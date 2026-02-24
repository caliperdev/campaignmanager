"use server";

import Papa from "papaparse";
import { supabase } from "@/db";
import { CAMPAIGNS_TABLE, campaignToInsert } from "@/db/schema";
import { revalidatePath, revalidateTag } from "next/cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const APP_DATA_TAG = "app-data";

/** Insert in batches to avoid statement timeout and stay under PostgREST limits. */
const CSV_IMPORT_BATCH_SIZE = 500;

/** Parse to YYYY-MM-DD or null if empty/unparseable. No default. */
function toIsoDateOrNull(value: string | undefined): string | null {
  const s = value?.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** User-selected column mapping: CSV header name -> role. */
export type CsvColumnMapping = {
  /** Column used as campaign label/identifier (ID preferred). */
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  impressionsGoal?: string;
};

function rowToInsert(
  rawRow: Record<string, string>,
  mapping: { id?: string; name?: string; startDate: string; endDate: string; impressionsGoal: string },
): ReturnType<typeof campaignToInsert> | null {
  const idVal = mapping.id ? String(rawRow[mapping.id] ?? "").trim() : "";
  const nameVal = mapping.name ? String(rawRow[mapping.name] ?? "").trim() : "";
  const label = idVal || nameVal || "Campaign";
  const startDate = toIsoDateOrNull(mapping.startDate ? rawRow[mapping.startDate] : undefined);
  const endDate = toIsoDateOrNull(mapping.endDate ? rawRow[mapping.endDate] : undefined);
  if (startDate == null || endDate == null) return null;
  const goalStr = mapping.impressionsGoal ? String(rawRow[mapping.impressionsGoal] ?? "0").replace(/,/g, "") : "0";
  const impressionsGoal = Math.max(0, parseInt(goalStr, 10) || 0);

  return campaignToInsert({
    name: label,
    startDate,
    endDate,
    impressionsGoal,
    distributionMode: "even",
    csvData: JSON.stringify(rawRow),
  });
}

export interface ImportResult {
  inserted: number;
  insertedIds: number[];
  errors: string[];
  headers?: string[];
}

/** One row in the preview (no DB write). Keys = first row headers. */
export interface CsvPreviewRow {
  rowNum: number;
  values: Record<string, string>;
}

export interface CsvPreviewResult {
  /** Column names from first row of CSV. */
  headers: string[];
  rows: CsvPreviewRow[];
  rowCount: number;
}

/** Parse CSV only; first row = headers, rest = data. No validation, no Supabase. */
export async function previewCsv(formData: FormData): Promise<CsvPreviewResult> {
  const file = formData.get("file") as File | null;
  const empty: CsvPreviewResult = { headers: [], rows: [], rowCount: 0 };
  if (!file) return empty;

  const text = await file.text();
  const { data, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = meta?.fields ?? (data?.[0] ? Object.keys(data[0]) : []);
  const rows: CsvPreviewRow[] = (data ?? []).map((raw, i) => ({
    rowNum: i + 2,
    values: { ...raw },
  }));

  return { headers, rows, rowCount: rows.length };
}

export async function importCsv(formData: FormData, columnMapping?: CsvColumnMapping | null): Promise<ImportResult> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file) return { inserted: 0, insertedIds: [], errors: ["No file provided."] };

  const text = await file.text();
  const { data, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = meta?.fields ?? (data?.[0] ? Object.keys(data[0]) : []);
  const result: ImportResult = { inserted: 0, insertedIds: [], errors: [], headers };

  const mapping = {
    id: columnMapping?.id ?? "",
    name: columnMapping?.name ?? "",
    startDate: columnMapping?.startDate ?? headers[1] ?? "",
    endDate: columnMapping?.endDate ?? headers[2] ?? "",
    impressionsGoal: columnMapping?.impressionsGoal ?? headers[3] ?? "",
  };
  if (!mapping.id && !mapping.name) mapping.name = headers[0] ?? "";

  const toInsert = (data ?? [])
    .map((rawRow) => rowToInsert(rawRow, mapping))
    .filter((row): row is NonNullable<ReturnType<typeof rowToInsert>> => row != null);

  if (toInsert.length > CSV_IMPORT_BATCH_SIZE) {
    console.info("[csv-import] Large import started:", {
      rowCount: toInsert.length,
      batchSize: CSV_IMPORT_BATCH_SIZE,
      batchCount: Math.ceil(toInsert.length / CSV_IMPORT_BATCH_SIZE),
    });
  }

  if (toInsert.length > 0) {
    const allIds: number[] = [];
    const totalBatches = Math.ceil(toInsert.length / CSV_IMPORT_BATCH_SIZE);

    for (let i = 0; i < toInsert.length; i += CSV_IMPORT_BATCH_SIZE) {
      const batch = toInsert.slice(i, i + CSV_IMPORT_BATCH_SIZE);
      const batchNum = Math.floor(i / CSV_IMPORT_BATCH_SIZE) + 1;

      try {
        const { data: insertedRows, error } = await supabase
          .from(CAMPAIGNS_TABLE)
          .insert(batch)
          .select("id");

        if (error) {
          console.error("[csv-import] Batch insert failed:", {
            batch: batchNum,
            totalBatches,
            rowsInBatch: batch.length,
            error: error.message,
            code: error.code,
          });
          result.errors.push(`Insert failed (batch ${batchNum}/${totalBatches}): ${error.message}`);
          break;
        }

        if (insertedRows?.length) {
          const ids = insertedRows.map((r) => r.id).filter((id): id is number => id != null);
          allIds.push(...ids);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[csv-import] Batch insert threw:", { batch: batchNum, totalBatches, err });
        result.errors.push(`Insert failed (batch ${batchNum}/${totalBatches}): ${message}`);
        break;
      }
    }

    result.inserted = allIds.length;
    result.insertedIds = allIds;
  }

  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
  return result;
}

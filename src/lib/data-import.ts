"use server";

import Papa from "papaparse";
import { supabase } from "@/db";
import { DATA_ENTRIES_TABLE, dataEntryToInsert, type DataEntryInsert } from "@/db/schema";
import { revalidatePath, revalidateTag } from "next/cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const APP_DATA_TAG = "app-data";
const DATA_IMPORT_BATCH_SIZE = 500;

function toIsoDate(value: string | undefined): string | null {
  const s = value?.trim();
  if (!s || s.length < 10) return null;
  const date = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

/** Column mapping: Date and Impressions only (no start/end date). */
export type DataCsvColumnMapping = {
  date?: string;
  impressions?: string;
};

export interface DataImportResult {
  inserted: number;
  insertedIds: number[];
  errors: string[];
  headers?: string[];
}

export interface DataPreviewRow {
  rowNum: number;
  values: Record<string, string>;
}

export interface DataPreviewResult {
  headers: string[];
  rows: DataPreviewRow[];
  rowCount: number;
}

export async function previewDataCsv(formData: FormData): Promise<DataPreviewResult> {
  const file = formData.get("file") as File | null;
  const empty: DataPreviewResult = { headers: [], rows: [], rowCount: 0 };
  if (!file) return empty;

  const text = await file.text();
  const { data, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = meta?.fields ?? (data?.[0] ? Object.keys(data[0]) : []);
  const rows: DataPreviewRow[] = (data ?? []).map((raw, i) => ({
    rowNum: i + 2,
    values: { ...raw },
  }));

  return { headers, rows, rowCount: rows.length };
}

function rowToDataInsert(
  rawRow: Record<string, string>,
  mapping: { date: string; impressions: string },
): DataEntryInsert | null {
  const reportDate = toIsoDate(mapping.date ? rawRow[mapping.date] : undefined);
  if (reportDate == null) return null;
  const impressionsStr = mapping.impressions ? String(rawRow[mapping.impressions] ?? "0").replace(/,/g, "") : "0";
  const impressions = Math.max(0, parseInt(impressionsStr, 10) || 0);
  return dataEntryToInsert({
    reportDate,
    impressions,
    csvData: JSON.stringify(rawRow),
  });
}

export async function importDataCsv(
  formData: FormData,
  columnMapping?: DataCsvColumnMapping | null,
): Promise<DataImportResult> {
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
  const result: DataImportResult = { inserted: 0, insertedIds: [], errors: [], headers };

  const mapping = {
    date: columnMapping?.date ?? headers[0] ?? "",
    impressions: columnMapping?.impressions ?? headers[1] ?? "",
  };

  const toInsert = (data ?? [])
    .map((rawRow) => rowToDataInsert(rawRow, mapping))
    .filter((row): row is DataEntryInsert => row != null);

  if (toInsert.length > DATA_IMPORT_BATCH_SIZE) {
    console.info("[data-import] Large import started:", {
      rowCount: toInsert.length,
      batchSize: DATA_IMPORT_BATCH_SIZE,
    });
  }

  if (toInsert.length > 0) {
    const allIds: number[] = [];
    const totalBatches = Math.ceil(toInsert.length / DATA_IMPORT_BATCH_SIZE);

    for (let i = 0; i < toInsert.length; i += DATA_IMPORT_BATCH_SIZE) {
      const batch = toInsert.slice(i, i + DATA_IMPORT_BATCH_SIZE);
      const batchNum = Math.floor(i / DATA_IMPORT_BATCH_SIZE) + 1;

      try {
        const { data: insertedRows, error } = await supabase
          .from(DATA_ENTRIES_TABLE)
          .insert(batch)
          .select("id");

        if (error) {
          result.errors.push(`Insert failed (batch ${batchNum}/${totalBatches}): ${error.message}`);
          break;
        }
        if (insertedRows?.length) {
          const ids = insertedRows.map((r) => r.id).filter((id): id is number => id != null);
          allIds.push(...ids);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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

"use server";

import Papa from "papaparse";
import { supabase } from "@/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const APP_DATA_TAG = "app-data";

export interface CreateSourceFromCsvResult {
  success: boolean;
  sourceId?: string;
  createdTableName?: string;
  inserted?: number;
  errors: string[];
}

/**
 * Create a new source from CSV: one column per header, one row per data row.
 * Registers in sources table (sources pipeline); uses data_ table prefix.
 */
export async function createSourceFromCsv(
  formData: FormData,
  displayName: string,
): Promise<CreateSourceFromCsvResult> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, errors: ["No file provided."] };

  const text = await file.text();
  const { data, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = meta?.fields ?? (data?.[0] ? Object.keys(data[0]) : []);
  if (!headers.length) return { success: false, errors: ["CSV has no column headers."] };

  const nameForTable = (displayName || file.name.replace(/\.csv$/i, "")).trim() || "import";
  const pTableName = nameForTable;

  const rows = data ?? [];
  const rowsAsJson = rows as unknown as Record<string, string>[];

  const { data: rpcData, error } = await supabase.rpc("create_source_csv_import_table", {
    p_table_name: pTableName,
    p_columns: headers,
    p_rows: rowsAsJson,
    p_display_name: displayName.trim() || nameForTable,
  });

  if (error) {
    console.error("[csv-source-table] RPC failed:", error);
    return { success: false, errors: [error.message] };
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row?.source_id) {
    return { success: false, errors: ["Import did not return a source id."] };
  }

  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");

  return {
    success: true,
    sourceId: row.source_id as string,
    createdTableName: row.created_table_name as string,
    inserted: Number(row.rows_inserted ?? 0),
    errors: [],
  };
}

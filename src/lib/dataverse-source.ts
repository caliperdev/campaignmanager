"use server";

import { supabase } from "@/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import {
  isDataverseConfigured,
  getDataverseTables,
  getDataverseTableData,
  type DataverseTableInfo,
} from "@/lib/dataverse-client";

export type { DataverseTableInfo };

const APP_DATA_TAG = "app-data";

export type DataverseImportResult = {
  success: boolean;
  sourceId?: string;
  errors: string[];
};

/** Safe to call from client. Returns whether Dataverse integration is configured. */
export async function checkDataverseEnabled(): Promise<boolean> {
  return isDataverseConfigured();
}

/** List tables available in the configured Dataverse environment. */
export async function listDataverseTables(): Promise<DataverseTableInfo[]> {
  if (!isDataverseConfigured()) return [];
  try {
    return await getDataverseTables();
  } catch (err) {
    console.error("[dataverse-source] listDataverseTables failed:", err);
    return [];
  }
}

/** Import a Dataverse table as a new source. Uses existing create_source_csv_import_table RPC. */
export async function importDataverseAsSource(
  logicalName: string,
  entitySetName: string,
  displayName: string
): Promise<DataverseImportResult> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  if (!isDataverseConfigured()) {
    return { success: false, errors: ["Dataverse is not configured."] };
  }

  try {
    const { columns, rows } = await getDataverseTableData(entitySetName, logicalName);
    if (!columns.length) {
      return { success: false, errors: ["Table has no readable columns."] };
    }

    const nameForTable = (displayName || logicalName).trim() || "dataverse";
    const pTableName = nameForTable.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "dataverse";

    const { data: rpcData, error } = await supabase.rpc("create_source_csv_import_table", {
      p_table_name: pTableName,
      p_columns: columns,
      p_rows: rows,
      p_display_name: displayName.trim() || logicalName,
    });

    if (error) {
      console.error("[dataverse-source] RPC failed:", error);
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
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dataverse-source] importDataverseAsSource failed:", err);
    return { success: false, errors: [message] };
  }
}

"use server";

import { supabase } from "@/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import {
  isDataverseConfigured,
  getDataverseTables,
  getDataverseTableChunk,
  getDataverseTableFull,
} from "@/lib/dataverse-client";

export interface DataverseTableInfo {
  logicalName: string;
  displayName: string;
  entitySetName: string;
}

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

/** List tables available in the configured Dataverse environment. Returns tables or an error message for the UI. */
export async function listDataverseTables(): Promise<
  { tables: DataverseTableInfo[] } | { error: string }
> {
  if (!isDataverseConfigured()) return { tables: [] };
  try {
    const tables = await getDataverseTables();
    return { tables };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dataverse-source] listDataverseTables failed:", err);
    if (message.includes("403") && message.includes("0x80072560")) {
      return {
        error:
          "The application is not a member of the Dataverse organization. In Power Platform / Dynamics 365, add an Application user with this app’s Client ID and assign a security role (e.g. System Administrator).",
      };
    }
    if (message.includes("403")) {
      return { error: "Access denied to Dataverse. Check that the app has a user and role in the environment." };
    }
    return { error: message };
  }
}

/** Register a Dataverse table as a source (view-only). No Supabase table is created; data is read from Dataverse when viewing. */
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
    const name = (displayName || logicalName).trim() || "Dataverse table";
    const { data, error } = await supabase
      .from("sources")
      .insert({
        name,
        entity_set_name: entitySetName,
        logical_name: logicalName,
        dynamic_table_name: null,
        column_headers: null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[dataverse-source] insert failed:", error);
      return { success: false, errors: [error.message] };
    }
    if (!data?.id) {
      return { success: false, errors: ["Insert did not return source id."] };
    }

    revalidateTag(APP_DATA_TAG, "max");
    revalidatePath("/");

    return {
      success: true,
      sourceId: data.id as string,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dataverse-source] importDataverseAsSource failed:", err);
    return { success: false, errors: [message] };
  }
}

/** Server-only. Fetch one chunk of a Dataverse table for viewing (used by source detail page). */
export async function fetchDataverseTableChunk(
  entitySetName: string,
  logicalName: string,
  offset: number,
  limit: number
): Promise<{ columns: string[]; rows: Record<string, string>[]; total: number }> {
  return getDataverseTableChunk(entitySetName, logicalName, offset, limit);
}

/** Server-only. Fetch entire Dataverse table (all columns, all rows) for view-only source page. */
export async function fetchDataverseTableFull(
  entitySetName: string,
  logicalName: string
): Promise<{ columns: string[]; rows: Record<string, string>[]; total: number }> {
  return getDataverseTableFull(entitySetName, logicalName);
}

"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/db";
import { DATA_ENTRIES_TABLE, TABLE_DATA_ENTRIES_TABLE } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import type { Table, TableUpdate, TableSection } from "@/lib/tables";
import { getCampaignListForTableChunk, getDynamicTableChunkWithCount } from "@/lib/tables";
import type { CampaignListItem } from "@/lib/campaign-grid";

const TABLES_TABLE = "tables";
const TABLE_CAMPAIGNS_TABLE = "table_campaigns";

const APP_DATA_TAG = "app-data";

type PathEntry = [string] | [string, "layout" | "page"];

function invalidateAppData(...paths: PathEntry[]) {
  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
  for (const entry of paths) {
    if (entry.length === 2) revalidatePath(entry[0], entry[1]);
    else revalidatePath(entry[0]);
  }
}

/** Invalidates the global app cache; call router.refresh() after to refetch. */
export async function refreshAppCache() {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
}

/** Clear all table–campaign and table–data-entry links and all table column headers. */
export async function clearAllTablesColumnHeadersAndLinks(): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: tables } = await supabase.from(TABLES_TABLE).select("id");
  if (!tables?.length) {
    invalidateAppData(["/campaigns"], ["/data"]);
    return true;
  }
  const tableIds = tables.map((t) => t.id);
  const { error: delCampaignLinks } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .delete()
    .in("table_id", tableIds);
  if (delCampaignLinks) return false;
  const { error: delDataLinks } = await supabase
    .from(TABLE_DATA_ENTRIES_TABLE)
    .delete()
    .in("table_id", tableIds);
  if (delDataLinks) return false;
  for (const id of tableIds) {
    const ok = await updateTable(id, { columnHeaders: [] });
    if (!ok) return false;
  }
  return true;
}

export async function addTable(
  userId: string | null,
  name: string,
  init?: TableUpdate,
  section: TableSection = "campaign",
): Promise<Table | null> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data, error } = await supabase
    .from(TABLES_TABLE)
    .insert({
      user_id: userId,
      name: (name?.trim() || init?.name?.trim()) || "Table",
      subtitle: init?.subtitle?.trim() || null,
      column_headers: init?.columnHeaders ?? null,
      section,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, subtitle, column_headers, section")
    .single();
  if (error) return null;
  invalidateAppData(["/campaigns"], ["/data"]);
  return {
    id: data.id,
    name: data.name ?? "",
    subtitle: data.subtitle ?? undefined,
    columnHeaders: Array.isArray(data.column_headers) ? data.column_headers : undefined,
    section: (data.section as TableSection) ?? "campaign",
  };
}

export async function updateTable(id: string, update: TableUpdate): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim() || "Table";
  if (update.subtitle !== undefined) payload.subtitle = update.subtitle?.trim() || null;
  if (update.columnHeaders !== undefined) payload.column_headers = update.columnHeaders;
  const { error } = await supabase.from(TABLES_TABLE).update(payload).eq("id", id);
  if (error) return false;
  invalidateAppData(["/campaigns"], ["/data"]);
  return true;
}

export async function setTableColumnHeaders(tableId: string, headers: string[]): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  return updateTable(tableId, { columnHeaders: headers });
}

export async function appendCampaignToTable(tableId: string, campaignId: number): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: existing } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .select("sort_order")
    .eq("table_id", tableId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sortOrder = (existing?.sort_order ?? -1) + 1;
  const { error } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .insert({ table_id: tableId, campaign_id: campaignId, sort_order: sortOrder });
  if (error) return false;
  invalidateAppData(["/campaigns"], ["/data"]);
  revalidatePath(`/campaigns/${tableId}`);
  return true;
}

export async function deleteTable(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(TABLES_TABLE).delete().eq("id", id);
  if (error) return false;
  invalidateAppData(["/campaigns"], ["/data"]);
  return true;
}

/** Fetch a chunk of campaign list items for a table (for infinite scroll). */
export async function fetchCampaignListChunk(
  tableId: string,
  offset: number,
  limit: number,
): Promise<CampaignListItem[]> {
  return getCampaignListForTableChunk(tableId, offset, limit);
}

/** Fetch a chunk of rows + total for a dynamic (CSV-import) table (for load more). */
export async function fetchDynamicTableChunk(
  dynamicTableName: string,
  offset: number,
  limit: number,
) {
  return getDynamicTableChunkWithCount(dynamicTableName, offset, limit);
}

/** Update one row in a dynamic (CSV-import) table. Payload keys must be DB column names (e.g. sanitized). */
export async function updateDynamicTableRow(
  dynamicTableName: string,
  rowId: number,
  payload: Record<string, string | number>,
): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) return false;
  const { error } = await supabase.from(dynamicTableName).update(payload).eq("id", rowId);
  if (error) return false;
  invalidateAppData(["/campaigns"], ["/data"]);
  return true;
}

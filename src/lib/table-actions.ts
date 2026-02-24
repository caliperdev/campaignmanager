"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/db";
import { CAMPAIGNS_TABLE, DATA_ENTRIES_TABLE, TABLE_DATA_ENTRIES_TABLE } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import type { Table, TableUpdate, TableSection } from "@/lib/tables";
import { getCampaignListForTableChunk } from "@/lib/tables";
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

async function setCampaignIdsForTable(tableId: string, ids: number[]): Promise<boolean> {
  const { error: delError } = await supabase.from(TABLE_CAMPAIGNS_TABLE).delete().eq("table_id", tableId);
  if (delError) return false;
  if (ids.length > 0) {
    const rows = ids.map((campaign_id, i) => ({ table_id: tableId, campaign_id, sort_order: i }));
    const { error: insError } = await supabase.from(TABLE_CAMPAIGNS_TABLE).insert(rows);
    if (insError) return false;
  }
  invalidateAppData(["/campaigns"], ["/data"]);
  return true;
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

/** Append campaign ids to a table (e.g. after CSV import). */
export async function appendCampaignIdsToTable(tableId: string, campaignIds: number[]): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: rows } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .select("campaign_id, sort_order")
    .eq("table_id", tableId)
    .order("sort_order", { ascending: true });
  const existingIds = (rows ?? []).map((r) => r.campaign_id);
  const merged = [...existingIds, ...campaignIds];
  return setCampaignIdsForTable(tableId, merged);
}

export async function deleteTable(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(TABLES_TABLE).delete().eq("id", id);
  if (error) return false;
  invalidateAppData(["/campaigns"], ["/data"]);
  return true;
}

/** Delete all rows in this table and clear column headers. Handles both campaign and data tables. */
export async function resetTable(tableId: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: tableMeta } = await supabase
    .from(TABLES_TABLE)
    .select("section")
    .eq("id", tableId)
    .single();
  const section = (tableMeta?.section as TableSection) ?? "campaign";

  if (section === "data") {
    const { data: rows } = await supabase
      .from(TABLE_DATA_ENTRIES_TABLE)
      .select("data_entry_id")
      .eq("table_id", tableId);
    const entryIds = (rows ?? []).map((r) => r.data_entry_id);
    if (entryIds.length > 0) {
      const { error: delLinks } = await supabase
        .from(TABLE_DATA_ENTRIES_TABLE)
        .delete()
        .eq("table_id", tableId);
      if (delLinks) return false;
      const { error: delEntries } = await supabase
        .from(DATA_ENTRIES_TABLE)
        .delete()
        .in("id", entryIds);
      if (delEntries) return false;
    }
  } else {
    const { data: rows } = await supabase
      .from(TABLE_CAMPAIGNS_TABLE)
      .select("campaign_id")
      .eq("table_id", tableId);
    const campaignIds = (rows ?? []).map((r) => r.campaign_id);
    if (campaignIds.length > 0) {
      const { error: delCampaigns } = await supabase
        .from(CAMPAIGNS_TABLE)
        .delete()
        .in("id", campaignIds);
      if (delCampaigns) return false;
    }
    const okLinks = await setCampaignIdsForTable(tableId, []);
    if (!okLinks) return false;
  }

  const okHeaders = await updateTable(tableId, { columnHeaders: [] });
  if (!okHeaders) return false;
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

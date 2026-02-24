"use server";

import { unstable_cache } from "next/cache";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/db";
import {
  DATA_ENTRIES_TABLE,
  TABLE_DATA_ENTRIES_TABLE,
  rowToDataEntry,
  type DataEntry,
} from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import { buildDataEntryListItems, type CampaignListItem } from "@/lib/campaign-grid";

const CACHE_TAG = "app-data";
const PAGE_SIZE = 1000;

function cached<T>(fn: () => Promise<T>, key: string[]): Promise<T> {
  return unstable_cache(fn, key, { tags: [CACHE_TAG], revalidate: false })();
}

export async function getDataEntriesByIds(ids: number[]): Promise<DataEntry[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from(DATA_ENTRIES_TABLE)
    .select("*")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToDataEntry);
}

async function getDataEntryIdsForTableUncached(tableId: string): Promise<number[]> {
  const all: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLE_DATA_ENTRIES_TABLE)
      .select("data_entry_id, sort_order")
      .eq("table_id", tableId)
      .order("sort_order", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return [];
    const page = (data ?? []).map((r) => r.data_entry_id);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function getDataEntryIdsForTable(tableId: string): Promise<number[]> {
  return cached(() => getDataEntryIdsForTableUncached(tableId), ["table-data-entries", tableId]);
}

export async function appendDataEntryIdsToTable(tableId: string, ids: number[]): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  if (ids.length === 0) return true;
  const { data: existing } = await supabase
    .from(TABLE_DATA_ENTRIES_TABLE)
    .select("sort_order")
    .eq("table_id", tableId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  let nextSort = (existing?.sort_order ?? -1) + 1;
  const rows = ids.map((data_entry_id) => ({
    table_id: tableId,
    data_entry_id,
    sort_order: nextSort++,
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from(TABLE_DATA_ENTRIES_TABLE)
      .insert(rows.slice(i, i + BATCH));
    if (error) return false;
  }
  revalidateTag(CACHE_TAG, "max");
  revalidatePath("/");
  return true;
}

async function getDataEntryCountForTableUncached(tableId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE_DATA_ENTRIES_TABLE)
    .select("data_entry_id", { count: "exact", head: true })
    .eq("table_id", tableId);
  if (error) return 0;
  return count ?? 0;
}

export async function getDataEntryCountForTable(tableId: string): Promise<number> {
  return cached(() => getDataEntryCountForTableUncached(tableId), ["table-data-entry-count", tableId]);
}

async function getDataEntryIdsForTableRangeUncached(
  tableId: string,
  offset: number,
  limit: number,
): Promise<number[]> {
  const { data, error } = await supabase
    .from(TABLE_DATA_ENTRIES_TABLE)
    .select("data_entry_id")
    .eq("table_id", tableId)
    .order("sort_order", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data ?? []).map((r) => r.data_entry_id);
}

export async function getDataEntryListForTableChunk(
  tableId: string,
  offset: number,
  limit: number,
): Promise<CampaignListItem[]> {
  const ids = await getDataEntryIdsForTableRangeUncached(tableId, offset, limit);
  if (ids.length === 0) return [];
  const entries = await getDataEntriesByIds(ids);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as DataEntry[];
  return buildDataEntryListItems(ordered);
}

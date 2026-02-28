/**
 * Campaigns and sources — Supabase. Mutations via table-actions.
 * All reads cached with tag "app-data".
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/db";
import type { Campaign, Source } from "@/db/schema";

const CACHE_TAG = "app-data";

function cached<T>(fn: () => Promise<T>, key: string[]): Promise<T> {
  return unstable_cache(fn, key, { tags: [CACHE_TAG], revalidate: false })();
}

const CAMPAIGNS_TABLE = "campaigns";
const SOURCES_TABLE = "sources";

function rowToCampaign(row: {
  id: string;
  name: string;
  dynamic_table_name: string;
  column_headers?: string[] | null;
  created_at: string;
  updated_at: string;
}): Campaign {
  const ch = row.column_headers;
  return {
    id: row.id,
    name: row.name ?? "",
    dynamicTableName: row.dynamic_table_name ?? "",
    columnHeaders: Array.isArray(ch) ? ch : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSource(row: {
  id: string;
  name: string;
  dynamic_table_name: string;
  column_headers?: string[] | null;
  created_at: string;
}): Source {
  const ch = row.column_headers;
  return {
    id: row.id,
    name: row.name ?? "",
    dynamicTableName: row.dynamic_table_name ?? "",
    columnHeaders: Array.isArray(ch) ? ch : undefined,
    createdAt: row.created_at,
  };
}

/** Server-only. Get all campaigns (cached). */
export async function getCampaigns(): Promise<Campaign[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CAMPAIGNS_TABLE)
      .select("id, name, dynamic_table_name, column_headers, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToCampaign);
  }, ["campaigns"]);
}

/** Server-only. Get a single campaign by id (cached). */
export async function getCampaign(id: string): Promise<Campaign | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CAMPAIGNS_TABLE)
      .select("id, name, dynamic_table_name, column_headers, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToCampaign(data);
  }, ["campaign", id]);
}

/** Server-only. Get all sources (cached). */
export async function getSources(): Promise<Source[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(SOURCES_TABLE)
      .select("id, name, dynamic_table_name, column_headers, created_at")
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToSource);
  }, ["sources"]);
}

/** Server-only. Get a single source by id (cached). */
export async function getSource(id: string): Promise<Source | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(SOURCES_TABLE)
      .select("id, name, dynamic_table_name, column_headers, created_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToSource(data);
  }, ["source", id]);
}

/** Server-only. Sidebar data (cached). */
export async function getSidebarData(): Promise<{ campaigns: Campaign[]; sources: Source[] }> {
  return cached(
    async () => ({
      campaigns: await getCampaigns(),
      sources: await getSources(),
    }),
    ["sidebar"],
  );
}

/** Row from a dynamic table: id + string columns. */
export type DynamicTableRow = { id: number; [k: string]: unknown };

/** Server-only. Chunk of rows + total for a dynamic table. */
export async function getDynamicTableChunkWithCount(
  dynamicTableName: string,
  offset: number,
  limit: number,
): Promise<{ rows: DynamicTableRow[]; total: number }> {
  const { data, error, count } = await supabase
    .from(dynamicTableName)
    .select("*", { count: "exact" })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return { rows: [], total: 0 };
  return { rows: (data ?? []) as DynamicTableRow[], total: count ?? 0 };
}

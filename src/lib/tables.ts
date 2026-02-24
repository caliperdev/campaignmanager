/**
 * Tables — Supabase only (no localStorage).
 * Types and async getters for server components. Mutations via table-actions.
 * All reads are cached with tag "app-data"; use revalidateTag("app-data") to refresh.
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/db";
import type { Campaign } from "@/db/schema";
import { getCampaignsByIds } from "@/lib/campaign";
import { buildCampaignListItems, type CampaignListItem } from "@/lib/campaign-grid";

const CACHE_TAG = "app-data";

function cached<T>(fn: () => Promise<T>, key: string[]): Promise<T> {
  return unstable_cache(fn, key, { tags: [CACHE_TAG], revalidate: false })();
}

export type TableSection = "campaign" | "data";

export type Table = {
  id: string;
  name: string;
  subtitle?: string;
  columnHeaders?: string[];
  section: TableSection;
};

export type TableUpdate = Partial<Pick<Table, "name" | "subtitle" | "columnHeaders">>;

const TABLES_TABLE = "tables";
const TABLE_CAMPAIGNS_TABLE = "table_campaigns";

function rowToTable(row: {
  id: string;
  name: string;
  subtitle?: string | null;
  column_headers?: string[] | null;
  section?: string | null;
}): Table {
  const ch = row.column_headers;
  return {
    id: row.id,
    name: row.name ?? "",
    subtitle: row.subtitle ?? undefined,
    columnHeaders: Array.isArray(ch) ? ch : undefined,
    section: (row.section as TableSection) ?? "campaign",
  };
}

async function getTablesUncached(userId: string | null, section?: TableSection): Promise<Table[]> {
  let q = supabase
    .from(TABLES_TABLE)
    .select("id, name, subtitle, column_headers, section")
    .order("created_at", { ascending: true });
  // Show campaign/data tables for any authenticated user (no user_id filter)
  if (section) q = q.eq("section", section);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map(rowToTable);
}

/** Server-only. Get tables for a user, optionally filtered by section (cached). */
export async function getTables(userId: string | null, section?: TableSection): Promise<Table[]> {
  return cached(
    () => getTablesUncached(userId, section),
    ["tables", userId ?? "", section ?? "all"],
  );
}

async function getTableUncached(tableId: string): Promise<Table | null> {
  const { data, error } = await supabase
    .from(TABLES_TABLE)
    .select("id, name, subtitle, column_headers, section")
    .eq("id", tableId)
    .single();
  if (error || !data) return null;
  return rowToTable(data);
}

/** Server-only. Get a single table by id (cached). */
export async function getTable(tableId: string): Promise<Table | null> {
  return cached(() => getTableUncached(tableId), ["table", tableId]);
}

const TABLE_CAMPAIGNS_PAGE_SIZE = 1000;

async function getCampaignIdsForTableUncached(tableId: string): Promise<number[]> {
  const all: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLE_CAMPAIGNS_TABLE)
      .select("campaign_id, sort_order")
      .eq("table_id", tableId)
      .order("sort_order", { ascending: true })
      .range(offset, offset + TABLE_CAMPAIGNS_PAGE_SIZE - 1);
    if (error) return [];
    const page = (data ?? []).map((r) => r.campaign_id);
    all.push(...page);
    if (page.length < TABLE_CAMPAIGNS_PAGE_SIZE) break;
    offset += TABLE_CAMPAIGNS_PAGE_SIZE;
  }
  return all;
}

export async function getCampaignIdsForTable(tableId: string): Promise<number[]> {
  return cached(() => getCampaignIdsForTableUncached(tableId), ["table-campaigns", tableId]);
}

/** Server-only. Sidebar data: tables grouped by section (cached). */
export async function getSidebarData(
  userId: string | null,
): Promise<{ tablesCampaigns: Table[]; tablesData: Table[] }> {
  return cached(
    async () => {
      const all = await getTablesUncached(userId);
      return {
        tablesCampaigns: all.filter((t) => t.section === "campaign"),
        tablesData: all.filter((t) => t.section === "data"),
      };
    },
    ["sidebar", userId ?? ""],
  );
}

async function getCampaignListForTableUncached(tableId: string): Promise<CampaignListItem[]> {
  const ids = await getCampaignIdsForTableUncached(tableId);
  if (ids.length === 0) return [];
  const campaigns = await getCampaignsByIds(ids);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Campaign[];
  return buildCampaignListItems(ordered);
}

/** Server-only. Campaign list items for a table in table order (cached). */
export async function getCampaignListForTable(tableId: string): Promise<CampaignListItem[]> {
  return cached(() => getCampaignListForTableUncached(tableId), ["campaigns-for-table", tableId]);
}

async function getCampaignIdsForTableRangeUncached(
  tableId: string,
  offset: number,
  limit: number,
): Promise<number[]> {
  const { data, error } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .select("campaign_id")
    .eq("table_id", tableId)
    .order("sort_order", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data ?? []).map((r) => r.campaign_id);
}

async function getTableCampaignCountUncached(tableId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE_CAMPAIGNS_TABLE)
    .select("campaign_id", { count: "exact", head: true })
    .eq("table_id", tableId);
  if (error) return 0;
  return count ?? 0;
}

export async function getTableCampaignCount(tableId: string): Promise<number> {
  return cached(() => getTableCampaignCountUncached(tableId), ["table-campaign-count", tableId]);
}

/** Server-only. One page of campaign list items for a table (uncached). */
export async function getCampaignListForTableChunk(
  tableId: string,
  offset: number,
  limit: number,
): Promise<CampaignListItem[]> {
  const ids = await getCampaignIdsForTableRangeUncached(tableId, offset, limit);
  if (ids.length === 0) return [];
  const campaigns = await getCampaignsByIds(ids);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Campaign[];
  return buildCampaignListItems(ordered);
}

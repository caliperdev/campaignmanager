/**
 * Orders and sources — Supabase. Mutations via table-actions.
 * All reads cached with tag "app-data".
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/db";
import type { Order, Source, Client, Agency, Advertiser, Campaign } from "@/db/schema";
import { ORDERS_TABLE, SOURCES_TABLE, CLIENTS_TABLE, AGENCIES_TABLE, ADVERTISERS_TABLE, CAMPAIGNS_TABLE, PLACEMENTS_TABLE, TRAFFICKERS, AMS, QA_AMS, FORMATS, CATEGORIES, DEALS } from "@/db/schema";

const CACHE_TAG = "app-data";

function cached<T>(fn: () => Promise<T>, key: string[]): Promise<T> {
  return unstable_cache(fn, key, { tags: [CACHE_TAG], revalidate: false })();
}

function rowToOrder(row: {
  id: string;
  name: string;
  dynamic_table_name?: string | null;
  column_headers?: string[] | null;
  campaign_id: string;
  document_path?: string | null;
  created_at: string;
  updated_at: string;
}): Order {
  const ch = row.column_headers;
  return {
    id: row.id,
    name: row.name ?? "",
    dynamicTableName: row.dynamic_table_name ?? "",
    columnHeaders: Array.isArray(ch) ? ch : undefined,
    campaignId: row.campaign_id,
    documentPath: row.document_path ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSource(row: {
  id: string;
  name: string;
  dynamic_table_name?: string | null;
  entity_set_name?: string | null;
  logical_name?: string | null;
  column_headers?: string[] | null;
  created_at: string;
}): Source {
  const ch = row.column_headers;
  return {
    id: row.id,
    name: row.name ?? "",
    dynamicTableName: row.dynamic_table_name ?? undefined,
    entitySetName: row.entity_set_name ?? undefined,
    logicalName: row.logical_name ?? undefined,
    columnHeaders: Array.isArray(ch) ? ch : undefined,
    createdAt: row.created_at,
  };
}

/** Server-only. Get all orders (cached). Optionally filter by campaign. */
export async function getOrders(campaignId?: string | null): Promise<Order[]> {
  return cached(async () => {
    let query = supabase
      .from(ORDERS_TABLE)
      .select("id, name, dynamic_table_name, column_headers, campaign_id, document_path, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []).map(rowToOrder);
  }, campaignId ? ["orders", "campaign", campaignId] : ["orders"]);
}

/**
 * Server-only. Check if migration 044 (campaign > order hierarchy) has been applied.
 * Use to show a message when the app expects the new schema but the DB still has the old one.
 */
export async function isHierarchyMigrationApplied(): Promise<boolean> {
  const { error } = await supabase
    .from(ORDERS_TABLE)
    .select("campaign_id")
    .limit(1);
  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    const msg = String(error.message ?? "");
    if (code === "42703" || /column.*campaign_id.*does not exist/i.test(msg)) return false;
  }
  return true;
}

/** Server-only. Get a single order by id (cached). */
export async function getOrder(id: string): Promise<Order | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select("id, name, dynamic_table_name, column_headers, campaign_id, document_path, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToOrder(data);
  }, ["order", id]);
}

/** Server-only. Get orders for a campaign (cached). */
export async function getOrdersByCampaign(campaignId: string): Promise<Order[]> {
  return getOrders(campaignId);
}

/** Server-only. Get all sources (cached). */
export async function getSources(): Promise<Source[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(SOURCES_TABLE)
      .select("id, name, dynamic_table_name, entity_set_name, logical_name, column_headers, created_at")
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
      .select("id, name, dynamic_table_name, entity_set_name, logical_name, column_headers, created_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToSource(data);
  }, ["source", id]);
}

function rowToClient(row: {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}): Client {
  return {
    id: row.id,
    name: row.name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Server-only. Get all clients (cached). */
export async function getClients(): Promise<Client[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CLIENTS_TABLE)
      .select("id, name, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToClient);
  }, ["clients"]);
}

/** Server-only. Get a single client by id (cached). */
export async function getClient(id: string): Promise<Client | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CLIENTS_TABLE)
      .select("id, name, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToClient(data);
  }, ["client", id]);
}

function rowToAgency(row: {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}): Agency {
  return {
    id: row.id,
    name: row.name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Server-only. Get all agencies (cached). */
export async function getAgencies(): Promise<Agency[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(AGENCIES_TABLE)
      .select("id, name, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToAgency);
  }, ["agencies"]);
}

/** Server-only. Get a single agency by id (cached). */
export async function getAgency(id: string): Promise<Agency | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(AGENCIES_TABLE)
      .select("id, name, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToAgency(data);
  }, ["agency", id]);
}

/** Server-only. Get agencies for a client (cached). Agencies are no longer tied to clients; returns []. */
export async function getAgenciesByClient(_clientId: string): Promise<Agency[]> {
  return [];
}

/** Counts per agency: advertisers, orders, campaigns, placements. */
export type AgencyCounts = {
  advertiserCount: number;
  orderCount: number;
  campaignCount: number;
  placementCount: number;
  activePlacementCount: number;
};

/** Counts per client: agencies, advertisers, campaigns, orders, placements, active placements. */
export type ClientCounts = {
  agencyCount: number;
  advertiserCount: number;
  campaignCount: number;
  orderCount: number;
  placementCount: number;
  activePlacementCount: number;
};

/** Server-only. Get counts for all clients (cached). Uses get_all_client_counts RPC. */
export async function getClientCountsMap(): Promise<Map<string, ClientCounts>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_all_client_counts");
      if (error) return {};
      const out: Record<string, ClientCounts> = {};
      for (const row of data ?? []) {
        out[row.client_id] = {
          agencyCount: row.agency_count ?? 0,
          advertiserCount: row.advertiser_count ?? 0,
          campaignCount: row.campaign_count ?? 0,
          orderCount: row.order_count ?? 0,
          placementCount: Number(row.placement_count ?? 0),
          activePlacementCount: Number(row.active_placement_count ?? 0),
        };
      }
      return out;
    },
    ["client-counts"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  const clients = await getClients();
  const map = new Map<string, ClientCounts>();
  for (const c of clients) {
    map.set(c.id, obj[c.id] ?? {
      agencyCount: 0,
      advertiserCount: 0,
      campaignCount: 0,
      orderCount: 0,
      placementCount: 0,
      activePlacementCount: 0,
    });
  }
  return map;
}

/** Server-only. Get active placement counts for all campaigns (cached). */
export async function getCampaignCountsMap(): Promise<Map<string, number>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_all_campaign_counts");
      if (error) return {};
      const out: Record<string, number> = {};
      for (const row of data ?? []) {
        out[row.campaign_id] = Number(row.active_placement_count ?? 0);
      }
      return out;
    },
    ["campaign-counts"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

export type StatusLabel = "Upcoming" | "Live" | "Ended";

function capitalizeStatus(s: string): StatusLabel {
  const lower = (s ?? "").toLowerCase();
  if (lower === "upcoming") return "Upcoming";
  if (lower === "live") return "Live";
  return "Ended";
}

/** Server-only. Get status (Upcoming, Live, Ended) for all campaigns (cached). */
export async function getCampaignStatusesMap(): Promise<Map<string, StatusLabel>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_campaign_statuses");
      if (error) return {};
      const out: Record<string, StatusLabel> = {};
      for (const row of data ?? []) {
        out[row.campaign_id] = capitalizeStatus(row.status ?? "ended");
      }
      return out;
    },
    ["campaign-statuses"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

/** Server-only. Get status (Upcoming, Live, Ended) for all orders (cached). */
export async function getOrderStatusesMap(): Promise<Map<string, StatusLabel>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_all_order_statuses");
      if (error) return {};
      const out: Record<string, StatusLabel> = {};
      for (const row of data ?? []) {
        out[row.order_id] = capitalizeStatus(row.status ?? "ended");
      }
      return out;
    },
    ["order-statuses"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

export type PlacementCountsByStatus = { liveCount: number; upcomingCount: number; endedCount: number };

/** Server-only. Get placement counts by status for all campaigns (cached). */
export async function getCampaignPlacementCountsByStatusMap(): Promise<Map<string, PlacementCountsByStatus>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_campaign_placement_counts_by_status");
      if (error) return {};
      const out: Record<string, PlacementCountsByStatus> = {};
      for (const row of data ?? []) {
        out[row.campaign_id] = {
          liveCount: Number(row.live_count ?? 0),
          upcomingCount: Number(row.upcoming_count ?? 0),
          endedCount: Number(row.ended_count ?? 0),
        };
      }
      return out;
    },
    ["campaign-placement-counts-by-status"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

/** Server-only. Get placement counts by status for all orders (cached). */
export async function getOrderPlacementCountsByStatusMap(): Promise<Map<string, PlacementCountsByStatus>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_all_order_placement_counts_by_status");
      if (error) return {};
      const out: Record<string, PlacementCountsByStatus> = {};
      for (const row of data ?? []) {
        out[row.order_id] = {
          liveCount: Number(row.live_count ?? 0),
          upcomingCount: Number(row.upcoming_count ?? 0),
          endedCount: Number(row.ended_count ?? 0),
        };
      }
      return out;
    },
    ["order-placement-counts-by-status"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

/** Server-only. Get counts for all agencies (cached). */
export async function getAgencyCountsMap(): Promise<Map<string, AgencyCounts>> {
  const obj = await unstable_cache(
    async () => {
      const { data, error } = await supabase.rpc("get_all_agency_counts");
      if (error) return {};
      const out: Record<string, AgencyCounts> = {};
      for (const row of data ?? []) {
        out[row.agency_id] = {
          advertiserCount: row.advertiser_count ?? 0,
          orderCount: row.order_count ?? 0,
          campaignCount: row.campaign_count ?? 0,
          placementCount: Number(row.placement_count ?? 0),
          activePlacementCount: Number(row.active_placement_count ?? 0),
        };
      }
      return out;
    },
    ["agency-counts"],
    { tags: [CACHE_TAG], revalidate: 1 }
  )();
  return new Map(Object.entries(obj));
}

function rowToAdvertiser(row: {
  id: string;
  advertiser: string;
  order_count: number;
  campaign_count: number;
  placement_count: number;
  active_placement_count?: number | null;
}): Advertiser {
  return {
    id: row.id,
    advertiser: row.advertiser ?? "",
    orderCount: row.order_count ?? 0,
    campaignCount: row.campaign_count ?? 0,
    placementCount: row.placement_count ?? 0,
    activePlacementCount: Number(row.active_placement_count ?? 0),
  };
}

/** Server-only. Get all advertisers (cached). */
export async function getAdvertisers(): Promise<Advertiser[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(ADVERTISERS_TABLE)
      .select("id, advertiser, order_count, campaign_count, placement_count, active_placement_count")
      .order("advertiser", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToAdvertiser);
  }, ["advertisers"]);
}

/** Server-only. Get a single advertiser by id (cached). */
export async function getAdvertiser(id: string): Promise<Advertiser | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(ADVERTISERS_TABLE)
      .select("id, advertiser, order_count, campaign_count, placement_count, active_placement_count")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToAdvertiser(data);
  }, ["advertiser", id]);
}

function rowToCampaign(row: {
  id: string;
  name: string;
  advertiser_id: string;
  agency_id: string;
  client_id: string;
  external_id?: string | null;
  category?: string | null;
  created_at: string;
  updated_at: string;
}): Campaign {
  return {
    id: row.id,
    name: row.name ?? "",
    advertiserId: row.advertiser_id,
    agencyId: row.agency_id,
    clientId: row.client_id,
    externalId: row.external_id ?? undefined,
    category: row.category ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Server-only. Get all campaigns (cached). Optionally filter by advertiser or by agency. */
export async function getCampaigns(advertiserId?: string | null): Promise<Campaign[]> {
  return cached(async () => {
    let query = supabase
      .from(CAMPAIGNS_TABLE)
      .select("id, name, advertiser_id, agency_id, client_id, external_id, category, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (advertiserId) query = query.eq("advertiser_id", advertiserId);
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []).map(rowToCampaign);
  }, advertiserId ? ["campaigns", "advertiser", advertiserId] : ["campaigns"]);
}

/** Server-only. Get campaigns that reference an agency (optional filter). */
export async function getCampaignsByAgency(agencyId: string): Promise<Campaign[]> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CAMPAIGNS_TABLE)
      .select("id, name, advertiser_id, agency_id, client_id, external_id, category, created_at, updated_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(rowToCampaign);
  }, ["campaigns", "agency", agencyId]);
}

/** Server-only. Get a single campaign by id (cached). */
export async function getCampaign(id: string): Promise<Campaign | null> {
  return cached(async () => {
    const { data, error } = await supabase
      .from(CAMPAIGNS_TABLE)
      .select("id, name, advertiser_id, agency_id, client_id, external_id, category, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return rowToCampaign(data);
  }, ["campaign", id]);
}

/** Server-only. Sidebar data (cached). */
export async function getSidebarData(): Promise<{ orders: Order[]; sources: Source[] }> {
  return cached(
    async () => ({
      orders: await getOrders(),
      sources: await getSources(),
    }),
    ["sidebar"],
  );
}

/** Server-only. Lookup options (cached). */
export async function getTraffickerOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(TRAFFICKERS).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["trafficker-options"]);
}

export async function getAmOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(AMS).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["am-options"]);
}

export async function getQaAmOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(QA_AMS).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["qa-am-options"]);
}

export async function getFormatOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(FORMATS).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["format-options"]);
}

export async function getCategoryOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(CATEGORIES).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["category-options"]);
}

export async function getDealOptions(): Promise<string[]> {
  return cached(async () => {
    const { data } = await supabase.from(DEALS).select("name").order("name", { ascending: true });
    return (data ?? []).map((r) => r.name);
  }, ["deal-options"]);
}

/** Row from a dynamic table: id + string columns. */
export type DynamicTableRow = { id: number; [k: string]: unknown };

/** Server-only. Chunk of rows + total for a dynamic table (e.g. source data_*). Supports optional sort and filter. */
export async function getDynamicTableChunkWithCount(
  dynamicTableName: string,
  offset: number,
  limit: number,
  sortColumn?: string | null,
  sortAsc: boolean = true,
  filter?: { column: string; value: string } | { or: Array<{ column: string; value: string }> } | null,
): Promise<{ rows: DynamicTableRow[]; total: number }> {
  let query = supabase.from(dynamicTableName).select("*", { count: "exact" });
  if (filter) {
    if ("or" in filter && Array.isArray(filter.or) && filter.or.length > 0) {
      const orClause = filter.or
        .filter((f) => f.column && f.value !== undefined)
        .map((f) => `${f.column}.eq.${JSON.stringify(f.value)}`)
        .join(",");
      if (orClause) query = query.or(orClause);
    } else if ("column" in filter && filter.column && filter.value !== undefined) {
      query = query.eq(filter.column, filter.value);
    }
  }
  if (sortColumn && sortColumn !== "id") {
    query = query.order(sortColumn, { ascending: sortAsc });
  }
  query = query.order("id", { ascending: true });
  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return { rows: [], total: 0 };
  return { rows: (data ?? []) as DynamicTableRow[], total: count ?? 0 };
}

/** Default column headers for placements table (display names). */
export const PLACEMENTS_TABLE_COLUMN_HEADERS = [
  "Placement ID",
  "Placement",
  "Category",
  "Format",
  "Deal",
  "Start Date",
  "End Date",
  "Impressions",
  "CPM Client",
  "CPM AdOps",
  "Trafficker",
  "AM",
  "QA AM",
  "Insertion Order ID - DSP",
] as const;

/** Server-only. Get a single placement by id from the placements table. */
export async function getPlacementById(
  orderId: string,
  placementId: number,
): Promise<DynamicTableRow | null> {
  const { data, error } = await supabase
    .from(PLACEMENTS_TABLE)
    .select("*")
    .eq("order_id", orderId)
    .eq("id", placementId)
    .single();
  if (error || !data) return null;
  return data as DynamicTableRow;
}

/** Server-only. Fetch placements for an order from the placements table. Supports optional campaign filter (order_campaign_id/order_campaign). */
export async function getPlacementsForOrder(
  orderId: string,
  offset: number = 0,
  limit: number = 500,
  campaignFilter?: { or: Array<{ column: string; value: string }> } | null,
): Promise<{ rows: DynamicTableRow[]; total: number }> {
  let query = supabase
    .from(PLACEMENTS_TABLE)
    .select("*", { count: "exact" })
    .eq("order_id", orderId);
  if (campaignFilter?.or?.length) {
    const orClause = campaignFilter.or
      .filter((f) => f.column && f.value !== undefined)
      .map((f) => `${f.column}.eq.${JSON.stringify(f.value)}`)
      .join(",");
    if (orClause) query = query.or(orClause);
  }
  query = query.order("id", { ascending: true }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) return { rows: [], total: 0 };
  return { rows: (data ?? []) as DynamicTableRow[], total: count ?? 0 };
}

/** Server-only. Placement count for one order (from placements table). */
export async function getOrderPlacementCount(order: Order): Promise<number> {
  const { count } = await supabase
    .from(PLACEMENTS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id);
  return count ?? 0;
}

/** Server-only. Active placement count for one order (placements where today overlaps start..end date). */
export async function getOrderActivePlacementCount(orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_order_active_placement_count", {
    p_order_id: orderId,
  });
  if (error) return 0;
  return Number(data ?? 0);
}

/** Server-only. Placement counts by order_campaign_id for one order. Used for count display. */
export async function getPlacementCountsByCampaign(orderId: string): Promise<Map<string, number>> {
  const { rows } = await getPlacementsForOrder(orderId, 0, 5000);
  const { groupRowsByCampaign } = await import("@/lib/order-grouping");
  const groups = groupRowsByCampaign(rows);
  return new Map(groups.map((g) => [g.id, g.count]));
}

/** Server-only. Orders for a campaign: from orders table, with placement counts and active placement count per order. */
export async function getOrdersForCampaign(campaignId: string): Promise<{ id: string; name: string; count?: number; activePlacementCount?: number; createdAt: string; documentPath?: string | null }[]> {
  const orders = await getOrdersByCampaign(campaignId);
  const results: { id: string; name: string; count?: number; activePlacementCount?: number; createdAt: string; documentPath?: string | null }[] = [];
  for (const o of orders) {
    const [count, activePlacementCount] = await Promise.all([
      getOrderPlacementCount(o),
      getOrderActivePlacementCount(o.id),
    ]);
    results.push({
      id: o.id,
      name: o.name,
      count,
      activePlacementCount,
      createdAt: o.createdAt,
      documentPath: o.documentPath,
    });
  }
  return results;
}

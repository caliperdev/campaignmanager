"use server";

/**
 * Monitor cache: pre-computed results per (campaign_id, source_id).
 * Read from cache; compute only on miss or explicit refresh.
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { supabase } from "@/db";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import type { MonitorDisplayRow } from "@/lib/monitor-data";
import { aggregateMonitorFromCampaignAndSource } from "@/lib/monitor-aggregate";

const MONITOR_CACHE_TAG = "monitor-data";
const CACHE_TTL_MINUTES = 15;

type CacheRow = {
  year_month: string;
  active_campaign_count: number;
  booked_impressions: number;
  delivered_impressions: number;
  delivered_lines: number;
  media_cost: number;
  media_fees: number;
  celtra_cost: number;
  total_cost: number;
  booked_revenue: number;
};

function cacheRowToDisplayRow(r: CacheRow): MonitorDisplayRow {
  return {
    yearMonth: r.year_month,
    sumImpressions: Number(r.booked_impressions),
    activeCampaignCount: Number(r.active_campaign_count),
    dataImpressions: Number(r.delivered_impressions),
    deliveredLines: Number(r.delivered_lines),
    mediaCost: Number(r.media_cost),
    mediaFees: Number(r.media_fees),
    celtraCost: Number(r.celtra_cost),
    totalCost: Number(r.total_cost),
    bookedRevenue: Number(r.booked_revenue),
  };
}

function rowsToPayload(rows: MonitorDisplayRow[]): MonitorDataPayload {
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;
  const totalUniqueCampaignCount = Math.max(...rows.map((r) => r.activeCampaignCount), 0);

  return {
    campaignRows: [],
    totalUniqueCampaignCount,
    dataRows: [],
    rows,
    totalImpressions,
    totalDataImpressions,
    totalDeliveredLines,
    totalMediaCost,
    totalMediaFees,
    totalCeltraCost,
    totalTotalCost,
    totalBookedRevenue,
  };
}

/** Read cached rows from monitor_cache. */
async function getMonitorCacheRows(campaignId: string, sourceId: string): Promise<CacheRow[]> {
  const { data, error } = await supabase
    .from("monitor_cache")
    .select("year_month, active_campaign_count, booked_impressions, delivered_impressions, delivered_lines, media_cost, media_fees, celtra_cost, total_cost, booked_revenue")
    .eq("campaign_id", campaignId)
    .eq("source_id", sourceId)
    .order("year_month", { ascending: true });

  if (error) return [];
  return (data ?? []) as CacheRow[];
}

/** Check if cache is stale (older than TTL). */
async function isCacheStale(campaignId: string, sourceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("monitor_cache")
    .select("updated_at")
    .eq("campaign_id", campaignId)
    .eq("source_id", sourceId)
    .limit(1)
    .single();

  if (!data?.updated_at) return true;
  const updated = new Date(data.updated_at as string).getTime();
  return Date.now() - updated > CACHE_TTL_MINUTES * 60 * 1000;
}

/** Upsert computed rows into monitor_cache. Replaces all rows for (campaign_id, source_id). */
async function upsertMonitorCache(
  campaignId: string,
  sourceId: string,
  rows: MonitorDisplayRow[]
): Promise<void> {
  await supabase.from("monitor_cache").delete().eq("campaign_id", campaignId).eq("source_id", sourceId);

  if (rows.length === 0) return;

  const toInsert = rows.map((r) => ({
    campaign_id: campaignId,
    source_id: sourceId,
    year_month: r.yearMonth,
    active_campaign_count: r.activeCampaignCount,
    booked_impressions: r.sumImpressions,
    delivered_impressions: r.dataImpressions,
    delivered_lines: r.deliveredLines,
    media_cost: r.mediaCost,
    media_fees: r.mediaFees,
    celtra_cost: r.celtraCost,
    total_cost: r.totalCost,
    booked_revenue: r.bookedRevenue,
  }));

  await supabase.from("monitor_cache").insert(toInsert);
}

/** Get monitor data from cache or compute and cache. Cached with Next.js unstable_cache. */
export async function getOrComputeMonitorData(
  campaignId: string,
  sourceId: string
): Promise<MonitorDataPayload> {
  return unstable_cache(
    async () => {
      const cached = await getMonitorCacheRows(campaignId, sourceId);
      const stale = await isCacheStale(campaignId, sourceId);

      if (cached.length > 0 && !stale) {
        const rows = cached.map(cacheRowToDisplayRow);
        return rowsToPayload(rows);
      }

      const rows = await aggregateMonitorFromCampaignAndSource(campaignId, sourceId);
      if (rows.length > 0) {
        await upsertMonitorCache(campaignId, sourceId, rows);
      }
      return rowsToPayload(rows);
    },
    ["monitor-cache", campaignId, sourceId],
    { tags: [MONITOR_CACHE_TAG], revalidate: false }
  )();
}

/** Force re-compute and cache. Call from Refresh button. */
export async function refreshMonitorCache(campaignId: string, sourceId: string): Promise<void> {
  const rows = await aggregateMonitorFromCampaignAndSource(campaignId, sourceId);
  await upsertMonitorCache(campaignId, sourceId, rows);
  revalidateTag(MONITOR_CACHE_TAG, "max");
}

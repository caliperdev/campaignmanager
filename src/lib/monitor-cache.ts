"use server";

/**
 * Monitor: compute results per (order_id, source_id).
 * Uses Next.js unstable_cache only (monitor_cache table was renamed to dashboard_cache for dashboard).
 */
import { revalidateTag, unstable_cache } from "next/cache";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import type { MonitorDisplayRow } from "@/lib/monitor-data";
import { aggregateMonitorFromOrderAndSource } from "@/lib/monitor-aggregate";

const MONITOR_CACHE_TAG = "monitor-data";

function rowsToPayload(rows: MonitorDisplayRow[]): MonitorDataPayload {
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;
  const totalUniqueOrderCount = Math.max(...rows.map((r) => r.activeOrderCount), 0);

  return {
    orderRows: [],
    totalUniqueOrderCount,
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

/** Get monitor data. Cached with Next.js unstable_cache. */
export async function getOrComputeMonitorData(
  orderId: string,
  sourceId: string
): Promise<MonitorDataPayload> {
  return unstable_cache(
    async () => {
      const rows = await aggregateMonitorFromOrderAndSource(orderId, sourceId);
      return rowsToPayload(rows);
    },
    ["monitor-cache", orderId, sourceId],
    { tags: [MONITOR_CACHE_TAG], revalidate: false }
  )();
}

/** Force re-compute. Call from Refresh button. */
export async function refreshMonitorCache(orderId: string, sourceId: string): Promise<void> {
  revalidateTag(MONITOR_CACHE_TAG, "max");
}

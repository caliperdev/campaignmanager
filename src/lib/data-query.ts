"use server";

/**
 * Monitor: read pre-computed data from monitor table. No RPCs.
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { supabase } from "@/db";
import { MONITOR_TABLE } from "@/db/schema";
import type { MonitorRow } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const MONITOR_DATA_CACHE_TAG = "monitor-data";

function rowToMonitorRow(row: {
  id: number;
  year_month: string;
  booked_impressions: number;
  delivered_impressions: number;
  delivered_lines: number;
  media_cost: number;
  media_fees: number;
  celtra_cost: number;
  total_cost: number;
  booked_revenue: number;
  updated_at?: string;
}): MonitorRow {
  return {
    id: row.id,
    yearMonth: row.year_month,
    bookedImpressions: Number(row.booked_impressions),
    deliveredImpressions: Number(row.delivered_impressions),
    deliveredLines: Number(row.delivered_lines),
    mediaCost: Number(row.media_cost),
    mediaFees: Number(row.media_fees),
    celtraCost: Number(row.celtra_cost),
    totalCost: Number(row.total_cost),
    bookedRevenue: Number(row.booked_revenue),
    updatedAt: row.updated_at,
  };
}

/** Cached. Get all monitor rows (pre-computed). */
export async function getMonitorRows(): Promise<MonitorRow[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from(MONITOR_TABLE)
        .select("*")
        .order("year_month", { ascending: true });
      if (error) return [];
      return (data ?? []).map(rowToMonitorRow);
    },
    ["monitor-rows"],
    { tags: [MONITOR_DATA_CACHE_TAG], revalidate: false },
  )();
}

/** Bust the monitor cache. */
export async function refreshMonitorData(): Promise<void> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  revalidateTag(MONITOR_DATA_CACHE_TAG, "max");
}

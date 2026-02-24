"use server";

/**
 * Monitor-only: aggregated data for the Monitor page and charts.
 * Does not affect core architecture (campaigns, tables, data import, data-entry lists).
 */

import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { supabase } from "@/db";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const MONITOR_DATA_CACHE_TAG = "monitor-data";

export type DataImpressionsByYearMonthRow = {
  yearMonth: string;
  sumImpressions: number;
};

/** Aggregation done in DB; returns only year-month + sum(impressions). No full-table fetch. */
async function fetchDataImpressionsByYearMonthFromDb(
  tableId?: string,
): Promise<DataImpressionsByYearMonthRow[]> {
  const { data, error } = await supabase.rpc("get_data_impressions_by_year_month", {
    p_table_id: tableId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { year_month: string; sum_impressions: number }) => ({
    yearMonth: row.year_month,
    sumImpressions: Number(row.sum_impressions),
  }));
}

/**
 * Cached. Optional tableId limits to one data table; null = all data tables.
 * Uses DB aggregation (RPC) so only aggregated numbers are returned, not full tables.
 */
export async function getDataImpressionsByYearMonth(tableId?: string): Promise<DataImpressionsByYearMonthRow[]> {
  return unstable_cache(
    () => fetchDataImpressionsByYearMonthFromDb(tableId),
    ["monitor-data-impressions", tableId ?? "all"],
    { tags: [MONITOR_DATA_CACHE_TAG], revalidate: false },
  )();
}

export type DeliveredLinesByYearMonthRow = {
  yearMonth: string;
  deliveredLines: number;
};

/** Unique count of insertion order gid from csv_data by year-month (DB aggregation). */
async function fetchDeliveredLinesByYearMonthFromDb(
  tableId?: string,
): Promise<DeliveredLinesByYearMonthRow[]> {
  const { data, error } = await supabase.rpc("get_delivered_lines_by_year_month", {
    p_table_id: tableId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { year_month: string; delivered_lines: number }) => ({
    yearMonth: row.year_month,
    deliveredLines: Number(row.delivered_lines),
  }));
}

/**
 * Cached. Optional tableId limits to one data table; null = all data tables.
 * Returns delivered lines (count distinct insertion order gid) per month.
 */
export async function getDeliveredLinesByYearMonth(tableId?: string): Promise<DeliveredLinesByYearMonthRow[]> {
  return unstable_cache(
    () => fetchDeliveredLinesByYearMonthFromDb(tableId),
    ["monitor-data-delivered-lines", tableId ?? "all"],
    { tags: [MONITOR_DATA_CACHE_TAG], revalidate: false },
  )();
}

export type MonitorCostsByYearMonthRow = {
  yearMonth: string;
  mediaCost: number;
  celtraCost: number;
  mediaFees: number;
  totalCost: number;
};

async function fetchMonitorCostsByYearMonthFromDb(
  tableId?: string,
): Promise<MonitorCostsByYearMonthRow[]> {
  const { data, error } = await supabase.rpc("get_monitor_costs_by_year_month", {
    p_table_id: tableId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { year_month: string; media_cost: number; celtra_cost: number; media_fees?: number }) => {
    const mediaCost = Number(row.media_cost);
    const celtraCost = Number(row.celtra_cost);
    const mediaFees = Number(row.media_fees ?? 0);
    return {
      yearMonth: row.year_month,
      mediaCost,
      celtraCost,
      mediaFees,
      totalCost: Math.round((mediaCost + celtraCost + mediaFees) * 100) / 100,
    };
  });
}

export async function getMonitorCostsByYearMonth(tableId?: string): Promise<MonitorCostsByYearMonthRow[]> {
  return unstable_cache(
    () => fetchMonitorCostsByYearMonthFromDb(tableId),
    ["monitor-data-costs", tableId ?? "all"],
    { tags: [MONITOR_DATA_CACHE_TAG], revalidate: false },
  )();
}

export type MonitorBookedRevenueByYearMonthRow = {
  yearMonth: string;
  bookedRevenue: number;
};

async function fetchMonitorBookedRevenueByYearMonthFromDb(
  campaignTableId?: string,
): Promise<MonitorBookedRevenueByYearMonthRow[]> {
  const { data, error } = await supabase.rpc("get_monitor_booked_revenue_by_year_month", {
    p_table_id: campaignTableId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { year_month: string; booked_revenue: number }) => ({
    yearMonth: row.year_month,
    bookedRevenue: Number(row.booked_revenue),
  }));
}

/**
 * Cached. Optional campaignTableId limits to campaigns linked to that table; null = all campaigns.
 */
export async function getMonitorBookedRevenueByYearMonth(
  campaignTableId?: string,
): Promise<MonitorBookedRevenueByYearMonthRow[]> {
  return unstable_cache(
    () => fetchMonitorBookedRevenueByYearMonthFromDb(campaignTableId),
    ["monitor-data-booked-revenue", campaignTableId ?? "all"],
    { tags: [MONITOR_DATA_CACHE_TAG], revalidate: false },
  )();
}

/** Bust the monitor data cache so the next page load recomputes. */
export async function refreshMonitorData(): Promise<void> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  revalidateTag(MONITOR_DATA_CACHE_TAG, "max");
}

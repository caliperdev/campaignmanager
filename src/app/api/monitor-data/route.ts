import { NextResponse } from "next/server";
import { getImpressionsByYearMonth } from "@/lib/campaign";
import {
  getDataImpressionsByYearMonth,
  getDeliveredLinesByYearMonth,
  getMonitorCostsByYearMonth,
  getMonitorBookedRevenueByYearMonth,
} from "@/lib/data-query";
import { mergeMonitorRows, type MonitorDataPayload } from "@/lib/monitor-data";

/**
 * Monitor-only: returns cached data for the Monitor page. Does not affect core architecture.
 * Uses getImpressionsByYearMonth + getDataImpressionsByYearMonth + getDeliveredLinesByYearMonth (cached).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ct = searchParams.get("ct") ?? undefined;
  const dt = searchParams.get("dt") ?? undefined;

  const [campaignResult, dataRows, deliveredLinesRows, costRows, bookedRevenueRows] = await Promise.all([
    getImpressionsByYearMonth(ct ? { tableId: ct } : undefined),
    getDataImpressionsByYearMonth(dt || undefined),
    getDeliveredLinesByYearMonth(dt || undefined),
    getMonitorCostsByYearMonth(dt || undefined),
    getMonitorBookedRevenueByYearMonth(ct || undefined),
  ]);

  const { rows: campaignRows, totalUniqueCampaignCount } = campaignResult;
  const rows = mergeMonitorRows(campaignRows, dataRows, deliveredLinesRows, costRows, bookedRevenueRows);
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;

  const payload: MonitorDataPayload = {
    campaignRows,
    totalUniqueCampaignCount,
    dataRows,
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

  return NextResponse.json(payload);
}

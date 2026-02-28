import { NextResponse } from "next/server";
import { getMonitorRows } from "@/lib/data-query";
import { toMonitorDisplayRows, type MonitorDataPayload } from "@/lib/monitor-data";
import { getOrComputeMonitorData } from "@/lib/monitor-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ct = searchParams.get("ct");
  const dt = searchParams.get("dt");

  let payload: MonitorDataPayload;

  if (ct && dt) {
    payload = await getOrComputeMonitorData(ct, dt);
  } else {
    const monitorRows = await getMonitorRows();
    const rows = toMonitorDisplayRows(monitorRows);
    const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
    const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
    const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
    const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
    const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
    const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
    const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
    const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;

    payload = {
      campaignRows: [],
      totalUniqueCampaignCount: 0,
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

  return NextResponse.json(payload);
}

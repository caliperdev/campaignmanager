import { NextResponse } from "next/server";
import { getPlacementsWithDspAggregated, revalidateDashboardCache } from "@/lib/dashboard-placements-dsp";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import { getOrComputeMonitorData } from "@/lib/monitor-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ct = searchParams.get("ct");
  const dt = searchParams.get("dt");
  const refresh = searchParams.get("refresh") === "1";
  const io = searchParams.get("io");

  let payload: MonitorDataPayload;

  if (ct && dt) {
    payload = await getOrComputeMonitorData(ct, dt);
  } else {
    if (refresh) await revalidateDashboardCache();
    const rows = await getPlacementsWithDspAggregated(io || undefined);
    const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
    const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
    const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
    const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
    const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
    const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
    const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
    const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;
    const totalUniqueOrderCount = Math.max(...rows.map((r) => r.activeOrderCount), 0);

    payload = {
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

  return NextResponse.json(payload);
}

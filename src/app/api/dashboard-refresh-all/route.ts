import { NextResponse } from "next/server";
import { refreshAllDashboardCache } from "@/lib/dashboard-placements-dsp";

/** POST: Refresh dashboard cache for all (io, advertiser) combinations. */
export async function POST() {
  try {
    const { refreshed } = await refreshAllDashboardCache();
    return NextResponse.json({ refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDistinctPlacementIdsForDashboard } from "@/lib/dashboard-placements-dsp";

/** GET ?advertiser=id - returns placement IDs for dashboard filter. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const advertiser = searchParams.get("advertiser");
  const options = await getDistinctPlacementIdsForDashboard(advertiser || undefined);
  return NextResponse.json(options);
}

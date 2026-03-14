import { NextResponse } from "next/server";
import {
  getInsertionOrderIdsForPlacement,
  getPlacementIoIdsForAllPlacements,
} from "@/lib/dashboard-placements-dsp";

/** GET ?placement=id&advertiser=id - returns insertion order IDs for that placement.
 *  GET ?advertiser=id&all=1 - returns { [placementId]: string[] } for all placements (for cache). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  const advertiser = searchParams.get("advertiser");
  const all = searchParams.get("all") === "1";

  if (all) {
    const map = await getPlacementIoIdsForAllPlacements(advertiser || undefined);
    return NextResponse.json(map);
  }
  if (!placement?.trim()) return NextResponse.json([]);
  const ids = await getInsertionOrderIdsForPlacement(placement.trim(), advertiser || undefined);
  return NextResponse.json(ids);
}

import { NextResponse } from "next/server";
import { getDistinctInsertionOrderIds } from "@/lib/dashboard-placements-dsp";

/** GET ?advertiser=id - returns insertion order IDs for that advertiser (or all if no advertiser). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const advertiser = searchParams.get("advertiser");
  const ioOptions = await getDistinctInsertionOrderIds(advertiser || undefined);
  return NextResponse.json(ioOptions);
}

import { NextResponse } from "next/server";
import { refreshDashboardSelection } from "@/lib/dashboard-placements-dsp";

/** POST: Refresh only the current selection (io + advertiser + placement). Body or searchParams: io, advertiser, placement. */
export async function POST(request: Request) {
  try {
    let io: string | null = null;
    let advertiser: string | null = null;
    let placement: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      io = body?.io ?? body?.ioFilter ?? null;
      advertiser = body?.advertiser ?? body?.advertiserFilter ?? null;
      placement = body?.placement ?? body?.placementFilter ?? null;
    } else {
      const { searchParams } = new URL(request.url);
      io = searchParams.get("io");
      advertiser = searchParams.get("advertiser");
      placement = searchParams.get("placement");
    }

    const { refreshed } = await refreshDashboardSelection(io, advertiser, placement);
    return NextResponse.json({ refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh selection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

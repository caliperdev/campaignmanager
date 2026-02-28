import { NextResponse } from "next/server";
import { refreshMonitorCache } from "@/lib/monitor-cache";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

/** Force re-compute and cache monitor data for the given campaign + source. */
export async function POST(request: Request) {
  if (await isReadOnlyMonitorUser()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const ct = searchParams.get("ct");
  const dt = searchParams.get("dt");

  if (!ct || !dt) {
    return NextResponse.json({ error: "ct and dt required" }, { status: 400 });
  }

  try {
    await refreshMonitorCache(ct, dt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getLast7DaysForMonth } from "@/lib/dashboard-placements-dsp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearMonth = searchParams.get("yearMonth");
  const io = searchParams.get("io");
  const advertiser = searchParams.get("advertiser");
  const placement = searchParams.get("placement");

  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json([], { status: 200 });
  }

  const rows = await getLast7DaysForMonth(
    yearMonth,
    io || undefined,
    advertiser || undefined,
    placement || undefined
  );
  return NextResponse.json(rows);
}

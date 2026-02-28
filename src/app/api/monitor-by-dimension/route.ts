import { NextResponse } from "next/server";

export type MonitorByDimensionRow = {
  dimensionValue: string;
  sumImpressions: number;
  activeCampaignCount: number;
};

/**
 * Dimension view: returns empty for now. Pre-computed monitor table does not store per-dimension breakdown.
 * Future: add dimension aggregation to monitor table or pipeline.
 */
export async function GET() {
  return NextResponse.json({ rows: [] as MonitorByDimensionRow[] });
}

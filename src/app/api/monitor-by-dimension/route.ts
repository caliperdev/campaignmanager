import { NextResponse } from "next/server";
import { getImpressionsByYearMonthPerCampaign } from "@/lib/campaign";
import { getCampaignListForTable } from "@/lib/tables";

export type MonitorByDimensionRow = {
  dimensionValue: string;
  sumImpressions: number;
  activeCampaignCount: number;
};

/**
 * Returns monitor metrics (booked impressions, campaign count) grouped by a campaign table dimension (column from pipeline).
 * Requires ct (campaign table id) and dimension (column header name, e.g. "Advertiser").
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ct = searchParams.get("ct");
  const dimension = searchParams.get("dimension");
  if (!ct || !dimension?.trim()) {
    return NextResponse.json(
      { error: "ct and dimension are required" },
      { status: 400 }
    );
  }

  const [perCampaignRows, campaignList] = await Promise.all([
    getImpressionsByYearMonthPerCampaign({ tableId: ct }),
    getCampaignListForTable(ct),
  ]);

  const byDimension = new Map<
    string,
    { sumImpressions: number; campaignIds: Set<number> }
  >();
  const campaignIdToCsv = new Map(
    campaignList.map((c) => [c.id, c.csvData])
  );

  for (const row of perCampaignRows) {
    const csv = campaignIdToCsv.get(row.campaignId);
    const value = (csv?.[dimension] ?? "").trim() || "(blank)";
    let agg = byDimension.get(value);
    if (!agg) {
      agg = { sumImpressions: 0, campaignIds: new Set() };
      byDimension.set(value, agg);
    }
    agg.sumImpressions += row.sumImpressions;
    agg.campaignIds.add(row.campaignId);
  }

  const rows: MonitorByDimensionRow[] = Array.from(byDimension.entries())
    .map(([dimensionValue, agg]) => ({
      dimensionValue,
      sumImpressions: agg.sumImpressions,
      activeCampaignCount: agg.campaignIds.size,
    }))
    .sort((a, b) => b.sumImpressions - a.sumImpressions);

  return NextResponse.json({ rows });
}

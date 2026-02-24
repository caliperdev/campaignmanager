/**
 * Monitor-only: types and merge logic for the Monitor page and monitor-data API.
 * Does not affect core architecture; does not call Supabase directly.
 */

export type MonitorRow = {
  yearMonth: string;
  sumImpressions: number;
  activeCampaignCount: number;
  dataImpressions: number;
  deliveredLines: number;
  mediaCost: number;
  mediaFees: number;
  celtraCost: number;
  totalCost: number;
  bookedRevenue: number;
};

const emptyRow = (yearMonth: string): MonitorRow => ({
  yearMonth,
  sumImpressions: 0,
  activeCampaignCount: 0,
  dataImpressions: 0,
  deliveredLines: 0,
  mediaCost: 0,
  mediaFees: 0,
  celtraCost: 0,
  totalCost: 0,
  bookedRevenue: 0,
});

export function mergeMonitorRows(
  campaignRows: { yearMonth: string; sumImpressions: number; activeCampaignCount: number }[],
  dataRows: { yearMonth: string; sumImpressions: number }[],
  deliveredLinesRows: { yearMonth: string; deliveredLines: number }[],
  costRows: { yearMonth: string; mediaCost: number; celtraCost: number; mediaFees?: number; totalCost: number }[],
  bookedRevenueRows: { yearMonth: string; bookedRevenue: number }[],
): MonitorRow[] {
  const byMonth = new Map<string, MonitorRow>();

  const getOrCreate = (ym: string) => {
    let row = byMonth.get(ym);
    if (!row) { row = emptyRow(ym); byMonth.set(ym, row); }
    return row;
  };

  for (const r of campaignRows) {
    const row = getOrCreate(r.yearMonth);
    row.sumImpressions = r.sumImpressions;
    row.activeCampaignCount = r.activeCampaignCount;
  }
  for (const r of dataRows) {
    getOrCreate(r.yearMonth).dataImpressions = r.sumImpressions;
  }
  for (const r of deliveredLinesRows) {
    getOrCreate(r.yearMonth).deliveredLines = r.deliveredLines;
  }
  for (const r of costRows) {
    const row = getOrCreate(r.yearMonth);
    row.mediaCost = r.mediaCost;
    row.celtraCost = r.celtraCost;
    row.mediaFees = r.mediaFees ?? 0;
    row.totalCost = r.totalCost;
  }
  for (const r of bookedRevenueRows) {
    getOrCreate(r.yearMonth).bookedRevenue = r.bookedRevenue;
  }

  return Array.from(byMonth.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export type MonitorDataPayload = {
  campaignRows: { yearMonth: string; sumImpressions: number; activeCampaignCount: number }[];
  totalUniqueCampaignCount: number;
  dataRows: { yearMonth: string; sumImpressions: number }[];
  rows: MonitorRow[];
  totalImpressions: number;
  totalDataImpressions: number;
  totalDeliveredLines: number;
  totalMediaCost: number;
  totalMediaFees: number;
  totalCeltraCost: number;
  totalTotalCost: number;
  totalBookedRevenue: number;
};

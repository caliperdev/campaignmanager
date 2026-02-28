/**
 * Monitor page: types and helpers. Data comes from monitor table (pre-computed).
 */
import type { MonitorRow } from "@/db/schema";

/** Row shape expected by MonitorContent (legacy names). */
export type MonitorDisplayRow = {
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

/** Map DB monitor rows to display shape. */
export function toMonitorDisplayRows(rows: MonitorRow[]): MonitorDisplayRow[] {
  return rows.map((r) => ({
    yearMonth: r.yearMonth,
    sumImpressions: r.bookedImpressions,
    activeCampaignCount: 0,
    dataImpressions: r.deliveredImpressions,
    deliveredLines: r.deliveredLines,
    mediaCost: r.mediaCost,
    mediaFees: r.mediaFees,
    celtraCost: r.celtraCost,
    totalCost: r.totalCost,
    bookedRevenue: r.bookedRevenue,
  }));
}

export type MonitorDataPayload = {
  campaignRows: MonitorDisplayRow[];
  totalUniqueCampaignCount: number;
  dataRows: MonitorDisplayRow[];
  rows: MonitorDisplayRow[];
  totalImpressions: number;
  totalDataImpressions: number;
  totalDeliveredLines: number;
  totalMediaCost: number;
  totalMediaFees: number;
  totalCeltraCost: number;
  totalTotalCost: number;
  totalBookedRevenue: number;
};

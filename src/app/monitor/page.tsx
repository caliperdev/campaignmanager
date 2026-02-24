import { getImpressionsByYearMonth } from "@/lib/campaign";
import {
  getDataImpressionsByYearMonth,
  getDeliveredLinesByYearMonth,
  getMonitorCostsByYearMonth,
  getMonitorBookedRevenueByYearMonth,
} from "@/lib/data-query";
import { mergeMonitorRows } from "@/lib/monitor-data";
import { getTable, getTables, type Table } from "@/lib/tables";
import MonitorContent from "./MonitorContent";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Monitor",
  description: "Monitor and analytics",
};

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ ct?: string; dt?: string }>;
}) {
  await enforceNotReadOnly();
  const { ct, dt } = await searchParams;

  const [campaignTables, dataTables, campaignResult, dataRows, deliveredLinesRows, costRows, bookedRevenueRows] =
    await Promise.all([
      getTables(null, "campaign"),
      getTables(null, "data"),
      getImpressionsByYearMonth(ct ? { tableId: ct } : undefined),
      getDataImpressionsByYearMonth(dt || undefined),
      getDeliveredLinesByYearMonth(dt || undefined),
      getMonitorCostsByYearMonth(dt || undefined),
      getMonitorBookedRevenueByYearMonth(ct || undefined),
    ]);

  const { rows: campaignRows, totalUniqueCampaignCount } = campaignResult;
  const rows = mergeMonitorRows(campaignRows, dataRows, deliveredLinesRows, costRows, bookedRevenueRows);
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;

  const initialData = {
    campaignRows,
    totalUniqueCampaignCount,
    dataRows,
    rows,
    totalImpressions,
    totalDataImpressions,
    totalDeliveredLines,
    totalMediaCost,
    totalMediaFees,
    totalCeltraCost,
    totalTotalCost,
    totalBookedRevenue,
  };

  const selectedCampaignTable = ct ? await getTable(ct) : null;
  const dimensionOptions = selectedCampaignTable?.columnHeaders ?? [];

  return (
    <MonitorContent
      initialData={initialData}
      ct={ct ?? null}
      dt={dt ?? null}
      campaignTables={campaignTables}
      dataTables={dataTables}
      dimensionOptions={dimensionOptions}
    />
  );
}

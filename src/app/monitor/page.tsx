import { getMonitorRows } from "@/lib/data-query";
import { toMonitorDisplayRows, type MonitorDataPayload } from "@/lib/monitor-data";
import { getCampaigns, getSources } from "@/lib/tables";
import MonitorContent from "./MonitorContent";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Monitor",
  description: "Monitor and analytics",
};

export default async function MonitorPage() {
  await enforceNotReadOnly();

  const [monitorRows, campaigns, sources] = await Promise.all([
    getMonitorRows(),
    getCampaigns(),
    getSources(),
  ]);

  const rows = toMonitorDisplayRows(monitorRows);
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;

  const initialData: MonitorDataPayload = {
    campaignRows: [],
    totalUniqueCampaignCount: 0,
    dataRows: [],
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

  return (
    <MonitorContent
      initialData={initialData}
      campaignTables={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      dataTables={sources.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}

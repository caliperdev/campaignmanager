import { getMonitorRows } from "@/lib/data-query";
import { toMonitorDisplayRows, type MonitorDataPayload } from "@/lib/monitor-data";
import { getCampaigns, getSources } from "@/lib/tables";
import { getOrComputeMonitorData } from "@/lib/monitor-cache";
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

  const params = await searchParams;
  const ct = params?.ct ?? null;
  const dt = params?.dt ?? null;

  const [campaigns, sources, initialData] = await Promise.all([
    getCampaigns(),
    getSources(),
    ct && dt ? getOrComputeMonitorData(ct, dt) : getGlobalMonitorData(),
  ]);

  return (
    <MonitorContent
      initialData={initialData}
      ct={ct}
      dt={dt}
      campaignTables={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      dataTables={sources.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}

async function getGlobalMonitorData(): Promise<MonitorDataPayload> {
  const monitorRows = await getMonitorRows();
  const rows = toMonitorDisplayRows(monitorRows);
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;

  return {
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
}

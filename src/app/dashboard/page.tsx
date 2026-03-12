import {
  getDistinctInsertionOrderIds,
  getDashboardDataFromCache,
} from "@/lib/dashboard-placements-dsp";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import MonitorContent from "@/app/monitor/MonitorContent";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

export const metadata = {
  title: "Dashboard",
  description: "Dashboard and analytics",
};

/** Dashboard loads from dashboard_cache (persisted). Refresh button stores fresh data. */
function rowsToPayload(rows: MonitorDataPayload["rows"]): MonitorDataPayload {
  const totalImpressions = rows.reduce((acc, r) => acc + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((acc, r) => acc + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((acc, r) => acc + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((acc, r) => acc + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((acc, r) => acc + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((acc, r) => acc + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((acc, r) => acc + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((acc, r) => acc + r.bookedRevenue, 0) * 100) / 100;
  const totalUniqueOrderCount = Math.max(...rows.map((r) => r.activeOrderCount), 0);

  return {
    orderRows: [],
    totalUniqueOrderCount,
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

export default async function DashboardPage() {
  const readOnly = await isReadOnlyMonitorUser();
  const [ioOptions, rows] = await Promise.all([
    getDistinctInsertionOrderIds(),
    getDashboardDataFromCache(),
  ]);

  const initialData = rowsToPayload(rows);

  return (
    <MonitorContent
      initialData={initialData}
      orderTables={[]}
      dataTables={[]}
      ioOptions={ioOptions}
      readOnly={readOnly}
      forceGlobal={true}
    />
  );
}

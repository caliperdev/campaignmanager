import { getDistinctInsertionOrderIds } from "@/lib/dashboard-placements-dsp";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import MonitorContent from "@/app/monitor/MonitorContent";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

export const metadata = {
  title: "Dashboard",
  description: "Dashboard and analytics",
};

/** Dashboard loads data only when user clicks Refresh. No initial fetch on page load. */
const EMPTY_INITIAL_DATA: MonitorDataPayload = {
  orderRows: [],
  totalUniqueOrderCount: 0,
  dataRows: [],
  rows: [],
  totalImpressions: 0,
  totalDataImpressions: 0,
  totalDeliveredLines: 0,
  totalMediaCost: 0,
  totalMediaFees: 0,
  totalCeltraCost: 0,
  totalTotalCost: 0,
  totalBookedRevenue: 0,
};

export default async function DashboardPage() {
  const readOnly = await isReadOnlyMonitorUser();
  const ioOptions = await getDistinctInsertionOrderIds();

  return (
    <MonitorContent
      initialData={EMPTY_INITIAL_DATA}
      orderTables={[]}
      dataTables={[]}
      ioOptions={ioOptions}
      readOnly={readOnly}
      forceGlobal={true}
    />
  );
}

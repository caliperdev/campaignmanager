import { redirect } from "next/navigation";
import { getMonitorRows } from "@/lib/data-query";
import { toMonitorDisplayRows, type MonitorDataPayload } from "@/lib/monitor-data";
import { getCurrentUserEmail } from "@/lib/read-only-guard";
import ShareShell from "./ShareShell";

const READ_ONLY_EMAIL_KEY = "READ_ONLY_MONITOR_EMAIL";

function normalizedConfigEmail(): string | null {
  const raw = process.env[READ_ONLY_EMAIL_KEY];
  if (raw == null || typeof raw !== "string") return null;
  return raw.trim().toLowerCase() || null;
}

export const metadata = {
  title: "Share — Monitor",
  description: "Read-only global Monitor view",
};

export default async function SharePage() {
  const userEmail = await getCurrentUserEmail();
  const configEmail = normalizedConfigEmail();

  if (!userEmail) redirect("/login");
  if (!configEmail || userEmail !== configEmail) redirect("/login");

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

  return <ShareShell initialData={initialData} />;
}

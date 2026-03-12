import Link from "next/link";
import { getCampaigns } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { NewOrderForm } from "./NewOrderForm";

export const metadata = {
  title: "New order",
  description: "Create a new order",
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  await enforceNotReadOnly();
  const campaigns = await getCampaigns();
  const { campaign: prefilledCampaignId } = await searchParams;

  return (
    <main
      className="main-content"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 0",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Link href="/orders" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Orders
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New order</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          New order
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          Create a new order. Select a campaign and enter Order #.
        </p>
        <NewOrderForm campaigns={campaigns} prefilledCampaignId={prefilledCampaignId} />
      </div>
    </main>
  );
}

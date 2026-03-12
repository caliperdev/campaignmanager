import Link from "next/link";
import { getAgency, getCampaignsByAgency } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { AgencyDetailClient } from "./AgencyDetailClient";

export const metadata = {
  title: "Agency",
  description: "Agency detail",
};

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const [agency, campaigns] = await Promise.all([
    getAgency(id),
    getCampaignsByAgency(id),
  ]);

  if (!agency) {
    return (
      <main className="page-responsive-padding" style={{ padding: 32 }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Agency not found.</p>
        <Link
          href="/agencies"
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "8px 16px",
            fontSize: 14,
            color: "var(--text-primary)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
          }}
        >
          Back to agencies
        </Link>
      </main>
    );
  }

  return <AgencyDetailClient agency={agency} campaigns={campaigns} />;
}

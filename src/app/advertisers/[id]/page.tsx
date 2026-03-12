import Link from "next/link";
import { getAdvertiser, getCampaigns } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { AdvertiserDetailClient } from "./AdvertiserDetailClient";

export const metadata = {
  title: "Advertiser",
  description: "Advertiser detail",
};

export default async function AdvertiserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const [advertiser, campaigns] = await Promise.all([getAdvertiser(id), getCampaigns(id)]);

  if (!advertiser) {
    return (
      <main className="page-responsive-padding" style={{ padding: 32 }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Advertiser not found.</p>
        <Link
          href="/advertisers"
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
          Back to advertisers
        </Link>
      </main>
    );
  }

  return <AdvertiserDetailClient advertiser={advertiser} campaigns={campaigns} />;
}

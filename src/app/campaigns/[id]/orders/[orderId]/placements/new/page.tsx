import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getOrder,
  getCampaign,
  getCampaigns,
  getAdvertiser,
  getAgency,
  getTraffickerOptions,
  getAmOptions,
  getQaAmOptions,
  getFormatOptions,
  getDealOptions,
} from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { NewPlacementForm } from "@/app/orders/[id]/placements/new/NewPlacementForm";

export const metadata = {
  title: "New placement",
  description: "Create a new placement",
};

export default async function NewCampaignOrderPlacementPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  await enforceNotReadOnly();
  const { id: campaignId, orderId } = await params;
  const decodedCampaignId = decodeURIComponent(campaignId);
  const [order, campaign, campaigns, traffickerOptions, amOptions, qaAmOptions, formatOptions, dealOptions] =
    await Promise.all([
      getOrder(orderId),
      getCampaign(decodedCampaignId),
      getCampaigns(),
      getTraffickerOptions(),
      getAmOptions(),
      getQaAmOptions(),
      getFormatOptions(),
      getDealOptions(),
    ]);
  if (!order) notFound();
  const displayCampaignId = campaign?.externalId?.trim() || campaign?.name || decodedCampaignId;
  const [advertiser, agency] = await Promise.all([
    campaign ? getAdvertiser(campaign.advertiserId) : Promise.resolve(null),
    campaign?.agencyId ? getAgency(campaign.agencyId) : Promise.resolve(null),
  ]);

  const campaignForPicker = campaigns.map((c) => ({
    id: c.id,
    name: c.externalId?.trim() || c.name || "",
    category: c.category ?? null,
  }));

  return (
    <main
      className="page-responsive-padding"
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
          padding: "8px 32px",
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
        <Link href="/campaigns" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Campaigns
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <Link
          href={`/campaigns/${campaignId}`}
          style={{ color: "var(--text-tertiary)", textDecoration: "none" }}
        >
          {displayCampaignId}
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <Link
          href={`/campaigns/${campaignId}/orders/${orderId}`}
          style={{ color: "var(--text-tertiary)", textDecoration: "none" }}
        >
          {order.name}
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New placement</span>
      </div>

      <div style={{ flex: 1, padding: 32, minWidth: 0, width: "100%" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          New placement
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          Add a new placement to this campaign.
        </p>
        <NewPlacementForm
          orderId={orderId}
          campaigns={campaignForPicker}
          defaultOrderCampaign={displayCampaignId}
          defaultOrderCampaignId={decodedCampaignId}
          returnPath={`/campaigns/${campaignId}/orders/${orderId}`}
          orderAgencyName={agency?.name}
          orderAdvertiser={advertiser?.advertiser ?? undefined}
          orderName={order.name}
          traffickerOptions={traffickerOptions}
          amOptions={amOptions}
          qaAmOptions={qaAmOptions}
          formatOptions={formatOptions}
          dealOptions={dealOptions}
        />
      </div>
    </main>
  );
}

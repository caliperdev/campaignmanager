import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getOrder,
  getCampaign,
  getPlacementById,
  getAdvertiser,
  getAgency,
  getTraffickerOptions,
  getAmOptions,
  getQaAmOptions,
  getFormatOptions,
  getDealOptions,
} from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { EditPlacementForm } from "@/app/orders/[id]/campaigns/[campaignId]/placements/[placementId]/edit/EditPlacementForm";

export const metadata = {
  title: "Edit placement",
  description: "Edit placement",
};

export default async function EditPlacementPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string; placementId: string }>;
}) {
  await enforceNotReadOnly();
  const { id: campaignId, orderId, placementId: placementIdStr } = await params;
  const decodedCampaignId = decodeURIComponent(campaignId);
  const placementId = parseInt(placementIdStr, 10);
  if (isNaN(placementId)) notFound();

  const order = await getOrder(orderId);
  if (!order) notFound();

  const [campaign, placementRow, traffickerOptions, amOptions, qaAmOptions, formatOptions, dealOptions] =
    await Promise.all([
      getCampaign(decodedCampaignId),
      getPlacementById(orderId, placementId),
      getTraffickerOptions(),
      getAmOptions(),
      getQaAmOptions(),
      getFormatOptions(),
      getDealOptions(),
    ]);

  if (!placementRow) notFound();

  const displayCampaignId = campaign?.externalId?.trim() || campaign?.name || decodedCampaignId;
  const [advertiser, agency] = await Promise.all([
    campaign ? getAdvertiser(campaign.advertiserId) : Promise.resolve(null),
    campaign?.agencyId ? getAgency(campaign.agencyId) : Promise.resolve(null),
  ]);

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
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Edit placement</span>
      </div>

      <div style={{ flex: 1, padding: 32, minWidth: 0, width: "100%" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          Edit placement
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          Update placement details. Order #, Campaign ID, Agency, and Category are inherited from the order and campaign.
        </p>
        <EditPlacementForm
          orderId={orderId}
          campaignId={campaignId}
          placementId={placementId}
          returnPath={`/campaigns/${campaignId}/orders/${orderId}`}
          initialRow={placementRow}
          orderName={order.name}
          campaignDisplayId={displayCampaignId}
          orderAgencyName={agency?.name}
          orderAdvertiser={advertiser?.advertiser ?? undefined}
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

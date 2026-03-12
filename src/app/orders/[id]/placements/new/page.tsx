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
import { NewPlacementForm } from "./NewPlacementForm";

export const metadata = {
  title: "New placement",
  description: "Create a new placement",
};

export default async function NewPlacementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const campaign = await getCampaign(order.campaignId);
  const [campaigns, advertiser, agency, traffickerOptions, amOptions, qaAmOptions, formatOptions, dealOptions] =
    await Promise.all([
      getCampaigns(),
      campaign ? getAdvertiser(campaign.advertiserId) : Promise.resolve(null),
      campaign?.agencyId ? getAgency(campaign.agencyId) : Promise.resolve(null),
      getTraffickerOptions(),
      getAmOptions(),
      getQaAmOptions(),
      getFormatOptions(),
      getDealOptions(),
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
        <Link href="/orders" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Orders
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <Link
          href={`/orders/${id}`}
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
        <NewPlacementForm
          orderId={id}
          campaigns={campaigns}
          returnPath={`/orders/${id}`}
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

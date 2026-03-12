import { notFound } from "next/navigation";
import {
  getOrder,
  getCampaign,
  getPlacementsForOrder,
  PLACEMENTS_TABLE_COLUMN_HEADERS,
  getTraffickerOptions,
  getAmOptions,
  getQaAmOptions,
  getFormatOptions,
  getCategoryOptions,
  getDealOptions,
} from "@/lib/tables";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

const INITIAL_PAGE_SIZE = 500;

export const metadata = {
  title: "Campaign Placements",
  description: "Placements for campaign in order",
};

export default async function CampaignOrderPlacementsPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  await enforceNotReadOnly();
  const { id: campaignId, orderId } = await params;
  const decodedCampaignId = decodeURIComponent(campaignId);
  const [order, campaign, traffickerOptions, amOptions, qaAmOptions, formatOptions, categoryOptions, dealOptions] =
    await Promise.all([
      getOrder(orderId),
      getCampaign(decodedCampaignId),
      getTraffickerOptions(),
      getAmOptions(),
      getQaAmOptions(),
      getFormatOptions(),
      getCategoryOptions(),
      getDealOptions(),
    ]);
  if (!order) notFound();

  const displayCampaignId = campaign?.externalId?.trim() || campaign?.name || decodedCampaignId;

  const campaignFilter = {
    or: [
      { column: "order_campaign", value: decodedCampaignId },
      { column: "order_campaign_id", value: decodedCampaignId },
      { column: "order_campaign", value: displayCampaignId },
      { column: "order_campaign_id", value: displayCampaignId },
    ],
  };

  const chunk = await getPlacementsForOrder(orderId, 0, INITIAL_PAGE_SIZE, campaignFilter);

  const virtualItem = {
    id: orderId,
    name: displayCampaignId,
    columnHeaders: [...PLACEMENTS_TABLE_COLUMN_HEADERS],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };

  return (
    <TableView
      key={chunk.total}
      item={virtualItem}
      basePath="/campaigns"
      initialDynamicRows={chunk.rows}
      dynamicTotal={chunk.total}
      readOnly={false}
      orderId={orderId}
      orderName={order.name}
      campaignId={campaignId}
      campaignFilter={campaignFilter}
      categoryOptions={categoryOptions}
      traffickerOptions={traffickerOptions}
      amOptions={amOptions}
      qaAmOptions={qaAmOptions}
      formatOptions={formatOptions}
      dealOptions={dealOptions}
    />
  );
}

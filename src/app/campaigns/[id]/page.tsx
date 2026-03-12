import { notFound } from "next/navigation";
import { getCampaign, getAdvertiser, getOrdersForCampaign } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { CampaignOrdersList } from "./CampaignOrdersList";

export const metadata = {
  title: "Campaign",
  description: "Campaign orders",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [orderGroups, advertiser] = await Promise.all([
    getOrdersForCampaign(id),
    getAdvertiser(campaign.advertiserId),
  ]);

  return (
    <CampaignOrdersList campaign={campaign} advertiser={advertiser} orderGroups={orderGroups} />
  );
}

import { redirect } from "next/navigation";

export default async function OldNewPlacementRedirect({
  params,
}: {
  params: Promise<{ id: string; campaignId: string }>;
}) {
  const { id: orderId, campaignId } = await params;
  redirect(`/campaigns/${encodeURIComponent(campaignId)}/orders/${orderId}/placements/new`);
}

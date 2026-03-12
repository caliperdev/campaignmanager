import { redirect } from "next/navigation";

export default async function OldEditPlacementRedirect({
  params,
}: {
  params: Promise<{ id: string; campaignId: string; placementId: string }>;
}) {
  const { id: orderId, campaignId, placementId } = await params;
  redirect(`/campaigns/${encodeURIComponent(campaignId)}/orders/${orderId}/placements/${placementId}/edit`);
}

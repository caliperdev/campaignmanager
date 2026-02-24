import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaign";
import EditCampaignClient from "./EditCampaignClient";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Edit Campaign",
  description: "Edit campaign details",
};

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await enforceNotReadOnly();
  const { id: rawId } = await params;
  const { returnTo } = await searchParams;
  const id = Number(rawId);
  if (isNaN(id)) notFound();

  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <EditCampaignClient campaign={campaign} returnTo={returnTo} />
  );
}

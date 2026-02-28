import { getCampaigns } from "@/lib/tables";
import { BoardListPage } from "@/components/BoardListPage";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Campaigns",
  description: "Manage your campaigns",
};

export default async function CampaignsPage() {
  await enforceNotReadOnly();
  const campaigns = await getCampaigns();

  return (
    <BoardListPage
      title="Campaigns"
      section="campaign"
      basePath="/campaigns"
      initialItems={campaigns}
    />
  );
}

import { notFound } from "next/navigation";
import { getTable, getCampaignListForTableChunk, getTableCampaignCount } from "@/lib/tables";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

const INITIAL_PAGE_SIZE = 500;

export const metadata = {
  title: "Campaign Board",
  description: "Campaign board view",
};

export default async function CampaignBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const [table, initialCampaigns, totalCount] = await Promise.all([
    getTable(id),
    getCampaignListForTableChunk(id, 0, INITIAL_PAGE_SIZE),
    getTableCampaignCount(id),
  ]);
  if (!table) notFound();

  return (
    <TableView
      table={table}
      basePath="/campaigns"
      initialCampaigns={initialCampaigns}
      totalCount={totalCount}
    />
  );
}

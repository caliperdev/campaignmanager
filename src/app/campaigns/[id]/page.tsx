import { notFound } from "next/navigation";
import {
  getTable,
  getCampaignListForTableChunk,
  getTableCampaignCount,
  getDynamicTableChunkWithCount,
} from "@/lib/tables";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import type { CampaignListItem } from "@/lib/campaign-grid";
import type { DynamicTableRow } from "@/lib/tables";

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
  const table = await getTable(id);
  if (!table) notFound();

  let initialCampaigns: CampaignListItem[] = [];
  let totalCount = 0;
  let initialDynamicRows: DynamicTableRow[] | undefined;
  let dynamicTotal: number | undefined;

  if (table.dynamicTableName) {
    const chunk = await getDynamicTableChunkWithCount(
      table.dynamicTableName,
      0,
      INITIAL_PAGE_SIZE,
    );
    initialDynamicRows = chunk.rows;
    dynamicTotal = chunk.total;
  } else {
    const [campaigns, count] = await Promise.all([
      getCampaignListForTableChunk(id, 0, INITIAL_PAGE_SIZE),
      getTableCampaignCount(id),
    ]);
    initialCampaigns = campaigns;
    totalCount = count;
  }

  return (
    <TableView
      table={table}
      basePath="/campaigns"
      initialCampaigns={initialCampaigns}
      totalCount={totalCount}
      initialDynamicRows={initialDynamicRows}
      dynamicTotal={dynamicTotal}
    />
  );
}

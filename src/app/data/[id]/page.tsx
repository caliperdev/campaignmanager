import { notFound } from "next/navigation";
import { getTable } from "@/lib/tables";
import { getDataEntryListForTableChunk, getDataEntryCountForTable } from "@/lib/data-entry";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

const INITIAL_PAGE_SIZE = 100;

export const metadata = {
  title: "Data Board",
  description: "Data board view",
};

export default async function DataBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const [table, initialCampaigns, totalCount] = await Promise.all([
    getTable(id),
    getDataEntryListForTableChunk(id, 0, INITIAL_PAGE_SIZE),
    getDataEntryCountForTable(id),
  ]);
  if (!table) notFound();

  return (
    <TableView
      table={table}
      basePath="/data"
      initialCampaigns={initialCampaigns}
      totalCount={totalCount}
      fetchChunk={getDataEntryListForTableChunk}
    />
  );
}

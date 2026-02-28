import { notFound } from "next/navigation";
import { getSource, getDynamicTableChunkWithCount } from "@/lib/tables";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

const INITIAL_PAGE_SIZE = 500;

export const metadata = {
  title: "Source",
  description: "Source view",
};

export default async function SourceBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const source = await getSource(id);
  if (!source) notFound();

  const chunk = await getDynamicTableChunkWithCount(
    source.dynamicTableName,
    0,
    INITIAL_PAGE_SIZE,
  );

  return (
    <TableView
      item={source}
      basePath="/sources"
      initialDynamicRows={chunk.rows}
      dynamicTotal={chunk.total}
      readOnly={true}
    />
  );
}

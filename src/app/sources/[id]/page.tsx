import { notFound } from "next/navigation";
import { getSource, getDynamicTableChunkWithCount } from "@/lib/tables";
import type { DynamicTableRow } from "@/lib/tables";
import { fetchDataverseTableFull } from "@/lib/dataverse-source";
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

  const isDataverse = Boolean(source.entitySetName && source.logicalName);

  if (isDataverse) {
    let chunk: Awaited<ReturnType<typeof fetchDataverseTableFull>>;
    try {
      chunk = await fetchDataverseTableFull(source.entitySetName!, source.logicalName!);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 560,
            margin: "24px auto",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
            Cannot load Dataverse table
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {message}
          </p>
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-tertiary)" }}>
            In Power Platform Admin Center (or your environment settings), open the Application user for this app and add a
            security role that includes <strong>Read</strong> on the entity &quot;{source.name}&quot;.
          </p>
          <a
            href="/sources"
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
            }}
          >
            Back to Sources
          </a>
        </div>
      );
    }
    const item = {
      ...source,
      columnHeaders: chunk.columns.length > 0 ? chunk.columns : undefined,
      dynamicTableName: undefined,
    };
    const rows: DynamicTableRow[] = chunk.rows.map((r, i) => ({
      ...r,
      id: i + 1,
    }));
    return (
      <TableView
        item={item}
        basePath="/sources"
        initialDynamicRows={rows}
        dynamicTotal={chunk.total}
        readOnly={true}
      />
    );
  }

  const chunk = await getDynamicTableChunkWithCount(
    source.dynamicTableName!,
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

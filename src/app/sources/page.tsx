import { getSources } from "@/lib/tables";
import { BoardListPage } from "@/components/BoardListPage";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { matchesSearch } from "@/lib/search";

export const metadata = {
  title: "Sources",
  description: "Sources",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  await enforceNotReadOnly();
  const { search = "" } = await searchParams;
  const sources = await getSources();
  const filtered = search.trim()
    ? sources.filter((s) => matchesSearch(search, s.name, s.entitySetName ?? undefined, s.logicalName ?? undefined))
    : sources;

  return (
    <BoardListPage
      title="Sources"
      section="sources"
      basePath="/sources"
      initialItems={filtered}
    />
  );
}

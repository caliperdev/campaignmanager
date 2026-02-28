import { getSources } from "@/lib/tables";
import { BoardListPage } from "@/components/BoardListPage";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Sources",
  description: "Sources",
};

export default async function SourcesPage() {
  await enforceNotReadOnly();
  const sources = await getSources();

  return (
    <BoardListPage
      title="Sources"
      section="sources"
      basePath="/sources"
      initialItems={sources}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { getTables } from "@/lib/tables";
import { BoardListPage } from "@/components/BoardListPage";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Data",
  description: "Manage your data tables",
};

export default async function DataPage() {
  await enforceNotReadOnly();
  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  const tables = await getTables(userId, "data");

  return (
    <BoardListPage
      title="Data"
      section="data"
      basePath="/data"
      initialTables={tables}
      userId={userId}
    />
  );
}

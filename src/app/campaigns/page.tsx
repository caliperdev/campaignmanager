import { createClient } from "@/lib/supabase/server";
import { getTables } from "@/lib/tables";
import { BoardListPage } from "@/components/BoardListPage";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Campaigns",
  description: "Manage your campaign tables",
};

export default async function CampaignsPage() {
  await enforceNotReadOnly();
  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  const tables = await getTables(userId, "campaign");

  return (
    <BoardListPage
      title="Campaigns"
      section="campaign"
      basePath="/campaigns"
      initialTables={tables}
      userId={userId}
    />
  );
}

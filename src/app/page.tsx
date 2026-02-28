import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/Landing";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

export const metadata = {
  title: "Campaign Manager",
  description: "Manage campaigns and data",
};

export default async function Home() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect((await isReadOnlyMonitorUser()) ? "/monitor" : "/home");
    }
  }
  return <Landing />;
}

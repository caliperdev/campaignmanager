import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/Landing";

const READ_ONLY_EMAIL_KEY = "READ_ONLY_MONITOR_EMAIL";

function isReadOnlyViewUser(email: string | null): boolean {
  const config = (process.env[READ_ONLY_EMAIL_KEY] ?? "").trim().toLowerCase();
  return !!config && !!email && email.trim().toLowerCase() === config;
}

export const metadata = {
  title: "Campaign Manager",
  description: "Manage campaigns and data",
};

export default async function Home() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect(isReadOnlyViewUser(user.email ?? null) ? "/share" : "/home");
    }
  }
  return <Landing />;
}

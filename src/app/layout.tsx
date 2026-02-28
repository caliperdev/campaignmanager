import "@/resources/design-layout.css";

import { Providers } from "@/components/Providers";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/server";
import { getSidebarData } from "@/lib/tables";
import type { Campaign, Source } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const EMPTY_CAMPAIGNS: Campaign[] = [];
const EMPTY_SOURCES: Source[] = [];

export const metadata = {
  title: "Campaign Manager",
  description: "Campaign manager — campaigns, data, resizable columns, font size, filters, sorting",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  const readOnlyUser = await isReadOnlyMonitorUser();
  const { campaigns, sources } = readOnlyUser
    ? { campaigns: EMPTY_CAMPAIGNS, sources: EMPTY_SOURCES }
    : await getSidebarData();

  return (
    <html lang="en">
      <body className="design-layout">
        <Providers>
          <AuthLayout campaigns={campaigns} sources={sources}>
            {children}
          </AuthLayout>
        </Providers>
      </body>
    </html>
  );
}

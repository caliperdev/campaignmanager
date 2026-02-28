import "@/resources/design-layout.css";

import { Providers } from "@/components/Providers";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/server";
import { getSidebarData } from "@/lib/tables";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import type { Campaign, Source } from "@/db/schema";
const EMPTY_CAMPAIGNS: Campaign[] = [];
const EMPTY_SOURCES: Source[] = [];

/** Layout uses cookies (auth), so it must be dynamic. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campaign Manager",
  description: "Campaign manager — campaigns, data, resizable columns, font size, filters, sorting",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let campaigns = EMPTY_CAMPAIGNS;
  let sources = EMPTY_SOURCES;
  let readOnlyUser = false;

  try {
    await createClient();
    readOnlyUser = await isReadOnlyMonitorUser();
    // Always load campaigns and sources so all users see the same sidebar (Supabase campaigns, Dataverse sources)
    const data = await getSidebarData();
    campaigns = data.campaigns;
    sources = data.sources;
  } catch (err) {
    console.error("[RootLayout] Failed to load auth/sidebar:", err);
  }

  return (
    <html lang="en">
      <body className="design-layout">
        <Providers>
          <AuthLayout campaigns={campaigns} sources={sources} readOnlyUser={readOnlyUser}>
            {children}
          </AuthLayout>
        </Providers>
      </body>
    </html>
  );
}

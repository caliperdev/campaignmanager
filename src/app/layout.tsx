import "@/resources/design-layout.css";

import { Providers } from "@/components/Providers";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/server";
import { getSidebarData, type Table } from "@/lib/tables";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";

const EMPTY_TABLES: Table[] = [];

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
  const { tablesCampaigns, tablesData } = readOnlyUser
    ? { tablesCampaigns: EMPTY_TABLES, tablesData: EMPTY_TABLES }
    : await getSidebarData(userId);

  return (
    <html lang="en">
      <body className="design-layout">
        <Providers>
          <AuthLayout tablesCampaigns={tablesCampaigns} tablesData={tablesData}>
            {children}
          </AuthLayout>
        </Providers>
      </body>
    </html>
  );
}

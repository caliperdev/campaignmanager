import "@/resources/design-layout.css";

import { Providers } from "@/components/Providers";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/server";
import { getSidebarData } from "@/lib/tables";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import type { Order, Source } from "@/db/schema";
const EMPTY_ORDERS: Order[] = [];
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
  let orders = EMPTY_ORDERS;
  let sources = EMPTY_SOURCES;
  let readOnlyUser = false;

  try {
    await createClient();
    readOnlyUser = await isReadOnlyMonitorUser();
    // Always load orders and sources so all users see the same sidebar (Supabase orders, Dataverse sources)
    const data = await getSidebarData();
    orders = data.orders;
    sources = data.sources;
  } catch (err) {
    console.error("[RootLayout] Failed to load auth/sidebar:", err);
  }

  return (
    <html lang="en">
      <body className="design-layout">
        <Providers>
          <AuthLayout orders={orders} sources={sources} readOnlyUser={readOnlyUser}>
            {children}
          </AuthLayout>
        </Providers>
      </body>
    </html>
  );
}

import Link from "next/link";
import { getClient, getClientCountsMap } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { ClientDetailClient } from "./ClientDetailClient";

export const metadata = {
  title: "Client",
  description: "Client detail",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id } = await params;
  const [client, countsMap] = await Promise.all([getClient(id), getClientCountsMap()]);
  const counts = countsMap.get(id) ?? null;

  if (!client) {
    return (
      <main className="page-responsive-padding" style={{ padding: 32 }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Client not found.</p>
        <Link
          href="/clients"
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "8px 16px",
            fontSize: 14,
            color: "var(--text-primary)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
          }}
        >
          Back to clients
        </Link>
      </main>
    );
  }

  return <ClientDetailClient client={client} counts={counts} />;
}

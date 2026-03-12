"use client";

import Link from "next/link";
import type { Client } from "@/db/schema";
import type { ClientCounts } from "@/lib/tables";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ClientDetailClient({ client, counts }: { client: Client; counts?: ClientCounts | null }) {
  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 32px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Link href="/clients" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Clients
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{client.name}</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <section
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>
            Client information
          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{client.name}</span>
            </div>

            <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 16,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-light)",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Created
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {formatDate(client.createdAt ?? "")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Agencies
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.agencyCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Advertisers
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.advertiserCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Campaigns
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.campaignCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Orders
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.orderCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Placements
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.placementCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Active placements
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {counts?.activePlacementCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
        </section>

        <div style={{ marginTop: 24 }}>
          <Link
            href="/clients"
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              textDecoration: "none",
            }}
          >
            ← Back to clients
          </Link>
        </div>
      </div>
    </main>
  );
}

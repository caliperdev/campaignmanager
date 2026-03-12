"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCampaign } from "@/lib/table-actions";
import { AdvertiserPicker } from "@/components/AdvertiserPicker";
import { AgencyPicker } from "@/components/AgencyPicker";
import { ClientPicker } from "@/components/ClientPicker";
import type { Advertiser, Agency, Client } from "@/db/schema";

type Props = {
  advertisers: Advertiser[];
  agencies: Agency[];
  clients: Client[];
  defaultAdvertiserId?: string | null;
  categoryOptions: string[];
};

export function NewCampaignForm({ advertisers, agencies, clients, defaultAdvertiserId, categoryOptions }: Props) {
  const router = useRouter();
  const [advertiserId, setAdvertiserId] = useState(defaultAdvertiserId ?? "");
  const [agencyId, setAgencyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    if (!clientId) missing.push("Client");
    if (!agencyId) missing.push("Agency");
    if (!advertiserId) missing.push("Advertiser");
    if (!campaignId.trim()) missing.push("Campaign ID");
    if (!name.trim()) missing.push("Campaign name");
    if (!category) missing.push("Category");
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createCampaign(
        advertiserId,
        name.trim(),
        agencyId.trim(),
        clientId.trim(),
        campaignId.trim(),
        category.trim(),
      );
      if (result.success) {
        router.push("/campaigns");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create campaign.");
      }
    } catch (err) {
      console.error("Create campaign error:", err);
      setError(err instanceof Error ? err.message : "Failed to create campaign.");
    } finally {
      setSaving(false);
    }
  }

  if (advertisers.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No advertisers yet.{" "}
        <Link href="/advertisers/new" style={{ color: "var(--accent-mint)", textDecoration: "underline" }}>
          Create an advertiser first
        </Link>
        .
      </p>
    );
  }
  if (agencies.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No agencies yet.{" "}
        <Link href="/agencies/new" style={{ color: "var(--accent-mint)", textDecoration: "underline" }}>
          Create an agency first
        </Link>
        .
      </p>
    );
  }
  if (clients.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No clients yet.{" "}
        <Link href="/clients/new" style={{ color: "var(--accent-mint)", textDecoration: "underline" }}>
          Create a client first
        </Link>
        .
      </p>
    );
  }
  if (categoryOptions.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No categories available. Add categories in the database first.
      </p>
    );
  }

  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 8,
  } as const;

  const inputStyle = {
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    width: "100%",
    maxWidth: 400,
  } as const;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <ClientPicker
        clients={clients}
        label="Client"
        value={clientId}
        onChange={setClientId}
        optional={false}
      />

      <AgencyPicker
        agencies={agencies}
        label="Agency"
        value={agencyId}
        onChange={setAgencyId}
        optional={false}
      />

      <AdvertiserPicker
        advertisers={advertisers}
        label="Advertiser"
        value={advertiserId}
        onChange={setAdvertiserId}
      />

      <label style={labelStyle}>Campaign ID</label>
      <input
        type="text"
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
        placeholder="Campaign ID"
        style={inputStyle}
        required
      />

      <label style={labelStyle}>Campaign name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Campaign name"
        style={inputStyle}
        required
      />

      <label style={labelStyle}>Category</label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={inputStyle}
        aria-label="Category"
        required
      >
        <option value="">Select category</option>
        {categoryOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-mint)",
            color: "white",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Creating…" : "Create campaign"}
        </button>
        <Link
          href="/campaigns"
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { createOrder, uploadOrderDocument } from "@/lib/table-actions";
import { PdfViewPane } from "@/components/PdfViewPane";
import type { Campaign } from "@/db/schema";

type Props = {
  campaigns: Campaign[];
  prefilledCampaignId?: string;
};

export function NewOrderForm({ campaigns, prefilledCampaignId }: Props) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [ioFile, setIoFile] = useState<File | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const pdfPreviewUrl = useMemo(() => (ioFile ? URL.createObjectURL(ioFile) : null), [ioFile]);
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);
  useEffect(() => {
    if (prefilledCampaignId && campaigns.some((c) => c.id === prefilledCampaignId)) {
      setCampaignId(prefilledCampaignId);
    }
  }, [prefilledCampaignId, campaigns]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    if (!campaignId.trim()) missing.push("Campaign");
    if (!orderNumber.trim()) missing.push("Order #");
    if (!ioFile) missing.push("IO file (PDF)");
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createOrder(orderNumber.trim(), campaignId);
      if (result.success && result.orderId) {
        if (ioFile) {
          const formData = new FormData();
          formData.append("file", ioFile);
          const uploadResult = await uploadOrderDocument(result.orderId, formData);
          if (!uploadResult.success) {
            setError(uploadResult.error ?? "Order created but PDF upload failed.");
            setSaving(false);
            return;
          }
        }
        router.push("/orders");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create order.");
      }
    } catch (err) {
      console.error("Create order error:", err);
      setError(err instanceof Error ? err.message : "Failed to create order.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    width: "100%",
  } as const;

  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 8,
  } as const;

  if (campaigns.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
          No campaigns yet. Create a campaign first to create orders.
        </p>
        <Link
          href="/campaigns/new"
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            color: "white",
            background: "var(--accent-mint)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            width: "fit-content",
          }}
        >
          Create a campaign
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <label style={labelStyle}>Campaign (required)</label>
      <select
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
        required
        style={inputStyle}
        aria-label="Campaign"
      >
        <option value="">Choose a campaign…</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.externalId?.trim() || c.name || c.id}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Order # (required)</label>
      <input
        type="text"
        value={orderNumber}
        onChange={(e) => setOrderNumber(e.target.value)}
        placeholder="Order #"
        required
        style={inputStyle}
      />

      <label style={labelStyle}>IO file (PDF) (required)</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => setIoFile(e.target.files?.[0] ?? null)}
          required
          style={inputStyle}
        />
        {ioFile && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Selected: {ioFile.name}
            </span>
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              View PDF
            </button>
          </div>
        )}
      </div>
      <PdfViewPane
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        pdfUrl={pdfPreviewUrl}
        title="IO PDF (preview)"
      />

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
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
          {saving ? "Creating…" : "Create order"}
        </button>
        <Link
          href="/orders"
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

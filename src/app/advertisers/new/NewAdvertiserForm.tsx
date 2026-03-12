"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAdvertiser } from "@/lib/table-actions";

export function NewAdvertiserForm() {
  const router = useRouter();
  const [advertiser, setAdvertiser] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = advertiser.trim();
    if (!trimmed) {
      setError("Please fill in: Advertiser");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createAdvertiser(trimmed);
      if (result.success) {
        router.push("/advertisers");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create advertiser.");
      }
    } catch (err) {
      console.error("Create advertiser error:", err);
      setError(err instanceof Error ? err.message : "Failed to create advertiser.");
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

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <label style={labelStyle}>Advertiser (required)</label>
      <input
        type="text"
        value={advertiser}
        onChange={(e) => setAdvertiser(e.target.value)}
        placeholder="Advertiser name"
        required
        style={inputStyle}
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
          {saving ? "Creating…" : "Create advertiser"}
        </button>
        <Link
          href="/advertisers"
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

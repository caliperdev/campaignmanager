"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAgency } from "@/lib/table-actions";

export function NewAgencyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please fill in: Name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createAgency(trimmed);
      if (result.success) {
        router.push("/agencies");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create agency.");
      }
    } catch (err) {
      console.error("Create agency error:", err);
      setError(err instanceof Error ? err.message : "Failed to create agency.");
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
      <label style={labelStyle}>Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Agency name"
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
          {saving ? "Creating…" : "Create agency"}
        </button>
        <Link
          href="/agencies"
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

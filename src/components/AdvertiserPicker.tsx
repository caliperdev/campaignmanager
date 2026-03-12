"use client";

import Link from "next/link";
import type { Advertiser } from "@/db/schema";

type Props = {
  advertisers: Advertiser[];
  label?: string;
  value?: string;
  onChange?: (advertiserId: string) => void;
  invalid?: boolean;
};

export function AdvertiserPicker({
  advertisers,
  label = "Select advertiser",
  value,
  onChange,
  invalid = false,
}: Props) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (id && onChange) onChange(id);
        }}
        required
        style={{
          padding: "10px 12px",
          fontSize: 14,
          border: invalid ? "1px solid #dc3545" : "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <option value="">Choose an advertiser…</option>
        {advertisers.map((a) => (
          <option key={a.id} value={a.id}>
            {a.advertiser}
          </option>
        ))}
      </select>
    </div>
  );
}

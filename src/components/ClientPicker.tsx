"use client";

import Link from "next/link";
import type { Client } from "@/db/schema";

type Props = {
  clients: Client[];
  label?: string;
  value?: string;
  onChange?: (clientId: string) => void;
  optional?: boolean;
  invalid?: boolean;
};

export function ClientPicker({
  clients,
  label = "Select client",
  value,
  onChange,
  optional = false,
  invalid = false,
}: Props) {

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
        required={!optional}
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
        <option value="">Choose a client…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Order } from "@/db/schema";

type Props = {
  orders: Order[];
  label?: string;
  /** Path template with {id} placeholder, e.g. "/orders/{id}/placements/new" */
  redirectTemplate: string;
};

export function OrderPicker({ orders, label = "Select order", redirectTemplate }: Props) {
  const router = useRouter();
  const filteredOrders = orders;

  const handleSelect = (orderId: string) => {
    router.push(redirectTemplate.replace("{id}", orderId));
  };

  if (filteredOrders.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No orders yet.{" "}
        <Link href="/orders/new" style={{ color: "var(--accent-mint)", textDecoration: "underline" }}>
          Create an order first
        </Link>
        .
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{
        display: "block",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-tertiary)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
      }}>
        {label}
      </label>
      <select
        onChange={(e) => {
          const id = e.target.value;
          if (id) handleSelect(id);
        }}
        style={{
          padding: "10px 12px",
          fontSize: 14,
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          width: "100%",
          maxWidth: 400,
        }}
        defaultValue=""
      >
        <option value="">Choose an order…</option>
        {filteredOrders.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

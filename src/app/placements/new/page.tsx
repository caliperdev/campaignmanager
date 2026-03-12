import Link from "next/link";
import { getOrders } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { OrderPicker } from "@/components/OrderPicker";

export const metadata = {
  title: "New placement",
  description: "Create a new placement",
};

export default async function NewPlacementPage() {
  await enforceNotReadOnly();
  const orders = await getOrders();

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
        <Link href="/placements" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Placements
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New placement</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          New placement
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          Select an order to add a new placement.
        </p>
        <OrderPicker
          orders={orders}
          label="Select order for new placement"
          redirectTemplate="/orders/{id}/placements/new"
        />
      </div>
    </main>
  );
}

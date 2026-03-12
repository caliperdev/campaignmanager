"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ItemRowActions } from "@/components/ItemRowActions";
import { deletePlacement } from "@/lib/table-actions";
import { getPlacementStatusLabel, getStatusDotClass } from "@/lib/placement-status";

type Placement = { id: number; name: string; startDate?: string; endDate?: string };
type Order = { id: string };

export function PlacementListRow({
  placement,
  order,
  campaignId,
  marginLeft,
}: {
  placement: Placement;
  order: Order;
  campaignId: string;
  marginLeft?: number;
}) {
  const statusLabel = getPlacementStatusLabel({
    start_date: placement.startDate,
    end_date: placement.endDate,
  });
  const router = useRouter();

  const handleDelete = async () => {
    const ok = await deletePlacement(placement.id);
    if (ok) {
      router.refresh();
    } else {
      window.alert("Failed to delete. Please try again.");
    }
  };

  const editHref = `/orders/${order.id}/campaigns/${encodeURIComponent(campaignId)}`;

  return (
    <div className="campaign-row" style={{ marginLeft: marginLeft ?? 24 }}>
      <Link
        href={editHref}
        style={{
          gridColumn: "1 / span 5",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-m)",
          textDecoration: "none",
          color: "inherit",
          minWidth: 0,
        }}
      >
        <div className={getStatusDotClass(statusLabel)} />
        <div className="row-meta">
          <div className="row-primary-text">{placement.name}</div>
          <div className="row-sub-text">Placement</div>
        </div>
        <div className="row-meta" />
        <div className="row-meta" />
      </Link>
      <div style={{ gridColumn: "6" }}>
        <ItemRowActions
          editHref={editHref}
          onDelete={handleDelete}
          itemName={placement.name}
        />
      </div>
    </div>
  );
}

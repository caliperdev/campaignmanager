"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ConfirmModal";
import { deletePlacement } from "@/lib/table-actions";
import { isPlacementActive } from "@/lib/placement-status";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import type { DynamicTableRow } from "@/lib/tables";

export const PLACEMENT_ROW_COLUMNS: { col: string | null; label: string; isDateRange?: boolean; sortKey?: string }[] = [
  { col: "Advertiser", label: "Advertiser", sortKey: "advertiser" },
  { col: "Order Campaign ID", label: "Campaign ID", sortKey: "campaignId" },
  { col: "Order Number", label: "Order#", sortKey: "order" },
  { col: "Format", label: "Format", sortKey: "format" },
  { col: "Deal", label: "Deal", sortKey: "deal" },
  { col: null, label: "Start – End", isDateRange: true, sortKey: "startEnd" },
  { col: "Impressions", label: "Impressions Goal", sortKey: "impressions" },
];

export function PlacementsTableHeader({ sortBy, sortOrder }: { sortBy?: string; sortOrder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildSortUrl = (columnKey: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (sortBy === columnKey) {
      if (sortOrder === "asc") {
        next.set("sortBy", columnKey);
        next.set("sortOrder", "desc");
      } else {
        next.delete("sortBy");
        next.delete("sortOrder");
      }
    } else {
      next.set("sortBy", columnKey);
      next.set("sortOrder", "asc");
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const handleSort = (columnKey: string) => {
    router.push(buildSortUrl(columnKey), { scroll: false });
  };

  const SortableHeader = ({ label, columnKey, isDateRange }: { label: string; columnKey: string; isDateRange?: boolean }) => (
    <button
      type="button"
      onClick={() => handleSort(columnKey)}
      className={`row-meta${isDateRange ? " row-meta--date" : ""}`}
      style={{
        textAlign: "left",
        border: "none",
        background: "transparent",
        padding: 0,
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="row-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {sortBy === columnKey && (
          <span style={{ fontSize: 10, opacity: 0.8 }}>{sortOrder === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </button>
  );

  return (
    <div className="campaign-row campaign-row--placements placements-header">
      <div />
      <SortableHeader label="Placement" columnKey="placement" />
      {PLACEMENT_ROW_COLUMNS.map(({ label, isDateRange, sortKey }, i) => (
        <SortableHeader key={i} label={label} columnKey={sortKey!} isDateRange={isDateRange} />
      ))}
      <div />
    </div>
  );
}

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return Number(digits).toLocaleString("en-US");
}

function getRowValue(row: DynamicTableRow, col: string | null): string {
  if (!col) return "";
  const dbKey = sanitizeDynamicColumnKey(col);
  const v = row[dbKey] ?? row[col];
  return String(v ?? "");
}

function getPlacementDateRange(row: DynamicTableRow): string {
  const start = getRowValue(row, "Start Date");
  const end = getRowValue(row, "End Date");
  if (!start && !end) return "—";
  return [start, end].filter(Boolean).join(" – ");
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

type Order = { id: string; name: string };

export function AllPlacementsRow({
  row,
  order,
  campaignUuid,
  campaignDisplayName,
  advertiserId,
  advertiserName,
}: {
  row: DynamicTableRow;
  order: Order;
  campaignUuid: string;
  campaignDisplayName: string;
  advertiserId?: string | null;
  advertiserName?: string;
}) {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const startDate = getRowValue(row, "Start Date");
  const endDate = getRowValue(row, "End Date");
  const dotActive = isPlacementActive(startDate, endDate);
  const primaryCol = "Placement ID";
  const primaryValue = getRowValue(row, primaryCol) || getRowValue(row, "Placement") || getRowValue(row, "placement_id") || "—";
  const editHref = `/campaigns/${encodeURIComponent(campaignUuid)}/orders/${encodeURIComponent(order.id)}/placements/${row.id}/edit`;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await showConfirm({ message: "Delete this placement? This cannot be undone.", variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    const deleted = await deletePlacement(row.id as number);
    if (deleted) router.refresh();
    else window.alert("Failed to delete. Please try again.");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="campaign-row campaign-row--placements"
      style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
      data-navigates
      data-href={editHref}
      onClick={() => router.push(editHref)}
      onKeyDown={(e) => e.key === "Enter" && router.push(editHref)}
    >
      <div className={dotActive ? "status-dot" : "status-dot paused"} />
      <div className="row-meta">
        <div className="row-primary-text">{primaryValue}</div>
      </div>
      {PLACEMENT_ROW_COLUMNS.map(({ col, isDateRange }, i) => {
        let value: string;
        let content: React.ReactNode;
        if (isDateRange) {
          value = getPlacementDateRange(row);
          content = value;
        } else if (col === "Order Number") {
          value = getRowValue(row, col) || order.name;
          content = value;
        } else if (col === "Order Campaign ID") {
          value = campaignDisplayName;
          content = value;
        } else if (col === "Advertiser") {
          value = advertiserName?.trim() || "—";
          content = advertiserId ? (
            <Link href={`/advertisers/${advertiserId}`} style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
              {value}
            </Link>
          ) : (
            value
          );
        } else if (col === "Impressions") {
          const raw = getRowValue(row, col);
          value = raw ? formatNumberWithCommas(raw) : "—";
          content = value;
        } else {
          value = col ? (getRowValue(row, col) || "—") : "—";
          content = value;
        }
        return (
          <div key={i} className={`row-meta${isDateRange ? " row-meta--date" : ""}`}>
            <div className="row-primary-text">{content}</div>
          </div>
        );
      })}
      <div className="control-group" onClick={(e) => e.stopPropagation()}>
        <Link
          href={editHref}
          className="icon-btn"
          aria-label="Edit placement"
          style={{ display: "inline-flex", alignItems: "center", padding: 4, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
        >
          <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          className="icon-btn"
          aria-label="Delete row"
        >
          <Icon><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
        </button>
      </div>
    </div>
  );
}

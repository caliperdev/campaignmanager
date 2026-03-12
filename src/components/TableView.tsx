"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect } from "react";
import { updateOrder, deleteOrder, updateSource, deleteSource, fetchDynamicTableChunk, fetchPlacementsChunk, updateDynamicTableRow, deleteDynamicTableRow, updatePlacement, deletePlacement } from "@/lib/table-actions";
import { useConfirm } from "@/components/ConfirmModal";
import { fetchDataverseSourceChunkFirst, fetchDataverseSourceChunkNext } from "@/lib/dataverse-source";
import type { Order, Source } from "@/db/schema";
import type { DynamicTableRow } from "@/lib/tables";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import { isPlacementActive } from "@/lib/placement-status";

const SOURCES_PAGE_SIZE = 200;
const SORT_REFETCH_LIMIT = 5000;

const PLACEMENT_DB_COLUMNS = new Set([
  "placement_id", "placement", "trafficker", "am", "qa_am", "format", "deal",
  "start_date", "end_date", "impressions", "cpm_client", "cpm_adops",
  "insertion_order_id_dsp", "insertion_order_name", "order_campaign_id", "order_campaign",
  "dark_days", "per_day_impressions", "dark_ranges", "assigned_ranges",
  "cpm_celtra", "budget_adops", "budget_client", "pacing", "targeting_audience", "important",
  "kpi", "kpi_vcr", "kpi_ctr", "kpi_view", "kpi_bsafe", "kpi_oog", "kpi_ivt",
  "teams_sharepoint", "dsp", "ads", "vrf", "placement_group_id",
]);

function isDateColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return /date|created|updated|modified|time/i.test(lower);
}

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseNumberInput(value: string): string {
  return value.replace(/\D/g, "");
}

function parseDecimalInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function isDecimalColumn(col: string): boolean {
  return col === "CPM Client" || col === "CPM AdOps";
}

function isNumericColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return /impressions|cpm|budget|count|number/i.test(lower);
}

function looksNumeric(value: string): boolean {
  if (!value) return false;
  return /^\d[\d,]*$/.test(value.replace(/,/g, ""));
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

type ViewItem = Order | Source;

type CampaignFilter = { column: string; value: string } | { or: Array<{ column: string; value: string }> };

export function TableView({
  item,
  basePath,
  initialDynamicRows,
  dynamicTotal,
  readOnly,
  isDataverseSource = false,
  entitySetName,
  logicalName,
  dataverseNextLink: initialDataverseNextLink,
  orderId,
  orderName,
  campaignId,
  campaignFilter,
  categoryOptions,
  traffickerOptions,
  amOptions,
  qaAmOptions,
  formatOptions,
  dealOptions,
}: {
  item: ViewItem;
  basePath: string;
  initialDynamicRows: DynamicTableRow[];
  dynamicTotal: number;
  readOnly: boolean;
  isDataverseSource?: boolean;
  entitySetName?: string;
  logicalName?: string;
  dataverseNextLink?: string | null;
  orderId?: string;
  orderName?: string;
  campaignId?: string;
  campaignFilter?: CampaignFilter | null;
  categoryOptions: string[];
  traffickerOptions: string[];
  amOptions: string[];
  qaAmOptions: string[];
  formatOptions: string[];
  dealOptions: string[];
}) {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [nameEditError, setNameEditError] = useState<string | null>(null);
  const [dynamicRows, setDynamicRows] = useState<DynamicTableRow[]>(initialDynamicRows ?? []);
  const [dynamicTotalState, setDynamicTotalState] = useState(dynamicTotal ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [dataverseNextLink, setDataverseNextLink] = useState<string | null>(initialDataverseNextLink ?? null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [editingRow, setEditingRow] = useState<DynamicTableRow | null>(null);
  const [viewingRow, setViewingRow] = useState<DynamicTableRow | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);
  const [editRowError, setEditRowError] = useState<string | null>(null);

  const columns = item.columnHeaders ?? (dynamicRows[0] ? Object.keys(dynamicRows[0]).filter((k) => k !== "id") : []);

  const isSourcesView = basePath === "/sources";
  const pageSize = isSourcesView ? SOURCES_PAGE_SIZE : 200;
  const isCampaignPlacementsView = Boolean(orderId && campaignId);

  const loadMoreDynamic = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (isDataverseSource && entitySetName && logicalName) {
        if (dataverseNextLink) {
          const next = await fetchDataverseSourceChunkNext(dataverseNextLink, columns, dynamicRows.length);
          const rows = next.rows.map((r) => ({ ...r, id: Number(r.id) || 0 })) as DynamicTableRow[];
          setDynamicRows((prev) => [...prev, ...rows]);
          setDataverseNextLink(next.nextLink);
        }
      } else if (item.dynamicTableName) {
        const sortCol = sortColumn ? sanitizeDynamicColumnKey(sortColumn) : undefined;
        const next = await fetchDynamicTableChunk(item.dynamicTableName, dynamicRows.length, pageSize, sortCol, sortAsc, campaignFilter ?? undefined);
        setDynamicRows((prev) => [...prev, ...next.rows]);
        setDynamicTotalState(next.total);
      } else if (orderId) {
        const filter = campaignFilter && "or" in campaignFilter ? campaignFilter : undefined;
        const next = await fetchPlacementsChunk(orderId, dynamicRows.length, pageSize, filter);
        setDynamicRows((prev) => [...prev, ...next.rows]);
        setDynamicTotalState(next.total);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [isDataverseSource, entitySetName, logicalName, dataverseNextLink, item.dynamicTableName, orderId, dynamicRows.length, loadingMore, sortColumn, sortAsc, pageSize, columns, campaignFilter]);

  const handleSortColumn = useCallback(async (col: string) => {
    if (!isSourcesView) return;
    const nextAsc = sortColumn === col ? !sortAsc : (isDateColumn(col) ? false : true);
    setSortColumn(col);
    setSortAsc(nextAsc);
    setLoadingMore(true);
    try {
      const limit = SORT_REFETCH_LIMIT;
      if (isDataverseSource && entitySetName && logicalName) {
        const result = await fetchDataverseSourceChunkFirst(entitySetName, logicalName, limit, col, nextAsc);
        const rows = result.rows.map((r) => ({ ...r, id: Number(r.id) || 0 })) as DynamicTableRow[];
        setDynamicRows(rows);
        setDynamicTotalState(result.total);
        setDataverseNextLink(result.nextLink);
      } else if (item.dynamicTableName) {
        const sortCol = sanitizeDynamicColumnKey(col);
        const next = await fetchDynamicTableChunk(item.dynamicTableName, 0, limit, sortCol, nextAsc);
        setDynamicRows(next.rows);
        setDynamicTotalState(next.total);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [isSourcesView, isDataverseSource, entitySetName, logicalName, item.dynamicTableName, sortColumn, sortAsc]);

  useEffect(() => {
    if (!isSourcesView || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 120 && !loadingMore) {
        const hasMore = isDataverseSource ? dataverseNextLink : dynamicRows.length < dynamicTotalState;
        if (hasMore) loadMoreDynamic();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [isSourcesView, loadingMore, isDataverseSource, dataverseNextLink, dynamicRows.length, dynamicTotalState, loadMoreDynamic]);

  const openEditRow = useCallback(
    (row: DynamicTableRow) => {
      setEditRowError(null);
      setEditingRow(row);
      const initial: Record<string, string> = {};
      for (const col of columns) {
        const dbKey = sanitizeDynamicColumnKey(col);
        let val = String((row[dbKey] ?? row[col]) ?? "");
        if (col === "Order Number" && isCampaignPlacementsView && !val.trim() && orderName) {
          val = orderName;
        }
        if (col === "Order Campaign ID" && isCampaignPlacementsView && !val.trim() && item.name) {
          val = item.name;
        }
        if (col === "Order Campaign" && isCampaignPlacementsView && !val.trim() && item.name) {
          val = item.name;
        }
        initial[col] = val;
      }
      setEditFormData(initial);
    },
    [columns, isCampaignPlacementsView, orderName, item.name],
  );

  const closeEditRow = useCallback(() => {
    setEditingRow(null);
    setEditFormData({});
    setEditRowError(null);
  }, []);

  const saveEditRow = useCallback(async () => {
    if (!editingRow) return;
    setEditRowError(null);
    setSavingRow(true);
    try {
      const payload: Record<string, string> = {};
      for (const col of columns) {
        payload[sanitizeDynamicColumnKey(col)] = editFormData[col] ?? "";
      }
      if (item.dynamicTableName) {
        if (isCampaignPlacementsView && orderName && columns.includes("Order Number")) {
          payload[sanitizeDynamicColumnKey("Order Number")] = orderName;
        }
        if (isCampaignPlacementsView && item.name && columns.includes("Order Campaign ID")) {
          payload[sanitizeDynamicColumnKey("Order Campaign ID")] = item.name;
        }
        if (isCampaignPlacementsView && item.name && columns.includes("Order Campaign")) {
          payload[sanitizeDynamicColumnKey("Order Campaign")] = item.name;
        }
      }
      const result = item.dynamicTableName
        ? await updateDynamicTableRow(item.dynamicTableName, editingRow.id as number, payload)
        : await updatePlacement(editingRow.id as number, Object.fromEntries(Object.entries(payload).filter(([k]) => PLACEMENT_DB_COLUMNS.has(k))));
      if (result.success) {
        const updated: DynamicTableRow = { ...editingRow };
        for (const col of columns) updated[sanitizeDynamicColumnKey(col)] = editFormData[col] ?? "";
        setDynamicRows((prev) => prev.map((r) => (r.id === editingRow.id ? updated : r)));
        closeEditRow();
      } else if (result.error) {
        setEditRowError(result.error);
      }
    } finally {
      setSavingRow(false);
    }
  }, [editingRow, item.dynamicTableName, columns, editFormData, closeEditRow, isCampaignPlacementsView, orderName, item.name]);

  const sectionLabel = basePath === "/sources" ? "Sources" : "Orders";
  const rowSubLabel = basePath === "/sources" ? "Source" : "Placement";

  const canCreatePlacement =
    (basePath === "/orders" || basePath === "/campaigns") && !readOnly && Boolean(orderId && campaignId);
  const placementNewHref = orderId && campaignId
    ? `/campaigns/${encodeURIComponent(campaignId)}/orders/${encodeURIComponent(orderId)}/placements/new`
    : `${basePath}/${item.id}/placements/new`;
  const placementHref = canCreatePlacement ? placementNewHref : `${basePath}/${item.id}/placements/new`;
  const showEditDelete = !isCampaignPlacementsView;

  /** Placement row display: columns to show when viewing campaign placements (primary = Placement ID, so omit from list) */
  const PLACEMENT_ROW_COLUMNS: { col: string | null; label: string; isDateRange?: boolean }[] = [
    { col: "Advertiser", label: "Advertiser" },
    { col: "Order Number", label: "Order#" },
    { col: "Order Campaign ID", label: "Campaign ID" },
    { col: "Format", label: "Format" },
    { col: "Deal", label: "Deal" },
    { col: null, label: "Start – End", isDateRange: true },
    { col: "Impressions", label: "Impressions Goal" },
  ];

  /** Pick primary column: Insertion Order Name, Name, or first column */
  const primaryCol = columns.find((c) => /insertion order name|^name$/i.test(c)) ?? columns[0];
  /** For placement view use Placement ID as primary (not Placement name) */
  const effectivePrimaryCol = isCampaignPlacementsView
    ? (columns.find((c) => c === "Placement ID") ?? primaryCol)
    : primaryCol;
  /** Meta columns: Budget, Delivery, Ends (case-insensitive) or columns 1,2,3 */
  const metaLabels = ["Budget", "Delivery", "Ends"];
  const metaCols = metaLabels.map((label) => columns.find((c) => c.toLowerCase().includes(label.toLowerCase())) ?? null);
  const fallbackMetaCols = columns.filter((c) => c !== primaryCol).slice(0, 3);
  const getMetaCol = (i: number) => metaCols[i] ?? fallbackMetaCols[i] ?? null;

  const getRowValue = (row: DynamicTableRow, col: string | null): string => {
    if (!col) return "";
    const dbKey = sanitizeDynamicColumnKey(col);
    const v = row[dbKey] ?? row[col];
    return String(v ?? "");
  };

  const getPlacementDateRange = (row: DynamicTableRow): string => {
    const start = getRowValue(row, "Start Date");
    const end = getRowValue(row, "End Date");
    if (!start && !end) return "—";
    return [start, end].filter(Boolean).join(" – ");
  };

  const saveEditName = async () => {
    setNameEditError(null);
    if (basePath === "/sources") {
      const ok = await updateSource(item.id, { name: editName.trim() || "Source" });
      if (ok) {
        router.refresh();
        setEditingName(false);
      } else {
        setNameEditError("Failed to update. Please try again.");
      }
    } else {
      const trimmed = editName.trim();
      if (!trimmed) {
        setNameEditError("Please fill in: Order #");
        return;
      }
      const result = await updateOrder(item.id, { name: trimmed });
      if (result.success) {
        router.refresh();
        setEditingName(false);
      } else {
        setNameEditError(result.error ?? "Failed to update. Please try again.");
      }
    }
  };

  const handleDelete = async () => {
    const ok = await showConfirm({ message: `Delete "${item.name}"? This cannot be undone.`, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      const ok = basePath === "/sources" ? await deleteSource(item.id) : await deleteOrder(item.id);
      if (ok) router.push(basePath);
      else window.alert("Failed to delete. Please try again.");
    } catch (err) {
      console.error("Delete error:", err);
      window.alert("Failed to delete. Please try again.");
    }
  };

  const canEditCell = !readOnly;
  const canViewRow = isSourcesView && readOnly;

  return (
    <div className="main-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "8px 0",
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
        <Link href={basePath} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {sectionLabel}
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        {orderId && orderName && (
          <>
            <Link href={`/orders/${orderId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
              {orderName}
            </Link>
            <span style={{ margin: "0 4px" }}>/</span>
          </>
        )}
        {editingName ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                style={{
                  padding: "4px 8px",
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  width: 200,
                }}
              />
              <button type="button" onClick={saveEditName} disabled={!editName.trim()} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 500, color: "white", background: "var(--accent-mint)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
                Save
              </button>
              <button type="button" onClick={() => { setEditingName(false); setNameEditError(null); }} style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
            {nameEditError && (
              <span style={{ fontSize: 12, color: "var(--accent-red, #dc3545)" }}>{nameEditError}</span>
            )}
          </div>
        ) : (
          <>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{item.name}</span>
            {canCreatePlacement && (
              <Link
                href={placementHref}
                aria-label="Create placement"
                style={{
                  marginLeft: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--accent-dark)",
                  background: "transparent",
                  border: "1px solid var(--accent-dark)",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                }}
              >
                + New placement
              </Link>
            )}
            {!readOnly && showEditDelete && (
              <>
                <button type="button" onClick={() => { setEditName(item.name); setNameEditError(null); setEditingName(true); }} aria-label="Edit name" style={{ display: "inline-flex", alignItems: "center", padding: 4, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}>
                  <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
                </button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }} aria-label="Delete" style={{ display: "inline-flex", alignItems: "center", padding: 4, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}>
                  <Icon><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
                </button>
              </>
            )}
          </>
        )}
      </div>
      <div style={{ padding: 24, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            Showing {dynamicRows.length} of {dynamicTotalState} row{dynamicTotalState !== 1 ? "s" : ""}{readOnly ? " (read-only)." : "."}
          </p>
          {isSourcesView && columns.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sort by:</span>
              <select
                value={sortColumn ?? columns[0] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) handleSortColumn(v);
                }}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                {columns.map((col) => (
                  <option key={col} value={col}>{col}{sortColumn === col ? (sortAsc ? " ↑" : " ↓") : ""}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div ref={scrollContainerRef} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", overflow: "auto", flex: 1, minHeight: 0 }}>
          <div className="campaign-list" style={{ padding: "var(--space-s)", display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
            {dynamicRows.map((row) => {
              const placementEditHref = orderId && campaignId
                ? `/campaigns/${encodeURIComponent(campaignId)}/orders/${encodeURIComponent(orderId)}/placements/${row.id}/edit`
                : null;
              const startDate = getRowValue(row, "Start Date");
              const endDate = getRowValue(row, "End Date");
              const dotActive = isCampaignPlacementsView
                ? isPlacementActive(startDate, endDate)
                : true; // default green when not placement view
              const rowContent = (
                <>
                <div className={dotActive ? "status-dot" : "status-dot paused"} />
                <div className="row-meta">
                  <div className="row-primary-text">{getRowValue(row, effectivePrimaryCol) || "—"}</div>
                  <div className="row-sub-text">{rowSubLabel}</div>
                </div>
                {isCampaignPlacementsView
                  ? PLACEMENT_ROW_COLUMNS.map(({ col, label, isDateRange }, i) => {
                      let value: string;
                      if (isDateRange) {
                        value = getPlacementDateRange(row);
                      } else if (col === "Order Number" && orderName) {
                        value = getRowValue(row, col) || orderName;
                      } else if (col === "Order Campaign ID" && item.name) {
                        value = item.name;
                      } else if (col === "Impressions") {
                        const raw = getRowValue(row, col);
                        value = raw ? formatNumberWithCommas(raw) : "—";
                      } else {
                        value = col ? (getRowValue(row, col) || "—") : "—";
                      }
                      return (
                        <div key={i} className={`row-meta${isDateRange ? " row-meta--date" : ""}`}>
                          <div className="row-label">{label}</div>
                          <div className="row-primary-text">{value}</div>
                        </div>
                      );
                    })
                  : [0, 1, 2].map((i) => {
                      const col = getMetaCol(i);
                      const label = col ? (metaCols[i] ? metaLabels[i] : col) : "";
                      return (
                        <div key={i} className="row-meta">
                          {label && <div className="row-label">{label}</div>}
                          <div className="row-primary-text">{col ? (getRowValue(row, col) || "—") : "—"}</div>
                        </div>
                      );
                    })}
                <div className="control-group" onClick={(e) => e.stopPropagation()}>
                  {canEditCell && (
                    <>
                      {placementEditHref ? (
                        <Link
                          href={placementEditHref}
                          className="icon-btn"
                          aria-label="Edit placement"
                          style={{ display: "inline-flex", alignItems: "center", padding: 4, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
                        >
                          <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditRow(row); }}
                          className="icon-btn"
                          aria-label="Edit row"
                        >
                          <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const confirmed = await showConfirm({ message: "Delete this placement? This cannot be undone.", variant: "danger", confirmLabel: "Delete" });
                          if (!confirmed) return;
                          const ok = item.dynamicTableName
                            ? await deleteDynamicTableRow(item.dynamicTableName, row.id as number)
                            : await deletePlacement(row.id as number);
                          if (ok) {
                            setDynamicRows((prev) => prev.filter((r) => r.id !== row.id));
                            setDynamicTotalState((n) => Math.max(0, n - 1));
                            router.refresh();
                          } else {
                            window.alert("Failed to delete. Please try again.");
                          }
                        }}
                        className="icon-btn"
                        aria-label="Delete row"
                      >
                        <Icon><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
                      </button>
                    </>
                  )}
                </div>
              </>
              );
              return placementEditHref ? (
                <div
                  key={row.id}
                  className={`campaign-row campaign-row--placements`}
                  role={canEditCell ? "button" : undefined}
                  tabIndex={canEditCell ? 0 : undefined}
                  data-navigates={canEditCell ? true : undefined}
                  data-href={canEditCell ? placementEditHref : undefined}
                  onClick={canEditCell ? () => router.push(placementEditHref) : undefined}
                  onKeyDown={canEditCell ? (e: React.KeyboardEvent) => e.key === "Enter" && router.push(placementEditHref) : undefined}
                  style={{ cursor: canEditCell ? "pointer" : "default", textDecoration: "none" }}
                >
                  {rowContent}
                </div>
              ) : (
                <div
                  key={row.id}
                  className="campaign-row"
                  role={canEditCell || canViewRow ? "button" : undefined}
                  tabIndex={canEditCell || canViewRow ? 0 : undefined}
                  onClick={canEditCell ? () => openEditRow(row) : canViewRow ? () => setViewingRow(row) : undefined}
                  onKeyDown={canEditCell ? (e: React.KeyboardEvent) => e.key === "Enter" && openEditRow(row) : canViewRow ? (e: React.KeyboardEvent) => e.key === "Enter" && setViewingRow(row) : undefined}
                  style={{ cursor: canEditCell || canViewRow ? "pointer" : "default", textDecoration: "none" }}
                >
                  {rowContent}
                </div>
              );
            })}
          </div>
        </div>
        {editingRow && canEditCell && !isCampaignPlacementsView && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-row-title"
            style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => e.target === e.currentTarget && closeEditRow()}
          >
            <div
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                maxWidth: 560,
                width: "90%",
                maxHeight: "85vh",
                overflow: "auto",
                padding: 24,
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="edit-row-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
                {isCampaignPlacementsView ? "Edit placement" : "Edit row"}
              </h2>
              {editRowError && (
                <div style={{ padding: "10px 12px", marginBottom: 12, background: "rgba(220, 53, 69, 0.12)", border: "1px solid rgba(220, 53, 69, 0.4)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                  {editRowError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {columns.map((col) => {
                  if (col === "Advertiser") return null;
                  const isOrderNumberReadOnly = col === "Order Number" && isCampaignPlacementsView && orderName;
                  const isCampaignIdReadOnly = col === "Order Campaign ID" && isCampaignPlacementsView && item.name;
                  const isOrderCampaignReadOnly = col === "Order Campaign" && isCampaignPlacementsView && item.name;
                  const isAgencyOrCategoryReadOnly = (col === "Agency" || col === "Category") && isCampaignPlacementsView;
                  const raw = isOrderNumberReadOnly ? orderName : (isCampaignIdReadOnly || isOrderCampaignReadOnly) ? item.name : (editFormData[col] ?? "");
                  const isOrderNumber = col === "Order Number";
                  const isOrderCampaignId = col === "Order Campaign ID";
                  const isOrderCampaign = col === "Order Campaign";
                  const isCategory = col === "Category";
                  const isTrafficker = col === "Trafficker";
                  const isAM = col === "AM";
                  const isQaAm = col === "QA AM";
                  const isFormat = col === "Format";
                  const isDeal = col === "Deal";
                  const decimal = isDecimalColumn(col);
                  const numeric = !decimal && !isCategory && !isTrafficker && !isAM && !isQaAm && !isFormat && !isDeal && !isOrderNumber && !isOrderCampaignId && !isOrderCampaign && (isNumericColumn(col) || looksNumeric(raw));
                  const display = decimal ? raw : numeric ? formatNumberWithCommas(raw) : raw;
                  return (
                    <label key={col} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{col === "Order Number" ? "Order #" : col}</span>
                      {isCategory && !isAgencyOrCategoryReadOnly ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="Category"
                        >
                          <option value="">—</option>
                          {categoryOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isTrafficker ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="Trafficker"
                        >
                          <option value="">—</option>
                          {traffickerOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isAM ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="AM"
                        >
                          <option value="">—</option>
                          {amOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isQaAm ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="QA AM"
                        >
                          <option value="">—</option>
                          {qaAmOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isFormat ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="Format"
                        >
                          <option value="">—</option>
                          {formatOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : isDeal ? (
                        <select
                          value={raw}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                          aria-label="Deal"
                        >
                          <option value="">—</option>
                          {dealOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          inputMode={decimal ? "decimal" : numeric ? "numeric" : "text"}
                          value={display}
                          onChange={(e) => {
                            if (isOrderNumberReadOnly || isCampaignIdReadOnly || isOrderCampaignReadOnly || isAgencyOrCategoryReadOnly) return;
                            const next = decimal ? parseDecimalInput(e.target.value) : numeric ? parseNumberInput(e.target.value) : e.target.value;
                            setEditFormData((prev) => ({ ...prev, [col]: next }));
                          }}
                          readOnly={isOrderNumberReadOnly || isCampaignIdReadOnly || isOrderCampaignReadOnly || isAgencyOrCategoryReadOnly}
                          style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: (isOrderNumberReadOnly || isCampaignIdReadOnly || isOrderCampaignReadOnly || isAgencyOrCategoryReadOnly) ? "var(--bg-secondary)" : "var(--bg-primary)", color: "var(--text-primary)" }}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeEditRow} style={{ padding: "8px 16px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="button" onClick={saveEditRow} disabled={savingRow} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none", borderRadius: "var(--radius-sm)", background: "var(--text-primary)", color: "var(--bg-primary)", cursor: savingRow ? "wait" : "pointer" }}>
                  {savingRow ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
        {viewingRow && canViewRow && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-row-title"
            style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => e.target === e.currentTarget && setViewingRow(null)}
          >
            <div
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                maxWidth: 560,
                width: "90%",
                maxHeight: "85vh",
                overflow: "auto",
                padding: 24,
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="view-row-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Row details</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {columns.filter((c) => c !== "id").map((col) => {
                  const val = getRowValue(viewingRow, col);
                  return (
                    <div key={col} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{col}</span>
                      <span style={{ color: "var(--text-primary)" }}>{val || "—"}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 20 }}>
                <button type="button" onClick={() => setViewingRow(null)} style={{ padding: "8px 16px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {(((item.dynamicTableName || orderId) && dynamicRows.length < dynamicTotalState) || (isDataverseSource && dataverseNextLink)) && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={loadMoreDynamic}
              disabled={loadingMore}
              style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", background: "var(--bg-secondary)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: loadingMore ? "wait" : "pointer" }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

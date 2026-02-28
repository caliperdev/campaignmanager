"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import { Button } from "@/components/ui";
import { useClickOutside } from "@/hooks/useClickOutside";
import ImpressionsChart, { type ChartMeasureGroup } from "./ImpressionsChart";
import MonitorPickers from "./MonitorPickers";
import RefreshCampaignButton from "./RefreshCampaignButton";
import RefreshMonitorButton from "./RefreshMonitorButton";
type NavItem = { id: string; name: string };

const tableBorderRadius = "var(--radius-md)";
const cellPadding = "10px 12px";
const PURPLE = "#6B007B";
const GOLD = "#E1C233";
const thStyle = {
  padding: cellPadding,
  fontWeight: 600,
  fontSize: 12,
  borderBottom: "1px solid var(--border-light)",
  background: "var(--bg-secondary)",
  position: "sticky" as const,
  top: 0,
  zIndex: 1,
};
const tdBase = { padding: cellPadding, fontSize: 13 };
const purpleTd = { ...tdBase, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, color: PURPLE };
const purpleTh = { ...thStyle, textAlign: "right" as const, color: PURPLE };
const goldTd = { ...tdBase, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, color: GOLD };
const goldTh = { ...thStyle, textAlign: "right" as const, color: GOLD };
const blackTd = { ...tdBase, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, color: "var(--text-primary)" };
const blackTh = { ...thStyle, textAlign: "right" as const, color: "var(--text-primary)" };

const IMPRESSIONS_TABLE_COLUMNS = [
  { id: "month", label: "Month", width: "9%", thStyle: { ...thStyle, textAlign: "left" as const }, tdStyle: tdBase },
  { id: "campaigns", label: "Campaigns", width: "8%", thStyle: goldTh, tdStyle: goldTd },
  { id: "delivLines", label: "Deliv. Lines", width: "8%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "bookedImpressions", label: "Booked impressions", width: "12%", thStyle: goldTh, tdStyle: goldTd },
  { id: "deliveredImpr", label: "Delivered Impr.", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "mediaCost", label: "Media Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "mediaFees", label: "Media Fees", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "celtraCost", label: "Celtra Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "totalCost", label: "Total Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "bookedRevenue", label: "Booked Revenue", width: "12%", thStyle: goldTh, tdStyle: goldTd },
  { id: "bookedRevenueVsTotalCost", label: "Booked Revenue vs Total Cost", width: "12%", thStyle: blackTh, tdStyle: blackTd },
  { id: "margin", label: "Margin", width: "9%", thStyle: blackTh, tdStyle: blackTd },
] as const;

type ColumnId = (typeof IMPRESSIONS_TABLE_COLUMNS)[number]["id"];

const defaultColumnOrder: ColumnId[] = IMPRESSIONS_TABLE_COLUMNS.map((c) => c.id);

const defaultColumnVisibility: Record<ColumnId, boolean> = {
  month: true,
  bookedImpressions: true,
  campaigns: true,
  deliveredImpr: true,
  delivLines: true,
  mediaCost: true,
  mediaFees: true,
  celtraCost: true,
  totalCost: true,
  bookedRevenue: true,
  bookedRevenueVsTotalCost: true,
  margin: true,
};

const colById = Object.fromEntries(IMPRESSIONS_TABLE_COLUMNS.map((c) => [c.id, c])) as Record<ColumnId, (typeof IMPRESSIONS_TABLE_COLUMNS)[number]>;

type MonitorByDimensionRow = {
  dimensionValue: string;
  sumImpressions: number;
  activeCampaignCount: number;
};

type Props = {
  initialData: MonitorDataPayload;
  ct?: string | null;
  dt?: string | null;
  campaignTables: NavItem[];
  dataTables: NavItem[];
  dimensionOptions?: string[];
  readOnly?: boolean;
  forceGlobal?: boolean;
};

export default function MonitorContent({
  initialData,
  ct = null,
  dt = null,
  campaignTables,
  dataTables,
  dimensionOptions = [],
  readOnly = false,
  forceGlobal = false,
}: Props) {
  const [data, setData] = useState<MonitorDataPayload>(initialData);
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder);
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(defaultColumnVisibility);
  const [draggingColId, setDraggingColId] = useState<ColumnId | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnsDropdownRect, setColumnsDropdownRect] = useState<{ top: number; right: number } | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const columnsButtonRef = useRef<HTMLDivElement>(null);

  const [monitorView, setMonitorView] = useState<"time" | "dimension">("time");
  const [timeGroup, setTimeGroup] = useState<"yearMonth" | "quarter" | "year">("yearMonth");
  const [chartMeasureGroup, setChartMeasureGroup] = useState<ChartMeasureGroup>("impressions");
  const [dimensionColumn, setDimensionColumn] = useState("");
  const [dimensionRows, setDimensionRows] = useState<MonitorByDimensionRow[]>([]);
  const [dimensionLoading, setDimensionLoading] = useState(false);

  useClickOutside(columnsRef, () => setColumnsOpen(false), columnsOpen);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!columnsOpen || !columnsButtonRef.current) {
      setColumnsDropdownRect(null);
      return;
    }
    const update = () => {
      const el = columnsButtonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setColumnsDropdownRect({ top: r.top, right: r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [columnsOpen]);

  const visibleColumns = columnOrder
    .filter((id) => columnVisibility[id])
    .map((id) => colById[id])
    .filter(Boolean);
  function setColumnVisible(id: ColumnId, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      const visibleCount = IMPRESSIONS_TABLE_COLUMNS.filter((c) => next[c.id]).length;
      if (visibleCount === 0) return prev;
      return next;
    });
  }

  function moveColumn(dragId: ColumnId, dropIndex: number) {
    setColumnOrder((prev) => {
      const without = prev.filter((id) => id !== dragId);
      const visibleInNew = without.filter((id) => columnVisibility[id]);
      const insertBeforeId = visibleInNew[dropIndex];
      const insertAt = insertBeforeId != null ? without.indexOf(insertBeforeId) : without.length;
      const next = [...without];
      next.splice(insertAt, 0, dragId);
      return next;
    });
  }

  function onHeaderDragStart(e: React.DragEvent, colId: ColumnId) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", colId);
    setDraggingColId(colId);
  }
  function onHeaderDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }
  function onHeaderDragLeave() {
    setDropTargetIndex(null);
  }
  function onHeaderDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    const dragId = (e.dataTransfer.getData("text/plain") || draggingColId) as ColumnId | "";
    if (dragId && colById[dragId]) {
      moveColumn(dragId, dropIndex);
    }
    setDraggingColId(null);
    setDropTargetIndex(null);
  }
  function onHeaderDragEnd() {
    setDraggingColId(null);
    setDropTargetIndex(null);
  }

  async function refreshFromCache() {
    const params = new URLSearchParams();
    if (ct) params.set("ct", ct);
    if (dt) params.set("dt", dt);
    const res = await fetch(`/api/monitor-data?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch monitor data");
    const payload: MonitorDataPayload = await res.json();
    setData(payload);
  }

  const { rows, campaignRows, totalUniqueCampaignCount, totalImpressions, totalDataImpressions, totalDeliveredLines, totalMediaCost, totalMediaFees, totalCeltraCost, totalTotalCost, totalBookedRevenue } = data;

  const aggregatedRows = useMemo(() => {
    if (timeGroup === "yearMonth") return rows;
    const keyFn = timeGroup === "year" ? (r: typeof rows[0]) => r.yearMonth.slice(0, 4) : (r: typeof rows[0]) => `${r.yearMonth.slice(0, 4)}-Q${Math.ceil(Number(r.yearMonth.slice(5, 7)) / 3)}`;
    const byKey = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const key = keyFn(r);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r, yearMonth: key });
      } else {
        existing.sumImpressions += r.sumImpressions;
        existing.activeCampaignCount += r.activeCampaignCount;
        existing.dataImpressions += r.dataImpressions;
        existing.deliveredLines += r.deliveredLines;
        existing.mediaCost += r.mediaCost;
        existing.mediaFees += r.mediaFees;
        existing.celtraCost += r.celtraCost;
        existing.totalCost += r.totalCost;
        existing.bookedRevenue += r.bookedRevenue;
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  }, [rows, timeGroup]);

  useEffect(() => {
    if (monitorView !== "dimension" || !ct || !dimensionColumn) {
      setDimensionRows([]);
      return;
    }
    setDimensionLoading(true);
    fetch(`/api/monitor-by-dimension?ct=${encodeURIComponent(ct)}&dimension=${encodeURIComponent(dimensionColumn)}`)
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((body) => setDimensionRows(body.rows ?? []))
      .finally(() => setDimensionLoading(false));
  }, [monitorView, ct, dimensionColumn]);

  const effectiveDimensionColumn = dimensionColumn || (dimensionOptions[0] ?? "");
  const showDimensionView = !forceGlobal && dimensionOptions.length > 0 && ct;

  useEffect(() => {
    if (monitorView === "dimension" && !dimensionColumn && dimensionOptions[0]) setDimensionColumn(dimensionOptions[0]);
  }, [monitorView, dimensionColumn, dimensionOptions]);

  return (
    <main
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "32px",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Monitor
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, maxWidth: 520 }}>
            Sum of daily impressions by time or by campaign dimension. Select campaign and source tables, then choose how to group.
          </p>
          {forceGlobal ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 16 }}>
              Viewing all campaign and source tables.
            </p>
          ) : (
            <div style={{ marginTop: 16 }}>
              <MonitorPickers
                campaignTables={campaignTables.map((t) => ({ id: t.id, name: t.name }))}
                dataTables={dataTables.map((t) => ({ id: t.id, name: t.name }))}
                selectedCt={ct}
                selectedDt={dt}
              />
            </div>
          )}
        </div>
        {!readOnly && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <RefreshCampaignButton onRefreshCached={refreshFromCache} />
          <RefreshMonitorButton dataTableId={dt ?? undefined} />
        </div>
        )}
      </div>

      <div
        style={{
          marginTop: 28,
          padding: "20px 24px",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-light)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>View</span>
            <div style={{ display: "flex", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", padding: 2, border: "1px solid var(--border-light)" }}>
              <button
                type="button"
                onClick={() => setMonitorView("time")}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  background: monitorView === "time" ? "var(--accent-dark)" : "transparent",
                  color: monitorView === "time" ? "white" : "var(--text-secondary)",
                }}
              >
                By time
              </button>
              {showDimensionView && (
                <button
                  type="button"
                  onClick={() => setMonitorView("dimension")}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: monitorView === "dimension" ? "var(--accent-dark)" : "transparent",
                    color: monitorView === "dimension" ? "white" : "var(--text-secondary)",
                  }}
                >
                  By dimension
                </button>
              )}
            </div>
          </div>
          {monitorView === "time" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Group by</span>
                <select
                  value={timeGroup}
                  onChange={(e) => setTimeGroup(e.target.value as "yearMonth" | "quarter" | "year")}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    minWidth: 140,
                  }}
                >
                  <option value="yearMonth">Year‑Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chart</span>
                <select
                  value={chartMeasureGroup}
                  onChange={(e) => setChartMeasureGroup(e.target.value as ChartMeasureGroup)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    minWidth: 140,
                  }}
                >
                  <option value="impressions">Impressions</option>
                  <option value="costs">Costs</option>
                  <option value="margin">Margin</option>
                </select>
              </div>
            </>
          )}
          {monitorView === "dimension" && showDimensionView && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dimension</span>
              <select
                value={effectiveDimensionColumn}
                onChange={(e) => setDimensionColumn(e.target.value)}
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  minWidth: 160,
                }}
              >
                {dimensionOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {monitorView === "time" && (
          <>
            <div style={{ marginTop: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {chartMeasureGroup === "impressions" && (timeGroup === "yearMonth" ? "Impressions by year‑month" : timeGroup === "quarter" ? "Impressions by quarter" : "Impressions by year")}
                {chartMeasureGroup === "costs" && (timeGroup === "yearMonth" ? "Costs by year‑month" : timeGroup === "quarter" ? "Costs by quarter" : "Costs by year")}
                {chartMeasureGroup === "margin" && (timeGroup === "yearMonth" ? "Margin by year‑month" : timeGroup === "quarter" ? "Margin by quarter" : "Margin by year")}
              </h2>
              <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <ImpressionsChart rows={aggregatedRows} measureGroup={chartMeasureGroup} />
              </div>
            </div>
            <div
              style={{
                marginTop: 20,
                border: "1px solid var(--border-light)",
                borderRadius: tableBorderRadius,
                background: "var(--bg-secondary)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", borderBottom: "1px solid var(--border-light)" }}>
                {!readOnly && (
                <div ref={columnsRef} style={{ position: "relative" }}>
                  <div ref={columnsButtonRef}>
                    <Button variant="secondary" onClick={() => setColumnsOpen((o) => !o)} style={{ fontSize: 12 }}>
                      Columns <span style={{ opacity: 0.8, marginLeft: 4 }}>{columnsOpen ? "▼" : "▲"}</span>
                    </Button>
                  </div>
                  {columnsOpen &&
                    columnsDropdownRect &&
                    typeof document !== "undefined" &&
                    createPortal(
                      <div
                        style={{
                          position: "fixed",
                          bottom: window.innerHeight - columnsDropdownRect.top + 4,
                          right: window.innerWidth - columnsDropdownRect.right,
                          minWidth: 180,
                          maxHeight: "min(60vh, 320px)",
                          overflowY: "auto",
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-md)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          zIndex: 2147483647,
                          padding: "8px 0",
                        }}
                      >
                        {IMPRESSIONS_TABLE_COLUMNS.map((col) => (
                          <label key={col.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}>
                            <input type="checkbox" checked={columnVisibility[col.id]} onChange={(e) => setColumnVisible(col.id, e.target.checked)} />
                            {col.label}
                          </label>
                        ))}
                      </div>,
                      document.body,
                    )}
                </div>
                )}
              </div>
              <div style={{ overflow: "auto", minHeight: 460, maxHeight: "min(70vh, 560px)" }}>
                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", color: "var(--text-primary)" }} aria-label="Impressions by year-month">
                  <colgroup>
                    {visibleColumns.map((col) => (
                      <col key={col.id} style={{ width: col.width }} />
                    ))}
                    <col style={{ width: 16 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {visibleColumns.map((col, index) => (
                        <th
                          key={col.id}
                          draggable={!readOnly}
                          onDragStart={readOnly ? undefined : (e) => onHeaderDragStart(e, col.id)}
                          onDragOver={readOnly ? undefined : (e) => onHeaderDragOver(e, index)}
                          onDragLeave={readOnly ? undefined : onHeaderDragLeave}
                          onDrop={readOnly ? undefined : (e) => onHeaderDrop(e, index)}
                          onDragEnd={readOnly ? undefined : onHeaderDragEnd}
                          style={{ ...col.thStyle, cursor: readOnly ? "default" : draggingColId ? "grabbing" : "grab", opacity: draggingColId === col.id ? 0.6 : 1, transition: "opacity 0.2s ease, background 0.2s ease" }}
                        >
                          {dropTargetIndex === index && (
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--text-primary)", borderRadius: 2, pointerEvents: "none" }} />
                          )}
                          {col.label}
                        </th>
                      ))}
                      <th
                        onDragOver={readOnly ? undefined : (e) => onHeaderDragOver(e, visibleColumns.length)}
                        onDragLeave={readOnly ? undefined : onHeaderDragLeave}
                        onDrop={readOnly ? undefined : (e) => onHeaderDrop(e, visibleColumns.length)}
                        style={{ ...thStyle, width: 16, minWidth: 16, padding: 0, borderLeft: dropTargetIndex === visibleColumns.length ? "3px solid var(--text-primary)" : undefined, transition: "border-color 0.2s ease" }}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length + 1} style={{ ...tdBase, color: "var(--text-secondary)", textAlign: "center" }}>
                          No data. Add campaigns or use Sources import to see impressions by month.
                        </td>
                      </tr>
                    ) : (
                      aggregatedRows.map((row) => (
                        <tr key={row.yearMonth} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          {visibleColumns.map((col) => {
                            if (col.id === "month") return <td key={col.id} style={col.tdStyle}>{row.yearMonth}</td>;
                            if (col.id === "bookedImpressions") return <td key={col.id} style={col.tdStyle}>{row.sumImpressions.toLocaleString("en-US")}</td>;
                            if (col.id === "campaigns") return <td key={col.id} style={col.tdStyle}>{row.activeCampaignCount}</td>;
                            if (col.id === "deliveredImpr") return <td key={col.id} style={col.tdStyle}>{row.dataImpressions > 0 ? row.dataImpressions.toLocaleString("en-US") : "\u2014"}</td>;
                            if (col.id === "delivLines") return <td key={col.id} style={col.tdStyle}>{row.deliveredLines > 0 ? row.deliveredLines.toLocaleString("en-US") : "\u2014"}</td>;
                            if (col.id === "mediaCost") return <td key={col.id} style={col.tdStyle}>{row.mediaCost > 0 ? `$${row.mediaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "mediaFees") return <td key={col.id} style={col.tdStyle}>{row.mediaFees > 0 ? `$${row.mediaFees.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "celtraCost") return <td key={col.id} style={col.tdStyle}>{row.celtraCost > 0 ? `$${row.celtraCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "totalCost") return <td key={col.id} style={col.tdStyle}>{row.totalCost > 0 ? `$${row.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "bookedRevenue") return <td key={col.id} style={col.tdStyle}>{row.bookedRevenue > 0 ? `$${row.bookedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "bookedRevenueVsTotalCost") {
                              const value = row.bookedRevenue - row.totalCost;
                              return (
                                <td key={col.id} style={{ ...col.tdStyle, color: value < 0 ? "#dc2626" : "#16a34a" }}>
                                  {row.bookedRevenue > 0 || row.totalCost > 0 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "\u2014"}
                                </td>
                              );
                            }
                            if (col.id === "margin") {
                              const margin = row.bookedRevenue > 0 ? (100 * (row.bookedRevenue - row.totalCost)) / row.bookedRevenue : null;
                              return (
                                <td key={col.id} style={{ ...col.tdStyle, color: margin != null && margin < 0 ? "#dc2626" : "#16a34a" }}>
                                  {margin != null ? `${margin.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "\u2014"}
                                </td>
                              );
                            }
                            return null;
                          })}
                          <td key="_drop" style={{ width: 16, padding: 0 }} />
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {aggregatedRows.length > 0 && (
                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", color: "var(--text-primary)" }} aria-label="Monitor totals">
                  <colgroup>
                    {visibleColumns.map((col) => (
                      <col key={col.id} style={{ width: col.width }} />
                    ))}
                    <col style={{ width: 16 }} />
                  </colgroup>
                  <tbody>
                    <tr style={{ borderTop: "2px solid var(--border-light)", background: "var(--bg-secondary)", fontWeight: 600, fontSize: 13 }}>
                      {visibleColumns.map((col) => {
                        if (col.id === "month") return <td key={col.id} style={col.tdStyle}>Total</td>;
                        if (col.id === "bookedImpressions") return <td key={col.id} style={col.tdStyle}>{totalImpressions.toLocaleString("en-US")}</td>;
                        if (col.id === "campaigns") return <td key={col.id} style={col.tdStyle}>{totalUniqueCampaignCount}</td>;
                        if (col.id === "deliveredImpr") return <td key={col.id} style={col.tdStyle}>{totalDataImpressions > 0 ? totalDataImpressions.toLocaleString("en-US") : "\u2014"}</td>;
                        if (col.id === "delivLines") return <td key={col.id} style={col.tdStyle}>{totalDeliveredLines > 0 ? totalDeliveredLines.toLocaleString("en-US") : "\u2014"}</td>;
                        if (col.id === "mediaCost") return <td key={col.id} style={col.tdStyle}>{totalMediaCost > 0 ? `$${totalMediaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "mediaFees") return <td key={col.id} style={col.tdStyle}>{(totalMediaFees ?? 0) > 0 ? `$${(totalMediaFees ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "celtraCost") return <td key={col.id} style={col.tdStyle}>{totalCeltraCost > 0 ? `$${totalCeltraCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "totalCost") return <td key={col.id} style={col.tdStyle}>{totalTotalCost > 0 ? `$${totalTotalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "bookedRevenue") return <td key={col.id} style={col.tdStyle}>{totalBookedRevenue > 0 ? `$${totalBookedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "bookedRevenueVsTotalCost") {
                          const value = totalBookedRevenue - totalTotalCost;
                          return (
                            <td key={col.id} style={{ ...col.tdStyle, color: value < 0 ? "#dc2626" : "#16a34a" }}>
                              {totalBookedRevenue > 0 || totalTotalCost > 0 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "\u2014"}
                            </td>
                          );
                        }
                        if (col.id === "margin") {
                          const margin = totalBookedRevenue > 0 ? (100 * (totalBookedRevenue - totalTotalCost)) / totalBookedRevenue : null;
                          return (
                            <td key={col.id} style={{ ...col.tdStyle, color: margin != null && margin < 0 ? "#dc2626" : "#16a34a" }}>
                              {margin != null ? `${margin.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "\u2014"}
                            </td>
                          );
                        }
                        return null;
                      })}
                      <td key="_drop" style={{ width: 16, padding: 0 }} />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {monitorView === "dimension" && showDimensionView && (
          <>
            <div style={{ marginTop: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Booked impressions by {effectiveDimensionColumn}
              </h2>
              {dimensionLoading ? (
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Loading…</span>
                </div>
              ) : (
                <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                  <ImpressionsChart
                    rows={dimensionRows.map((r) => ({
                      yearMonth: r.dimensionValue,
                      sumImpressions: r.sumImpressions,
                      dataImpressions: 0,
                    }))}
                    measureGroup="impressions"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {monitorView === "dimension" && showDimensionView && (
        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--border-light)",
            borderRadius: tableBorderRadius,
            background: "var(--bg-secondary)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)", fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Table by {effectiveDimensionColumn}
          </div>
          <div style={{ overflow: "auto", minHeight: 460, maxHeight: "min(70vh, 560px)" }}>
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13, color: "var(--text-primary)" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ ...thStyle, textAlign: "left" }}>{effectiveDimensionColumn}</th>
                  <th style={{ ...goldTh }}>Booked impressions</th>
                  <th style={{ ...goldTh }}>Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {dimensionLoading ? (
                  <tr><td colSpan={3} style={{ ...tdBase, textAlign: "center", color: "var(--text-secondary)" }}>Loading…</td></tr>
                ) : dimensionRows.length === 0 ? (
                  <tr><td colSpan={3} style={{ ...tdBase, textAlign: "center", color: "var(--text-secondary)" }}>Select a campaign table and dimension.</td></tr>
                ) : (
                  dimensionRows.map((r) => (
                    <tr key={r.dimensionValue} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={tdBase}>{r.dimensionValue}</td>
                      <td style={goldTd}>{r.sumImpressions.toLocaleString("en-US")}</td>
                      <td style={goldTd}>{r.activeCampaignCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

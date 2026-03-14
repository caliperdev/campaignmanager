"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MonitorDataPayload, MonitorDisplayRow } from "@/lib/monitor-data";
import { Button } from "@/components/ui";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useLoading } from "@/components/LoadingOverlay";
import ImpressionsChart, { type ChartMeasureGroup } from "./ImpressionsChart";
import MonitorPickers from "./MonitorPickers";
import RefreshOrderButton from "./RefreshOrderButton";
import RefreshMonitorButton from "./RefreshMonitorButton";
import PlacementsModal from "./PlacementsModal";
import { FilterPillSelect } from "@/components/FilterPillSelect";
import { Last7DaysTooltip } from "./Last7DaysTooltip";
import { DailyPane } from "./DailyPane";
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
  { id: "placements", label: "Placements", width: "8%", thStyle: goldTh, tdStyle: goldTd },
  { id: "bookedImpressions", label: "Booked impressions", width: "12%", thStyle: goldTh, tdStyle: goldTd },
  { id: "deliveredImpr", label: "Delivered Impr.", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "mediaCost", label: "Media Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "mediaFees", label: "Media Fees", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "celtraCost", label: "Celtra Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "totalCost", label: "Total Cost", width: "12%", thStyle: purpleTh, tdStyle: purpleTd },
  { id: "bookedRevenue", label: "Booked Revenue", width: "12%", thStyle: goldTh, tdStyle: goldTd },
  { id: "bookedRevenueVsTotalCost", label: "Booked Revenue vs Total Cost", width: "12%", thStyle: blackTh, tdStyle: blackTd },
  { id: "margin", label: "Margin (%)", width: "9%", thStyle: blackTh, tdStyle: blackTd },
] as const;

type ColumnId = (typeof IMPRESSIONS_TABLE_COLUMNS)[number]["id"];

const defaultColumnOrder: ColumnId[] = IMPRESSIONS_TABLE_COLUMNS.map((c) => c.id);

const defaultColumnVisibility: Record<ColumnId, boolean> = {
  month: true,
  bookedImpressions: true,
  placements: true,
  deliveredImpr: true,
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
  activeOrderCount: number;
};

type AdvertiserOption = { id: string; advertiser: string };

/** Merge multiple payloads by year-month: sum metrics per month. */
function mergePayloadsByYearMonth(payloads: MonitorDataPayload[]): MonitorDataPayload | null {
  if (payloads.length === 0) return null;
  const byYm = new Map<string, Partial<MonitorDisplayRow>>();
  for (const p of payloads) {
    for (const r of p.rows ?? []) {
      const existing = byYm.get(r.yearMonth);
      if (!existing) {
        byYm.set(r.yearMonth, { ...r });
      } else {
        existing.sumImpressions = (existing.sumImpressions ?? 0) + r.sumImpressions;
        existing.dataImpressions = (existing.dataImpressions ?? 0) + r.dataImpressions;
        existing.deliveredLines = (existing.deliveredLines ?? 0) + r.deliveredLines;
        existing.mediaCost = (existing.mediaCost ?? 0) + r.mediaCost;
        existing.mediaFees = (existing.mediaFees ?? 0) + r.mediaFees;
        existing.celtraCost = (existing.celtraCost ?? 0) + r.celtraCost;
        existing.totalCost = (existing.totalCost ?? 0) + r.totalCost;
        existing.bookedRevenue = (existing.bookedRevenue ?? 0) + r.bookedRevenue;
        existing.activeOrderCount = Math.max(existing.activeOrderCount ?? 0, r.activeOrderCount ?? 0);
        existing.placementCount = (existing.placementCount ?? 0) + (r.placementCount ?? r.activeOrderCount ?? 0);
      }
    }
  }
  const rows: MonitorDisplayRow[] = Array.from(byYm.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, r]) => ({
      yearMonth,
      sumImpressions: r.sumImpressions ?? 0,
      activeOrderCount: r.activeOrderCount ?? 0,
      dataImpressions: r.dataImpressions ?? 0,
      deliveredLines: r.deliveredLines ?? 0,
      mediaCost: Math.round((r.mediaCost ?? 0) * 100) / 100,
      mediaFees: Math.round((r.mediaFees ?? 0) * 100) / 100,
      celtraCost: Math.round((r.celtraCost ?? 0) * 100) / 100,
      totalCost: Math.round((r.totalCost ?? 0) * 100) / 100,
      bookedRevenue: Math.round((r.bookedRevenue ?? 0) * 100) / 100,
      placementCount: r.placementCount ?? 0,
    }));
  const totalImpressions = rows.reduce((a, r) => a + r.sumImpressions, 0);
  const totalDataImpressions = rows.reduce((a, r) => a + r.dataImpressions, 0);
  const totalDeliveredLines = rows.reduce((a, r) => a + r.deliveredLines, 0);
  const totalMediaCost = Math.round(rows.reduce((a, r) => a + r.mediaCost, 0) * 100) / 100;
  const totalMediaFees = Math.round(rows.reduce((a, r) => a + r.mediaFees, 0) * 100) / 100;
  const totalCeltraCost = Math.round(rows.reduce((a, r) => a + r.celtraCost, 0) * 100) / 100;
  const totalTotalCost = Math.round(rows.reduce((a, r) => a + r.totalCost, 0) * 100) / 100;
  const totalBookedRevenue = Math.round(rows.reduce((a, r) => a + r.bookedRevenue, 0) * 100) / 100;
  const totalPlacementCount = Math.max(...rows.map((r) => r.placementCount ?? 0), 0);
  return {
    orderRows: [],
    totalUniqueOrderCount: 0,
    dataRows: [],
    rows,
    totalImpressions,
    totalDataImpressions,
    totalDeliveredLines,
    totalMediaCost,
    totalMediaFees,
    totalCeltraCost,
    totalTotalCost,
    totalBookedRevenue,
    totalPlacementCount,
  };
}

type Props = {
  initialData: MonitorDataPayload;
  ct?: string | null;
  dt?: string | null;
  orderTables: NavItem[];
  dataTables: NavItem[];
  dimensionOptions?: string[];
  advertiserOptions?: AdvertiserOption[];
  readOnly?: boolean;
  forceGlobal?: boolean;
};

export default function MonitorContent({
  initialData,
  ct = null,
  dt = null,
  orderTables,
  dataTables,
  dimensionOptions = [],
  advertiserOptions = [],
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
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("");
  const [ioFilter, setIoFilter] = useState<string>("");
  const [placementFilter, setPlacementFilter] = useState<string>("");
  const [placementIoIds, setPlacementIoIds] = useState<string[]>([]);
  const [ioOptions, setIoOptions] = useState<string[]>([]);
  const [placementOptions, setPlacementOptions] = useState<{ id: string; label: string }[]>([]);
  const [dimensionColumn, setDimensionColumn] = useState("");
  const [dimensionRows, setDimensionRows] = useState<MonitorByDimensionRow[]>([]);
  const [dimensionLoading, setDimensionLoading] = useState(false);
  const [placementsModalOpen, setPlacementsModalOpen] = useState(false);
  const [dailyPaneOpen, setDailyPaneOpen] = useState(false);
  const [dailyPaneYearMonth, setDailyPaneYearMonth] = useState<string>("");
  const { setLoading } = useLoading();

  const openDailyPane = (yearMonth: string) => {
    setDailyPaneYearMonth(yearMonth);
    setDailyPaneOpen(true);
  };

  useEffect(() => {
    if (!dailyPaneOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDailyPaneOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dailyPaneOpen]);

  useClickOutside(columnsRef, () => setColumnsOpen(false), columnsOpen);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (forceGlobal) setLoading(false);
  }, [forceGlobal, setLoading]);

  // Fetch placement options when advertiser changes (placements scoped to that advertiser)
  useEffect(() => {
    if (!forceGlobal || !advertiserOptions.length) return;
    const adv = advertiserFilter?.trim() || undefined;
    const params = new URLSearchParams();
    if (adv) params.set("advertiser", adv);
    fetch(`/api/dashboard-placement-options?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((arr) => setPlacementOptions(Array.isArray(arr) ? arr : []));
  }, [forceGlobal, advertiserOptions.length, advertiserFilter]);

  // Fetch IO options when advertiser changes (for read-only display when "all placements")
  useEffect(() => {
    if (!forceGlobal || !advertiserOptions.length) return;
    const adv = advertiserFilter?.trim() || undefined;
    fetch(`/api/dashboard-io-options${adv ? `?advertiser=${encodeURIComponent(adv)}` : ""}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((arr) => setIoOptions(Array.isArray(arr) ? arr : []));
  }, [forceGlobal, advertiserOptions.length, advertiserFilter]);

  const placementFetchAbortRef = useRef<AbortController | null>(null);
  const dataFetchIdRef = useRef(0);
  const filtersRef = useRef({ placementFilter, advertiserFilter, ioFilter });
  filtersRef.current = { placementFilter, advertiserFilter, ioFilter };

  // Current month daily totals (up to yesterday) for margin and rev vs cost columns — same as right pane
  const [currentMonthToDate, setCurrentMonthToDate] = useState<{ rev: number; cost: number } | null>(null);

  // Fetch IO IDs for selected placement (for display and data fetch). Server cache handles repeat requests.
  const [placementIoIdsSettled, setPlacementIoIdsSettled] = useState(false);
  useEffect(() => {
    if (!forceGlobal || !placementFilter?.trim()) {
      setPlacementIoIds([]);
      setPlacementIoIdsSettled(true);
      return;
    }
    placementFetchAbortRef.current?.abort();
    placementFetchAbortRef.current = new AbortController();
    const signal = placementFetchAbortRef.current.signal;
    const currentPlacement = placementFilter;
    const currentAdvertiser = advertiserFilter;
    setPlacementIoIds([]);
    setPlacementIoIdsSettled(false);
    const params = new URLSearchParams();
    params.set("placement", placementFilter.trim());
    if (advertiserFilter?.trim()) params.set("advertiser", advertiserFilter.trim());
    fetch(`/api/dashboard-placement-io-ids?${params.toString()}`, { signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((arr) => {
        const ids = Array.isArray(arr) ? arr : [];
        if (placementFilter === currentPlacement && advertiserFilter === currentAdvertiser) {
          setPlacementIoIds(ids);
          setPlacementIoIdsSettled(true);
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError" && placementFilter === currentPlacement) setPlacementIoIdsSettled(true);
      });
    return () => placementFetchAbortRef.current?.abort();
  }, [forceGlobal, placementFilter, advertiserFilter]);

  // Refetch dashboard data when filters change. Only applies result if filters still match.
  const filtersInitialized = useRef(false);
  const effectiveIo: string = placementFilter && placementIoIds.length > 0 ? placementIoIds[0] : ioFilter;
  const canFetchWithPlacement = !placementFilter || placementIoIdsSettled;
  const ioSelectValue = placementFilter ? (placementIoIds[0] ?? "") : ioFilter;
  const advertiserOnly = !!(advertiserFilter && !placementFilter && !effectiveIo);

  useEffect(() => {
    if (!forceGlobal || !advertiserOptions.length || !canFetchWithPlacement) return;
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      return;
    }
    const fetchId = ++dataFetchIdRef.current;
    const fetchPlacement = placementFilter;
    const fetchAdvertiser = advertiserFilter;
    const fetchIo = effectiveIo;
    setLoading(true);

    if (advertiserOnly) {
      // Single fetch: backend includes ALL placements (with/without DSP) for full booked-impressions
      const params = new URLSearchParams();
      params.set("advertiser", advertiserFilter!);
      fetch(`/api/monitor-data?${params.toString()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          if (fetchId === dataFetchIdRef.current && filtersRef.current.placementFilter === fetchPlacement && filtersRef.current.advertiserFilter === fetchAdvertiser) {
            if (payload) setData(payload);
          }
        })
        .finally(() => {
          if (fetchId === dataFetchIdRef.current) setLoading(false);
        });
    } else {
      const params = new URLSearchParams();
      if (advertiserFilter) params.set("advertiser", advertiserFilter);
      if (effectiveIo) params.set("io", effectiveIo);
      if (placementFilter) params.set("placement", placementFilter);
      fetch(`/api/monitor-data?${params.toString()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          if (fetchId === dataFetchIdRef.current && filtersRef.current.placementFilter === fetchPlacement && filtersRef.current.advertiserFilter === fetchAdvertiser && effectiveIo === fetchIo) {
            if (payload) setData(payload);
          }
        })
        .finally(() => {
          if (fetchId === dataFetchIdRef.current) setLoading(false);
        });
    }
  }, [forceGlobal, advertiserOptions.length, advertiserFilter, effectiveIo, placementFilter, canFetchWithPlacement, setLoading, advertiserOnly]);

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
    if (forceGlobal) {
      const refreshRes = await fetch("/api/dashboard-refresh-all", { method: "POST" });
      if (!refreshRes.ok) {
        const body = await refreshRes.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to refresh dashboard cache");
      }
    }
    const params = new URLSearchParams();
    if (ct) params.set("ct", ct);
    if (dt) params.set("dt", dt);
    if (forceGlobal) {
      if (effectiveIo) params.set("io", effectiveIo);
      if (advertiserFilter) params.set("advertiser", advertiserFilter);
      if (placementFilter) params.set("placement", placementFilter);
    }
    const res = await fetch(`/api/monitor-data?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch monitor data");
    const payload: MonitorDataPayload = await res.json();
    setData(payload);
  }

  async function refreshSelectionFromCache() {
    const refreshRes = await fetch("/api/dashboard-refresh-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        io: effectiveIo || undefined,
        advertiser: advertiserFilter || undefined,
        placement: placementFilter || undefined,
      }),
    });
    if (!refreshRes.ok) {
      const body = await refreshRes.json().catch(() => ({}));
      throw new Error(body?.error ?? "Failed to refresh selection");
    }
    const params = new URLSearchParams();
    if (effectiveIo) params.set("io", effectiveIo);
    if (advertiserFilter) params.set("advertiser", advertiserFilter);
    if (placementFilter) params.set("placement", placementFilter);
    const res = await fetch(`/api/monitor-data?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch monitor data");
    const payload: MonitorDataPayload = await res.json();
    setData(payload);
  }

  const { rows, orderRows, totalUniqueOrderCount, totalPlacementCount, totalImpressions, totalDataImpressions, totalDeliveredLines, totalMediaCost, totalMediaFees, totalCeltraCost, totalTotalCost, totalBookedRevenue } = data;

  const currentPeriodKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (timeGroup === "yearMonth") return `${y}-${String(m).padStart(2, "0")}`;
    if (timeGroup === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
    return String(y);
  }, [timeGroup]);

  // Fetch current month daily totals (up to yesterday) for margin/rev-vs-cost — same logic as right pane
  useEffect(() => {
    if (!forceGlobal || timeGroup !== "yearMonth" || !currentPeriodKey || !/^\d{4}-\d{2}$/.test(currentPeriodKey)) {
      setCurrentMonthToDate(null);
      return;
    }
    const params = new URLSearchParams();
    params.set("yearMonth", currentPeriodKey);
    if (advertiserFilter?.trim()) params.set("advertiser", advertiserFilter.trim());
    if (effectiveIo) params.set("io", effectiveIo);
    if (placementFilter?.trim()) params.set("placement", placementFilter.trim());
    fetch(`/api/dashboard-daily-by-month?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { date: string; bookedRevenue: number; totalCost: number }[]) => {
        const rev = rows.reduce((a, r) => a + r.bookedRevenue, 0);
        const cost = rows.reduce((a, r) => a + r.totalCost, 0);
        setCurrentMonthToDate({ rev, cost });
      })
      .catch(() => setCurrentMonthToDate(null));
  }, [forceGlobal, timeGroup, currentPeriodKey, advertiserFilter, effectiveIo, placementFilter]);

  const aggregatedRows = useMemo(() => {
    if (timeGroup === "yearMonth") return rows;
    const keyFn = timeGroup === "year" ? (r: typeof rows[0]) => r.yearMonth.slice(0, 4) : (r: typeof rows[0]) => `${r.yearMonth.slice(0, 4)}-Q${Math.ceil(Number(r.yearMonth.slice(5, 7)) / 3)}`;
    const byKey = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const key = keyFn(r);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r, yearMonth: key, placementCount: r.placementCount ?? r.activeOrderCount ?? 0 });
      } else {
        existing.sumImpressions += r.sumImpressions;
        existing.activeOrderCount += r.activeOrderCount;
        existing.placementCount = (existing.placementCount ?? 0) + (r.placementCount ?? r.activeOrderCount ?? 0);
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
      className="main-content"
      data-dashboard={forceGlobal ? "true" : undefined}
      style={{
        flex: 1,
        minHeight: 0,
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div className={forceGlobal ? "dashboard-header" : undefined}>
          <h1>Dashboard</h1>
          {forceGlobal ? null : (
            <div style={{ marginTop: 16, display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
              <MonitorPickers
                orderTables={orderTables.map((t) => ({ id: t.id, name: t.name }))}
                dataTables={dataTables.map((t) => ({ id: t.id, name: t.name }))}
                selectedCt={ct}
                selectedDt={dt}
              />
            </div>
          )}
        </div>
        {(forceGlobal || !readOnly) && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {!readOnly && (forceGlobal ? (
            <>
              <RefreshOrderButton onRefreshCached={refreshFromCache} />
              <Button
                variant="secondary"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await refreshSelectionFromCache();
                  } finally {
                    setLoading(false);
                  }
                }}
                title="Refresh only the current selection (advertiser, IO, placement) for quick test"
              >
                Refresh selection
              </Button>
            </>
          ) : (
            <>
              <RefreshOrderButton onRefreshCached={refreshFromCache} />
              <RefreshMonitorButton orderId={ct ?? undefined} sourceId={dt ?? undefined} onRefreshCached={refreshFromCache} />
            </>
          ))}
        </div>
        )}
        {forceGlobal && (
          <PlacementsModal open={placementsModalOpen} onClose={() => setPlacementsModalOpen(false)} />
        )}
      </div>

      <div className={forceGlobal ? "dashboard-card" : undefined} style={!forceGlobal ? { marginTop: 28, padding: "20px 24px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" } : undefined}>
        <div className={forceGlobal ? "dashboard-toolbar" : undefined} style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          {!forceGlobal && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>View</span>
              <div style={{ display: "flex", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", padding: 2, border: "1px solid var(--border-light)" }}>
                <button
                  type="button"
                  onClick={() => setMonitorView("time")}
                  style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, border: "none", borderRadius: "6px", cursor: "pointer", background: monitorView === "time" ? "var(--accent-dark)" : "transparent", color: monitorView === "time" ? "white" : "var(--text-secondary)" }}
                >
                  By time
                </button>
                {showDimensionView && (
                  <button
                    type="button"
                    onClick={() => setMonitorView("dimension")}
                    style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, border: "none", borderRadius: "6px", cursor: "pointer", background: monitorView === "dimension" ? "var(--accent-dark)" : "transparent", color: monitorView === "dimension" ? "white" : "var(--text-secondary)" }}
                  >
                    By dimension
                  </button>
                )}
              </div>
            </div>
          )}
          {forceGlobal && advertiserOptions.length > 0 && (
            <div className="dashboard-toolbar-filters">
                <div className="dashboard-control-group">
                  <label htmlFor="advertiser-filter">Advertiser</label>
                  <FilterPillSelect
                    id="advertiser-filter"
                    aria-label="Select advertiser"
                    value={advertiserFilter}
                    onChange={(v) => {
                      setLoading(true);
                      setAdvertiserFilter(v);
                      setPlacementFilter("");
                      setIoFilter("");
                    }}
                    options={advertiserOptions.map((a) => ({ value: a.id, label: a.advertiser }))}
                    emptyLabel="All advertisers"
                  />
                </div>
                <div className="dashboard-control-group">
                  <label htmlFor="placement-filter">Placement ID</label>
                  <FilterPillSelect
                    id="placement-filter"
                    aria-label="Select placement"
                    value={placementFilter}
                    onChange={(v) => {
                      setLoading(true);
                      setPlacementFilter(v);
                      setIoFilter("");
                    }}
                    options={placementOptions.map((p) => ({ value: p.id, label: p.id }))}
                    emptyLabel="All placements"
                  />
                </div>
                <div className="dashboard-control-group">
                  <label htmlFor="io-filter">Insertion Order ID</label>
                  <FilterPillSelect
                    id="io-filter"
                    aria-label="Insertion order ID"
                    value={ioSelectValue}
                    onChange={() => {}}
                    options={ioOptions.map((io) => ({ value: io, label: io }))}
                    emptyLabel="All insertion order IDs"
                    readOnly
                  />
                </div>
            </div>
          )}
          {forceGlobal && advertiserOptions.length > 0 && <div className="dashboard-toolbar-divider" />}
          {(monitorView === "time" || forceGlobal) && (
            <>
              {forceGlobal ? (
                <>
                  <div className="dashboard-control-group">
                    <label htmlFor="time-group-select">Group by</label>
                    <select
                      id="time-group-select"
                      className="dashboard-control"
                      value={timeGroup}
                      onChange={(e) => setTimeGroup(e.target.value as "yearMonth" | "quarter" | "year")}
                    >
                      <option value="yearMonth">Year‑Month</option>
                      <option value="quarter">Quarter</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                  <div className="dashboard-control-group">
                    <label htmlFor="chart-measure-select">Chart</label>
                    <select
                      id="chart-measure-select"
                      className="dashboard-control"
                      value={chartMeasureGroup}
                      onChange={(e) => setChartMeasureGroup(e.target.value as ChartMeasureGroup)}
                    >
                      <option value="impressions">Impressions</option>
                      <option value="costs">Costs</option>
                      <option value="margin">Margin</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Group by</span>
                    <select
                      value={timeGroup}
                      onChange={(e) => setTimeGroup(e.target.value as "yearMonth" | "quarter" | "year")}
                      style={{ padding: "8px 12px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", minWidth: 140 }}
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
                      style={{ padding: "8px 12px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", minWidth: 140 }}
                    >
                      <option value="impressions">Impressions</option>
                      <option value="costs">Costs</option>
                      <option value="margin">Margin</option>
                    </select>
                  </div>
                </>
              )}
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
                          {forceGlobal
                            ? "Click Refresh to load dashboard data."
                            : ct && dt
                              ? "No data. Ensure campaign and source have matching Insertion Order ID / GID columns, then Refresh."
                              : "No data. Add placements with Insertion Order ID - DSP linked to DSP source."}
                        </td>
                      </tr>
                    ) : (
                      aggregatedRows.map((row) => (
                        <tr key={row.yearMonth} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          {visibleColumns.map((col) => {
                            if (col.id === "month") return <td key={col.id} style={col.tdStyle}>{row.yearMonth}</td>;
                            if (col.id === "bookedImpressions") return <td key={col.id} style={col.tdStyle}>{row.sumImpressions.toLocaleString("en-US")}</td>;
                            if (col.id === "placements") return <td key={col.id} style={col.tdStyle}>{row.placementCount ?? row.activeOrderCount ?? 0}</td>;
                            if (col.id === "deliveredImpr") return <td key={col.id} style={col.tdStyle}>{row.dataImpressions > 0 ? row.dataImpressions.toLocaleString("en-US") : "\u2014"}</td>;
                            if (col.id === "mediaCost") return <td key={col.id} style={col.tdStyle}>{row.mediaCost > 0 ? `$${row.mediaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "mediaFees") return <td key={col.id} style={col.tdStyle}>{row.mediaFees > 0 ? `$${row.mediaFees.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "celtraCost") return <td key={col.id} style={col.tdStyle}>{row.celtraCost > 0 ? `$${row.celtraCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "totalCost") return <td key={col.id} style={col.tdStyle}>{row.totalCost > 0 ? `$${row.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "bookedRevenue") return <td key={col.id} style={col.tdStyle}>{row.bookedRevenue > 0 ? `$${row.bookedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                            if (col.id === "bookedRevenueVsTotalCost") {
                              const isFuture = row.yearMonth > currentPeriodKey;
                              if (isFuture) return <td key={col.id} style={col.tdStyle}>—</td>;
                              const rev = row.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.rev : row.bookedRevenue;
                              const cost = row.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.cost : row.totalCost;
                              const value = rev - cost;
                              return (
                                <Last7DaysTooltip
                                  key={col.id}
                                  yearMonth={row.yearMonth}
                                  advertiser={advertiserFilter || undefined}
                                  io={effectiveIo || undefined}
                                  placement={placementFilter || undefined}
                                  cellStyle={{ ...col.tdStyle, color: value < 0 ? "#dc2626" : "#16a34a" }}
                                  forceGlobal={forceGlobal}
                                  timeGroup={timeGroup}
                                  onCellClick={forceGlobal && /^\d{4}-\d{2}$/.test(row.yearMonth) ? () => openDailyPane(row.yearMonth) : undefined}
                                >
                                  {rev > 0 || cost > 0 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}
                                </Last7DaysTooltip>
                              );
                            }
                            if (col.id === "margin") {
                              const isFuture = row.yearMonth > currentPeriodKey;
                              if (isFuture) return <td key={col.id} style={col.tdStyle}>—</td>;
                              const rev = row.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.rev : row.bookedRevenue;
                              const cost = row.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.cost : row.totalCost;
                              const margin = rev > 0 ? (100 * (rev - cost)) / rev : null;
                              return (
                                <Last7DaysTooltip
                                  key={col.id}
                                  yearMonth={row.yearMonth}
                                  advertiser={advertiserFilter || undefined}
                                  io={effectiveIo || undefined}
                                  placement={placementFilter || undefined}
                                  cellStyle={{ ...col.tdStyle, color: margin != null && margin < 0 ? "#dc2626" : "#16a34a" }}
                                  forceGlobal={forceGlobal}
                                  timeGroup={timeGroup}
                                  onCellClick={forceGlobal && /^\d{4}-\d{2}$/.test(row.yearMonth) ? () => openDailyPane(row.yearMonth) : undefined}
                                >
                                  {margin != null ? `${margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "\u2014"}
                                </Last7DaysTooltip>
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
                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", color: "var(--text-primary)" }} aria-label="Dashboard totals">
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
                        if (col.id === "placements") return <td key={col.id} style={col.tdStyle}>{totalPlacementCount ?? totalUniqueOrderCount ?? 0}</td>;
                        if (col.id === "deliveredImpr") return <td key={col.id} style={col.tdStyle}>{totalDataImpressions > 0 ? totalDataImpressions.toLocaleString("en-US") : "\u2014"}</td>;
                        if (col.id === "mediaCost") return <td key={col.id} style={col.tdStyle}>{totalMediaCost > 0 ? `$${totalMediaCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "mediaFees") return <td key={col.id} style={col.tdStyle}>{(totalMediaFees ?? 0) > 0 ? `$${(totalMediaFees ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "celtraCost") return <td key={col.id} style={col.tdStyle}>{totalCeltraCost > 0 ? `$${totalCeltraCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "totalCost") return <td key={col.id} style={col.tdStyle}>{totalTotalCost > 0 ? `$${totalTotalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "bookedRevenue") return <td key={col.id} style={col.tdStyle}>{totalBookedRevenue > 0 ? `$${totalBookedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}</td>;
                        if (col.id === "bookedRevenueVsTotalCost") {
                          const toDate = aggregatedRows.filter((r) => r.yearMonth <= currentPeriodKey);
                          const revToDate = Math.round(toDate.reduce((a, r) => a + (r.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.rev : r.bookedRevenue), 0) * 100) / 100;
                          const costToDate = Math.round(toDate.reduce((a, r) => a + (r.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.cost : r.totalCost), 0) * 100) / 100;
                          const value = revToDate - costToDate;
                          return (
                            <td key={col.id} style={{ ...col.tdStyle, color: value < 0 ? "#dc2626" : "#16a34a" }}>
                              {revToDate > 0 || costToDate > 0 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}
                            </td>
                          );
                        }
                        if (col.id === "margin") {
                          const toDate = aggregatedRows.filter((r) => r.yearMonth <= currentPeriodKey);
                          const revToDate = toDate.reduce((a, r) => a + (r.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.rev : r.bookedRevenue), 0);
                          const costToDate = toDate.reduce((a, r) => a + (r.yearMonth === currentPeriodKey && currentMonthToDate ? currentMonthToDate.cost : r.totalCost), 0);
                          const margin = revToDate > 0 ? (100 * (revToDate - costToDate)) / revToDate : null;
                          return (
                            <td key={col.id} style={{ ...col.tdStyle, color: margin != null && margin < 0 ? "#dc2626" : "#16a34a" }}>
                              {margin != null ? `${margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "\u2014"}
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
                      <td style={goldTd}>{r.activeOrderCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {forceGlobal && (
        <>
          {dailyPaneOpen && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDailyPaneOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.2)",
                zIndex: 999,
              }}
              aria-label="Close daily pane"
            />
          )}
          <DailyPane
            yearMonth={dailyPaneYearMonth}
            advertiser={advertiserFilter || undefined}
            io={effectiveIo || undefined}
            placement={placementFilter || undefined}
            open={dailyPaneOpen}
            onClose={() => setDailyPaneOpen(false)}
          />
        </>
      )}
    </main>
  );
}

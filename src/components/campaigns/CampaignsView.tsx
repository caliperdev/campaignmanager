"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  ToolbarRoot,
  ToolbarButton,
  ToolbarDivider,
  DataGridProvider,
  DataGridRoot,
  DataGridHeader,
  DataGridRow,
  DataGridCell,
  DataGridCheckbox,
  useDataGrid,
} from "@/components/ui";
import CsvImportButton from "@/components/CsvImportButton";
import DataImportButton from "@/app/monitor/DataImportButton";
import ExportCsvButton from "@/components/ExportCsvButton";
import ResetAllButton from "@/components/ResetAllButton";
import CampaignNotesModal from "@/components/CampaignNotesModal";
import { deriveColumnHeaders, type CampaignListItem } from "@/lib/campaign-grid";
import { deleteCampaigns, updateCampaignCsvData } from "@/lib/campaign";
import { fetchCampaignListChunk } from "@/lib/table-actions";

const DEFAULT_COLUMN_WIDTH = 120;
const PAGE_SIZE = 100;
const LOAD_MORE_THRESHOLD_PX = 800;
const CELL_PADDING_X = 64; // 32 + 32 from DataGridCell

function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const a = [...arr];
  const [item] = a.splice(fromIndex, 1);
  a.splice(toIndex, 0, item);
  return a;
}

function measureTextWidth(text: string, fontSizePx: number): number {
  if (typeof document === "undefined") return text.length * (fontSizePx * 0.55);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * (fontSizePx * 0.55);
  ctx.font = `${fontSizePx}px system-ui, -apple-system, sans-serif`;
  return ctx.measureText(text).width;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "currentColor", opacity: 0.7 }}>
      {children}
    </svg>
  );
}

function matchesSearch(c: CampaignListItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return Object.values(c.csvData).some((v) => String(v ?? "").toLowerCase().includes(q));
}

export type FilterPill = { id: string; columnId: string; value: string };

/** Search input that keeps local state and only notifies parent after delay. Avoids re-rendering the whole grid on every keystroke. */
function DebouncedSearchInput({
  onDebouncedChange,
  delayMs = 1000,
  placeholder = "Search all columns...",
  style,
}: {
  onDebouncedChange: (value: string) => void;
  delayMs?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onDebouncedChange(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, onDebouncedChange]);
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      style={style}
    />
  );
}

function SelectionBar({ rowIds }: { rowIds: number[] }) {
  const grid = useDataGrid();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const count = grid.selectAll ? rowIds.length : grid.selectedIds.size;
  if (count === 0) return null;
  const idsToDelete: number[] = grid.selectAll ? rowIds : Array.from(grid.selectedIds) as number[];

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCampaigns(idsToDelete);
      grid.clearSelection();
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-light)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>
        {count} selected
      </span>
      <button
        type="button"
        onClick={() => grid.clearSelection()}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-secondary)",
          background: "transparent",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
        }}
      >
        Deselect all
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 500,
          color: "white",
          background: "var(--accent-dark)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: deleting ? "not-allowed" : "pointer",
          opacity: deleting ? 0.7 : 1,
        }}
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

function matchesOneFilter(c: CampaignListItem, columnId: string, value: string): boolean {
  const cell = (c.csvData[columnId] ?? "").trim().toLowerCase();
  const v = value.trim().toLowerCase();
  return cell.includes(v);
}

function matchesAllFilters(c: CampaignListItem, filters: FilterPill[]): boolean {
  return filters.every((f) => matchesOneFilter(c, f.columnId, f.value));
}

function compareCampaigns(a: CampaignListItem, b: CampaignListItem, columnId: string, dir: "asc" | "desc"): number {
  const va = (a.csvData[columnId] ?? "").trim().toLowerCase();
  const vb = (b.csvData[columnId] ?? "").trim().toLowerCase();
  const cmp = va.localeCompare(vb, undefined, { numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

type SortLevel = { columnId: string; direction: "asc" | "desc" } | null;

function sortByLevels(list: CampaignListItem[], levels: SortLevel[]): CampaignListItem[] {
  const filled = levels.filter((l): l is { columnId: string; direction: "asc" | "desc" } => l != null && l.columnId !== "");
  if (filled.length === 0) return list;
  return [...list].sort((a, b) => {
    for (const { columnId, direction } of filled) {
      const cmp = compareCampaigns(a, b, columnId, direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

export interface CampaignsViewProps {
  initialCampaigns: CampaignListItem[];
  totalCount: number;
  tableId?: string;
  tableName?: string;
  columnHeaders?: string[];
  returnToBase?: string;
  /** When true (Data view): no editing, no New Campaign, no Export; only CSV import and Delete all. */
  readOnly?: boolean;
  /** Override the chunk fetcher for infinite scroll (used by Data section). */
  fetchChunk?: (tableId: string, offset: number, limit: number) => Promise<CampaignListItem[]>;
}

export function CampaignsView({ initialCampaigns, totalCount, tableId, tableName, columnHeaders, returnToBase = "/campaigns", readOnly = false, fetchChunk }: CampaignsViewProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>(initialCampaigns);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const displayColumns = useMemo(
    () => (columnHeaders?.length ? columnHeaders : deriveColumnHeaders(campaigns)),
    [columnHeaders, campaigns]
  );

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const orderedDisplayColumns = useMemo(() => {
    if (columnOrder.length === 0) return displayColumns;
    const set = new Set(displayColumns);
    const ordered = columnOrder.filter((id) => set.has(id));
    const rest = displayColumns.filter((id) => !columnOrder.includes(id));
    return [...ordered, ...rest];
  }, [displayColumns, columnOrder]);

  const visibleOrderedDisplayColumns = useMemo(
    () => orderedDisplayColumns.filter((id) => columnVisibility[id] !== false),
    [orderedDisplayColumns, columnVisibility]
  );

  const setColumnVisible = useCallback((id: string, visible: boolean) => {
    setColumnVisibility((prev) => {
      const visibleCount = orderedDisplayColumns.filter((cid) => prev[cid] !== false).length;
      if (!visible && visibleCount <= 1) return prev;
      return { ...prev, [id]: visible };
    });
  }, [orderedDisplayColumns]);

  const fullColumnCount = orderedDisplayColumns.length;
  const visibleColumnCount = visibleOrderedDisplayColumns.length;

  const [columnWidths, setColumnWidths] = useState<number[]>(() => Array(displayColumns.length).fill(DEFAULT_COLUMN_WIDTH));
  const [resizingColumn, setResizingColumn] = useState<{ colIndex: number; widthPx: number } | null>(null);
  useEffect(() => {
    setColumnWidths((prev) => {
      if (prev.length === fullColumnCount) return prev;
      const next = Array(fullColumnCount).fill(DEFAULT_COLUMN_WIDTH);
      for (let i = 0; i < Math.min(prev.length, fullColumnCount); i++) next[i] = prev[i];
      return next;
    });
  }, [fullColumnCount]);

  const dataColumnCount = visibleOrderedDisplayColumns.length;
  const handleColumnReorder = useCallback((fromIndex: number, toIndex: number) => {
    const from = Math.min(fromIndex, dataColumnCount - 1);
    const to = Math.min(toIndex, dataColumnCount - 1);
    if (from === to) return;
    const newVisibleOrder = reorderArray(visibleOrderedDisplayColumns, from, to);
    const newFullOrder = newVisibleOrder.concat(
      orderedDisplayColumns.filter((id) => !visibleOrderedDisplayColumns.includes(id))
    );
    setColumnOrder(newFullOrder);
    setColumnWidths((prev) =>
      newFullOrder.map((id) => prev[orderedDisplayColumns.indexOf(id)] ?? DEFAULT_COLUMN_WIDTH)
    );
  }, [visibleOrderedDisplayColumns, orderedDisplayColumns, dataColumnCount]);
  const [searchQueryDebounced, setSearchQueryDebounced] = useState("");
  const [filters, setFilters] = useState<FilterPill[]>([]);
  const [sortLevels, setSortLevels] = useState<[SortLevel, SortLevel, SortLevel]>([null, null, null]);
  type ToolbarPopup = "filter" | "sort" | "columns" | null;
  const [toolbarPopup, setToolbarPopup] = useState<ToolbarPopup>(null);
  const showFilter = toolbarPopup === "filter";
  const showSort = toolbarPopup === "sort";
  const showColumns = toolbarPopup === "columns";
  const [filterDraftColumn, setFilterDraftColumn] = useState("");
  const [filterDraftValue, setFilterDraftValue] = useState("");
  const [tableFontSize, setTableFontSize] = useState(14);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useClickOutside(toolbarRef, () => setToolbarPopup(null), toolbarPopup !== null);

  const TABLE_FONT_MIN = 11;
  const TABLE_FONT_MAX = 20;

  const hasMore = campaigns.length < totalCount;

  const loadMore = useCallback(async () => {
    if (!tableId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const fetcher = fetchChunk ?? fetchCampaignListChunk;
      const chunk = await fetcher(tableId, campaigns.length, PAGE_SIZE);
      if (chunk.length > 0) {
        setCampaigns((prev) => [...prev, ...chunk]);
        setCampaignNotes((prev) => {
          const next = { ...prev };
          for (const c of chunk) next[c.id] = c.notes;
          return next;
        });
      }
    } finally {
      setLoadingMore(false);
    }
  }, [tableId, loadingMore, hasMore, campaigns.length]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD_PX) void loadMore();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  const addFilter = () => {
    if (!filterDraftColumn || !filterDraftValue.trim()) return;
    setFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), columnId: filterDraftColumn, value: filterDraftValue.trim() },
    ]);
    setFilterDraftColumn("");
    setFilterDraftValue("");
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const filteredAndSorted = useMemo(() => {
    let list = campaigns.filter(
      (c) => matchesSearch(c, searchQueryDebounced) && matchesAllFilters(c, filters)
    );
    list = sortByLevels(list, sortLevels);
    return list;
  }, [campaigns, searchQueryDebounced, filters, sortLevels]);

  const rowIds = filteredAndSorted.map((c) => c.id);
  const effectiveWidths = visibleOrderedDisplayColumns.map((id, i) => {
    const fullIndex = orderedDisplayColumns.indexOf(id);
    const w = columnWidths[fullIndex] ?? DEFAULT_COLUMN_WIDTH;
    return resizingColumn?.colIndex === i ? resizingColumn.widthPx : w;
  });
  const gridTemplateColumns = readOnly
    ? effectiveWidths.map((w) => `${w}px`).join(" ")
    : `40px ${effectiveWidths.map((w) => `${w}px`).join(" ")} 72px 40px`;

  const [editingCell, setEditingCell] = useState<{ campaignId: number; colId: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editingInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingCell) {
      editingInputRef.current?.focus();
      editingInputRef.current?.select();
    }
  }, [editingCell]);
  const [notesModal, setNotesModal] = useState<{ campaignId: number; name: string; startDate: string; endDate: string; notes: Record<string, string> } | null>(null);
  const [campaignNotes, setCampaignNotes] = useState<Record<number, Record<string, string>>>(() => {
    const map: Record<number, Record<string, string>> = {};
    for (const c of campaigns) map[c.id] = c.notes;
    return map;
  });

  // Sync from server when initialCampaigns changes (e.g. after CSV import + router.refresh())
  useEffect(() => {
    setCampaigns(initialCampaigns);
    setCampaignNotes((prev) => {
      const next = { ...prev };
      for (const c of initialCampaigns) next[c.id] = c.notes;
      return next;
    });
  }, [initialCampaigns]);

  const headerColumns = useMemo(() => {
    const measureColumnWidth = (colId: string): number => {
      const headerText = String(colId);
      const headerW = measureTextWidth(headerText, 11);
      const cellTexts = filteredAndSorted.map(
        (c) => String(c.csvData[colId] ?? "").trim() || "-"
      );
      const maxCellW =
        cellTexts.length === 0
          ? 0
          : Math.max(...cellTexts.map((t) => measureTextWidth(t, tableFontSize)));
      return Math.ceil(Math.max(headerW, maxCellW) + CELL_PADDING_X);
    };
    return [
      ...visibleOrderedDisplayColumns.map((colId, i) => {
        const fullIndex = orderedDisplayColumns.indexOf(colId);
        const widthPx = resizingColumn?.colIndex === i ? resizingColumn.widthPx : (columnWidths[fullIndex] ?? DEFAULT_COLUMN_WIDTH);
        return {
          id: colId,
          header: colId,
          widthPx,
          onResize: (width: number) => {
            setColumnWidths((prev) => {
              const next = [...prev];
              next[fullIndex] = width;
              return next;
            });
            setResizingColumn(null);
          },
          onResizeStart: () => setResizingColumn({ colIndex: i, widthPx }),
          onResizeMove: (widthPx: number) => setResizingColumn((prev) => (prev?.colIndex === i ? { ...prev, widthPx } : { colIndex: i, widthPx })),
          onAutoSize: () => measureColumnWidth(colId),
        };
      }),
      ...(readOnly ? [] : [{ id: "notes", header: "Notes" as React.ReactNode }, { id: "actions", header: "" as React.ReactNode }]),
    ];
  }, [visibleOrderedDisplayColumns, orderedDisplayColumns, columnWidths, resizingColumn, filteredAndSorted, tableFontSize, readOnly]);

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-primary)",
      }}
    >
      <header
        style={{
          height: "64px",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {tableName ?? "Campaigns"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {tableId && (returnToBase === "/data" ? <DataImportButton tableId={tableId} /> : <CsvImportButton tableId={tableId} />)}
          {!readOnly && <ExportCsvButton filteredCampaignIds={rowIds} />}
          {tableId && <ResetAllButton tableId={tableId} returnToBase={returnToBase} />}
          {!readOnly && (
            <Link
              href={tableId ? `/campaign/new?tableId=${tableId}&returnTo=${encodeURIComponent(`${returnToBase}/${tableId}`)}` : "/campaign/new"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "var(--accent-dark)",
                color: "white",
                border: "none",
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background 0.2s var(--anim-ease)",
              }}
            >
              <span>+</span> New Campaign
            </Link>
          )}
        </div>
      </header>

      <ToolbarRoot>
        <div ref={toolbarRef} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative" }}>
          <ToolbarButton
            icon={
              <Icon>
                <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
              </Icon>
            }
            onClick={() => setToolbarPopup((v) => (v === "filter" ? null : "filter"))}
          >
            Filter
          </ToolbarButton>
          {showFilter && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-float)",
                padding: 12,
                zIndex: 20,
                minWidth: 220,
              }}
            >
              <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Column</div>
              <select
                value={filterDraftColumn}
                onChange={(e) => setFilterDraftColumn(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  marginBottom: 8,
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">Select column</option>
                {displayColumns.map((colId) => (
                  <option key={colId} value={colId}>{colId}</option>
                ))}
              </select>
              <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Contains</div>
              <input
                type="text"
                value={filterDraftValue}
                onChange={(e) => setFilterDraftValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFilter()}
                placeholder="Value..."
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  marginBottom: 10,
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                type="button"
                onClick={addFilter}
                disabled={!filterDraftColumn || !filterDraftValue.trim()}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "white",
                  background: "var(--accent-dark)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                Add filter
              </button>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ToolbarButton
            icon={
              <Icon>
                <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
              </Icon>
            }
            onClick={() => setToolbarPopup((v) => (v === "sort" ? null : "sort"))}
          >
            Sort
          </ToolbarButton>
          {showSort && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-float)",
                padding: 12,
                zIndex: 20,
                minWidth: 240,
              }}
            >
              {(["first", "second", "third"] as const).map((levelKey, i) => {
                const level = sortLevels[i];
                const label = i === 0 ? "1st by" : i === 1 ? "2nd by" : "3rd by";
                return (
                  <div key={`sort-level-${levelKey}`} style={{ marginBottom: i < 2 ? 12 : 0 }}>
                    <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        value={level?.columnId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSortLevels((prev) => {
                            const next = [...prev];
                            next[i] = v ? { columnId: v, direction: (next[i]?.direction ?? "asc") as "asc" | "desc" } : null;
                            return next as [SortLevel, SortLevel, SortLevel];
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="">None</option>
                        {displayColumns.map((colId) => (
                          <option key={colId} value={colId}>{colId}</option>
                        ))}
                      </select>
                      <select
                        value={level?.direction ?? "asc"}
                        onChange={(e) => {
                          const dir = e.target.value as "asc" | "desc";
                          setSortLevels((prev) => {
                            const next = [...prev];
                            const cur = next[i];
                            if (cur) next[i] = { ...cur, direction: dir };
                            return next as [SortLevel, SortLevel, SortLevel];
                          });
                        }}
                        style={{
                          width: 72,
                          padding: "6px 8px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="asc">A → Z</option>
                        <option value="desc">Z → A</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ToolbarButton
            icon={
              <Icon>
                <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm0 10v4c0 1.1.9 2 2 2h4v-2H5v-4H3zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-14h-4v2h4v4h2V5c0-1.1-.9-2-2-2z" />
              </Icon>
            }
            onClick={() => setToolbarPopup((v) => (v === "columns" ? null : "columns"))}
          >
            Columns
          </ToolbarButton>
          {showColumns && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-float)",
                padding: "8px 0",
                zIndex: 20,
                minWidth: 200,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {displayColumns.map((colId) => (
                <label
                  key={colId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={columnVisibility[colId] !== false}
                    onChange={(e) => setColumnVisible(colId, e.target.checked)}
                  />
                  {colId}
                </label>
              ))}
            </div>
          )}
        </div>
        <ToolbarDivider />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon>
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </Icon>
          <DebouncedSearchInput
            onDebouncedChange={setSearchQueryDebounced}
            delayMs={1000}
            placeholder="Search all columns..."
            style={{
              width: 220,
              padding: "6px 8px",
              fontSize: 13,
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {totalCount > 0
              ? `${filteredAndSorted.length} of ${totalCount} rows${campaigns.length < totalCount ? ` (${campaigns.length} loaded)` : ""}`
              : "0 rows"}
          </span>
          {loadingMore && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading more…</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ToolbarButton
            icon={<Icon><path d="M19 13H5v-2h14v2z" /></Icon>}
            onClick={() => setTableFontSize((s) => Math.max(TABLE_FONT_MIN, s - 1))}
          >
            A−
          </ToolbarButton>
          <ToolbarButton
            icon={<Icon><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></Icon>}
            onClick={() => setTableFontSize((s) => Math.min(TABLE_FONT_MAX, s + 1))}
          >
            A+
          </ToolbarButton>
          </div>
        </div>
        </div>
      </ToolbarRoot>

      {filters.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 32px",
            borderBottom: "1px solid var(--border-light)",
            background: "var(--bg-secondary)",
            flexWrap: "wrap",
          }}
        >
          {filters.map((f) => {
            const colHeader = displayColumns.includes(f.columnId) ? f.columnId : f.columnId;
            return (
              <span
                key={f.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 100,
                }}
              >
                <span>{colHeader}: {f.value}</span>
                <button
                  type="button"
                  onClick={() => removeFilter(f.id)}
                  aria-label="Remove filter"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    borderRadius: "50%",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 4 }}>
            {filteredAndSorted.length} of {campaigns.length} rows
          </span>
        </div>
      )}

      <DataGridProvider rowIds={rowIds}>
        {!readOnly && <SelectionBar rowIds={rowIds} />}
        <DataGridRoot gridTemplateColumns={gridTemplateColumns} scrollContainerRef={scrollContainerRef}>
          <DataGridHeader
          columns={headerColumns}
          selectionColumn={!readOnly}
          onColumnReorder={handleColumnReorder}
          reorderableColumnCount={dataColumnCount}
        />
          {filteredAndSorted.map((campaign, rowIndex) => (
            <DataGridRow key={campaign.id} rowId={campaign.id} rowIndex={rowIndex}>
              {!readOnly && (
                <DataGridCell compact>
                  <DataGridCheckbox rowId={campaign.id} />
                </DataGridCell>
              )}
              {visibleOrderedDisplayColumns.map((colId) => {
                const value = campaign.csvData[colId]?.trim() ?? "";
                const isNameCol = colId === visibleOrderedDisplayColumns[0];
                const isEditing = !readOnly && editingCell?.campaignId === campaign.id && editingCell?.colId === colId;
                const startEditing = (e: React.MouseEvent) => {
                  if ((e.target as HTMLElement).closest("a")) return;
                  setEditingCell({ campaignId: campaign.id, colId });
                  setEditingValue(value);
                };
                const cancelEditing = () => setEditingCell(null);
                const saveAndClose = async () => {
                  if (editingCell?.campaignId !== campaign.id || editingCell?.colId !== colId) return;
                  const nextCsv = { ...campaign.csvData, [colId]: editingValue };
                  await updateCampaignCsvData(campaign.id, nextCsv);
                  setEditingCell(null);
                  router.refresh();
                };
                const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Escape") cancelEditing();
                  else if (e.key === "Enter") void saveAndClose();
                };
                return (
                  <DataGridCell key={colId}>
                    {readOnly ? (
                      <span style={{ fontSize: tableFontSize, minHeight: 20, display: "block" }}>
                        {value || "-"}
                      </span>
                    ) : isEditing ? (
                      <input
                        ref={editingInputRef}
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => void saveAndClose()}
                        style={{
                          width: "100%",
                          fontSize: tableFontSize,
                          padding: 0,
                          border: "1px solid var(--accent-dark)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <span
                        style={{ fontSize: tableFontSize, cursor: "text", minHeight: 20, display: "block" }}
                        onClick={startEditing}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEditing(e as unknown as React.MouseEvent); } }}
                      >
                        {isNameCol && value ? (
                          <Link
                            href={tableId ? `/campaign/${campaign.id}?returnTo=${encodeURIComponent(`${returnToBase}/${tableId}`)}` : `/campaign/${campaign.id}`}
                            style={{
                              color: "var(--text-primary)",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {value}
                          </Link>
                        ) : (
                          value || "-"
                        )}
                      </span>
                    )}
                  </DataGridCell>
                );
              })}
              {!readOnly && (
                <>
                  <DataGridCell compact truncate={false}>
                    {(() => {
                      const n = campaignNotes[campaign.id] ?? campaign.notes;
                      const count = Object.values(n).filter((v) => v.trim()).length;
                      return (
                        <button
                          type="button"
                          title={count > 0 ? `${count} note${count > 1 ? "s" : ""}` : "Add notes"}
                          onClick={() =>
                            setNotesModal({
                              campaignId: campaign.id,
                              name: campaign.name || (visibleOrderedDisplayColumns[0] ? campaign.csvData[visibleOrderedDisplayColumns[0]] : "") || "",
                              startDate: campaign.startDate,
                              endDate: campaign.endDate,
                              notes: n,
                            })
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            fontSize: 12,
                            border: "1px solid var(--border-light)",
                            borderRadius: "var(--radius-sm)",
                            background: count > 0 ? "#fef9e7" : "transparent",
                            color: count > 0 ? "#92400e" : "var(--text-tertiary)",
                            cursor: "pointer",
                            fontWeight: count > 0 ? 500 : 400,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          {count > 0 && count}
                        </button>
                      );
                    })()}
                  </DataGridCell>
                  <DataGridCell compact truncate={false}>...</DataGridCell>
                </>
              )}
            </DataGridRow>
          ))}
        </DataGridRoot>
      </DataGridProvider>

      {notesModal && (
        <CampaignNotesModal
          open
          onClose={() => setNotesModal(null)}
          campaignId={notesModal.campaignId}
          campaignName={notesModal.name}
          startDate={notesModal.startDate}
          endDate={notesModal.endDate}
          initialNotes={notesModal.notes}
          onSaved={(saved) => {
            setCampaignNotes((prev) => ({ ...prev, [notesModal.campaignId]: saved }));
          }}
        />
      )}
    </main>
  );
}

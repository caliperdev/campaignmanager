"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect } from "react";
import { updateCampaign, deleteCampaign, updateSource, deleteSource, fetchDynamicTableChunk, updateDynamicTableRow } from "@/lib/table-actions";
import type { Campaign, Source } from "@/db/schema";
import type { DynamicTableRow } from "@/lib/tables";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";

const DYNAMIC_PAGE_SIZE = 200;
const DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 60;
const RESIZE_HANDLE_WIDTH = 6;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

type ViewItem = Campaign | Source;

export function TableView({
  item,
  basePath,
  initialDynamicRows,
  dynamicTotal,
  readOnly,
}: {
  item: ViewItem;
  basePath: string;
  initialDynamicRows: DynamicTableRow[];
  dynamicTotal: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [dynamicRows, setDynamicRows] = useState<DynamicTableRow[]>(initialDynamicRows ?? []);
  const [dynamicTotalState, setDynamicTotalState] = useState(dynamicTotal ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<DynamicTableRow | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const columns = item.columnHeaders ?? (dynamicRows[0] ? Object.keys(dynamicRows[0]).filter((k) => k !== "id") : []);

  const getColWidth = useCallback((col: string) => colWidths[col] ?? DEFAULT_COL_WIDTH, [colWidths]);
  const setColWidth = useCallback((col: string, w: number) => setColWidths((prev) => ({ ...prev, [col]: Math.max(MIN_COL_WIDTH, w) })), []);

  useEffect(() => {
    if (!resizingCol) return;
    const onMove = (e: MouseEvent) => setColWidth(resizingCol, resizeStartWidth.current + (e.clientX - resizeStartX.current));
    const onUp = () => {
      setResizingCol(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [resizingCol, setColWidth]);

  const loadMoreDynamic = useCallback(async () => {
    if (!item.dynamicTableName || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchDynamicTableChunk(item.dynamicTableName, dynamicRows.length, DYNAMIC_PAGE_SIZE);
      setDynamicRows((prev) => [...prev, ...next.rows]);
      setDynamicTotalState(next.total);
    } finally {
      setLoadingMore(false);
    }
  }, [item.dynamicTableName, dynamicRows.length, loadingMore]);

  const openEditRow = useCallback(
    (row: DynamicTableRow) => {
      setEditingRow(row);
      const initial: Record<string, string> = {};
      for (const col of columns) {
        const dbKey = sanitizeDynamicColumnKey(col);
        initial[col] = String((row[dbKey] ?? row[col]) ?? "");
      }
      setEditFormData(initial);
    },
    [columns],
  );

  const closeEditRow = useCallback(() => {
    setEditingRow(null);
    setEditFormData({});
  }, []);

  const saveEditRow = useCallback(async () => {
    if (!editingRow || !item.dynamicTableName) return;
    setSavingRow(true);
    try {
      const payload: Record<string, string> = {};
      for (const col of columns) {
        payload[sanitizeDynamicColumnKey(col)] = editFormData[col] ?? "";
      }
      const ok = await updateDynamicTableRow(item.dynamicTableName, editingRow.id as number, payload);
      if (ok) {
        const updated: DynamicTableRow = { ...editingRow };
        for (const col of columns) updated[sanitizeDynamicColumnKey(col)] = editFormData[col] ?? "";
        setDynamicRows((prev) => prev.map((r) => (r.id === editingRow.id ? updated : r)));
        closeEditRow();
      }
    } finally {
      setSavingRow(false);
    }
  }, [editingRow, item.dynamicTableName, columns, editFormData, closeEditRow]);

  const sectionLabel = basePath === "/sources" ? "Sources" : "Campaigns";

  const saveEditName = async () => {
    const ok =
      basePath === "/sources"
        ? await updateSource(item.id, { name: editName.trim() || "Source" })
        : await updateCampaign(item.id, { name: editName.trim() || "Untitled" });
    if (ok) {
      router.refresh();
      setEditingName(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const ok = basePath === "/sources" ? await deleteSource(item.id) : await deleteCampaign(item.id);
      if (ok) router.push(basePath);
      else window.alert("Failed to delete. Please try again.");
    } catch (err) {
      console.error("Delete error:", err);
      window.alert("Failed to delete. Please try again.");
    }
  };

  const canEditCell = !readOnly;

  return (
    <>
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
        <Link href={basePath} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {sectionLabel}
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        {editingName ? (
          <>
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
            <button type="button" onClick={saveEditName} disabled={!editName.trim()} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 500, color: "white", background: "var(--accent-dark)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Save
            </button>
            <button type="button" onClick={() => setEditingName(false)} style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{item.name}</span>
            {!readOnly && (
              <>
                <button type="button" onClick={() => { setEditName(item.name); setEditingName(true); }} aria-label="Edit name" style={{ display: "inline-flex", alignItems: "center", padding: 4, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)" }}>
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
      <div style={{ padding: 24, overflow: "auto" }}>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Showing {dynamicRows.length} of {dynamicTotalState} row{dynamicTotalState !== 1 ? "s" : ""}{readOnly ? " (read-only)." : "."}
        </p>
        <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
            <colgroup>
              {columns.map((col) => (
                <col key={col} style={{ width: getColWidth(col), minWidth: MIN_COL_WIDTH }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                {columns.map((col) => (
                  <th
                    key={col}
                    style={{
                      position: "sticky",
                      textAlign: "left",
                      padding: "8px 10px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "visible",
                      textOverflow: "ellipsis",
                      top: 0,
                      zIndex: 1,
                      background: "var(--bg-secondary)",
                      borderBottom: "1px solid var(--border-light)",
                      width: getColWidth(col),
                      minWidth: MIN_COL_WIDTH,
                      boxSizing: "border-box",
                    }}
                  >
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{col}</span>
                    <span
                      role="separator"
                      aria-label={`Resize ${col}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        resizeStartX.current = e.clientX;
                        resizeStartWidth.current = getColWidth(col);
                        setResizingCol(col);
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: RESIZE_HANDLE_WIDTH,
                        height: "100%",
                        cursor: "col-resize",
                        userSelect: "none",
                        borderLeft: "2px solid var(--text-tertiary)",
                        background: "var(--border-light)",
                        boxSizing: "border-box",
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dynamicRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  {columns.map((col) => {
                    const dbKey = sanitizeDynamicColumnKey(col);
                    const value = row[dbKey] ?? row[col];
                    const isInsertionOrderName = col === "Insertion Order Name" && canEditCell;
                    return (
                      <td
                        key={col}
                        {...(isInsertionOrderName && {
                          role: "button",
                          tabIndex: 0,
                          onClick: () => openEditRow(row),
                          onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && openEditRow(row),
                        })}
                        style={{
                          padding: "6px 10px",
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          boxSizing: "border-box",
                          ...(isInsertionOrderName && { cursor: "pointer" }),
                        }}
                        title={String(value ?? "")}
                      >
                        {String(value ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingRow && canEditCell && (
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
              <h2 id="edit-row-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Edit row</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {columns.map((col) => (
                  <label key={col} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{col}</span>
                    <input
                      type="text"
                      value={editFormData[col] ?? ""}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, [col]: e.target.value }))}
                      style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    />
                  </label>
                ))}
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
        {item.dynamicTableName && dynamicRows.length < dynamicTotalState && (
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
    </>
  );
}

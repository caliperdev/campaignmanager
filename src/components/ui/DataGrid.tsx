"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Checkbox } from "./Checkbox";

export type DataGridColumn = {
  id: string;
  header: ReactNode;
  width?: string;
  /** Pixel width for resizable columns; when set with onResize, column is resizable */
  widthPx?: number;
  onResize?: (width: number) => void;
  /** Called on drag start; use to set "live" resize state without updating main column widths */
  onResizeStart?: () => void;
  /** Called on mousemove during drag; use to update live width only (commit on mouseup via onResize) */
  onResizeMove?: (width: number) => void;
  /** Return desired width in px when user double-clicks resize handle; used with onResize */
  onAutoSize?: () => number;
};

interface DataGridContextValue {
  selectedIds: Set<string | number>;
  selectAll: boolean;
  toggle: (id: string | number) => void;
  toggleAll: (checked: boolean) => void;
  isSelected: (id: string | number) => boolean;
  clearSelection: () => void;
}

const DataGridContext = createContext<DataGridContextValue | null>(null);

export function useDataGrid() {
  const ctx = useContext(DataGridContext);
  if (!ctx) throw new Error("DataGrid components must be used within DataGridProvider");
  return ctx;
}

export interface DataGridProviderProps {
  children: ReactNode;
  rowIds: (string | number)[];
}

export function DataGridProvider({ children, rowIds }: DataGridProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const toggle = useCallback((id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAll(false);
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectAll(checked);
      setSelectedIds(checked ? new Set(rowIds) : new Set());
    },
    [rowIds]
  );

  const isSelected = useCallback(
    (id: string | number) => selectAll || selectedIds.has(id),
    [selectAll, selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, []);

  const value = useMemo<DataGridContextValue>(
    () => ({ selectedIds, selectAll, toggle, toggleAll, isSelected, clearSelection }),
    [selectedIds, selectAll, toggle, toggleAll, isSelected, clearSelection]
  );

  return (
    <DataGridContext.Provider value={value}>{children}</DataGridContext.Provider>
  );
}

export interface DataGridRootProps {
  children: ReactNode;
  gridTemplateColumns: string;
  maxHeight?: string | number;
  /** Optional ref for the scrollable container (e.g. for infinite scroll). */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function DataGridRoot({
  children,
  gridTemplateColumns,
  maxHeight = "100%",
  scrollContainerRef,
}: DataGridRootProps) {
  return (
    <div
      ref={scrollContainerRef}
      style={{
        flex: 1,
        overflow: "auto",
        padding: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gridAutoRows: "auto",
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const RESIZE_HANDLE_WIDTH = 6;
const MIN_COLUMN_WIDTH = 60;

function DataGridHeaderCell({
  column: col,
  colIndex,
  reorder,
}: {
  column: DataGridColumn;
  colIndex: number;
  reorder?: {
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: () => void;
    draggingColIndex: number | null;
    dropTargetIndex: number | null;
  };
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const lastWidthRef = useRef(0);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth.current + delta);
      lastWidthRef.current = newWidth;
      if (col.onResizeMove) col.onResizeMove(newWidth);
      else col.onResize?.(newWidth);
    };
    const onUp = () => {
      if (col.onResize && col.onResizeMove) col.onResize(lastWidthRef.current);
      setIsResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, col]);

  const onResizeStart = (e: React.MouseEvent) => {
    if (!col.onResize) return;
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startWidth.current = col.widthPx ?? 120;
    lastWidthRef.current = startWidth.current;
    col.onResizeStart?.();
    setIsResizing(true);
  };

  const onResizeHandleDoubleClick = () => {
    if (!col.onResize || !col.onAutoSize) return;
    const w = col.onAutoSize();
    col.onResize(Math.max(MIN_COLUMN_WIDTH, w));
  };

  const isDragging = reorder?.draggingColIndex === colIndex;
  const isDropTarget = reorder?.dropTargetIndex === colIndex;

  return (
    <div
      style={{
        padding: "8px 8px 8px 12px",
        borderBottom: "1px solid var(--border-light)",
        background: "var(--bg-secondary)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        fontSize: "11px",
        textTransform: "uppercase",
        fontWeight: 600,
        color: "var(--text-tertiary)",
        letterSpacing: "0.05em",
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        borderLeft: isDropTarget ? "3px solid var(--accent-dark)" : undefined,
        opacity: isDragging ? 0.6 : 1,
        transition: "opacity 0.2s ease, border-color 0.2s ease",
      }}
    >
      {reorder ? (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(colIndex));
            reorder.onDragStart(e, colIndex);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            reorder.onDragOver(e, colIndex);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            reorder.onDrop(e, colIndex);
          }}
          onDragEnd={reorder.onDragEnd}
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: reorder.draggingColIndex != null ? "grabbing" : "grab",
            userSelect: "none",
          }}
        >
          {col.header}
        </div>
      ) : (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {col.header}
        </span>
      )}
      {col.onResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          onDoubleClick={onResizeHandleDoubleClick}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: RESIZE_HANDLE_WIDTH,
            height: "100%",
            cursor: "col-resize",
            flexShrink: 0,
            borderLeft: "1px solid var(--border-light)",
            background: "var(--border-light)",
          }}
        />
      )}
    </div>
  );
}

export interface DataGridHeaderProps {
  columns: DataGridColumn[];
  selectionColumn?: boolean;
  onColumnReorder?: (fromIndex: number, toIndex: number) => void;
  /** When onColumnReorder is set, only columns with index < reorderableColumnCount are draggable (e.g. exclude Notes/Actions). */
  reorderableColumnCount?: number;
}

export function DataGridHeader({
  columns,
  selectionColumn = false,
  onColumnReorder,
  reorderableColumnCount,
}: DataGridHeaderProps) {
  const [draggingColIndex, setDraggingColIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((_e: React.DragEvent, index: number) => {
    setDraggingColIndex(index);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (!Number.isNaN(fromIndex) && onColumnReorder) {
        onColumnReorder(fromIndex, dropIndex);
      }
      setDraggingColIndex(null);
      setDropTargetIndex(null);
    },
    [onColumnReorder]
  );
  const handleDragEnd = useCallback(() => {
    setDraggingColIndex(null);
    setDropTargetIndex(null);
  }, []);

  const reorderableCount = reorderableColumnCount ?? (onColumnReorder ? columns.length : 0);
  const reorder =
    onColumnReorder != null
      ? {
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDrop: handleDrop,
          onDragEnd: handleDragEnd,
          draggingColIndex,
          dropTargetIndex,
        }
      : undefined;

  return (
    <>
      {selectionColumn && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-light)",
            background: "var(--bg-secondary)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            fontSize: "11px",
            textTransform: "uppercase",
            fontWeight: 600,
            color: "var(--text-tertiary)",
            letterSpacing: "0.05em",
          }}
        >
          <DataGridCheckbox header />
        </div>
      )}
      {columns.map((col, colIndex) => (
        <DataGridHeaderCell
          key={col.id}
          column={col}
          colIndex={colIndex}
          reorder={reorder != null && colIndex < reorderableCount ? reorder : undefined}
        />
      ))}
    </>
  );
}

export interface DataGridRowProps {
  rowId: string | number;
  children: ReactNode;
  /** Zero-based row index for alternating row banding */
  rowIndex?: number;
}

const DataGridRowContext = createContext<{ rowIndex?: number }>({});

export function DataGridRow({ rowId, children, rowIndex }: DataGridRowProps) {
  return (
    <DataGridRowContext.Provider value={{ rowIndex }}>
      <div data-row-id={rowId} style={{ display: "contents" }}>
        {children}
      </div>
    </DataGridRowContext.Provider>
  );
}

export interface DataGridCellProps {
  children: ReactNode;
  truncate?: boolean;
  /** Use when column is narrow (e.g. checkbox/actions); uses smaller horizontal padding */
  compact?: boolean;
}

export function DataGridCell({ children, truncate = true, compact = false }: DataGridCellProps) {
  const { rowIndex } = useContext(DataGridRowContext);
  const isOdd = rowIndex != null && rowIndex % 2 === 1;
  return (
    <div
      style={{
        padding: compact ? "8px 12px" : "8px 32px",
        borderBottom: "1px solid var(--border-light)",
        alignItems: "center",
        display: "flex",
        justifyContent: compact ? "center" : undefined,
        fontSize: "14px",
        color: "var(--text-primary)",
        minWidth: 0,
        overflow: truncate ? "hidden" : undefined,
        textOverflow: truncate ? "ellipsis" : undefined,
        whiteSpace: truncate ? "nowrap" : undefined,
        background: isOdd ? "var(--bg-row-alt, rgba(0,0,0,0.02))" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export interface DataGridCheckboxProps {
  header?: boolean;
  rowId?: string | number;
}

export function DataGridCheckbox({ header, rowId }: DataGridCheckboxProps) {
  const ctx = useContext(DataGridContext);
  if (!ctx) {
    return header ? (
      <Checkbox
        checked={false}
        onChange={() => {}}
      />
    ) : (
      <Checkbox checked={false} onChange={() => {}} />
    );
  }
  if (header) {
    return (
      <Checkbox
        checked={ctx.selectAll}
        onChange={(e) => ctx.toggleAll(e.target.checked)}
      />
    );
  }
  if (rowId == null) return null;
  return (
    <Checkbox
      checked={ctx.isSelected(rowId)}
      onChange={() => ctx.toggle(rowId)}
    />
  );
}

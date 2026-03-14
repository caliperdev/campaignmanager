"use client";

import { createPortal } from "react-dom";
import { useCallback, useRef, useState } from "react";

type Last7DaysRow = { date: string; bookedRevenue: number; totalCost: number; margin: number | null };

type Props = {
  yearMonth: string;
  advertiser?: string;
  io?: string;
  placement?: string;
  children: React.ReactNode;
  cellStyle?: React.CSSProperties;
  forceGlobal?: boolean;
  timeGroup?: string;
  onCellClick?: () => void;
};

export function Last7DaysTooltip({
  yearMonth,
  advertiser,
  io,
  placement,
  children,
  cellStyle,
  forceGlobal,
  timeGroup,
  onCellClick,
}: Props) {
  const [tooltip, setTooltip] = useState<Last7DaysRow[] | "loading" | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<HTMLTableCellElement | null>(null);

  const fetchData = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(yearMonth) || timeGroup !== "yearMonth") return;
    setTooltip("loading");
    const params = new URLSearchParams();
    params.set("yearMonth", yearMonth);
    if (advertiser) params.set("advertiser", advertiser);
    if (io) params.set("io", io);
    if (placement) params.set("placement", placement);
    fetch(`/api/dashboard-last-7-days?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Last7DaysRow[]) => setTooltip(rows))
      .catch(() => setTooltip(null));
  }, [yearMonth, advertiser, io, placement, timeGroup]);

  const onMouseEnter = useCallback(() => {
    if (!forceGlobal || timeGroup !== "yearMonth") return;
    const el = elRef.current;
    const setPosFromEl = () => {
      if (el) {
        const rect = el.getBoundingClientRect();
        setPos({ x: rect.left, y: rect.bottom + 4 });
      }
    };
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPosFromEl();
      fetchData();
    }, 400);
  }, [forceGlobal, timeGroup, fetchData]);

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setTooltip(null);
    setPos(null);
  }, []);

  const showTooltip = forceGlobal && timeGroup === "yearMonth" && /^\d{4}-\d{2}$/.test(yearMonth);

  const tooltipEl =
    pos && tooltip
      ? createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              zIndex: 9999,
              background: "var(--bg-primary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "10px 12px",
              fontSize: 12,
              minWidth: 200,
              maxWidth: 280,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>Last 7 days</div>
            {tooltip === "loading" ? (
              <span style={{ color: "var(--text-secondary)" }}>Loading…</span>
            ) : tooltip.length === 0 ? (
              <span style={{ color: "var(--text-secondary)" }}>No daily data</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tooltip.map((r) => {
                  const marginColor = r.margin != null ? (r.margin < 0 ? "#dc2626" : "#16a34a") : undefined;
                  return (
                    <div key={r.date} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span style={{ color: "var(--text-secondary)" }}>{r.date}</span>
                      <span>
                        ${(r.bookedRevenue - r.totalCost).toFixed(2)}
                        {r.margin != null ? (
                          <span style={{ color: marginColor }}> ({r.margin.toFixed(1)}%)</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <td
      ref={elRef}
      style={{ ...cellStyle, cursor: onCellClick ? "pointer" : undefined }}
      onMouseEnter={showTooltip ? onMouseEnter : undefined}
      onMouseLeave={showTooltip ? onMouseLeave : undefined}
      onClick={onCellClick}
    >
      {children}
      {tooltipEl}
    </td>
  );
}

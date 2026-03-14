"use client";

import { useEffect, useState } from "react";

type DailyRow = { date: string; bookedRevenue: number; totalCost: number; margin: number | null };

type Props = {
  yearMonth: string;
  advertiser?: string;
  io?: string;
  placement?: string;
  open: boolean;
  onClose: () => void;
};

export function DailyPane({ yearMonth, advertiser, io, placement, open, onClose }: Props) {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !/^\d{4}-\d{2}$/.test(yearMonth)) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("yearMonth", yearMonth);
    if (advertiser) params.set("advertiser", advertiser);
    if (io) params.set("io", io);
    if (placement) params.set("placement", placement);
    fetch(`/api/dashboard-daily-by-month?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DailyRow[]) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, yearMonth, advertiser, io, placement]);

  if (!open) return null;

  const monthLabel = yearMonth
    ? new Date(parseInt(yearMonth.slice(0, 4), 10), parseInt(yearMonth.slice(5, 7), 10) - 1).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        maxWidth: "90vw",
        background: "var(--bg-primary)",
        borderLeft: "1px solid var(--border-light)",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          Daily breakdown — {monthLabel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            padding: 4,
            cursor: "pointer",
            fontSize: 18,
            color: "var(--text-secondary)",
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>No daily data</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Date
                </th>
                <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Rev vs Cost
                </th>
                <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diff = r.bookedRevenue - r.totalCost;
                return (
                  <tr key={r.date} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "8px 0", color: "var(--text-primary)" }}>{r.date}</td>
                    <td
                      style={{
                        padding: "8px 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: diff < 0 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      ${diff.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "8px 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: r.margin != null && r.margin < 0 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {r.margin != null ? `${r.margin.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length > 0 && (() => {
                const totalRev = rows.reduce((a, r) => a + r.bookedRevenue, 0);
                const totalCost = rows.reduce((a, r) => a + r.totalCost, 0);
                const totalDiff = totalRev - totalCost;
                const totalMargin = totalRev > 0 ? (100 * totalDiff) / totalRev : null;
                return (
                  <tr style={{ borderTop: "2px solid var(--border-light)", fontWeight: 600, background: "var(--bg-secondary)" }}>
                    <td style={{ padding: "10px 0", color: "var(--text-primary)" }}>Total</td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: totalDiff < 0 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      ${totalDiff.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: totalMargin != null && totalMargin < 0 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {totalMargin != null ? `${totalMargin.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

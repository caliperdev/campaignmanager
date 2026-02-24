"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui";
import type { CustomRange } from "@/db/schema";

interface DistributionPreviewModalProps {
  open: boolean;
  onClose: () => void;
  campaignName: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode: "even" | "custom";
  customRanges: CustomRange[];
}

function daysInRange(startIso: string, endIso: string): number {
  const a = new Date(startIso);
  const b = new Date(endIso);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function dateInRange(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

function getDarkDates(startDate: string, endDate: string, ranges: CustomRange[]): Set<string> {
  const dark = new Set<string>();
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    const iso = d.toISOString().split("T")[0];
    for (const r of ranges) {
      if ("isDark" in r && r.isDark && dateInRange(iso, r.startDate, r.endDate)) {
        dark.add(iso);
        break;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return dark;
}

function getDatesInAnyRange(ranges: CustomRange[]): Set<string> {
  const covered = new Set<string>();
  for (const r of ranges) {
    const d = new Date(r.startDate);
    const end = new Date(r.endDate);
    while (d <= end) {
      covered.add(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }
  }
  return covered;
}

type DayRow = { date: string; impressions: number; type: "even" | "goal" | "dark" | "remainder"; rangeLabel: string };

function computeDistribution(
  startDate: string,
  endDate: string,
  impressionsGoal: number,
  distributionMode: "even" | "custom",
  customRanges: CustomRange[],
): DayRow[] {
  const rows: DayRow[] = [];
  const totalDays = daysInRange(startDate, endDate);
  if (totalDays <= 0) return rows;

  const allDates: string[] = [];
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    allDates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  if (distributionMode === "even") {
    const base = Math.floor(impressionsGoal / totalDays);
    const remainder = impressionsGoal - base * totalDays;
    for (let i = 0; i < allDates.length; i++) {
      rows.push({
        date: allDates[i],
        impressions: base + (i === allDates.length - 1 ? remainder : 0),
        type: "even",
        rangeLabel: "",
      });
    }
    return rows;
  }

  const darkDates = getDarkDates(startDate, endDate, customRanges);
  const coveredDates = getDatesInAnyRange(customRanges);

  const impsByDate = new Map<string, { impressions: number; type: DayRow["type"]; rangeLabel: string }>();

  let totalAllocatedInRanges = 0;
  for (let ri = 0; ri < customRanges.length; ri++) {
    const r = customRanges[ri];
    const isDark = "isDark" in r && r.isDark;
    const label = `${r.startDate} – ${r.endDate}`;

    if (isDark) {
      const rd = new Date(r.startDate);
      const re = new Date(r.endDate);
      while (rd <= re) {
        const iso = rd.toISOString().split("T")[0];
        if (dateInRange(iso, startDate, endDate)) {
          impsByDate.set(iso, { impressions: 0, type: "dark", rangeLabel: label });
        }
        rd.setDate(rd.getDate() + 1);
      }
      continue;
    }
    if (!("impressionsGoal" in r) || typeof r.impressionsGoal !== "number") continue;
    const days = daysInRange(r.startDate, r.endDate);
    if (days <= 0) continue;
    const goal = r.impressionsGoal;
    totalAllocatedInRanges += goal;
    const base = Math.floor(goal / days);
    const rem = goal - base * days;
    const rangeDates: string[] = [];
    const rd = new Date(r.startDate);
    const re = new Date(r.endDate);
    while (rd <= re) {
      rangeDates.push(rd.toISOString().split("T")[0]);
      rd.setDate(rd.getDate() + 1);
    }
    rangeDates.forEach((iso, i) => {
      if (dateInRange(iso, startDate, endDate)) {
        impsByDate.set(iso, {
          impressions: base + (i === rangeDates.length - 1 ? rem : 0),
          type: "goal",
          rangeLabel: label,
        });
      }
    });
  }

  const uncovered = allDates.filter((iso) => !coveredDates.has(iso) && !darkDates.has(iso));
  const remaining = Math.max(0, impressionsGoal - totalAllocatedInRanges);
  if (remaining > 0 && uncovered.length > 0) {
    const base = Math.floor(remaining / uncovered.length);
    const rem = remaining - base * uncovered.length;
    uncovered.forEach((iso, i) => {
      impsByDate.set(iso, {
        impressions: base + (i === uncovered.length - 1 ? rem : 0),
        type: "remainder",
        rangeLabel: "",
      });
    });
  }

  for (const iso of allDates) {
    const entry = impsByDate.get(iso);
    rows.push({
      date: iso,
      impressions: entry?.impressions ?? 0,
      type: entry?.type ?? "remainder",
      rangeLabel: entry?.rangeLabel ?? "",
    });
  }

  return rows;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

const TYPE_COLORS: Record<DayRow["type"], { bg: string; color: string; label: string }> = {
  even: { bg: "#fef3c7", color: "#92400e", label: "Even" },
  goal: { bg: "#fde68a", color: "#92400e", label: "Custom" },
  dark: { bg: "#e5e7eb", color: "#6b7280", label: "Dark" },
  remainder: { bg: "#fef9c3", color: "#854d0e", label: "AUTO" },
};

const CHART_HEIGHT = 160;
const CHART_PAD = { top: 16, right: 12, bottom: 32, left: 48 };

function DistributionChart({ rows, maxImp, onSelectDate }: { rows: DayRow[]; maxImp: number; onSelectDate: (date: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = rows.length;
  if (n === 0) return null;

  const totalW = containerW || 600;
  const innerW = totalW - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const gap = Math.max(1, innerW * 0.005);
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n);

  const yTicks = 4;
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxImp / yTicks) * i));

  const labelEvery = n <= 10 ? 1 : n <= 20 ? 2 : n <= 45 ? 7 : 14;

  return (
    <div ref={containerRef} style={{ padding: "12px 20px 0" }}>
      {containerW > 0 && (
        <svg
          width={totalW}
          height={CHART_HEIGHT}
          style={{ display: "block", fontFamily: "var(--font-main)", fontSize: 10 }}
        >
          {yLines.map((val) => {
            const y = CHART_PAD.top + innerH - (val / maxImp) * innerH;
            return (
              <g key={val}>
                <line
                  x1={CHART_PAD.left}
                  x2={CHART_PAD.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="var(--border-light)"
                  strokeDasharray={val === 0 ? "none" : "3,3"}
                />
                <text
                  x={CHART_PAD.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-tertiary)"
                  fontSize={9}
                >
                  {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                </text>
              </g>
            );
          })}

          {rows.map((row, i) => {
            const barH = row.impressions > 0 ? Math.max(1, (row.impressions / maxImp) * innerH) : 0;
            const x = CHART_PAD.left + i * (barW + gap);
            const y = CHART_PAD.top + innerH - barH;
            const tc = TYPE_COLORS[row.type];
            return (
              <rect
                key={row.date}
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={1}
                fill={tc.bg}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectDate(row.date)}
              >
                <title>{row.date}: {formatNum(row.impressions)}</title>
              </rect>
            );
          })}

          {rows.map((row, i) => {
            if (i % labelEvery !== 0 && i !== n - 1) return null;
            const x = CHART_PAD.left + i * (barW + gap) + barW / 2;
            const label = row.date.slice(5);
            return (
              <text
                key={row.date}
                x={x}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fill="var(--text-tertiary)"
                fontSize={9}
              >
                {label}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default function DistributionPreviewModal({
  open,
  onClose,
  campaignName,
  startDate,
  endDate,
  impressionsGoal,
  distributionMode,
  customRanges,
}: DistributionPreviewModalProps) {
  const rows = useMemo(
    () => computeDistribution(startDate, endDate, impressionsGoal, distributionMode, customRanges),
    [startDate, endDate, impressionsGoal, distributionMode, customRanges],
  );

  const totalImpressions = useMemo(() => rows.reduce((s, r) => s + r.impressions, 0), [rows]);
  const maxImp = useMemo(() => Math.max(1, ...rows.map((r) => r.impressions)), [rows]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  function scrollToDate(date: string) {
    if (!tableContainerRef.current) return;
    const row = tableContainerRef.current.querySelector(`[data-date="${date}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!open) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Close modal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClose(); } }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          width: "min(960px, calc(100vw - 48px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-light)",
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Distribution Preview
            </h3>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {campaignName || "Untitled"} · {startDate} → {endDate} · {rows.length} days
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "var(--text-tertiary)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Summary bar */}
        <div style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          padding: "12px 20px",
          background: "var(--bg-secondary)",
          fontSize: 13,
        }}>
          <span>
            <strong style={{ color: "var(--text-primary)" }}>{formatNum(totalImpressions)}</strong>
            <span style={{ color: "var(--text-secondary)" }}> / {formatNum(impressionsGoal)} impressions</span>
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            Mode: <strong style={{ color: "var(--text-primary)" }}>{distributionMode === "even" ? "Even" : "Custom"}</strong>
          </span>
          {distributionMode === "custom" && (
            <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {(["goal", "dark", "remainder"] as const).map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: TYPE_COLORS[t].bg,
                    border: `1px solid ${TYPE_COLORS[t].color}`,
                    display: "inline-block",
                  }} />
                  {TYPE_COLORS[t].label}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Bar chart */}
        {rows.length > 0 && (
          <DistributionChart rows={rows} maxImp={maxImp} onSelectDate={scrollToDate} />
        )}

        {/* Table */}
        <div ref={tableContainerRef} style={{ overflow: "auto", flex: 1 }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}>
            <thead>
              <tr style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-primary)",
                borderBottom: "1px solid var(--border-light)",
                zIndex: 1,
              }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>
                  Date
                </th>
                {distributionMode === "custom" && (
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>
                    Type
                  </th>
                )}
                {distributionMode === "custom" && (
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>
                    Range
                  </th>
                )}
                <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>
                  Impressions
                </th>
                <th style={{ padding: "8px 12px", width: "30%" }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const tc = TYPE_COLORS[row.type];
                const barWidth = row.impressions > 0 ? Math.max(2, (row.impressions / maxImp) * 100) : 0;
                return (
                  <tr
                    key={row.date}
                    data-date={row.date}
                    style={{
                      borderBottom: "1px solid var(--border-light)",
                      background: i % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                    }}
                  >
                    <td style={{
                      padding: "6px 12px",
                      color: "var(--text-primary)",
                      fontWeight: 500,
                    }}>
                      {row.date}
                    </td>
                    {distributionMode === "custom" && (
                      <td style={{ padding: "6px 12px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          background: tc.bg,
                          color: tc.color,
                        }}>
                          {tc.label}
                        </span>
                      </td>
                    )}
                    {distributionMode === "custom" && (
                      <td style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        color: row.rangeLabel ? "var(--text-secondary)" : "var(--text-tertiary)",
                        whiteSpace: "nowrap",
                      }}>
                        {row.rangeLabel || "—"}
                      </td>
                    )}
                    <td style={{
                      padding: "6px 12px",
                      textAlign: "right",
                      fontWeight: 500,
                      color: row.type === "dark" ? "#9ca3af" : "var(--text-primary)",
                    }}>
                      {formatNum(row.impressions)}
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <div style={{
                        height: 6,
                        borderRadius: 3,
                        background: "var(--bg-secondary)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${barWidth}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: tc.bg,
                          transition: "width 0.2s ease",
                        }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "12px 20px",
          borderTop: "1px solid var(--border-light)",
        }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

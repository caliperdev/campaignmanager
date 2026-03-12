"use client";

import { toDateStr } from "@/lib/placement-allocator";
import type { DarkRange, AssignedRange } from "@/lib/placement-allocator";

function getDatesInRange(from: Date, to: Date): string[] {
  const result: string[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

function formatRangeFromTo(from: string, to: string): string {
  const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function getDaysInRange(from: string, to: string): number {
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function getContiguousRanges(sortedDateStrs: string[]): string[][] {
  if (sortedDateStrs.length === 0) return [];
  const ranges: string[][] = [];
  let current: string[] = [sortedDateStrs[0]!];
  for (let i = 1; i < sortedDateStrs.length; i++) {
    const prev = sortedDateStrs[i - 1]!;
    const curr = sortedDateStrs[i]!;
    const nextDay = new Date(prev + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStr = toDateStr(nextDay);
    if (curr === nextStr) {
      current.push(curr);
    } else {
      ranges.push(current);
      current = [curr];
    }
  }
  ranges.push(current);
  return ranges;
}

function formatRangeCompact(dateStrs: string[]): string {
  if (dateStrs.length === 0) return "—";
  const d0 = new Date(dateStrs[0] + "T12:00:00");
  const d1 = new Date(dateStrs[dateStrs.length - 1]! + "T12:00:00");
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (dateStrs.length === 1) return fmt(d0);
  const sameMonthYear = d0.getMonth() === d1.getMonth() && d0.getFullYear() === d1.getFullYear();
  const month = d0.toLocaleDateString(undefined, { month: "short" });
  const yearSuffix = d0.getFullYear() !== new Date().getFullYear() ? `, ${d0.getFullYear()}` : "";
  return sameMonthYear ? `${month} ${d0.getDate()}–${d1.getDate()}${yearSuffix}` : `${fmt(d0)} – ${fmt(d1)}`;
}

function assignedRangesToPerDay(ranges: AssignedRange[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ranges) {
    for (const [d, v] of Object.entries(r.perDay)) {
      if (v > 0) out[d] = v;
    }
  }
  return out;
}

function darkRangesToDarkDays(ranges: DarkRange[]): string[] {
  const out: string[] = [];
  for (const r of ranges) {
    const start = new Date(r.from + "T12:00:00");
    const end = new Date(r.to + "T12:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(toDateStr(new Date(d)));
    }
  }
  return [...new Set(out)].sort();
}

type Props = {
  startDate?: string;
  endDate?: string;
  impressions: string;
  darkRanges: DarkRange[];
  assignedRanges: AssignedRange[];
};

export function ReadOnlyAllocatorSection({ startDate, endDate, impressions, darkRanges, assignedRanges }: Props) {
  const parse = (s: string | undefined) => (s ? new Date(s + "T12:00:00") : undefined);
  const start = parse(startDate);
  const end = parse(endDate ?? startDate);
  const flightDayDates =
    start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
      ? getDatesInRange(start, end)
      : [];
  const darkDays = darkRangesToDarkDays(darkRanges);
  const perDayImpressions = assignedRangesToPerDay(assignedRanges);
  const totalImpressions = parseInt(String(impressions || "0").replace(/[$,\s]/g, ""), 10) || 0;
  const allocatableStrs = flightDayDates.filter((d) => !darkDays.includes(d));
  const assignedDayStrs = Object.keys(perDayImpressions)
    .filter((k) => (perDayImpressions[k] ?? 0) > 0 && allocatableStrs.includes(k))
    .sort();
  const assignedContiguousRanges = getContiguousRanges(assignedDayStrs);
  const remainingDayStrs = allocatableStrs.filter((d) => !assignedDayStrs.includes(d));
  const remainingRanges = getContiguousRanges(remainingDayStrs);
  const totalAssigned = assignedDayStrs.reduce((a, k) => a + (perDayImpressions[k] ?? 0), 0);
  const remainingImpressions = Math.max(0, totalImpressions - totalAssigned);
  const n = remainingDayStrs.length;
  const dailyBase = n > 0 ? Math.floor(remainingImpressions / n) : 0;
  const remainder = n > 0 ? remainingImpressions - dailyBase * n : 0;
  const spreadPerDay = dailyBase;
  const onlyFullFlightEven =
    assignedContiguousRanges.length === 0 &&
    remainingRanges.length === 1 &&
    remainingRanges[0].length === flightDayDates.length;
  const showEvenPill = remainingRanges.length > 0 && !onlyFullFlightEven;
  const hasPills = darkRanges.length > 0 || assignedRanges.length > 0 || showEvenPill;

  type PillItem = { type: "dark"; r: DarkRange } | { type: "custom"; r: AssignedRange };
  const pills: PillItem[] = [
    ...darkRanges.map((r) => ({ type: "dark" as const, r })),
    ...assignedRanges.map((r) => ({ type: "custom" as const, r })),
  ].sort((a, b) => a.r.from.localeCompare(b.r.from));

  const pillStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px 4px 6px",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.3,
    borderRadius: 6,
    minHeight: 32,
    boxSizing: "border-box" as const,
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
        Impressions and Dark Weeks allocator (read-only)
      </p>
      {flightDayDates.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Total flight: {flightDayDates.length} day{flightDayDates.length !== 1 ? "s" : ""}
        </p>
      )}
      {hasPills && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {pills.map((item, i) =>
            item.type === "dark" ? (
              <span
                key={"dark-" + i}
                style={{
                  ...pillStyle,
                  background: "#e5e7eb",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                }}
              >
                <span style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: "#6b7280", color: "#fff" }}>DARK</span>
                </span>
                <span style={{ flex: "1 1 0%", textAlign: "left" }}>
                  {formatRangeFromTo(item.r.from, item.r.to)} · {getDaysInRange(item.r.from, item.r.to)} days
                </span>
              </span>
            ) : (
              (() => {
                const r = item.r;
                const rangeImpressions = Object.values(r.perDay).reduce((a, v) => a + v, 0);
                return (
                  <span
                    key={"custom-" + i}
                    style={{
                      ...pillStyle,
                      background: "#fed7aa",
                      color: "#9a3412",
                      border: "1px solid #fdba74",
                    }}
                  >
                    <span style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: "#c2410c", color: "#fff" }}>CUSTOM</span>
                    </span>
                    <span style={{ flex: "1 1 0%", textAlign: "left" }}>
                      {formatRangeFromTo(r.from, r.to)} · {getDaysInRange(r.from, r.to)} days · {rangeImpressions.toLocaleString()} impressions
                    </span>
                  </span>
                );
              })()
            )
          )}
          {showEvenPill && (
            <span
              style={{
                ...pillStyle,
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
              }}
            >
              <span style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", background: "#ca8a04", color: "#fff" }}>EVEN</span>
              </span>
              <span style={{ flex: "1 1 0%", textAlign: "left" }}>
                {remainingRanges.map((r) => formatRangeCompact(r)).join(" · ")} · {remainingDayStrs.length} days · {remainder > 0 ? `${dailyBase.toLocaleString()} each, ${(dailyBase + remainder).toLocaleString()} on last (unassigned)` : `${spreadPerDay.toLocaleString()} each (unassigned)`}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

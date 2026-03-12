"use client";

import { useState } from "react";
import { FlightPicker } from "@/components/FlightPicker";
import {
  toDateStr,
  type DarkRange,
  type AssignedRange,
  darkRangesToDarkDays,
  assignedRangesToPerDay,
} from "@/lib/placement-allocator";
import type { DateRange } from "react-day-picker";

type Props = {
  /** Start date of the flight range (from form, read-only in calendar) */
  startDate?: string;
  /** End date of the flight range (from form, read-only in calendar) */
  endDate?: string;
  /** Total impressions for the placement */
  impressions: string;
  /** Dark blocks: one per "mark dark" action. Never grouped. */
  darkRanges: DarkRange[];
  /** Assigned blocks: one per "assign" action. Never grouped. */
  assignedRanges: AssignedRange[];
  /** Called when dark ranges change */
  onDarkRangesChange: (darkRanges: DarkRange[]) => void;
  /** Called when assigned ranges change */
  onAssignedRangesChange: (assignedRanges: AssignedRange[]) => void;
  /** Number of months to show in the calendar */
  numberOfMonths?: number;
  /** Compact display mode */
  compact?: boolean;
};

function getDatesInRange(from: Date, to: Date): string[] {
  const result: string[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const totalDays =
    Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

function formatRange(dateStrs: string[]): string {
  if (dateStrs.length === 0) return "—";
  const fmt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return dateStrs.length === 1 ? fmt(dateStrs[0]!) : `${fmt(dateStrs[0]!)} – ${fmt(dateStrs[dateStrs.length - 1]!)}`;
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

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseNumberInput(value: string): string {
  return value.replace(/\D/g, "");
}

/** Compact format for grouped EVEN ranges: "Mar 1–7 · Mar 22–31" */
function formatRangeCompact(dateStrs: string[]): string {
  if (dateStrs.length === 0) return "—";
  const d0 = new Date(dateStrs[0] + "T12:00:00");
  const d1 = new Date(dateStrs[dateStrs.length - 1]! + "T12:00:00");
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (dateStrs.length === 1) return fmt(d0);
  const sameMonthYear = d0.getMonth() === d1.getMonth() && d0.getFullYear() === d1.getFullYear();
  const month = d0.toLocaleDateString(undefined, { month: "short" });
  const yearSuffix = d0.getFullYear() !== new Date().getFullYear() ? `, ${d0.getFullYear()}` : "";
  return sameMonthYear
    ? `${month} ${d0.getDate()}–${d1.getDate()}${yearSuffix}`
    : `${fmt(d0)} – ${fmt(d1)}`;
}

/** Split sorted date strings into contiguous day ranges (one array per range). Used only for EVEN pill. */
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

/** Remove given days from dark ranges; may split ranges. */
function removeDaysFromDarkRanges(ranges: DarkRange[], daysToRemove: Set<string>): DarkRange[] {
  const out: DarkRange[] = [];
  for (const r of ranges) {
    const start = new Date(r.from + "T12:00:00");
    const end = new Date(r.to + "T12:00:00");
    let segFrom: string | null = null;
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      const s = toDateStr(new Date(d));
      if (daysToRemove.has(s)) {
        if (segFrom !== null) {
          const prev = new Date(d);
          prev.setDate(prev.getDate() - 1);
          out.push({ from: segFrom, to: toDateStr(prev) });
          segFrom = null;
        }
      } else {
        if (segFrom === null) segFrom = s;
      }
    }
    if (segFrom !== null) {
      out.push({ from: segFrom, to: r.to });
    }
  }
  return out;
}

/** Remove given days from assigned ranges; may split ranges. */
function removeDaysFromAssignedRanges(ranges: AssignedRange[], daysToRemove: Set<string>): AssignedRange[] {
  const out: AssignedRange[] = [];
  for (const r of ranges) {
    const start = new Date(r.from + "T12:00:00");
    const end = new Date(r.to + "T12:00:00");
    let segFrom: string | null = null;
    let segPerDay: Record<string, number> = {};
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      const s = toDateStr(new Date(d));
      const val = r.perDay[s] ?? 0;
      if (daysToRemove.has(s) || val <= 0) {
        if (segFrom !== null && Object.keys(segPerDay).length > 0) {
          const prev = new Date(d);
          prev.setDate(prev.getDate() - 1);
          out.push({ from: segFrom, to: toDateStr(prev), perDay: { ...segPerDay } });
          segFrom = null;
          segPerDay = {};
        }
      } else {
        if (segFrom === null) segFrom = s;
        segPerDay[s] = val;
      }
    }
    if (segFrom !== null && Object.keys(segPerDay).length > 0) {
      out.push({ from: segFrom, to: r.to, perDay: segPerDay });
    }
  }
  return out;
}

function PillIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, fill: "currentColor", flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

type PillProps = {
  tag: "EVEN" | "DARK" | "CUSTOM";
  dateRangeText: string;
  daysCount: number;
  impressionsText: string;
  onEdit?: () => void;
  onDelete?: () => void;
  style: React.CSSProperties;
};

const PILL_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

function AllocatorPill({ tag, dateRangeText, daysCount, impressionsText, onEdit, onDelete, style }: PillProps) {
  const tagStyle: React.CSSProperties =
    tag === "DARK"
      ? { background: "#9ca3af", color: "#fff" }
      : tag === "CUSTOM"
        ? { background: "#c2410c", color: "#fff" }
        : { background: "#ca8a04", color: "#fff" };
  return (
    <span
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px 4px 6px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.3,
        borderRadius: 6,
        minHeight: 32,
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      <span
        style={{
          width: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            padding: "2px 5px",
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            ...tagStyle,
          }}
        >
          {tag}
        </span>
      </span>
      <span style={{ color: "inherit", flex: 1, textAlign: "left" }}>
        {dateRangeText} · {daysCount} day{daysCount !== 1 ? "s" : ""} · {impressionsText}
      </span>
      {(onEdit || onDelete) && (
      <span style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label="Edit"
            style={{
              padding: 2,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.85,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PillIcon d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete"
            style={{
              padding: 2,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.85,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PillIcon d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </button>
        )}
      </span>
      )}
    </span>
  );
}

export function PlacementAllocator({
  startDate,
  endDate,
  impressions,
  darkRanges,
  assignedRanges,
  onDarkRangesChange,
  onAssignedRangesChange,
  numberOfMonths = 3,
  compact = false,
}: Props) {
  const [assignValue, setAssignValue] = useState("");
  const [actionSelection, setActionSelection] = useState<DateRange | undefined>(undefined);

  const darkDays = darkRangesToDarkDays(darkRanges);
  const perDayImpressions = assignedRangesToPerDay(assignedRanges);

  const parse = (s: string | undefined) => (s ? new Date(s + "T12:00:00") : undefined);
  const start = parse(startDate);
  const end = parse(endDate ?? startDate);
  const flightRange: DateRange | undefined =
    start && !isNaN(start.getTime())
      ? {
          from: start,
          to: end && !isNaN(end.getTime()) ? end : start,
        }
      : undefined;

  const darkDayDates = darkDays
    .map((s) => new Date(s + "T12:00:00"))
    .filter((d) => !isNaN(d.getTime()));

  const flightDayDates = flightRange?.from && flightRange?.to
    ? (() => {
        const dates: Date[] = [];
        const s = new Date(flightRange.from!.getFullYear(), flightRange.from!.getMonth(), flightRange.from!.getDate());
        const e = new Date(flightRange.to!.getFullYear(), flightRange.to!.getMonth(), flightRange.to!.getDate());
        const n = Math.ceil((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        for (let i = 0; i < n; i++) {
          const d = new Date(s);
          d.setDate(d.getDate() + i);
          dates.push(d);
        }
        return dates;
      })()
    : [];

  const subrangeDates =
    actionSelection?.from && actionSelection?.to && actionSelection.from.getTime() <= actionSelection.to.getTime()
      ? (() => {
          const dates: Date[] = [];
          const s = new Date(actionSelection.from!.getFullYear(), actionSelection.from!.getMonth(), actionSelection.from!.getDate());
          const e = new Date(actionSelection.to!.getFullYear(), actionSelection.to!.getMonth(), actionSelection.to!.getDate());
          const n = Math.ceil((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
          for (let i = 0; i < n; i++) {
            const d = new Date(s);
            d.setDate(d.getDate() + i);
            dates.push(d);
          }
          return dates;
        })()
      : [];

  const assignedDates = Object.keys(perDayImpressions)
    .filter((k) => (perDayImpressions[k] ?? 0) > 0)
    .map((s) => new Date(s + "T12:00:00"))
    .filter((d) => !isNaN(d.getTime()));

  const modifiers: Record<string, Date[] | undefined> = {
    flight: flightDayDates,
    subrange: subrangeDates.length > 0 ? subrangeDates : undefined,
    assigned: assignedDates.length > 0 ? assignedDates : undefined,
    dark: darkDayDates.length > 0 ? darkDayDates : undefined,
  };
  const modifiersClassNames: Record<string, string> = {
    flight: "rdp-flight-day",
    subrange: "rdp-range-subrange",
    assigned: "rdp-range-assigned",
    dark: "rdp-range-dark",
  };

  const hasValidRange =
    flightRange?.from && flightRange?.to && flightRange.from.getTime() <= flightRange.to.getTime();

  const targetRange = actionSelection?.from && actionSelection?.to && actionSelection.from.getTime() <= actionSelection.to.getTime()
    ? actionSelection
    : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    setActionSelection(range);
  };

  const handleMarkDark = () => {
    if (!targetRange?.from || !targetRange?.to) return;
    const selectionDays = getDatesInRange(targetRange.from, targetRange.to);
    const darkSet = new Set(darkDays);
    const toRemove = new Set<string>();
    const toAdd: string[] = [];
    for (const d of selectionDays) {
      if (darkSet.has(d)) {
        toRemove.add(d);
      } else {
        toAdd.push(d);
      }
    }
    if (toRemove.size === 0 && toAdd.length === 0) return;

    let nextDarkRanges = darkRanges;
    if (toRemove.size > 0) {
      nextDarkRanges = removeDaysFromDarkRanges(nextDarkRanges, toRemove);
    }
    if (toAdd.length > 0) {
      toAdd.sort();
      nextDarkRanges = [...nextDarkRanges, { from: toAdd[0]!, to: toAdd[toAdd.length - 1]! }];
    }

    let nextAssignedRanges = assignedRanges;
    if (toAdd.length > 0) {
      nextAssignedRanges = removeDaysFromAssignedRanges(nextAssignedRanges, new Set(toAdd));
    }

    onDarkRangesChange(nextDarkRanges);
    onAssignedRangesChange(nextAssignedRanges);
    setActionSelection(undefined);
  };

  const handleAssignSubmit = () => {
    if (!targetRange?.from || !targetRange?.to) return;
    const days = getDatesInRange(targetRange.from, targetRange.to);
    const nonDark = days.filter((d) => !darkDays.includes(d));
    if (nonDark.length === 0) {
      window.alert("All selected days are dark. Clear dark days first to assign impressions.");
      return;
    }

    const total = parseInt(parseNumberInput(assignValue), 10) || 0;
    if (total <= 0) {
      window.alert("Enter a positive number of impressions.");
      return;
    }

    const dailyBase = Math.floor(total / nonDark.length);
    const remainder = total - dailyBase * nonDark.length;
    const perDay: Record<string, number> = {};
    nonDark.forEach((dateStr, i) => {
      const val = i === nonDark.length - 1 ? dailyBase + remainder : dailyBase;
      perDay[dateStr] = Math.floor(val);
    });
    const newRange: AssignedRange = {
      from: nonDark[0]!,
      to: nonDark[nonDark.length - 1]!,
      perDay,
    };
    const toStr = (d: Date) => toDateStr(d);
    const selFrom = toStr(targetRange.from);
    const selTo = toStr(targetRange.to);
    const editIdx = assignedRanges.findIndex((r) => r.from === selFrom && r.to === selTo);
    const next =
      editIdx >= 0
        ? assignedRanges.map((r, i) => (i === editIdx ? newRange : r))
        : [...assignedRanges, newRange];
    onAssignedRangesChange(next);
    setAssignValue("");
    setActionSelection(undefined);
  };

  const disabledOutsideFlight =
    hasValidRange && flightRange?.from && flightRange?.to
      ? [
          { before: new Date(flightRange.from.getFullYear(), flightRange.from.getMonth(), flightRange.from.getDate()) },
          { after: new Date(flightRange.to.getFullYear(), flightRange.to.getMonth(), flightRange.to.getDate()) },
        ]
      : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 4px" }}>
        {hasValidRange
          ? "Select a range in the calendar to mark dark days or assign impressions. Impressions spread evenly across non-dark days by default."
          : "Set Start Date and End Date in the form above to see the flight range."}
      </p>
      <FlightPicker
        selected={actionSelection}
        onSelect={handleSelect}
        displayMonth={flightRange?.from}
        numberOfMonths={numberOfMonths}
        compact={compact}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        disabled={disabledOutsideFlight}
      />
      {hasValidRange && (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Total flight: {flightDayDates.length} day{flightDayDates.length !== 1 ? "s" : ""}
        </p>
      )}
      {hasValidRange && (() => {
        const goal = parseInt(String(impressions || "0").replace(/[$,\s]/g, ""), 10) || 0;
        const assignedSum = Object.values(perDayImpressions).reduce((a, v) => a + v, 0);
        const showAbove = goal > 0 && assignedSum > goal;
        const showBelow = goal > 0 && assignedSum > 0 && assignedSum < goal;
        if (showAbove || showBelow) {
          return (
            <p
              style={{
                fontSize: 12,
                margin: "8px 0 0",
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                background: showAbove ? "#fef2f2" : "#fffbeb",
                color: showAbove ? "#b91c1c" : "#b45309",
                border: `1px solid ${showAbove ? "#fecaca" : "#fde68a"}`,
              }}
            >
              {showAbove
                ? `Assigned ${assignedSum.toLocaleString()} is above goal ${goal.toLocaleString()}`
                : `Assigned ${assignedSum.toLocaleString()} is below goal ${goal.toLocaleString()}`}
            </p>
          );
        }
        return null;
      })()}
      {hasValidRange && (() => {
        const totalImpressions = parseInt(String(impressions || "0").replace(/[$,\s]/g, ""), 10) || 0;
        const flightDayStrs = flightRange?.from && flightRange?.to ? getDatesInRange(flightRange.from, flightRange.to) : [];
        const allocatableStrs = flightDayStrs.filter((d) => !darkDays.includes(d));
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
          remainingRanges[0].length === flightDayStrs.length;
        const showEvenPill = remainingRanges.length > 0 && !onlyFullFlightEven;
        const hasPills = darkRanges.length > 0 || assignedRanges.length > 0 || showEvenPill;
        if (!hasPills) return null;

        type PillItem = { type: "dark"; r: DarkRange } | { type: "custom"; r: AssignedRange };
        const pills: PillItem[] = [
          ...darkRanges.map((r) => ({ type: "dark" as const, r })),
          ...assignedRanges.map((r) => ({ type: "custom" as const, r })),
        ].sort((a, b) => a.r.from.localeCompare(b.r.from));

        return (
          <div style={{ ...PILL_ROW_STYLE, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
            {pills.map((item, i) =>
              item.type === "dark" ? (
                <AllocatorPill
                  key={"dark-" + i + "-" + item.r.from + "-" + item.r.to}
                  tag="DARK"
                  dateRangeText={formatRangeFromTo(item.r.from, item.r.to)}
                  daysCount={getDaysInRange(item.r.from, item.r.to)}
                  impressionsText="0 impressions"
                  onEdit={() => {
                    setActionSelection({
                      from: new Date(item.r.from + "T12:00:00"),
                      to: new Date(item.r.to + "T12:00:00"),
                    });
                  }}
                  onDelete={() => {
                    onDarkRangesChange(darkRanges.filter((x) => x.from !== item.r.from || x.to !== item.r.to));
                  }}
                  style={{
                    background: "#e5e7eb",
                    color: "#6b7280",
                    border: "1px solid #d1d5db",
                  }}
                />
              ) : (
                (() => {
                  const r = item.r;
                  const rangeImpressions = Object.values(r.perDay).reduce((a, v) => a + v, 0);
                  return (
                    <AllocatorPill
                      key={"custom-" + i + "-" + r.from + "-" + r.to}
                      tag="CUSTOM"
                      dateRangeText={formatRangeFromTo(r.from, r.to)}
                      daysCount={getDaysInRange(r.from, r.to)}
                      impressionsText={`${rangeImpressions.toLocaleString()} impressions`}
                      onEdit={() => {
                        setActionSelection({
                          from: new Date(r.from + "T12:00:00"),
                          to: new Date(r.to + "T12:00:00"),
                        });
                        setAssignValue(rangeImpressions > 0 ? formatNumberWithCommas(String(rangeImpressions)) : "");
                      }}
                      onDelete={() => {
                        onAssignedRangesChange(assignedRanges.filter((x) => x.from !== r.from || x.to !== r.to));
                      }}
                      style={{ background: "#fed7aa", color: "#9a3412", border: "1px solid #fdba74" }}
                    />
                  );
                })()
              )
            )}
            {showEvenPill && (
              <AllocatorPill
                key="even-grouped"
                tag="EVEN"
                dateRangeText={remainingRanges.map((r) => formatRangeCompact(r)).join(" · ")}
                daysCount={remainingDayStrs.length}
                impressionsText={
                  remainder > 0
                    ? `${dailyBase.toLocaleString()} each, ${(dailyBase + remainder).toLocaleString()} on last (unassigned)`
                    : `${spreadPerDay.toLocaleString()} each (unassigned)`
                }
                onEdit={() => {
                  if (remainingRanges.length > 0) {
                    const first = remainingRanges[0]![0];
                    const last = remainingRanges[remainingRanges.length - 1]![remainingRanges[remainingRanges.length - 1]!.length - 1];
                    setActionSelection({
                      from: new Date(first + "T12:00:00"),
                      to: new Date(last + "T12:00:00"),
                    });
                  }
                }}
                onDelete={undefined}
                style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
              />
            )}
          </div>
        );
      })()}

      {hasValidRange && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!targetRange && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Select a range in the calendar first
            </span>
          )}
          <button
            type="button"
            onClick={handleMarkDark}
            disabled={!targetRange}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid #d1d5db",
              borderRadius: "var(--radius-sm)",
              background: "#e5e7eb",
              color: "#6b7280",
              cursor: targetRange ? "pointer" : "not-allowed",
              opacity: targetRange ? 1 : 0.6,
            }}
          >
            Mark as dark days
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleAssignSubmit}
              disabled={!targetRange}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid #fdba74",
                borderRadius: "var(--radius-sm)",
                background: "#fed7aa",
                color: "#9a3412",
                cursor: targetRange ? "pointer" : "not-allowed",
                opacity: targetRange ? 1 : 0.6,
              }}
            >
              Assign impressions
            </button>
            {targetRange && (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  value={assignValue}
                  onChange={(e) => setAssignValue(formatNumberWithCommas(parseNumberInput(e.target.value)))}
                  placeholder="e.g. 10,000"
                  style={{
                    padding: "8px 10px",
                    fontSize: 14,
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    width: "100%",
                    maxWidth: 200,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAssignSubmit();
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {targetRange.from && targetRange.to
                    ? (() => {
                        const n = getDatesInRange(targetRange.from!, targetRange.to!).filter((d) => !darkDays.includes(d)).length;
                        return `${n} day${n !== 1 ? "s" : ""} in range`;
                      })()
                    : "0 days in range"}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

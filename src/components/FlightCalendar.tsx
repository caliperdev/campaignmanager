"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Button, Input } from "@/components/ui";
import type { CustomRange } from "@/db/schema";

import "react-day-picker/style.css";

function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getMonthsBetween(startIso: string, endIso: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

interface FlightCalendarProps {
  flightStart: string;
  flightEnd: string;
  customRanges: CustomRange[];
  distributionMode: "even" | "custom";
  onAddRange: (range: CustomRange) => void;
}

export default function FlightCalendar({
  flightStart,
  flightEnd,
  customRanges,
  distributionMode,
  onAddRange,
}: FlightCalendarProps) {
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [pendingGoal, setPendingGoal] = useState("");

  const startDate = parseIso(flightStart);
  const endDate = parseIso(flightEnd);
  const months = getMonthsBetween(flightStart, flightEnd);
  const isCustom = distributionMode === "custom";

  const disabledMatcher = (date: Date) => {
    const iso = toIso(date);
    return iso < flightStart || iso > flightEnd;
  };

  const darkRanges = customRanges
    .filter((r): r is { startDate: string; endDate: string; isDark: true } => "isDark" in r && r.isDark)
    .map((r) => ({ from: parseIso(r.startDate), to: parseIso(r.endDate) }));
  const goalRanges = customRanges
    .filter((r): r is { startDate: string; endDate: string; impressionsGoal: number } => "impressionsGoal" in r)
    .map((r) => ({ from: parseIso(r.startDate), to: parseIso(r.endDate) }));

  const selectedRange =
    range.from && range.to && range.to >= range.from
      ? { from: parseIso(range.from), to: parseIso(range.to) }
      : range.from
        ? { from: parseIso(range.from), to: undefined }
        : undefined;

  function handleSelect(value: { from?: Date; to?: Date } | undefined) {
    if (!value?.from) {
      setRange({ from: null, to: null });
      return;
    }
    setRange({
      from: toIso(value.from),
      to: value.to ? toIso(value.to) : null,
    });
  }

  function addAsDark() {
    if (!range.from || !range.to || range.to < range.from) return;
    onAddRange({ startDate: range.from, endDate: range.to, isDark: true });
    setRange({ from: null, to: null });
  }

  function addAsGoal() {
    if (!range.from || !range.to || range.to < range.from) return;
    const n = parseInt(pendingGoal, 10);
    const goal = Number.isNaN(n) || n < 0 ? 0 : n;
    onAddRange({ startDate: range.from, endDate: range.to, impressionsGoal: goal });
    setRange({ from: null, to: null });
    setPendingGoal("");
  }

  const hasSelection = range.from && range.to && range.to >= range.from;

  const selectedDayCount = hasSelection && range.from && range.to
    ? Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 0;

  const isLongFlight = months.length >= 5;
  const visibleMonths = isLongFlight ? Math.min(months.length, 5) : Math.min(months.length, 3);

  if (!isCustom) {
    return (
      <div className={`rdp-flight-wrapper${isLongFlight ? " rdp-compact" : ""}`}>
        <DayPicker
          defaultMonth={startDate}
          startMonth={startDate}
          endMonth={endDate}
          numberOfMonths={visibleMonths}
          pagedNavigation
          disabled={disabledMatcher}
          modifiers={{
            flight: { from: startDate, to: endDate },
            ...(darkRanges.length > 0 && { dark: darkRanges }),
            ...(goalRanges.length > 0 && { goal: goalRanges }),
          }}
          modifiersClassNames={{
            flight: "rdp-flight-day",
            dark: "rdp-range-dark",
            goal: "rdp-range-goal",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className={`rdp-flight-wrapper${isLongFlight ? " rdp-compact" : ""}`}>
        <DayPicker
          mode="range"
          defaultMonth={startDate}
          startMonth={startDate}
          endMonth={endDate}
          numberOfMonths={visibleMonths}
          pagedNavigation
          disabled={disabledMatcher}
          selected={selectedRange}
          onSelect={handleSelect}
          modifiers={{
            flight: { from: startDate, to: endDate },
            ...(darkRanges.length > 0 && { dark: darkRanges }),
            ...(goalRanges.length > 0 && { goal: goalRanges }),
          }}
          modifiersClassNames={{
            flight: "rdp-flight-day",
            dark: "rdp-range-dark",
            goal: "rdp-range-goal",
          }}
        />
      </div>

      {hasSelection && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
            padding: "14px 16px",
            background: "var(--bg-primary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1,
              paddingBottom: 2,
            }}
          >
            Selected: {range.from} – {range.to}
            {selectedDayCount > 0 && (
              <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text-tertiary)" }}>
                ({selectedDayCount} day{selectedDayCount !== 1 ? "s" : ""})
              </span>
            )}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              paddingLeft: 16,
              borderLeft: "1px solid var(--border-light)",
            }}
          >
            <div style={{ minWidth: 100 }}>
              <Input
                id="flight-cal-goal"
                label="Impressions goal"
                type="number"
                min={0}
                placeholder="0"
                value={pendingGoal}
                onChange={(e) => setPendingGoal(e.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={addAsGoal}
              style={{
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #f59e0b",
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              Set Custom
            </Button>
            <Button
              type="button"
              onClick={addAsDark}
              style={{
                background: "#f3f4f6",
                color: "#4b5563",
                border: "1px solid #d1d5db",
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              Set DARK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

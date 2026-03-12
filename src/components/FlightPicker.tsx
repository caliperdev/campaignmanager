"use client";

import { useState, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import type { Matcher } from "react-day-picker";
import "react-day-picker/style.css";

type Props = {
  /** Selected date range (flight) */
  selected?: DateRange;
  /** Called when user selects a date range */
  onSelect?: (range: DateRange | undefined) => void;
  /** Optional: month to display (e.g. from flight start/end) */
  displayMonth?: Date;
  /** Optional: number of months to show (default 3) */
  numberOfMonths?: number;
  /** Optional: compact mode for smaller display */
  compact?: boolean;
  /** Optional: custom modifiers for styling days (e.g. dark days) */
  modifiers?: Record<string, Matcher | Matcher[] | undefined>;
  /** Optional: CSS class names for modifier-matched days */
  modifiersClassNames?: Record<string, string>;
  /** Optional: disable specific dates (e.g. outside flight range) */
  disabled?: Matcher | Matcher[];
};

export function FlightPicker({
  selected,
  onSelect,
  displayMonth,
  numberOfMonths = 3,
  compact = false,
  modifiers,
  modifiersClassNames,
  disabled,
}: Props) {
  const wrapperClass = compact
    ? "rdp-flight-wrapper rdp-compact"
    : "rdp-flight-wrapper";

  const targetMonth = displayMonth ?? selected?.from ?? selected?.to ?? new Date();
  const [month, setMonth] = useState(targetMonth);

  useEffect(() => {
    if (displayMonth && !isNaN(displayMonth.getTime())) {
      setMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth()));
    }
  }, [displayMonth]);

  return (
    <div className={wrapperClass} aria-label="Flight date range picker">
      <DayPicker
        mode="range"
        selected={selected}
        onSelect={onSelect}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={numberOfMonths}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        disabled={disabled}
      />
    </div>
  );
}

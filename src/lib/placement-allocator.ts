/**
 * Placement allocator: spread impressions across flight days, excluding dark days.
 * Used by monitor aggregation and the PlacementAllocator UI.
 */

/** One dark block = one user "mark dark" action. Never grouped. */
export type DarkRange = { from: string; to: string };

/** One assigned block = one user "assign" action. Never grouped. */
export type AssignedRange = { from: string; to: string; perDay: Record<string, number> };

/** Flatten dark ranges to date array for allocation. */
export function darkRangesToDarkDays(ranges: DarkRange[]): string[] {
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

/** Merge assigned ranges to per-day map (last wins for overlaps). */
export function assignedRangesToPerDay(ranges: AssignedRange[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ranges) {
    for (const [d, v] of Object.entries(r.perDay)) {
      if (v > 0) out[d] = v;
    }
  }
  return out;
}

/** Split sorted date strings into contiguous ranges. Used for migration from flat dark_days. */
export function darkDaysToDarkRanges(darkDays: string[]): DarkRange[] {
  if (darkDays.length === 0) return [];
  const sorted = [...darkDays].sort();
  const ranges: DarkRange[] = [];
  let from = sorted[0]!;
  let to = from;
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]!;
    const prev = sorted[i - 1]!;
    const nextDay = new Date(prev + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStr = toDateStr(nextDay);
    if (curr === nextStr) {
      to = curr;
    } else {
      ranges.push({ from, to });
      from = curr;
      to = curr;
    }
  }
  ranges.push({ from, to });
  return ranges;
}

/** Split per-day map into contiguous ranges. Used for migration from flat per_day_impressions. */
export function perDayToAssignedRanges(perDay: Record<string, number>): AssignedRange[] {
  const days = Object.keys(perDay)
    .filter((k) => (perDay[k] ?? 0) > 0)
    .sort();
  if (days.length === 0) return [];
  const ranges: AssignedRange[] = [];
  let from = days[0]!;
  let to = from;
  for (let i = 1; i < days.length; i++) {
    const curr = days[i]!;
    const prev = days[i - 1]!;
    const nextDay = new Date(prev + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStr = toDateStr(nextDay);
    if (curr === nextStr) {
      to = curr;
    } else {
      const perDaySlice: Record<string, number> = {};
      for (let d = new Date(from + "T12:00:00"); d <= new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1)) {
        const s = toDateStr(new Date(d));
        perDaySlice[s] = perDay[s] ?? 0;
      }
      ranges.push({ from, to, perDay: perDaySlice });
      from = curr;
      to = curr;
    }
  }
  const perDaySlice: Record<string, number> = {};
  for (let d = new Date(from + "T12:00:00"); d <= new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1)) {
    const s = toDateStr(new Date(d));
    perDaySlice[s] = perDay[s] ?? 0;
  }
  ranges.push({ from, to, perDay: perDaySlice });
  return ranges;
}

/** Format date as YYYY-MM-DD. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format date as YYYY-MM. */
function toYearMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Returns list of non-dark dates in [start, end] (inclusive).
 */
export function getFlightDays(
  start: Date,
  end: Date,
  darkDays?: string[]
): Date[] {
  const darkSet = new Set(darkDays ?? []);
  const result: Date[] = [];
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const totalDays = Math.max(
    1,
    Math.ceil((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDay);
    d.setDate(d.getDate() + i);
    const str = toDateStr(d);
    if (!darkSet.has(str)) {
      result.push(d);
    }
  }
  return result;
}

/**
 * Spread totalImpressions (placement Impressions field) across flight days.
 * - Dark days: excluded, no impressions.
 * - Days with per-day overrides: use assigned value (scaled if assigned sum > total).
 * - Unallocated impressions: spread equally among non-dark, non-assigned days.
 * - Remainder (from uneven division) goes to the last allocatable day.
 * Returns Map<yearMonth, booked impressions>.
 */
export function allocateImpressionsByMonth(
  start: Date,
  end: Date,
  totalImpressions: number,
  darkDays?: string[],
  perDayImpressions?: Record<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  if (totalImpressions <= 0) return result;

  const flightDays = getFlightDays(start, end, darkDays);
  if (flightDays.length === 0) return result;

  const perDay = perDayImpressions ?? {};
  const daysWithOverride = new Set(Object.keys(perDay));
  const allocatableDays = flightDays.filter((d) => !daysWithOverride.has(toDateStr(d)));
  const rawOverrideSum = Object.values(perDay).reduce((a, b) => a + b, 0);
  const overrideSum = Math.min(rawOverrideSum, totalImpressions);
  const scale = rawOverrideSum > 0 ? overrideSum / rawOverrideSum : 1;
  const remaining = totalImpressions - overrideSum;

  if (allocatableDays.length === 0) {
    const overrideDays = flightDays.filter((d) => (perDay[toDateStr(d)] ?? 0) > 0);
    const scaled: number[] = overrideDays.map((d) => Math.floor((perDay[toDateStr(d)] ?? 0) * scale));
    const sum = scaled.reduce((a, b) => a + b, 0);
    const remainder = overrideSum - sum;
    for (let i = 0; i < overrideDays.length; i++) {
      const d = overrideDays[i];
      const ym = toYearMonth(d);
      const val = Math.floor(scaled[i]! + (i === overrideDays.length - 1 ? remainder : 0));
      result.set(ym, Math.floor((result.get(ym) ?? 0) + val));
    }
    return result;
  }

  const dailyBase = Math.floor(remaining / allocatableDays.length);
  const remainder = remaining - dailyBase * allocatableDays.length;

  for (let i = 0; i < allocatableDays.length; i++) {
    const d = allocatableDays[i];
    const ym = toYearMonth(d);
    const daily = Math.floor(dailyBase + (i === allocatableDays.length - 1 ? remainder : 0));
    result.set(ym, Math.floor((result.get(ym) ?? 0) + daily));
  }

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const overrideEntries = Object.entries(perDay)
    .filter(([, v]) => v > 0)
    .map(([dateStr, val]) => {
      const d = new Date(dateStr + "T12:00:00");
      return { val, d };
    })
    .filter(({ d }) => !Number.isNaN(d.getTime()))
    .filter(({ d }) => {
      const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dDay >= startDay && dDay <= endDay;
    })
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  const scaled = overrideEntries.map(({ val }) => Math.floor(val * scale));
  const overrideSumActual = scaled.reduce((a, b) => a + b, 0);
  const overrideRemainder = overrideSum - overrideSumActual;
  for (let i = 0; i < overrideEntries.length; i++) {
    const { d } = overrideEntries[i]!;
    const ym = toYearMonth(d);
    const val = Math.floor(scaled[i]! + (i === overrideEntries.length - 1 ? overrideRemainder : 0));
    result.set(ym, Math.floor((result.get(ym) ?? 0) + val));
  }

  return result;
}

/**
 * Same as allocateImpressionsByMonth but returns Map<dateStr, daily impressions> for day-level breakdown.
 */
export function allocateImpressionsByDay(
  start: Date,
  end: Date,
  totalImpressions: number,
  darkDays?: string[],
  perDayImpressions?: Record<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  if (totalImpressions <= 0) return result;

  const flightDays = getFlightDays(start, end, darkDays);
  if (flightDays.length === 0) return result;

  const perDay = perDayImpressions ?? {};
  const daysWithOverride = new Set(Object.keys(perDay));
  const allocatableDays = flightDays.filter((d) => !daysWithOverride.has(toDateStr(d)));
  const rawOverrideSum = Object.values(perDay).reduce((a, b) => a + b, 0);
  const overrideSum = Math.min(rawOverrideSum, totalImpressions);
  const scale = rawOverrideSum > 0 ? overrideSum / rawOverrideSum : 1;
  const remaining = totalImpressions - overrideSum;

  if (allocatableDays.length === 0) {
    const overrideDays = flightDays.filter((d) => (perDay[toDateStr(d)] ?? 0) > 0);
    const scaled = overrideDays.map((d) => Math.floor((perDay[toDateStr(d)] ?? 0) * scale));
    const sum = scaled.reduce((a, b) => a + b, 0);
    const remainder = overrideSum - sum;
    for (let i = 0; i < overrideDays.length; i++) {
      const d = overrideDays[i];
      const dateStr = toDateStr(d);
      const val = Math.floor(scaled[i]! + (i === overrideDays.length - 1 ? remainder : 0));
      result.set(dateStr, (result.get(dateStr) ?? 0) + val);
    }
    return result;
  }

  const dailyBase = Math.floor(remaining / allocatableDays.length);
  const remainder = remaining - dailyBase * allocatableDays.length;

  for (let i = 0; i < allocatableDays.length; i++) {
    const d = allocatableDays[i];
    const dateStr = toDateStr(d);
    const daily = Math.floor(dailyBase + (i === allocatableDays.length - 1 ? remainder : 0));
    result.set(dateStr, (result.get(dateStr) ?? 0) + daily);
  }

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const overrideEntries = Object.entries(perDay)
    .filter(([, v]) => v > 0)
    .map(([dateStr, val]) => {
      const d = new Date(dateStr + "T12:00:00");
      return { val, d, dateStr };
    })
    .filter(({ d }) => !Number.isNaN(d.getTime()))
    .filter(({ d }) => {
      const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dDay >= startDay && dDay <= endDay;
    })
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  const scaled = overrideEntries.map(({ val }) => Math.floor(val * scale));
  const overrideSumActual = scaled.reduce((a, b) => a + b, 0);
  const overrideRemainder = overrideSum - overrideSumActual;
  for (let i = 0; i < overrideEntries.length; i++) {
    const { dateStr } = overrideEntries[i]!;
    const val = Math.floor(scaled[i]! + (i === overrideEntries.length - 1 ? overrideRemainder : 0));
    result.set(dateStr, (result.get(dateStr) ?? 0) + val);
  }

  return result;
}

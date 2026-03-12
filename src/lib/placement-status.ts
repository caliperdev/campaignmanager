/**
 * Returns true when today (real-world date) falls between startDate and endDate (inclusive).
 * Both dates must be present and parseable.
 */
export function isPlacementActive(startDate: string, endDate: string): boolean {
  if (!startDate?.trim() || !endDate?.trim()) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return false;
  return today >= start && today <= end;
}

function parseDate(s: string): Date | null {
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Returns "Live", "Ended", or "Unknown" for grouping. Accepts row-like object with start/end date values. */
export function getPlacementStatusLabel(row: { [k: string]: unknown }): "Live" | "Ended" | "Unknown" {
  const startStr = String(row.start_date ?? row["Start Date"] ?? row.startdate ?? "").trim();
  const endStr = String(row.end_date ?? row["End Date"] ?? row.enddate ?? "").trim();
  if (!startStr || !endStr) return "Unknown";
  const startD = parseDate(startStr);
  const endD = parseDate(endStr);
  if (!startD || !endD) return "Unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today >= startD && today <= endD) return "Live";
  return "Ended";
}

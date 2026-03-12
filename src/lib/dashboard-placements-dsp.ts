"use server";

/**
 * Dashboard: aggregate placements (with insertion_order_id_dsp) joined to DSP source.
 * Join: placement.insertion_order_id_dsp = DSP.cr4fe_insertionordergid
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { supabase, supabaseReadOnly } from "@/db";
import { PLACEMENTS_TABLE } from "@/db/schema";
import { getSourceByType, getSourceDataFull } from "@/app/test-link/actions";
import { allocateImpressionsByMonth } from "@/lib/placement-allocator";
import type { MonitorDisplayRow } from "@/lib/monitor-data";

const DASHBOARD_CACHE_TAG = "dashboard-placements-dsp";
const DASHBOARD_CACHE_TABLE = "dashboard_cache";

const DATE_COLUMNS = ["cr4fe_date", "cr4fe_reportdate", "report_date", "reportdate", "ReportDate", "date"];
const IMPRESSIONS_COLUMNS = ["cr4fe_impressioncount", "cr4fe_impressions", "impressions", "impression_count", "impressioncount", "delivered_impressions"];
const MEDIA_COST_COLUMNS = ["cr4fe_totalmediacost", "total_media_cost", "totalmediacost", "media_cost", "mediacost"];
const MEDIA_FEES_COLUMNS = ["cr4fe_mediafees", "media_fees", "mediafees", "Media Fees"];
const ADVERTISER_COLUMNS = ["cr4fe_advertiser", "Advertiser", "advertiser"];
const IO_SOURCE_COLUMNS = ["cr4fe_insertionordergid", "cr4fe_insertionorderid", "insertion_order_gid", "insertion order gid", "InsertionOrderGID"];

/** Media fees by advertiser (from migration 013). Applied when no media_fees column in source. */
const MEDIA_FEES_BY_ADVERTISER: Record<string, number> = {
  "ND - HA Usd - Buho": 0.28,
  "ND - BM Usd - Buho Media": 0.08,
};

type PlacementRow = {
  order_id: string;
  insertion_order_id_dsp: string | null;
  start_date: string | null;
  end_date: string | null;
  impressions: string | null;
  cpm_adops: string | null;
  cpm_celtra: string | null;
  dark_days: string | null;
  per_day_impressions: string | null;
};

function findColumn(row: Record<string, unknown>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const cNorm = c.toLowerCase().replace(/\s/g, "_");
    const found = keys.find(
      (k) =>
        k.toLowerCase().replace(/\s/g, "_") === cNorm ||
        k.toLowerCase().includes(cNorm) ||
        cNorm.includes(k.toLowerCase().replace(/\s/g, "_"))
    );
    if (found) return found;
  }
  return null;
}

function parseNum(val: unknown): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  const s = String(val).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseDate(val: unknown): Date | null {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseYearMonth(dateVal: unknown): string | null {
  if (dateVal == null || dateVal === "") return null;
  const s = String(dateVal).trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const odataMatch = s.match(/\/Date\((\d+)\)\//);
  if (odataMatch) {
    const d = new Date(parseInt(odataMatch[1], 10));
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseDarkDays(val: unknown): string[] {
  if (val == null || val === "") return [];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  try {
    const parsed = JSON.parse(String(val));
    return Array.isArray(parsed) ? parsed.filter((v: unknown): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parsePerDayImpressions(val: unknown): Record<string, number> {
  if (val == null || val === "") return {};
  const toInt = (v: unknown): number => {
    if (typeof v === "number" && !Number.isNaN(v)) return Math.floor(v);
    const n = parseInt(String(v).replace(/[$,\s]/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  };
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(val)) {
      const n = toInt(v);
      if (n > 0) out[String(k)] = n;
    }
    return out;
  }
  try {
    const parsed = JSON.parse(String(val));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = toInt(v);
      if (n > 0) out[String(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function getVal(row: Record<string, unknown>, col: string): string {
  const key = Object.keys(row).find((k) => k === col) ?? Object.keys(row).find((k) => k.toLowerCase() === col.toLowerCase());
  const v = key != null ? row[key] : undefined;
  return v !== undefined && v !== null ? String(v) : "";
}

/** Fetch placements with insertion_order_id_dsp from placements table. Read-only. */
async function getPlacementsWithIoDsp(ioFilter?: string | null): Promise<PlacementRow[]> {
  let q = supabaseReadOnly
    .from(PLACEMENTS_TABLE)
    .select("order_id, insertion_order_id_dsp, start_date, end_date, impressions, cpm_adops, cpm_celtra, dark_days, per_day_impressions")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");
  if (ioFilter && ioFilter.trim()) {
    q = q.eq("insertion_order_id_dsp", ioFilter.trim());
  }
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as PlacementRow[];
}

/** Fetch distinct insertion_order_id_dsp values for filter dropdown. Read-only. */
export async function getDistinctInsertionOrderIds(): Promise<string[]> {
  const { data, error } = await supabaseReadOnly
    .from(PLACEMENTS_TABLE)
    .select("insertion_order_id_dsp")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");

  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) {
    const io = String((row as { insertion_order_id_dsp: string | null }).insertion_order_id_dsp ?? "").trim();
    if (io) set.add(io);
  }
  return Array.from(set).sort();
}

/** Compute booked impressions by month per IO. */
function computeBookedByIoAndMonth(placements: PlacementRow[]): Map<string, Map<string, number>> {
  const byIoAndMonth = new Map<string, Map<string, number>>();

  for (const p of placements) {
    const io = String(p.insertion_order_id_dsp ?? "").trim();
    if (!io) continue;

    const start = parseDate(p.start_date);
    const end = parseDate(p.end_date);
    if (!start || !end || end < start) continue;

    const goal = parseInt(String(p.impressions ?? "0").replace(/[$,\s]/g, ""), 10) || 0;
    if (goal <= 0) continue;

    const darkDays = parseDarkDays(p.dark_days);
    const perDayImpressions = parsePerDayImpressions(p.per_day_impressions);

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const booked = allocateImpressionsByMonth(startDay, endDay, goal, darkDays, perDayImpressions);

    let ioMonths = byIoAndMonth.get(io);
    if (!ioMonths) {
      ioMonths = new Map();
      byIoAndMonth.set(io, ioMonths);
    }
    for (const [ym, val] of booked) {
      ioMonths.set(ym, (ioMonths.get(ym) ?? 0) + val);
    }
  }
  return byIoAndMonth;
}

/** Read cached rows from dashboard_cache. Read-only. */
async function getDashboardCacheRows(ioFilter: string): Promise<MonitorDisplayRow[]> {
  const { data, error } = await supabaseReadOnly
    .from(DASHBOARD_CACHE_TABLE)
    .select("year_month, active_order_count, booked_impressions, delivered_impressions, delivered_lines, media_cost, media_fees, celtra_cost, total_cost, booked_revenue")
    .eq("io_filter", ioFilter)
    .order("year_month", { ascending: true });

  if (error) return [];
  return (data ?? []).map((r) => ({
    yearMonth: r.year_month,
    sumImpressions: Number(r.booked_impressions),
    activeOrderCount: Number(r.active_order_count),
    dataImpressions: Number(r.delivered_impressions),
    deliveredLines: Number(r.delivered_lines),
    mediaCost: Number(r.media_cost),
    mediaFees: Number(r.media_fees),
    celtraCost: Number(r.celtra_cost),
    totalCost: Number(r.total_cost),
    bookedRevenue: Number(r.booked_revenue),
  }));
}

/** Upsert rows into dashboard_cache. Replaces all rows for io_filter. */
async function upsertDashboardCache(ioFilter: string, rows: MonitorDisplayRow[]): Promise<void> {
  await supabase.from(DASHBOARD_CACHE_TABLE).delete().eq("io_filter", ioFilter);

  if (rows.length === 0) return;

  const toInsert = rows.map((r) => ({
    io_filter: ioFilter,
    year_month: r.yearMonth,
    active_order_count: r.activeOrderCount,
    booked_impressions: r.sumImpressions,
    delivered_impressions: r.dataImpressions,
    delivered_lines: r.deliveredLines,
    media_cost: r.mediaCost,
    media_fees: r.mediaFees,
    celtra_cost: r.celtraCost,
    total_cost: r.totalCost,
    booked_revenue: r.bookedRevenue,
  }));

  await supabase.from(DASHBOARD_CACHE_TABLE).insert(toInsert);
}

/** Get dashboard data from DB cache. Returns empty if not cached. */
export async function getDashboardDataFromCache(ioFilter?: string | null): Promise<MonitorDisplayRow[]> {
  const filterKey = ioFilter?.trim() ?? "";
  return getDashboardCacheRows(filterKey);
}

/** Compute fresh data, store in dashboard_cache, and return. Call from Refresh button. */
export async function refreshAndStoreDashboardData(ioFilter?: string | null): Promise<MonitorDisplayRow[]> {
  const filterKey = ioFilter?.trim() ?? "";
  const rows = await computePlacementsWithDspAggregated(filterKey || undefined);
  if (rows.length > 0) {
    await upsertDashboardCache(filterKey, rows);
  }
  revalidateTag(DASHBOARD_CACHE_TAG, "max");
  return rows;
}

/** Internal: aggregate placements + DSP source by month (no cache). */
async function computePlacementsWithDspAggregated(ioFilter?: string | null): Promise<MonitorDisplayRow[]> {
  const filterKey = ioFilter?.trim() ?? "";
  const [placements, dspSource] = await Promise.all([
    getPlacementsWithIoDsp(filterKey || undefined),
    getSourceByType("DSP"),
  ]);

  if (placements.length === 0) return [];
  if (!dspSource?.id) return [];

  const sourceData = await getSourceDataFull(dspSource.id);
  if (!sourceData || sourceData.rows.length === 0) return [];

  const ioIds = new Set<string>();
  for (const p of placements) {
    const io = String(p.insertion_order_id_dsp ?? "").trim();
    if (io) ioIds.add(io);
  }

  const dateCol = findColumn(sourceData.rows[0] as Record<string, unknown>, DATE_COLUMNS);
  const imprCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IMPRESSIONS_COLUMNS);
  const mediaCostCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_COST_COLUMNS);
  const mediaFeesCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_FEES_COLUMNS);
  const advertiserCol = findColumn(sourceData.rows[0] as Record<string, unknown>, ADVERTISER_COLUMNS);
  const ioCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IO_SOURCE_COLUMNS);

  if (!dateCol || !imprCol || !mediaCostCol || !ioCol) return [];

  const bookedByIoAndMonth = computeBookedByIoAndMonth(placements);

  const ioToCpmAdops = new Map<string, number>();
  const ioToCpmCeltra = new Map<string, number>();
  const ioToOrderIds = new Map<string, Set<string>>();
  for (const p of placements) {
    const io = String(p.insertion_order_id_dsp ?? "").trim();
    if (!io) continue;
    if (!ioToCpmAdops.has(io)) {
      ioToCpmAdops.set(io, parseNum(p.cpm_adops));
    }
    if (!ioToCpmCeltra.has(io)) {
      ioToCpmCeltra.set(io, parseNum(p.cpm_celtra));
    }
    if (!ioToOrderIds.has(io)) ioToOrderIds.set(io, new Set());
    ioToOrderIds.get(io)!.add(p.order_id);
  }

  type IoAgg = { delivered: number; mediaCost: number; mediaFees: number };
  const byMonthIo = new Map<string, Map<string, IoAgg>>();

  for (const row of sourceData.rows) {
    const r = row as Record<string, unknown>;
    const io = getVal(r, ioCol).trim();
    if (!io || !ioIds.has(io)) continue;

    const dateVal = r[dateCol];
    const ym = parseYearMonth(dateVal);
    if (!ym) continue;

    let byIo = byMonthIo.get(ym);
    if (!byIo) {
      byIo = new Map();
      byMonthIo.set(ym, byIo);
    }

    let agg = byIo.get(io);
    if (!agg) {
      agg = { delivered: 0, mediaCost: 0, mediaFees: 0 };
      byIo.set(io, agg);
    }

    const rowMediaCost = parseNum(r[mediaCostCol]);
    agg.delivered += Math.floor(parseNum(r[imprCol]));
    agg.mediaCost += rowMediaCost;
    if (mediaFeesCol) {
      agg.mediaFees += parseNum(r[mediaFeesCol]);
    } else if (advertiserCol) {
      const advertiser = getVal(r, advertiserCol).trim();
      const rate = MEDIA_FEES_BY_ADVERTISER[advertiser];
      if (rate != null) agg.mediaFees += rowMediaCost * rate;
    }
  }

  const allMonths = new Set<string>(byMonthIo.keys());
  for (const ioMonths of bookedByIoAndMonth.values()) {
    for (const ym of ioMonths.keys()) allMonths.add(ym);
  }

  const result: MonitorDisplayRow[] = [];

  for (const ym of Array.from(allMonths).sort()) {
    const byIo = byMonthIo.get(ym) ?? new Map();
    let bookedImpr = 0;
    let deliveredImpr = 0;
    let mediaCost = 0;
    let mediaFees = 0;
    let celtraCost = 0;
    let bookedRevenue = 0;
    const ioIdsInMonth = new Set<string>();
    const orderIdsInMonth = new Set<string>();

    for (const io of ioIds) {
      const agg = byIo.get(io) ?? { delivered: 0, mediaCost: 0, mediaFees: 0 };
      const cpmAdops = ioToCpmAdops.get(io) ?? 0;
      const cpmCeltra = ioToCpmCeltra.get(io) ?? 0;
      const bookedForIo = bookedByIoAndMonth.get(io)?.get(ym) ?? 0;

      bookedImpr += bookedForIo;
      deliveredImpr += agg.delivered;
      mediaCost += agg.mediaCost;
      mediaFees += agg.mediaFees;
      celtraCost += (agg.delivered / 1000) * cpmCeltra;
      bookedRevenue += (bookedForIo / 1000) * cpmAdops;
      if (agg.delivered > 0 || bookedForIo > 0) {
        ioIdsInMonth.add(io);
        for (const oid of ioToOrderIds.get(io) ?? []) orderIdsInMonth.add(oid);
      }
    }

    const totalCost = mediaCost + celtraCost;

    result.push({
      yearMonth: ym,
      sumImpressions: Math.floor(bookedImpr),
      activeOrderCount: orderIdsInMonth.size,
      dataImpressions: Math.floor(deliveredImpr),
      deliveredLines: ioIdsInMonth.size,
      mediaCost: Math.round(mediaCost * 100) / 100,
      mediaFees: Math.round(mediaFees * 100) / 100,
      celtraCost: Math.round(celtraCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      bookedRevenue: Math.round(bookedRevenue * 100) / 100,
    });
  }

  return result.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/** Aggregate placements + DSP source by month. Returns MonitorDisplayRow[]. Uses Next.js cache for backwards compat. */
export async function getPlacementsWithDspAggregated(ioFilter?: string | null): Promise<MonitorDisplayRow[]> {
  const filterKey = ioFilter?.trim() ?? "";
  return unstable_cache(
    () => computePlacementsWithDspAggregated(filterKey || undefined),
    ["dashboard-placements-dsp", filterKey],
    { tags: [DASHBOARD_CACHE_TAG], revalidate: false }
  )();
}

/** Revalidate dashboard cache. Call from refresh button. */
export async function revalidateDashboardCache(): Promise<void> {
  revalidateTag(DASHBOARD_CACHE_TAG, "max");
}

export type PlacementWithIoDsp = {
  id: number;
  order_id: string;
  placement_id: string | null;
  placement: string | null;
  insertion_order_id_dsp: string | null;
  format: string | null;
  deal: string | null;
  start_date: string | null;
  end_date: string | null;
  impressions: string | null;
};

/** Fetch placements with insertion_order_id_dsp for display in modal. */
export async function getPlacementsWithInsertionOrderIdDsp(): Promise<PlacementWithIoDsp[]> {
  const { data, error } = await supabase
    .from(PLACEMENTS_TABLE)
    .select("id, order_id, placement_id, placement, insertion_order_id_dsp, format, deal, start_date, end_date, impressions")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "")
    .order("id", { ascending: true });

  if (error) return [];
  return (data ?? []) as PlacementWithIoDsp[];
}

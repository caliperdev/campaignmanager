"use server";

/**
 * Dashboard: aggregate placements (with insertion_order_id_dsp) joined to DSP source.
 * Join: placement.insertion_order_id_dsp = DSP.cr4fe_insertionordergid
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { supabase } from "@/db";
import { PLACEMENTS_TABLE, ORDERS_TABLE, CAMPAIGNS_TABLE } from "@/db/schema";
import { getSourceByType, getSourceDataFull, type SourceData } from "@/app/test-link/actions";
import {
  allocateImpressionsByMonth,
  darkRangesToDarkDays,
  assignedRangesToPerDay,
  toDateStr,
  type DarkRange,
} from "@/lib/placement-allocator";
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
  placement_id: string | null;
  start_date: string | null;
  end_date: string | null;
  impressions: string | null;
  cpm_adops: string | null;
  cpm_celtra: string | null;
  dark_days: string | null;
  per_day_impressions: string | null;
  dark_ranges?: string | null;
  assigned_ranges?: string | null;
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
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
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
  const raw: string[] = Array.isArray(val)
    ? val.filter((v): v is string => typeof v === "string")
    : (() => {
        try {
          const parsed = JSON.parse(String(val));
          return Array.isArray(parsed) ? parsed.filter((v: unknown): v is string => typeof v === "string") : [];
        } catch {
          return [];
        }
      })();
  return raw.map((s) => normalizeDateKey(s));
}

/** Resolve dark days from placement: prefer dark_ranges (JSON), fallback to dark_days. */
function resolveDarkDays(p: PlacementRow): string[] {
  const rawRanges = (p as Record<string, unknown>).dark_ranges ?? p.dark_ranges;
  if (rawRanges && String(rawRanges).trim()) {
    try {
      const parsed = JSON.parse(String(rawRanges));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ranges = parsed as Array<{ from?: string; to?: string }>;
        const valid = ranges.filter((r): r is DarkRange => !!(r?.from && r?.to));
        if (valid.length > 0) return darkRangesToDarkDays(valid);
      }
    } catch {
      /* ignore */
    }
  }
  const rawDark = (p as Record<string, unknown>).dark_days ?? p.dark_days;
  return parseDarkDays(rawDark);
}

/** Normalize date key to YYYY-MM-DD so allocateImpressionsByMonth lookups succeed. */
function normalizeDateKey(key: string): string {
  const s = String(key).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s + (s.includes("T") ? "" : "T12:00:00"));
  if (!Number.isNaN(d.getTime())) return toDateStr(d);
  return s;
}

/** Resolve per-day impressions from placement: prefer assigned_ranges (JSON), fallback to per_day_impressions. Ensures numeric values and YYYY-MM-DD keys. */
function resolvePerDayImpressions(p: PlacementRow): Record<string, number> {
  const toNum = (v: unknown): number => {
    if (typeof v === "number" && !Number.isNaN(v)) return Math.floor(v);
    const n = parseInt(String(v).replace(/[$,\s]/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const normalize = (m: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      const n = toNum(v);
      if (n > 0) {
        const normKey = normalizeDateKey(k);
        out[normKey] = (out[normKey] ?? 0) + n;
      }
    }
    return out;
  };

  let result: Record<string, number> = {};

  const rawRanges = (p as Record<string, unknown>).assigned_ranges ?? p.assigned_ranges;
  if (rawRanges && String(rawRanges).trim()) {
    try {
      const parsed = JSON.parse(String(rawRanges));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ranges = parsed as Array<{ from?: string; to?: string; perDay?: Record<string, unknown> }>;
        const valid = ranges.filter((r) => r?.perDay && typeof r.perDay === "object");
        if (valid.length > 0) {
          result = assignedRangesToPerDay(valid as Array<{ from: string; to: string; perDay: Record<string, number> }>);
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (Object.keys(result).length === 0) {
    const rawPerDay = (p as Record<string, unknown>).per_day_impressions ?? (p as Record<string, unknown>).perDayImpressions ?? p.per_day_impressions;
    result = parsePerDayImpressions(rawPerDay);
  }

  return normalize(result);
}

/** Resolve impressions goal from placement (handles Impressions/impressions). */
function resolveImpressionsGoal(p: PlacementRow): number {
  const raw = (p as Record<string, unknown>).impressions ?? (p as Record<string, unknown>).Impressions ?? p.impressions ?? "";
  return parseInt(String(raw ?? "0").replace(/[$,\s]/g, ""), 10) || 0;
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

/** Get order IDs for placements that have insertion_order_id_dsp and belong to advertiser. */
async function getOrderIdsForAdvertiserWithIoDsp(advertiserId: string): Promise<Set<string>> {
  const { data: campaigns } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("id")
    .eq("advertiser_id", advertiserId);
  const campaignIds = (campaigns ?? []).map((c) => (c as { id: string }).id);
  if (campaignIds.length === 0) return new Set();

  const { data: orders } = await supabase
    .from(ORDERS_TABLE)
    .select("id")
    .in("campaign_id", campaignIds);
  return new Set((orders ?? []).map((o) => (o as { id: string }).id));
}

/** Fetch placements with insertion_order_id_dsp from placements table. Optionally filter by io, advertiser, and/or placement_id. */
async function getPlacementsWithIoDsp(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<PlacementRow[]> {
  let q = supabase
    .from(PLACEMENTS_TABLE)
    .select("order_id, insertion_order_id_dsp, placement_id, start_date, end_date, impressions, cpm_adops, cpm_celtra, dark_days, per_day_impressions, dark_ranges, assigned_ranges")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");
  if (ioFilter && ioFilter.trim()) {
    q = q.eq("insertion_order_id_dsp", ioFilter.trim());
  }
  if (placementIdFilter && placementIdFilter.trim()) {
    q = q.eq("placement_id", placementIdFilter.trim());
  }
  const { data, error } = await q;
  if (error) return [];
  let placements = (data ?? []) as PlacementRow[];

  if (advertiserFilter && advertiserFilter.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserFilter.trim());
    if (orderIds.size === 0) return [];
    placements = placements.filter((p) => orderIds.has(p.order_id));
  }
  return placements;
}

/** Fetch placements by placement_id (all placements, including those without DSP link). For booked-only data. */
async function getPlacementsByPlacementId(
  placementId: string,
  advertiserFilter?: string | null,
  ioFilter?: string | null
): Promise<PlacementRow[]> {
  const pid = placementId?.trim();
  if (!pid) return [];

  let q = supabase
    .from(PLACEMENTS_TABLE)
    .select("order_id, insertion_order_id_dsp, placement_id, start_date, end_date, impressions, cpm_adops, cpm_celtra, dark_days, per_day_impressions, dark_ranges, assigned_ranges")
    .eq("placement_id", pid);
  if (ioFilter && ioFilter.trim()) {
    q = q.eq("insertion_order_id_dsp", ioFilter.trim());
  }
  const { data, error } = await q;
  if (error) return [];
  let placements = (data ?? []) as PlacementRow[];

  if (advertiserFilter && advertiserFilter.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserFilter.trim());
    if (orderIds.size === 0) return [];
    placements = placements.filter((p) => orderIds.has(p.order_id));
  }
  return placements;
}

/** Fetch distinct advertisers that have placements with insertion_order_id_dsp (for filter dropdown). */
export async function getDistinctAdvertisersForDashboard(): Promise<{ id: string; advertiser: string }[]> {
  const { data, error } = await supabase
    .from(PLACEMENTS_TABLE)
    .select("order_id")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");
  if (error) return [];

  const orderIds = [...new Set((data ?? []).map((r) => (r as { order_id: string }).order_id))];
  if (orderIds.length === 0) return [];

  const { data: orders } = await supabase
    .from(ORDERS_TABLE)
    .select("campaign_id")
    .in("id", orderIds);
  const campaignIds = [...new Set((orders ?? []).map((o) => (o as { campaign_id: string }).campaign_id).filter(Boolean))];
  if (campaignIds.length === 0) return [];

  const { data: campaigns } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("advertiser_id")
    .in("id", campaignIds);
  const advertiserIds = [...new Set((campaigns ?? []).map((c) => (c as { advertiser_id: string }).advertiser_id).filter(Boolean))];
  if (advertiserIds.length === 0) return [];

  const { data: advertisers } = await supabase
    .from("advertisers")
    .select("id, advertiser")
    .in("id", advertiserIds)
    .order("advertiser", { ascending: true });
  return (advertisers ?? []) as { id: string; advertiser: string }[];
}

/** Fetch distinct insertion_order_id_dsp values for filter dropdown. When advertiserId is set, only IOs belonging to that advertiser. */
export async function getDistinctInsertionOrderIds(advertiserId?: string | null): Promise<string[]> {
  let placements: { insertion_order_id_dsp: string | null }[];
  if (advertiserId && advertiserId.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserId.trim());
    if (orderIds.size === 0) return [];
    const { data, error } = await supabase
      .from(PLACEMENTS_TABLE)
      .select("insertion_order_id_dsp")
      .not("insertion_order_id_dsp", "is", null)
      .neq("insertion_order_id_dsp", "")
      .in("order_id", Array.from(orderIds));
    if (error) return [];
    placements = data ?? [];
  } else {
    const { data, error } = await supabase
      .from(PLACEMENTS_TABLE)
      .select("insertion_order_id_dsp")
      .not("insertion_order_id_dsp", "is", null)
      .neq("insertion_order_id_dsp", "");
    if (error) return [];
    placements = data ?? [];
  }
  const set = new Set<string>();
  for (const row of placements) {
    const io = String(row.insertion_order_id_dsp ?? "").trim();
    if (io) set.add(io);
  }
  return Array.from(set).sort();
}

/** Fetch distinct placement_id values for dashboard filter. Shows all placements (not just DSP-linked). Scoped by advertiser and/or io when provided. */
export async function getDistinctPlacementIdsForDashboard(
  advertiserId?: string | null,
  ioFilter?: string | null
): Promise<{ id: string; label: string }[]> {
  let q = supabase
    .from(PLACEMENTS_TABLE)
    .select("placement_id, placement, order_id")
    .not("placement_id", "is", null)
    .neq("placement_id", "");
  if (ioFilter && ioFilter.trim()) {
    q = q.eq("insertion_order_id_dsp", ioFilter.trim());
  }
  const { data, error } = await q;
  if (error) return [];
  let placements = (data ?? []) as { placement_id: string | null; placement: string | null; order_id: string }[];

  if (advertiserId && advertiserId.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserId.trim());
    if (orderIds.size === 0) return [];
    placements = placements.filter((p) => orderIds.has(p.order_id));
  }

  const seen = new Set<string>();
  const result: { id: string; label: string }[] = [];
  for (const p of placements) {
    const id = String(p.placement_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = String(p.placement ?? id).trim() || id;
    result.push({ id, label });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label));
}
/** Group key: io when present, else placement_id for placements without DSP link. */
function placementGroupKey(p: PlacementRow): string {
  const io = String(p.insertion_order_id_dsp ?? "").trim();
  if (io) return io;
  const pid = String(p.placement_id ?? "").trim();
  return pid ? `_p:${pid}` : "";
}

/** Sum perDay values within [startDay, endDay] so we can use as goal when all assigned (avoids scaling). */
function sumPerDayInRange(perDay: Record<string, number>, startDay: Date, endDay: Date): number {
  let sum = 0;
  const startMs = startDay.getTime();
  const endMs = endDay.getTime();
  for (const [dateStr, val] of Object.entries(perDay)) {
    const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
    if (!Number.isNaN(d.getTime())) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayStart >= startMs && dayStart <= endMs) sum += val;
    }
  }
  return sum;
}

/** Sum perDay values by month within [startDay, endDay]. Used when all days assigned to match allocator exactly (no floor/remainder drift). */
function sumPerDayByMonth(perDay: Record<string, number>, startDay: Date, endDay: Date): Map<string, number> {
  const byMonth = new Map<string, number>();
  const startMs = startDay.getTime();
  const endMs = endDay.getTime();
  for (const [dateStr, val] of Object.entries(perDay)) {
    const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
    if (!Number.isNaN(d.getTime())) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayStart >= startMs && dayStart <= endMs) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + val);
      }
    }
  }
  return byMonth;
}

function computeBookedByIoAndMonth(placements: PlacementRow[]): Map<string, Map<string, number>> {
  const byIoAndMonth = new Map<string, Map<string, number>>();

  for (const p of placements) {
    const key = placementGroupKey(p);
    if (!key) continue;

    const start = parseDate(p.start_date);
    const end = parseDate(p.end_date);
    if (!start || !end || end < start) continue;

    const darkDays = resolveDarkDays(p);
    const perDayImpressions = resolvePerDayImpressions(p);

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const assignedSum = sumPerDayInRange(perDayImpressions, startDay, endDay);
    const goal = assignedSum > 0 ? assignedSum : resolveImpressionsGoal(p);
    if (goal <= 0) continue;

    const booked =
      assignedSum > 0
        ? sumPerDayByMonth(perDayImpressions, startDay, endDay)
        : allocateImpressionsByMonth(startDay, endDay, goal, darkDays, perDayImpressions);

    let ioMonths = byIoAndMonth.get(key);
    if (!ioMonths) {
      ioMonths = new Map();
      byIoAndMonth.set(key, ioMonths);
    }
    for (const [ym, val] of booked) {
      ioMonths.set(ym, (ioMonths.get(ym) ?? 0) + val);
    }
  }
  return byIoAndMonth;
}

/** Compute placement count by month per IO/placement (placements with booked impressions in that month). */
function computePlacementCountByIoAndMonth(placements: PlacementRow[]): Map<string, Map<string, number>> {
  const byIoAndMonth = new Map<string, Map<string, number>>();

  for (const p of placements) {
    const key = placementGroupKey(p);
    if (!key) continue;

    const start = parseDate(p.start_date);
    const end = parseDate(p.end_date);
    if (!start || !end || end < start) continue;

    const darkDays = resolveDarkDays(p);
    const perDayImpressions = resolvePerDayImpressions(p);

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const assignedSum = sumPerDayInRange(perDayImpressions, startDay, endDay);
    const goal = assignedSum > 0 ? assignedSum : resolveImpressionsGoal(p);
    if (goal <= 0) continue;

    const booked =
      assignedSum > 0
        ? sumPerDayByMonth(perDayImpressions, startDay, endDay)
        : allocateImpressionsByMonth(startDay, endDay, goal, darkDays, perDayImpressions);

    let ioMonths = byIoAndMonth.get(key);
    if (!ioMonths) {
      ioMonths = new Map();
      byIoAndMonth.set(key, ioMonths);
    }
    for (const [ym] of booked) {
      ioMonths.set(ym, (ioMonths.get(ym) ?? 0) + 1);
    }
  }
  return byIoAndMonth;
}

/** Read cached rows from dashboard_cache. */
async function getDashboardCacheRows(ioFilter: string, advertiserFilter: string): Promise<MonitorDisplayRow[]> {
  const { data, error } = await supabase
    .from(DASHBOARD_CACHE_TABLE)
    .select("year_month, active_order_count, placement_count, booked_impressions, delivered_impressions, delivered_lines, media_cost, media_fees, celtra_cost, total_cost, booked_revenue")
    .eq("io_filter", ioFilter)
    .eq("advertiser_filter", advertiserFilter)
    .order("year_month", { ascending: true });

  if (error) return [];
  return (data ?? [])
    .map((r) => {
      const placementCount = r.placement_count != null ? Number(r.placement_count) : Number(r.active_order_count);
      return {
        yearMonth: r.year_month,
        sumImpressions: Number(r.booked_impressions),
        activeOrderCount: Number(r.active_order_count),
        placementCount,
        dataImpressions: Number(r.delivered_impressions),
        deliveredLines: Number(r.delivered_lines),
        mediaCost: Number(r.media_cost),
        mediaFees: Number(r.media_fees),
        celtraCost: Number(r.celtra_cost),
        totalCost: Number(r.total_cost),
        bookedRevenue: Number(r.booked_revenue),
      };
    })
    .filter(
      (r) =>
        r.placementCount > 0 ||
        r.sumImpressions > 0 ||
        r.dataImpressions > 0 ||
        r.mediaCost > 0 ||
        r.totalCost > 0
    );
}

/** Upsert rows into dashboard_cache. Replaces all rows for io_filter + advertiser_filter. */
async function upsertDashboardCache(ioFilter: string, advertiserFilter: string, rows: MonitorDisplayRow[]): Promise<void> {
  await supabase
    .from(DASHBOARD_CACHE_TABLE)
    .delete()
    .eq("io_filter", ioFilter)
    .eq("advertiser_filter", advertiserFilter);

  if (rows.length === 0) return;

  const toInsert = rows.map((r) => ({
    io_filter: ioFilter,
    advertiser_filter: advertiserFilter,
    year_month: r.yearMonth,
    active_order_count: r.activeOrderCount,
    placement_count: r.placementCount ?? r.activeOrderCount,
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
export async function getDashboardDataFromCache(
  ioFilter?: string | null,
  advertiserFilter?: string | null
): Promise<MonitorDisplayRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  return getDashboardCacheRows(ioKey, advKey);
}

/** Get dashboard data. When placementIdFilter is set, computes on demand (cached by placement+io+advertiser). When cache is empty, computes on demand so filter changes show data. */
export async function getDashboardData(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<MonitorDisplayRow[]> {
  if (placementIdFilter?.trim()) {
    const ioKey = ioFilter?.trim() ?? "";
    const advKey = advertiserFilter?.trim() ?? "";
    const placementKey = placementIdFilter.trim();
    return unstable_cache(
      () =>
        computePlacementsWithDspAggregated(
          ioKey || undefined,
          advKey || undefined,
          placementKey
        ),
      ["dashboard-placement-filter", ioKey, advKey, placementKey],
      { tags: [DASHBOARD_CACHE_TAG], revalidate: 300 }
    )();
  }
  const cached = await getDashboardDataFromCache(ioFilter, advertiserFilter);
  if (cached.length > 0) return cached;
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  return computePlacementsWithDspAggregated(ioKey || undefined, advKey || undefined);
}

/** Compute fresh data, store in dashboard_cache, and return. Call from Refresh button. */
export async function refreshAndStoreDashboardData(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  preFetchedSourceData?: SourceData | null
): Promise<MonitorDisplayRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const rows = await computePlacementsWithDspAggregated(ioKey || undefined, advKey || undefined, undefined, preFetchedSourceData);
  if (rows.length > 0) {
    await upsertDashboardCache(ioKey, advKey, rows);
  }
  revalidateTag(DASHBOARD_CACHE_TAG, "max");
  return rows;
}

const REFRESH_CONCURRENCY = 5;

/** Refresh dashboard cache for all combinations. Shares DSP fetch, batches IO lookups, runs in parallel. */
export async function refreshAllDashboardCache(): Promise<{ refreshed: number }> {
  const [advertisers, allIos, dspSource] = await Promise.all([
    getDistinctAdvertisersForDashboard(),
    getDistinctInsertionOrderIds(),
    getSourceByType("DSP"),
  ]);

  if (!dspSource?.id) return { refreshed: 0 };
  const sourceData = await getSourceDataFull(dspSource.id);
  if (!sourceData || sourceData.rows.length === 0) return { refreshed: 0 };

  const iosByAdvertiser = await Promise.all(advertisers.map((a) => getDistinctInsertionOrderIds(a.id)));

  const seen = new Set<string>();
  const key = (io: string, adv: string) => `${io}\0${adv}`;
  const toRefresh: { io: string; advertiser: string }[] = [];
  const add = (io: string, adv: string) => {
    const k = key(io, adv);
    if (!seen.has(k)) {
      seen.add(k);
      toRefresh.push({ io, advertiser: adv });
    }
  };

  add("", "");
  for (const a of advertisers) add("", a.id);
  for (const io of allIos) add(io, "");
  advertisers.forEach((a, i) => {
    for (const io of iosByAdvertiser[i] ?? []) add(io, a.id);
  });

  for (let i = 0; i < toRefresh.length; i += REFRESH_CONCURRENCY) {
    const batch = toRefresh.slice(i, i + REFRESH_CONCURRENCY);
    await Promise.all(
      batch.map(({ io, advertiser }) =>
        refreshAndStoreDashboardData(io || undefined, advertiser || undefined, sourceData)
      )
    );
  }

  revalidateTag(DASHBOARD_CACHE_TAG, "max");
  return { refreshed: toRefresh.length };
}

/** Refresh only the current selection (io + advertiser, or placement-filtered). For quick test before full refresh. */
export async function refreshDashboardSelection(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<{ refreshed: boolean }> {
  const placementKey = placementIdFilter?.trim();
  if (placementKey) {
    revalidateTag(DASHBOARD_CACHE_TAG, "max");
    return { refreshed: true };
  }
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const dspSource = await getSourceByType("DSP");
  let sourceData: SourceData | null = null;
  if (dspSource?.id) sourceData = await getSourceDataFull(dspSource.id);
  await refreshAndStoreDashboardData(ioKey || undefined, advKey || undefined, sourceData ?? undefined);
  return { refreshed: true };
}

/** Internal: aggregate placements + DSP source by month (no cache). When placementIdFilter is set, also includes placements without DSP link (booked-only). */
async function computePlacementsWithDspAggregated(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null,
  preFetchedSourceData?: SourceData | null
): Promise<MonitorDisplayRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const placementKey = placementIdFilter?.trim() ?? undefined;

  let placements = await getPlacementsWithIoDsp(ioKey || undefined, advKey || undefined, placementKey);
  if (placements.length === 0 && placementKey) {
    placements = await getPlacementsByPlacementId(placementKey, advKey || undefined, ioKey || undefined);
  }
  if (placements.length === 0) return [];

  const bookedByIoAndMonth = computeBookedByIoAndMonth(placements);
  const placementCountByIoAndMonth = computePlacementCountByIoAndMonth(placements);

  const ioIds = new Set<string>();
  for (const p of placements) {
    const key = placementGroupKey(p);
    if (key) ioIds.add(key);
  }

  const ioToCpmAdops = new Map<string, number>();
  const ioToCpmCeltra = new Map<string, number>();
  const ioToOrderIds = new Map<string, Set<string>>();
  for (const p of placements) {
    const key = placementGroupKey(p);
    if (!key) continue;
    if (!ioToCpmAdops.has(key)) {
      ioToCpmAdops.set(key, parseNum(p.cpm_adops));
    }
    if (!ioToCpmCeltra.has(key)) {
      ioToCpmCeltra.set(key, parseNum(p.cpm_celtra));
    }
    if (!ioToOrderIds.has(key)) ioToOrderIds.set(key, new Set());
    ioToOrderIds.get(key)!.add(p.order_id);
  }

  type IoAgg = { delivered: number; mediaCost: number; mediaFees: number };
  const byMonthIo = new Map<string, Map<string, IoAgg>>();

  let sourceData = preFetchedSourceData;
  if (!sourceData) {
    const dspSource = await getSourceByType("DSP");
    if (dspSource?.id) sourceData = await getSourceDataFull(dspSource.id);
  }

  if (sourceData && sourceData.rows.length > 0) {
    const dateCol = findColumn(sourceData.rows[0] as Record<string, unknown>, DATE_COLUMNS);
    const imprCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IMPRESSIONS_COLUMNS);
    const mediaCostCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_COST_COLUMNS);
    const mediaFeesCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_FEES_COLUMNS);
    const advertiserCol = findColumn(sourceData.rows[0] as Record<string, unknown>, ADVERTISER_COLUMNS);
    const ioCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IO_SOURCE_COLUMNS);

    if (dateCol && imprCol && mediaCostCol && ioCol) {
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
    let placementCountInMonth = 0;

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
        placementCountInMonth += placementCountByIoAndMonth.get(io)?.get(ym) ?? 0;
      }
    }

    const totalCost = mediaCost + celtraCost;

    const isEmpty =
      placementCountInMonth === 0 &&
      bookedImpr === 0 &&
      deliveredImpr === 0 &&
      mediaCost === 0 &&
      totalCost === 0;
    if (isEmpty) continue;

    result.push({
      yearMonth: ym,
      sumImpressions: Math.floor(bookedImpr),
      activeOrderCount: 0,
      placementCount: placementCountInMonth,
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
export async function getPlacementsWithDspAggregated(
  ioFilter?: string | null,
  advertiserFilter?: string | null
): Promise<MonitorDisplayRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  return unstable_cache(
    () => computePlacementsWithDspAggregated(ioKey || undefined, advKey || undefined),
    ["dashboard-placements-dsp", ioKey, advKey],
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

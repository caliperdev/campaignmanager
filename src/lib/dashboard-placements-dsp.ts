"use server";

/**
 * Dashboard: aggregate placements joined to DSP (Dataverse cr4fe_dspalls).
 *
 * Pipeline (same as test page):
 * 1. Supabase placements.insertion_order_id_dsp → unique IO IDs
 * 2. Dataverse cr4fe_dspalls filtered by cr4fe_insertionordergid = each IO
 * 3. Join: Supabase IO = Dataverse cr4fe_insertionordergid (exact or comma-separated)
 * 4. Sum cr4fe_impressions by year-month → Delivered Impr. column
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { supabase } from "@/db";
import { PLACEMENTS_TABLE, ORDERS_TABLE, CAMPAIGNS_TABLE } from "@/db/schema";
import { getSourceByType, getSourceDataFull, getSourceDataFilteredByIos, type SourceData } from "@/app/test-link/actions";
import {
  allocateImpressionsByMonth,
  allocateImpressionsByDay,
  darkRangesToDarkDays,
  assignedRangesToPerDay,
  toDateStr,
  type DarkRange,
} from "@/lib/placement-allocator";
import type { MonitorDisplayRow } from "@/lib/monitor-data";

const DASHBOARD_CACHE_TAG = "dashboard-placements-dsp";
const DASHBOARD_CACHE_TABLE = "dashboard_cache";
const PLACEMENT_IO_CACHE_TAG = "dashboard-placement-io";

const DATE_COLUMNS = ["cr4fe_date", "cr4fe_reportdate", "report_date", "reportdate", "ReportDate", "date"];
const IMPRESSIONS_COLUMNS = ["cr4fe_impressions", "cr4fe_impressioncount", "impressions", "impression_count", "impressioncount", "delivered_impressions"];
/** Media Cost: Dataverse cr4fe_totalmediacost (primary), then fallbacks. */
const MEDIA_COST_COLUMNS = ["cr4fe_totalmediacost", "total_media_cost", "totalmediacost", "media_cost", "mediacost"];
const ADVERTISER_COLUMNS = ["cr4fe_advertiser", "Advertiser", "advertiser"];
const IO_SOURCE_COLUMNS = ["cr4fe_insertionordergid", "insertion order gid", "cr4fe_insertionorderid", "insertion_order_gid", "InsertionOrderGID"];

/** Media fees = Total Media Cost * multiplier by cr4fe_advertiser (Dataverse). */
const MEDIA_FEES_BY_ADVERTISER: Record<string, number> = {
  "ND - HA Usd - Buho": 0.28,
  "ND - HA - Buho USD": 0.28,
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
    const exactMatch = keys.find((k) => k.toLowerCase().replace(/\s/g, "_") === cNorm);
    if (exactMatch) return exactMatch;
  }
  for (const c of candidates) {
    const cNorm = c.toLowerCase().replace(/\s/g, "_");
    const found = keys.find((k) => k.toLowerCase().includes(cNorm) || cNorm.includes(k.toLowerCase().replace(/\s/g, "_")));
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

/** Fetch ALL placements for advertiser (with or without insertion_order_id_dsp). For full booked-impressions coverage. */
async function getPlacementsForAdvertiserAll(advertiserId: string): Promise<PlacementRow[]> {
  const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserId);
  if (orderIds.size === 0) return [];
  const { data, error } = await supabase
    .from(PLACEMENTS_TABLE)
    .select("order_id, insertion_order_id_dsp, placement_id, start_date, end_date, impressions, cpm_adops, cpm_celtra, dark_days, per_day_impressions, dark_ranges, assigned_ranges")
    .in("order_id", Array.from(orderIds));
  if (error) return [];
  return (data ?? []) as PlacementRow[];
}

/** Fetch placements with insertion_order_id_dsp from placements table. Optionally filter by io, advertiser, and/or placement_id. */
export async function getPlacementsWithIoDsp(
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

/** Fetch distinct placement_id values for dashboard filter. Shows all placements (not just DSP-linked). Scoped by advertiser when provided. */
export async function getDistinctPlacementIdsForDashboard(
  advertiserId?: string | null
): Promise<{ id: string; label: string }[]> {
  const q = supabase
    .from(PLACEMENTS_TABLE)
    .select("placement_id, placement, order_id")
    .not("placement_id", "is", null)
    .neq("placement_id", "");
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

async function getInsertionOrderIdsForPlacementInner(
  placementId: string,
  advertiserId?: string | null
): Promise<string[]> {
  const pid = placementId?.trim();
  if (!pid) return [];

  let q = supabase
    .from(PLACEMENTS_TABLE)
    .select("insertion_order_id_dsp, order_id")
    .eq("placement_id", pid)
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");
  const { data, error } = await q;
  if (error) return [];
  let rows = (data ?? []) as { insertion_order_id_dsp: string | null; order_id: string }[];

  if (advertiserId && advertiserId.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserId.trim());
    if (orderIds.size === 0) return [];
    rows = rows.filter((r) => orderIds.has(r.order_id));
  }

  const set = new Set<string>();
  for (const r of rows) {
    const io = String(r.insertion_order_id_dsp ?? "").trim();
    if (io) set.add(io);
  }
  return Array.from(set).sort();
}

/** Fetch distinct insertion_order_id_dsp values for a placement. Cached 5 min. */
export async function getInsertionOrderIdsForPlacement(
  placementId: string,
  advertiserId?: string | null
): Promise<string[]> {
  const pid = placementId?.trim() ?? "";
  const advKey = advertiserId?.trim() ?? "";
  return unstable_cache(
    () => getInsertionOrderIdsForPlacementInner(placementId, advertiserId),
    ["placement-io-single", pid, advKey],
    { tags: [PLACEMENT_IO_CACHE_TAG, DASHBOARD_CACHE_TAG], revalidate: 300 }
  )();
}

async function getPlacementIoIdsForAllPlacementsInner(
  advertiserId?: string | null
): Promise<Record<string, string[]>> {
  let q = supabase
    .from(PLACEMENTS_TABLE)
    .select("placement_id, insertion_order_id_dsp, order_id")
    .not("placement_id", "is", null)
    .neq("placement_id", "")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "");
  const { data, error } = await q;
  if (error) return {};
  let rows = (data ?? []) as { placement_id: string | null; insertion_order_id_dsp: string | null; order_id: string }[];

  if (advertiserId?.trim()) {
    const orderIds = await getOrderIdsForAdvertiserWithIoDsp(advertiserId.trim());
    if (orderIds.size === 0) return {};
    rows = rows.filter((r) => orderIds.has(r.order_id));
  }

  const result: Record<string, string[]> = {};
  for (const r of rows) {
    const pid = String(r.placement_id ?? "").trim();
    const io = String(r.insertion_order_id_dsp ?? "").trim();
    if (!pid || !io) continue;
    if (!result[pid]) result[pid] = [];
    if (!result[pid].includes(io)) result[pid].push(io);
  }
  for (const arr of Object.values(result)) arr.sort();
  return result;
}

/** Fetch placement_id -> insertion_order_id_dsp[] for all placements. Cached 5 min. */
export async function getPlacementIoIdsForAllPlacements(
  advertiserId?: string | null
): Promise<Record<string, string[]>> {
  const advKey = advertiserId?.trim() ?? "";
  return unstable_cache(
    () => getPlacementIoIdsForAllPlacementsInner(advertiserId),
    ["placement-io-all", advKey],
    { tags: [PLACEMENT_IO_CACHE_TAG, DASHBOARD_CACHE_TAG], revalidate: 300 }
  )();
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

/** Sum perDay values by date within [startDay, endDay]. */
function sumPerDayByDay(perDay: Record<string, number>, startDay: Date, endDay: Date): Map<string, number> {
  const byDay = new Map<string, number>();
  const startMs = startDay.getTime();
  const endMs = endDay.getTime();
  for (const [dateStr, val] of Object.entries(perDay)) {
    const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
    if (!Number.isNaN(d.getTime()) && val > 0) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayStart >= startMs && dayStart <= endMs) {
        const norm = normalizeDateKey(dateStr);
        byDay.set(norm, (byDay.get(norm) ?? 0) + val);
      }
    }
  }
  return byDay;
}

function computeBookedByIoAndDay(
  placements: PlacementRow[],
  startDay: Date,
  endDay: Date
): Map<string, Map<string, number>> {
  const byIoAndDay = new Map<string, Map<string, number>>();
  const startStr = toDateStr(startDay);
  const endStr = toDateStr(endDay);

  for (const p of placements) {
    const key = placementGroupKey(p);
    if (!key) continue;

    const start = parseDate(p.start_date);
    const end = parseDate(p.end_date);
    if (!start || !end || end < start) continue;

    const darkDays = resolveDarkDays(p);
    const perDayImpressions = resolvePerDayImpressions(p);

    const pStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const pEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (pEnd < startDay || pStart > endDay) continue;

    const assignedSum = sumPerDayInRange(perDayImpressions, pStart, pEnd);
    const goal = assignedSum > 0 ? assignedSum : resolveImpressionsGoal(p);
    if (goal <= 0) continue;

    const bookedFull =
      assignedSum > 0
        ? sumPerDayByDay(perDayImpressions, pStart, pEnd)
        : allocateImpressionsByDay(pStart, pEnd, goal, darkDays, perDayImpressions);

    let ioDays = byIoAndDay.get(key);
    if (!ioDays) {
      ioDays = new Map();
      byIoAndDay.set(key, ioDays);
    }
    for (const [dateStr, val] of bookedFull) {
      if (dateStr >= startStr && dateStr <= endStr) {
        ioDays.set(dateStr, (ioDays.get(dateStr) ?? 0) + val);
      }
    }
  }
  return byIoAndDay;
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
      const mediaCost = Number(r.media_cost);
      const mediaFees = Number(r.media_fees);
      const celtraCost = Number(r.celtra_cost);
      const totalCost = mediaCost + mediaFees + celtraCost;
      return {
        yearMonth: r.year_month,
        sumImpressions: Number(r.booked_impressions),
        activeOrderCount: Number(r.active_order_count),
        placementCount,
        dataImpressions: Number(r.delivered_impressions),
        deliveredLines: Number(r.delivered_lines),
        mediaCost,
        mediaFees,
        celtraCost,
        totalCost: Math.round(totalCost * 100) / 100,
        bookedRevenue: Number(r.booked_revenue),
      };
    });
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

/** Get dashboard data. When placementIdFilter is set, computes on demand (cached by placement+io+advertiser). When cache is empty or has no DSP data, computes on demand so filter changes show data. */
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
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const advertiserOnly = !!advKey && !ioKey;
  const cached = await getDashboardDataFromCache(ioFilter, advertiserFilter);
  const hasDspData = cached.some((r) => r.dataImpressions > 0 || r.mediaCost > 0);
  if (!advertiserOnly && cached.length > 0 && hasDspData) return cached;
  const fresh = await computePlacementsWithDspAggregated(ioKey || undefined, advKey || undefined);
  if (fresh.length > 0 && fresh.some((r) => r.dataImpressions > 0 || r.mediaCost > 0)) {
    await upsertDashboardCache(ioKey, advKey, fresh);
  }
  return fresh.length > 0 ? fresh : cached;
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

  let sourceData: SourceData | null = null;
  if (dspSource?.id) {
    sourceData = await getSourceDataFilteredByIos(dspSource.id, "cr4fe_insertionordergid", allIos);
  }

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
        refreshAndStoreDashboardData(io || undefined, advertiser || undefined, sourceData ?? undefined)
      )
    );
  }

  revalidateTag(DASHBOARD_CACHE_TAG, "max");
  return { refreshed: toRefresh.length };
}

const APP_DATA_CACHE_TAG = "app-data";

/** Refresh only the current selection (io + advertiser, or placement-filtered). For quick test before full refresh. */
export async function refreshDashboardSelection(
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<{ refreshed: boolean }> {
  revalidateTag(APP_DATA_CACHE_TAG, "max");
  revalidateTag(PLACEMENT_IO_CACHE_TAG, "max");
  revalidateTag(LAST7_CACHE_TAG, "max");
  const placementKey = placementIdFilter?.trim();
  if (placementKey) {
    revalidateTag(DASHBOARD_CACHE_TAG, "max");
    return { refreshed: true };
  }
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const dspSource = await getSourceByType("DSP");
  let sourceData: SourceData | null = null;
  if (dspSource?.id && dspSource.entitySetName && dspSource.logicalName) {
    const ios = await getDistinctInsertionOrderIds(advKey || undefined);
    sourceData = await getSourceDataFilteredByIos(
      dspSource.id,
      "cr4fe_insertionordergid",
      ios,
      { entitySetName: dspSource.entitySetName!, logicalName: dspSource.logicalName! }
    );
  }
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

  let placements: PlacementRow[];
  if (placementKey) {
    placements = await getPlacementsByPlacementId(placementKey, advKey || undefined, ioKey || undefined);
    if (placements.length === 0) return [];
  } else if (advKey && !ioKey) {
    placements = await getPlacementsForAdvertiserAll(advKey);
  } else {
    placements = await getPlacementsWithIoDsp(ioKey || undefined, advKey || undefined, placementKey);
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

  const IO_FILTER_COL = "cr4fe_insertionordergid";
  let sourceData = preFetchedSourceData && preFetchedSourceData.rows.length > 0 ? preFetchedSourceData : null;
  if (!sourceData && ioIds.size > 0) {
    const dspSource = await getSourceByType("DSP");
    if (dspSource?.id && dspSource.entitySetName && dspSource.logicalName) {
      const realIos = Array.from(ioIds).filter((id) => !id.startsWith("_p:"));
      if (realIos.length > 0) {
        try {
          sourceData = await getSourceDataFilteredByIos(
            dspSource.id,
            IO_FILTER_COL,
            realIos,
            { entitySetName: dspSource.entitySetName!, logicalName: dspSource.logicalName! }
          );
        } catch (err) {
          console.error("[dashboard-dsp] Dataverse fetch error:", err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  if (sourceData && sourceData.rows.length > 0) {
    const dateCol = findColumn(sourceData.rows[0] as Record<string, unknown>, DATE_COLUMNS);
    const imprCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IMPRESSIONS_COLUMNS);
    const mediaCostCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_COST_COLUMNS);
    const advertiserCol = findColumn(sourceData.rows[0] as Record<string, unknown>, ADVERTISER_COLUMNS);
    const ioCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IO_SOURCE_COLUMNS);

    if (dateCol && imprCol && mediaCostCol && ioCol) {
  for (const row of sourceData.rows) {
    const r = row as Record<string, unknown>;
    const ioRaw = getVal(r, ioCol).trim();
    if (!ioRaw) continue;
    const ioParts = ioRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const io = ioParts.find((p) => ioIds.has(p)) ?? (ioIds.has(ioRaw) ? ioRaw : null);
    if (!io) continue;

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
    const advertiser = (advertiserCol ? getVal(r, advertiserCol) : "").trim();
    const feeMultiplier = MEDIA_FEES_BY_ADVERTISER[advertiser] ?? 1;
    agg.mediaFees += rowMediaCost * feeMultiplier;
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
      ioIdsInMonth.add(io);
      placementCountInMonth += placementCountByIoAndMonth.get(io)?.get(ym) ?? 0;
    }

    const totalCost = mediaCost + mediaFees + celtraCost;

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
  revalidateTag(LAST7_CACHE_TAG, "max");
  revalidateTag(PLACEMENT_IO_CACHE_TAG, "max");
}

export type Last7DaysRow = { date: string; bookedRevenue: number; totalCost: number; margin: number | null };

const LAST7_CACHE_TAG = "dashboard-last7";

/** Last 7 days (up to today) for a given yearMonth. Returns daily breakdown for Booked Revenue vs Total Cost tooltip. Cached 5 min. */
export async function getLast7DaysForMonth(
  yearMonth: string,
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<Last7DaysRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const placementKey = placementIdFilter?.trim() ?? "";
  return unstable_cache(
    () => getLast7DaysForMonthInner(yearMonth, ioKey || undefined, advKey || undefined, placementKey || undefined),
    ["dashboard-last7", yearMonth, ioKey, advKey, placementKey],
    { tags: [LAST7_CACHE_TAG, DASHBOARD_CACHE_TAG], revalidate: 300 }
  )();
}

async function getLast7DaysForMonthInner(
  yearMonth: string,
  ioFilter?: string,
  advertiserFilter?: string,
  placementIdFilter?: string
): Promise<Last7DaysRow[]> {
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, 1);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  if (yesterday < monthStart) return [];

  const rangeEnd = yesterday > monthEnd ? new Date(monthEnd) : new Date(yesterday);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - 6);
  if (rangeStart < monthStart) rangeStart.setTime(monthStart.getTime());

  const dayCount = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount <= 0) return [];

  return getDailyBreakdownInner(
    rangeStart,
    rangeEnd,
    dayCount,
    ioFilter,
    advertiserFilter,
    placementIdFilter
  );
}

/** Full month daily breakdown (days 1 through last of month). For side pane. Cached 5 min. */
export async function getDailyByMonth(
  yearMonth: string,
  ioFilter?: string | null,
  advertiserFilter?: string | null,
  placementIdFilter?: string | null
): Promise<Last7DaysRow[]> {
  const ioKey = ioFilter?.trim() ?? "";
  const advKey = advertiserFilter?.trim() ?? "";
  const placementKey = placementIdFilter?.trim() ?? "";
  return unstable_cache(
    () => getDailyByMonthInner(yearMonth, ioKey || undefined, advKey || undefined, placementKey || undefined),
    ["dashboard-daily-month", yearMonth, ioKey, advKey, placementKey],
    { tags: [LAST7_CACHE_TAG, DASHBOARD_CACHE_TAG], revalidate: 300 }
  )();
}

async function getDailyByMonthInner(
  yearMonth: string,
  ioFilter?: string,
  advertiserFilter?: string,
  placementIdFilter?: string
): Promise<Last7DaysRow[]> {
  const match = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, 1);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  if (yesterday < monthStart) return [];

  const rangeStart = monthStart;
  const rangeEnd = yesterday > monthEnd ? new Date(monthEnd) : new Date(yesterday);
  const dayCount = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount <= 0) return [];

  return getDailyBreakdownInner(
    rangeStart,
    rangeEnd,
    dayCount,
    ioFilter,
    advertiserFilter,
    placementIdFilter
  );
}

async function getDailyBreakdownInner(
  rangeStart: Date,
  rangeEnd: Date,
  dayCount: number,
  ioFilter?: string,
  advertiserFilter?: string,
  placementIdFilter?: string
): Promise<Last7DaysRow[]> {
  let placements: PlacementRow[];
  if (placementIdFilter) {
    placements = await getPlacementsByPlacementId(placementIdFilter, advertiserFilter || undefined, ioFilter || undefined);
    if (placements.length === 0) return [];
  } else if (advertiserFilter && !ioFilter) {
    placements = await getPlacementsForAdvertiserAll(advertiserFilter);
  } else {
    placements = await getPlacementsWithIoDsp(ioFilter || undefined, advertiserFilter || undefined, placementIdFilter);
  }
  if (placements.length === 0) return [];

  const bookedByIoAndDay = computeBookedByIoAndDay(placements, rangeStart, rangeEnd);
  const ioIds = new Set<string>();
  for (const p of placements) {
    const key = placementGroupKey(p);
    if (key) ioIds.add(key);
  }

  const ioToCpmAdops = new Map<string, number>();
  const ioToCpmCeltra = new Map<string, number>();
  for (const p of placements) {
    const key = placementGroupKey(p);
    if (!key) continue;
    if (!ioToCpmAdops.has(key)) ioToCpmAdops.set(key, parseNum(p.cpm_adops));
    if (!ioToCpmCeltra.has(key)) ioToCpmCeltra.set(key, parseNum(p.cpm_celtra));
  }

  type DayAgg = { delivered: number; mediaCost: number; mediaFees: number };
  const byDateIo = new Map<string, Map<string, DayAgg>>();

  const IO_FILTER_COL = "cr4fe_insertionordergid";
  let sourceData: SourceData | null = null;
  const realIos = Array.from(ioIds).filter((id) => !id.startsWith("_p:"));
  if (realIos.length > 0) {
    const dspSource = await getSourceByType("DSP");
    if (dspSource?.id && dspSource.entitySetName && dspSource.logicalName) {
      try {
        sourceData = await getSourceDataFilteredByIos(
          dspSource.id,
          IO_FILTER_COL,
          realIos,
          { entitySetName: dspSource.entitySetName!, logicalName: dspSource.logicalName! }
        );
      } catch {
        /* ignore */
      }
    }
  }

  const dateCol = sourceData?.rows?.[0] ? findColumn(sourceData.rows[0] as Record<string, unknown>, DATE_COLUMNS) : null;
  const imprCol = sourceData?.rows?.[0] ? findColumn(sourceData.rows[0] as Record<string, unknown>, IMPRESSIONS_COLUMNS) : null;
  const mediaCostCol = sourceData?.rows?.[0] ? findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_COST_COLUMNS) : null;
  const advertiserCol = sourceData?.rows?.[0] ? findColumn(sourceData.rows[0] as Record<string, unknown>, ADVERTISER_COLUMNS) : null;
  const ioCol = sourceData?.rows?.[0] ? findColumn(sourceData.rows[0] as Record<string, unknown>, IO_SOURCE_COLUMNS) : null;

  if (sourceData?.rows?.length && dateCol && imprCol && mediaCostCol && ioCol) {
    const rangeStartStr = toDateStr(rangeStart);
    const rangeEndStr = toDateStr(rangeEnd);
    for (const row of sourceData.rows) {
      const r = row as Record<string, unknown>;
      const dateVal = r[dateCol];
      const dateStr = parseDate(dateVal) ? toDateStr(parseDate(dateVal)!) : null;
      if (!dateStr || dateStr < rangeStartStr || dateStr > rangeEndStr) continue;

      const ioRaw = getVal(r, ioCol).trim();
      if (!ioRaw) continue;
      const ioParts = ioRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const io = ioParts.find((p) => ioIds.has(p)) ?? (ioIds.has(ioRaw) ? ioRaw : null);
      if (!io) continue;

      let byIo = byDateIo.get(dateStr);
      if (!byIo) {
        byIo = new Map();
        byDateIo.set(dateStr, byIo);
      }
      let agg = byIo.get(io);
      if (!agg) {
        agg = { delivered: 0, mediaCost: 0, mediaFees: 0 };
        byIo.set(io, agg);
      }
      const rowMediaCost = parseNum(r[mediaCostCol]);
      agg.delivered += Math.floor(parseNum(r[imprCol]));
      agg.mediaCost += rowMediaCost;
      const advertiser = (advertiserCol ? getVal(r, advertiserCol) : "").trim();
      agg.mediaFees += rowMediaCost * (MEDIA_FEES_BY_ADVERTISER[advertiser] ?? 1);
    }
  }

  const result: Last7DaysRow[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    let bookedRevenue = 0;
    let totalCost = 0;

    for (const io of ioIds) {
      const bookedImpr = bookedByIoAndDay.get(io)?.get(dateStr) ?? 0;
      const cpmAdops = ioToCpmAdops.get(io) ?? 0;
      bookedRevenue += (bookedImpr / 1000) * cpmAdops;

      const agg = byDateIo.get(dateStr)?.get(io) ?? { delivered: 0, mediaCost: 0, mediaFees: 0 };
      const cpmCeltra = ioToCpmCeltra.get(io) ?? 0;
      totalCost += agg.mediaCost + agg.mediaFees + (agg.delivered / 1000) * cpmCeltra;
    }

    const margin = bookedRevenue > 0 ? (100 * (bookedRevenue - totalCost)) / bookedRevenue : null;
    result.push({
      date: dateStr,
      bookedRevenue: Math.round(bookedRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      margin: margin != null ? Math.round(margin * 100) / 100 : null,
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
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

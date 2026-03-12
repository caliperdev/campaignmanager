"use server";

/**
 * Aggregate monitor metrics from order (Supabase) + source (Dataverse or dynamic table).
 * Left join: order.Insertion Order ID = source.cr4fe_insertionordergid.
 * Formulas per Leo's SQL:
 * - Booked impressions: order daily allocation (Impressions Goal spread across Start–End date range)
 * - Booked revenue = (booked impressions / 1000) * CPM
 * - Celtra cost = (delivered impressions / 1000) * CPM Celtra
 * - Total cost = media cost + celtra cost
 */
import { getOrder, getSource, getPlacementsForOrder } from "@/lib/tables";
import { getDynamicTableChunkWithCount } from "@/lib/tables";
import { fetchDataverseTableFull } from "@/lib/dataverse-source";
import { supabase } from "@/db";
import type { MonitorDisplayRow } from "@/lib/monitor-data";
import { allocateImpressionsByMonth } from "@/lib/placement-allocator";

// Schema adaptation: column names for Supabase dynamic tables + Dataverse (cr4fe_* custom entities)
const DATE_COLUMNS = ["cr4fe_date", "cr4fe_reportdate", "report_date", "report date", "reportdate", "ReportDate", "date"];
const IMPRESSIONS_COLUMNS = ["cr4fe_impressioncount", "cr4fe_impressions", "impressions", "impression_count", "impressioncount", "delivered_impressions"];
const MEDIA_COST_COLUMNS = ["cr4fe_totalmediacost", "total_media_cost", "totalmediacost", "media_cost", "mediacost"];
const IO_SOURCE_COLUMNS = ["cr4fe_insertionordergid", "cr4fe_insertionorderid", "insertion_order_gid", "insertion order gid", "InsertionOrderGID"];
const IO_ORDER_COLUMNS = ["Insertion Order ID", "insertion_order_id"];
const START_DATE_COLUMNS = ["Start Date", "start_date", "start date"];
const END_DATE_COLUMNS = ["End Date", "end_date", "end date"];
const IMPRESSIONS_GOAL_COLUMNS = ["Impressions Goal", "Impressions", "impressions_goal", "impressions goal", "impressions"];
const DARK_DAYS_COLUMNS = ["dark_days", "dark days", "Dark Days"];
const PER_DAY_IMPRESSIONS_COLUMNS = ["per_day_impressions", "per day impressions", "Per Day Impressions"];
const CPM_COLUMNS = ["CPM", "cpm"];
const CPM_CELTRA_COLUMNS = ["CPM Celtra", "cpm_celtra", "cpm celtra"];

type JoinConfig = { order: string; source: string };

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

function resolveColumn(row: Record<string, unknown>, colName: string): string | null {
  if (!colName) return null;
  const keys = Object.keys(row);
  const target = colName.toLowerCase().replace(/\s/g, "_");
  return (
    keys.find(
      (k) =>
        k.toLowerCase().replace(/\s/g, "_") === target ||
        k.toLowerCase().includes(target) ||
        target.includes(k.toLowerCase().replace(/\s/g, "_"))
    ) ?? null
  );
}

function autoDetectJoin(
  orderRows: Record<string, unknown>[],
  sourceRows: Record<string, unknown>[]
): JoinConfig | null {
  const oRow = orderRows[0];
  const sRow = sourceRows[0];
  if (!oRow || !sRow) return null;
  const orderCol = IO_ORDER_COLUMNS.map((c) => resolveColumn(oRow, c)).find(Boolean) ?? null;
  const sourceCol = IO_SOURCE_COLUMNS.map((c) => resolveColumn(sRow, c)).find(Boolean) ?? null;
  if (orderCol && sourceCol) return { order: orderCol, source: sourceCol };
  return null;
}

async function getJoinConfig(orderId: string, sourceId: string): Promise<JoinConfig | null> {
  const { data } = await supabase
    .from("monitor_column_mapping")
    .select("mapping")
    .eq("order_id", orderId)
    .eq("source_id", sourceId)
    .maybeSingle();
  const mapping = data?.mapping as { join?: JoinConfig } | null;
  return mapping?.join?.order && mapping?.join?.source ? mapping.join : null;
}

function applyLeftJoin(
  sourceRows: Record<string, unknown>[],
  orderRows: Record<string, unknown>[],
  joinConfig: JoinConfig
): Record<string, unknown>[] {
  const orderCol = orderRows[0] ? resolveColumn(orderRows[0], joinConfig.order) : null;
  const sourceCol = sourceRows[0] ? resolveColumn(sourceRows[0], joinConfig.source) : null;
  if (!orderCol || !sourceCol) return sourceRows;

  const orderIds = new Set<string>();
  for (const r of orderRows) {
    const v = r[orderCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    if (s) orderIds.add(s);
  }
  if (orderIds.size === 0) return sourceRows;

  return sourceRows.filter((r) => {
    const v = r[sourceCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    return s && orderIds.has(s);
  });
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

/** Parse date string to YYYY-MM. Handles ISO, /Date(ms)/, M/D/YYYY. */
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

/** Fetch all rows from a Supabase dynamic table (paginated). */
async function fetchAllSupabaseRows(tableName: string): Promise<Record<string, unknown>[]> {
  const PAGE = 2000;
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { rows, total } = await getDynamicTableChunkWithCount(tableName, offset, PAGE);
    for (const r of rows) {
      const obj: Record<string, unknown> = { ...r };
      delete obj.id;
      all.push(obj);
    }
    if (all.length >= total || rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Fetch all placements for an order (paginated). */
async function fetchAllPlacementsForOrder(orderId: string): Promise<Record<string, unknown>[]> {
  const PAGE = 2000;
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { rows, total } = await getPlacementsForOrder(orderId, offset, PAGE);
    for (const r of rows) {
      const obj: Record<string, unknown> = { ...r };
      delete obj.id;
      all.push(obj);
    }
    if (all.length >= total || rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
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

/**
 * Compute booked impressions by month per IO: spread Impressions Goal across order date range.
 * Excludes dark days; uses placement-allocator for allocation logic.
 * Returns Map<io, Map<yearMonth, booked>>.
 */
function computeBookedImpressionsByIoAndMonth(
  orderRows: Record<string, unknown>[],
  ioCol: string | null,
  startCol: string | null,
  endCol: string | null,
  goalCol: string | null,
  darkDaysCol: string | null,
  perDayImpressionsCol: string | null
): Map<string, Map<string, number>> {
  const byIoAndMonth = new Map<string, Map<string, number>>();
  if (!ioCol || !startCol || !endCol || !goalCol) return byIoAndMonth;

  for (const row of orderRows) {
    const io = String(row[ioCol] ?? "").trim();
    if (!io) continue;

    const start = parseDate(row[startCol]);
    const end = parseDate(row[endCol]);
    if (!start || !end || end < start) continue;

    const goal = parseInt(String(row[goalCol] ?? "0").replace(/[$,\s]/g, ""), 10) || 0;
    if (goal <= 0) continue;

    const darkDays = darkDaysCol ? parseDarkDays(row[darkDaysCol]) : [];
    const perDayImpressions = perDayImpressionsCol ? parsePerDayImpressions(row[perDayImpressionsCol]) : undefined;

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

/** Aggregate by month with full formulas: booked impressions, delivered, media cost, celtra cost, total cost, booked revenue. */
function aggregateByMonth(
  orderRows: Record<string, unknown>[],
  sourceRows: Record<string, unknown>[],
  joinConfig: JoinConfig
): MonitorDisplayRow[] {
  if (orderRows.length === 0) return [];

  const ioOrderCol = resolveColumn(orderRows[0], joinConfig.order);
  const ioSourceCol = sourceRows[0] ? resolveColumn(sourceRows[0], joinConfig.source) : null;
  const startCol = findColumn(orderRows[0], START_DATE_COLUMNS);
  const endCol = findColumn(orderRows[0], END_DATE_COLUMNS);
  const goalCol = findColumn(orderRows[0], IMPRESSIONS_GOAL_COLUMNS);
  const darkDaysCol = findColumn(orderRows[0], DARK_DAYS_COLUMNS);
  const perDayImpressionsCol = findColumn(orderRows[0], PER_DAY_IMPRESSIONS_COLUMNS);
  const cpmCol = findColumn(orderRows[0], CPM_COLUMNS);
  const cpmCeltraCol = findColumn(orderRows[0], CPM_CELTRA_COLUMNS);
  const dateCol = sourceRows[0] ? findColumn(sourceRows[0], DATE_COLUMNS) : null;
  const imprCol = sourceRows[0] ? findColumn(sourceRows[0], IMPRESSIONS_COLUMNS) : null;
  const mediaCostCol = sourceRows[0] ? findColumn(sourceRows[0], MEDIA_COST_COLUMNS) : null;

  if (!ioOrderCol) return [];
  if (sourceRows.length > 0 && (!ioSourceCol || !dateCol || !imprCol || !mediaCostCol)) return [];

  const bookedByIoAndMonth = computeBookedImpressionsByIoAndMonth(
    orderRows,
    ioOrderCol,
    startCol,
    endCol,
    goalCol,
    darkDaysCol,
    perDayImpressionsCol
  );

  const orderIds = new Set<string>();
  for (const r of orderRows) {
    const v = r[ioOrderCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    if (s) orderIds.add(s);
  }

  const ioToCpm = new Map<string, number>();
  const ioToCpmCeltra = new Map<string, number>();
  for (const r of orderRows) {
    const io = String(r[ioOrderCol] ?? "").trim();
    if (!io || ioToCpm.has(io)) continue;
    if (cpmCol) ioToCpm.set(io, parseNum(r[cpmCol]));
    if (cpmCeltraCol) ioToCpmCeltra.set(io, parseNum(r[cpmCeltraCol]));
  }

  const byMonthIo = new Map<string, Map<string, { delivered: number; mediaCost: number }>>();

  if (ioSourceCol && dateCol && imprCol && mediaCostCol) {
    for (const row of sourceRows) {
      const io = String(row[ioSourceCol] ?? "").trim();
      if (!io || !orderIds.has(io)) continue;

      const dateVal = row[dateCol];
      const ym = parseYearMonth(dateVal);
      if (!ym) continue;

      let byIo = byMonthIo.get(ym);
      if (!byIo) {
        byIo = new Map();
        byMonthIo.set(ym, byIo);
      }

      let agg = byIo.get(io);
      if (!agg) {
        agg = { delivered: 0, mediaCost: 0 };
        byIo.set(io, agg);
      }

      agg.delivered += Math.floor(parseNum(row[imprCol]));
      agg.mediaCost += parseNum(row[mediaCostCol]);
    }
  }

  const byMonth = new Map<
    string,
    {
      bookedImpr: number;
      deliveredImpr: number;
      mediaCost: number;
      celtraCost: number;
      totalCost: number;
      bookedRevenue: number;
      ioIds: Set<string>;
    }
  >();

  const allMonths = new Set<string>(byMonthIo.keys());
  for (const ioMonths of bookedByIoAndMonth.values()) {
    for (const ym of ioMonths.keys()) {
      if (orderIds.size > 0) allMonths.add(ym);
    }
  }

  for (const ym of allMonths) {
    const byIo = byMonthIo.get(ym) ?? new Map();
    let bookedImpr = 0;
    let deliveredImpr = 0;
    let mediaCost = 0;
    let celtraCost = 0;
    let bookedRevenue = 0;
    const ioIds = new Set<string>();

    for (const io of orderIds) {
      const agg = byIo.get(io) ?? { delivered: 0, mediaCost: 0 };
      const cpm = ioToCpm.get(io) ?? 0;
      const cpmCeltra = ioToCpmCeltra.get(io) ?? 0;
      const bookedForIo = bookedByIoAndMonth.get(io)?.get(ym) ?? 0;

      bookedImpr += bookedForIo;
      deliveredImpr += agg.delivered;
      mediaCost += agg.mediaCost;
      celtraCost += agg.delivered / 1000 * cpmCeltra;
      bookedRevenue += (bookedForIo / 1000) * cpm;
      if (agg.delivered > 0 || bookedForIo > 0) ioIds.add(io);
    }

    byMonth.set(ym, {
      bookedImpr,
      deliveredImpr,
      mediaCost,
      celtraCost,
      totalCost: mediaCost + celtraCost,
      bookedRevenue,
      ioIds,
    });
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([yearMonth, e]) => ({
      yearMonth,
      sumImpressions: Math.floor(e.bookedImpr),
      activeOrderCount: orderIds.size > 0 ? 1 : 0,
      dataImpressions: Math.floor(e.deliveredImpr),
      deliveredLines: e.ioIds.size,
      mediaCost: Math.round(e.mediaCost * 100) / 100,
      mediaFees: 0,
      celtraCost: Math.round(e.celtraCost * 100) / 100,
      totalCost: Math.round(e.totalCost * 100) / 100,
      bookedRevenue: Math.round(e.bookedRevenue * 100) / 100,
    }));
}

export async function aggregateMonitorFromOrderAndSource(
  orderId: string,
  sourceId: string
): Promise<MonitorDisplayRow[]> {
  const [order, source] = await Promise.all([getOrder(orderId), getSource(sourceId)]);

  if (!order || !source) return [];

  let sourceRows: Record<string, unknown>[] = [];
  let orderRows: Record<string, unknown>[] = [];

  if (source.entitySetName && source.logicalName) {
    try {
      const chunk = await fetchDataverseTableFull(source.entitySetName, source.logicalName);
      sourceRows = chunk.rows.map((r) => ({ ...r } as Record<string, unknown>));
    } catch {
      return [];
    }
  } else if (source.dynamicTableName) {
    sourceRows = await fetchAllSupabaseRows(source.dynamicTableName);
  }

  if (order.dynamicTableName) {
    orderRows = await fetchAllSupabaseRows(order.dynamicTableName);
  } else {
    orderRows = await fetchAllPlacementsForOrder(orderId);
  }

  let joinConfig = await getJoinConfig(orderId, sourceId);
  if (!joinConfig && sourceRows.length > 0 && orderRows.length > 0) {
    joinConfig = autoDetectJoin(orderRows, sourceRows);
  }

  const filteredSourceRows =
    joinConfig && sourceRows.length > 0 && orderRows.length > 0
      ? applyLeftJoin(sourceRows, orderRows, joinConfig)
      : sourceRows;

  if (!joinConfig) return [];

  return aggregateByMonth(orderRows, filteredSourceRows, joinConfig);
}

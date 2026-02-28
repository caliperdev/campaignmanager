"use server";

/**
 * Aggregate monitor metrics from campaign (Supabase) + source (Dataverse or CSV).
 * Left join: campaign.Insertion Order ID = source.cr4fe_insertionordergid.
 * Formulas per Leo's SQL:
 * - Booked impressions: campaign daily allocation (Impressions Goal spread across Start–End date range)
 * - Booked revenue = (booked impressions / 1000) * CPM
 * - Celtra cost = (delivered impressions / 1000) * CPM Celtra
 * - Total cost = media cost + celtra cost
 */
import { getCampaign, getSource } from "@/lib/tables";
import { getDynamicTableChunkWithCount } from "@/lib/tables";
import { fetchDataverseTableFull } from "@/lib/dataverse-source";
import { supabase } from "@/db";
import type { MonitorDisplayRow } from "@/lib/monitor-data";

// Schema adaptation: column names for Supabase dynamic tables + Dataverse (cr4fe_* custom entities)
const DATE_COLUMNS = ["cr4fe_date", "cr4fe_reportdate", "report_date", "report date", "reportdate", "ReportDate", "date"];
const IMPRESSIONS_COLUMNS = ["cr4fe_impressioncount", "cr4fe_impressions", "impressions", "impression_count", "impressioncount", "delivered_impressions"];
const MEDIA_COST_COLUMNS = ["cr4fe_totalmediacost", "total_media_cost", "totalmediacost", "media_cost", "mediacost"];
const IO_SOURCE_COLUMNS = ["cr4fe_insertionordergid", "cr4fe_insertionorderid", "insertion_order_gid", "insertion order gid", "InsertionOrderGID"];
const IO_CAMPAIGN_COLUMNS = ["Insertion Order ID", "insertion_order_id"];
const START_DATE_COLUMNS = ["Start Date", "start_date", "start date"];
const END_DATE_COLUMNS = ["End Date", "end_date", "end date"];
const IMPRESSIONS_GOAL_COLUMNS = ["Impressions Goal", "impressions_goal", "impressions goal"];
const CPM_COLUMNS = ["CPM", "cpm"];
const CPM_CELTRA_COLUMNS = ["CPM Celtra", "cpm_celtra", "cpm celtra"];

type JoinConfig = { campaign: string; source: string };

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
  campaignRows: Record<string, unknown>[],
  sourceRows: Record<string, unknown>[]
): JoinConfig | null {
  const cRow = campaignRows[0];
  const sRow = sourceRows[0];
  if (!cRow || !sRow) return null;
  const campaignCol = IO_CAMPAIGN_COLUMNS.map((c) => resolveColumn(cRow, c)).find(Boolean) ?? null;
  const sourceCol = IO_SOURCE_COLUMNS.map((c) => resolveColumn(sRow, c)).find(Boolean) ?? null;
  if (campaignCol && sourceCol) return { campaign: campaignCol, source: sourceCol };
  return null;
}

async function getJoinConfig(campaignId: string, sourceId: string): Promise<JoinConfig | null> {
  const { data } = await supabase
    .from("monitor_column_mapping")
    .select("mapping")
    .eq("campaign_id", campaignId)
    .eq("source_id", sourceId)
    .maybeSingle();
  const mapping = data?.mapping as { join?: JoinConfig } | null;
  return mapping?.join?.campaign && mapping?.join?.source ? mapping.join : null;
}

function applyLeftJoin(
  sourceRows: Record<string, unknown>[],
  campaignRows: Record<string, unknown>[],
  joinConfig: JoinConfig
): Record<string, unknown>[] {
  const campaignCol = campaignRows[0] ? resolveColumn(campaignRows[0], joinConfig.campaign) : null;
  const sourceCol = sourceRows[0] ? resolveColumn(sourceRows[0], joinConfig.source) : null;
  if (!campaignCol || !sourceCol) return sourceRows;

  const campaignIds = new Set<string>();
  for (const r of campaignRows) {
    const v = r[campaignCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    if (s) campaignIds.add(s);
  }
  if (campaignIds.size === 0) return sourceRows;

  return sourceRows.filter((r) => {
    const v = r[sourceCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    return s && campaignIds.has(s);
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

function toYearMonth(d: Date): string {
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

/**
 * Compute booked impressions by month per IO: spread Impressions Goal across campaign date range.
 * Returns Map<io, Map<yearMonth, booked>>.
 */
function computeBookedImpressionsByIoAndMonth(
  campaignRows: Record<string, unknown>[],
  ioCol: string | null,
  startCol: string | null,
  endCol: string | null,
  goalCol: string | null
): Map<string, Map<string, number>> {
  const byIoAndMonth = new Map<string, Map<string, number>>();
  if (!ioCol || !startCol || !endCol || !goalCol) return byIoAndMonth;

  for (const row of campaignRows) {
    const io = String(row[ioCol] ?? "").trim();
    if (!io) continue;

    const start = parseDate(row[startCol]);
    const end = parseDate(row[endCol]);
    if (!start || !end || end < start) continue;

    const goal = parseInt(String(row[goalCol] ?? "0").replace(/[$,\s]/g, ""), 10) || 0;
    if (goal <= 0) continue;

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const totalDays = Math.max(1, Math.ceil((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const dailyBase = Math.floor(goal / totalDays);
    const remainder = goal - dailyBase * totalDays;

    let ioMonths = byIoAndMonth.get(io);
    if (!ioMonths) {
      ioMonths = new Map();
      byIoAndMonth.set(io, ioMonths);
    }

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDay);
      d.setDate(d.getDate() + i);
      const ym = toYearMonth(d);
      const daily = dailyBase + (i === totalDays - 1 ? remainder : 0);
      ioMonths.set(ym, (ioMonths.get(ym) ?? 0) + daily);
    }
  }
  return byIoAndMonth;
}

/** Aggregate by month with full formulas: booked impressions, delivered, media cost, celtra cost, total cost, booked revenue. */
function aggregateByMonth(
  campaignRows: Record<string, unknown>[],
  sourceRows: Record<string, unknown>[],
  joinConfig: JoinConfig
): MonitorDisplayRow[] {
  if (campaignRows.length === 0) return [];

  const ioCampaignCol = resolveColumn(campaignRows[0], joinConfig.campaign);
  const ioSourceCol = sourceRows[0] ? resolveColumn(sourceRows[0], joinConfig.source) : null;
  const startCol = findColumn(campaignRows[0], START_DATE_COLUMNS);
  const endCol = findColumn(campaignRows[0], END_DATE_COLUMNS);
  const goalCol = findColumn(campaignRows[0], IMPRESSIONS_GOAL_COLUMNS);
  const cpmCol = findColumn(campaignRows[0], CPM_COLUMNS);
  const cpmCeltraCol = findColumn(campaignRows[0], CPM_CELTRA_COLUMNS);
  const dateCol = sourceRows[0] ? findColumn(sourceRows[0], DATE_COLUMNS) : null;
  const imprCol = sourceRows[0] ? findColumn(sourceRows[0], IMPRESSIONS_COLUMNS) : null;
  const mediaCostCol = sourceRows[0] ? findColumn(sourceRows[0], MEDIA_COST_COLUMNS) : null;

  if (!ioCampaignCol) return [];
  if (sourceRows.length > 0 && (!ioSourceCol || !dateCol || !imprCol || !mediaCostCol)) return [];

  const bookedByIoAndMonth = computeBookedImpressionsByIoAndMonth(
    campaignRows,
    ioCampaignCol,
    startCol,
    endCol,
    goalCol
  );

  const campaignIds = new Set<string>();
  for (const r of campaignRows) {
    const v = r[ioCampaignCol];
    const s = v != null && v !== "" ? String(v).trim() : "";
    if (s) campaignIds.add(s);
  }

  const ioToCpm = new Map<string, number>();
  const ioToCpmCeltra = new Map<string, number>();
  for (const r of campaignRows) {
    const io = String(r[ioCampaignCol] ?? "").trim();
    if (!io || ioToCpm.has(io)) continue;
    if (cpmCol) ioToCpm.set(io, parseNum(r[cpmCol]));
    if (cpmCeltraCol) ioToCpmCeltra.set(io, parseNum(r[cpmCeltraCol]));
  }

  const byMonthIo = new Map<string, Map<string, { delivered: number; mediaCost: number }>>();

  if (ioSourceCol && dateCol && imprCol && mediaCostCol) {
    for (const row of sourceRows) {
      const io = String(row[ioSourceCol] ?? "").trim();
      if (!io || !campaignIds.has(io)) continue;

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

      agg.delivered += parseNum(row[imprCol]);
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
      if (campaignIds.size > 0) allMonths.add(ym);
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

    for (const io of campaignIds) {
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
      sumImpressions: e.bookedImpr,
      activeCampaignCount: campaignIds.size > 0 ? 1 : 0,
      dataImpressions: e.deliveredImpr,
      deliveredLines: e.ioIds.size,
      mediaCost: Math.round(e.mediaCost * 100) / 100,
      mediaFees: 0,
      celtraCost: Math.round(e.celtraCost * 100) / 100,
      totalCost: Math.round(e.totalCost * 100) / 100,
      bookedRevenue: Math.round(e.bookedRevenue * 100) / 100,
    }));
}

export async function aggregateMonitorFromCampaignAndSource(
  campaignId: string,
  sourceId: string
): Promise<MonitorDisplayRow[]> {
  const [campaign, source] = await Promise.all([getCampaign(campaignId), getSource(sourceId)]);

  if (!campaign || !source) return [];

  let sourceRows: Record<string, unknown>[] = [];
  let campaignRows: Record<string, unknown>[] = [];

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

  if (campaign.dynamicTableName) {
    campaignRows = await fetchAllSupabaseRows(campaign.dynamicTableName);
  }

  let joinConfig = await getJoinConfig(campaignId, sourceId);
  if (!joinConfig && sourceRows.length > 0 && campaignRows.length > 0) {
    joinConfig = autoDetectJoin(campaignRows, sourceRows);
  }

  const filteredSourceRows =
    joinConfig && sourceRows.length > 0 && campaignRows.length > 0
      ? applyLeftJoin(sourceRows, campaignRows, joinConfig)
      : sourceRows;

  if (!joinConfig) return [];

  return aggregateByMonth(campaignRows, filteredSourceRows, joinConfig);
}

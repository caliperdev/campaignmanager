"use server";

import { supabase } from "@/db";
import {
  CAMPAIGNS_TABLE,
  type CustomRange,
  rowToCampaign,
  campaignToInsert,
  campaignToUpdate,
} from "@/db/schema";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import { clearAllTablesColumnHeadersAndLinks } from "@/lib/table-actions";

const APP_DATA_TAG = "app-data";

function invalidateAppData() {
  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
}

export async function getCampaigns() {
  const { data, error } = await supabase.from(CAMPAIGNS_TABLE).select("*").order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCampaign);
}

export async function getCampaign(id: number) {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToCampaign(data) : null;
}

/** Get campaigns by ids (order not guaranteed; use sort_order from table_campaigns if needed). */
export async function getCampaignsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("*")
    .in("id", ids)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCampaign);
}

function parseCustomRanges(raw: string | null): unknown[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Payload from form. csvData = full Relevant+ row; name/startDate/endDate/impressionsGoal derived or explicit. */
type CampaignSavePayload = {
  name: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode?: "even" | "custom";
  customRanges?: CustomRange[] | null;
  /** Full CSV row (Relevant+ columns); stored as campaigns.csvData. */
  csvData?: Record<string, string> | null;
};

function validateCampaignPayload(data: CampaignSavePayload) {
  if (!data.startDate || !data.endDate) {
    throw new Error("Start date and end date are required.");
  }
  if (data.startDate > data.endDate) {
    throw new Error("Start date must be before or equal to end date.");
  }
  if (typeof data.impressionsGoal !== "number" || data.impressionsGoal < 0 || !Number.isInteger(data.impressionsGoal)) {
    throw new Error("Impressions goal is required and must be a non-negative whole number.");
  }
}

type CreateCampaignOptions = {
  returnToTableId?: string;
};

export async function createCampaign(
  data: CampaignSavePayload,
  options?: CreateCampaignOptions
): Promise<{ newId: number } | void> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  validateCampaignPayload(data);
  const insertRow = campaignToInsert({
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    impressionsGoal: data.impressionsGoal,
    distributionMode: data.distributionMode ?? "even",
    customRanges: data.customRanges != null ? JSON.stringify(data.customRanges) : null,
    csvData: data.csvData != null ? JSON.stringify(data.csvData) : "{}",
  });
  const { data: inserted, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  invalidateAppData();
  if (options?.returnToTableId) {
    return { newId: inserted.id };
  }
  redirect(`/campaign/${inserted.id}`);
}

export async function updateCampaign(
  id: number,
  data: CampaignSavePayload,
  options?: { returnTo?: string }
) {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  validateCampaignPayload(data);
  const updateRow = campaignToUpdate({
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    impressionsGoal: data.impressionsGoal,
    distributionMode: data.distributionMode ?? "even",
    customRanges: data.customRanges != null ? JSON.stringify(data.customRanges) : null,
    ...(data.csvData != null && { csvData: JSON.stringify(data.csvData) }),
  });
  const { error } = await supabase.from(CAMPAIGNS_TABLE).update(updateRow).eq("id", id);
  if (error) throw new Error(error.message);
  invalidateAppData();
  if (options?.returnTo) {
    redirect(options.returnTo);
  }
  redirect("/");
}

export async function deleteCampaign(id: number) {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  invalidateAppData();
  redirect("/");
}

/** Delete multiple campaigns by id; does not redirect. */
export async function deleteCampaigns(ids: number[]) {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  if (ids.length === 0) return;
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().in("id", ids);
  if (error) throw new Error(error.message);
  invalidateAppData();
}

export async function updateCampaignNotes(id: number, notes: Record<string, string>) {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const cleaned: Record<string, string> = {};
  for (const [date, text] of Object.entries(notes)) {
    const trimmed = text.trim();
    if (trimmed) cleaned[date] = trimmed;
  }
  const { error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update({ notes: JSON.stringify(cleaned), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  invalidateAppData();
}

/** Update only csv_data for a campaign (e.g. inline table edit). No redirect. */
export async function updateCampaignCsvData(id: number, csvData: Record<string, string>): Promise<void> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update({ csv_data: JSON.stringify(csvData), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  invalidateAppData();
}

export async function resetAllCampaigns() {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().gt("id", 0);
  if (error) throw new Error(error.message);
  const ok = await clearAllTablesColumnHeadersAndLinks();
  if (!ok) throw new Error("Failed to clear table column headers and links");
  invalidateAppData();
}

/** Pivot: list of dates from 2025-01-01 to today; columns = Date + one per campaign (Impressions; blank if outside flight, 0 if dark). If campaignIds is provided, only those campaigns are included. */
export async function getExportCsvPivot(campaignIds?: number[]): Promise<string> {
  let list = await getCampaigns();
  if (campaignIds != null && campaignIds.length > 0) {
    const idSet = new Set(campaignIds);
    list = list.filter((c) => idSet.has(c.id));
  }
  const start = new Date(2025, 0, 1);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  function escapeCsv(val: string | number): string {
    const s = String(val);
    if (s === "") return "";
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function daysInRange(startIso: string, endIso: string): number {
    const a = new Date(startIso);
    const b = new Date(endIso);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }

  function dateInRange(dateIso: string, startIso: string, endIso: string): boolean {
    return dateIso >= startIso && dateIso <= endIso;
  }

  type CampaignExport = {
    name: string;
    startDate: string;
    endDate: string;
    impressionsGoal: number;
    distributionMode: string;
    customRanges: CustomRange[];
  };

  const campaignsExport: CampaignExport[] = list.map((c) => ({
    name: c.name ?? "",
    startDate: c.startDate,
    endDate: c.endDate,
    impressionsGoal: c.impressionsGoal ?? 0,
    distributionMode: c.distributionMode ?? "even",
    customRanges: parseCustomRanges(c.customRanges) as CustomRange[],
  }));

  const headers = ["Date", ...campaignsExport.map((c) => escapeCsv(c.name))];
  const rows: string[][] = [headers];

  /** For custom mode: which dates in [start,end] are dark (no impressions). */
  function getDarkDates(c: CampaignExport): Set<string> {
    const dark = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return dark;
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      for (const r of c.customRanges) {
        if ("isDark" in r && r.isDark && dateInRange(dateIso, r.startDate, r.endDate)) {
          dark.add(dateIso);
          break;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return dark;
  }

  /** For custom mode: which dates fall in any custom range (for "uncovered" remainder). */
  function getDatesInAnyRange(c: CampaignExport): Set<string> {
    const covered = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return covered;
    for (const r of c.customRanges) {
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        covered.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return covered;
  }

  /**
   * Custom mode: (1) allocate each range's impressionsGoal evenly over that range's days;
   * (2) allocate remaining (campaign goal minus sum of range goals) evenly over uncovered days.
   */
  function getImpressionsByDate(c: CampaignExport): Map<string, number> {
    const map = new Map<string, number>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return map;

    let totalAllocatedInRanges = 0;

    for (const r of c.customRanges) {
      if ("isDark" in r && r.isDark) continue;
      if (!("impressionsGoal" in r) || typeof r.impressionsGoal !== "number") continue;
      const days = daysInRange(r.startDate, r.endDate);
      if (days <= 0) continue;
      const goal = r.impressionsGoal;
      totalAllocatedInRanges += goal;
      const basePerDay = Math.floor(goal / days);
      const remainder = goal - basePerDay * days;
      const rangeDates: string[] = [];
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        rangeDates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
      rangeDates.forEach((dateIso, i) => {
        map.set(dateIso, basePerDay + (i === rangeDates.length - 1 ? remainder : 0));
      });
    }

    const datesInRanges = getDatesInAnyRange(c);
    const darkDates = getDarkDates(c);
    const uncovered: string[] = [];
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      if (!datesInRanges.has(dateIso) && !darkDates.has(dateIso)) uncovered.push(dateIso);
      d.setDate(d.getDate() + 1);
    }

    const remaining = Math.max(0, c.impressionsGoal - totalAllocatedInRanges);
    if (remaining > 0 && uncovered.length > 0) {
      const basePerDay = Math.floor(remaining / uncovered.length);
      const remainderDays = remaining - basePerDay * uncovered.length;
      uncovered.forEach((dateIso, i) => {
        const isLast = i === uncovered.length - 1;
        map.set(dateIso, basePerDay + (isLast ? remainderDays : 0));
      });
    }

    return map;
  }

  const customImpressionsMap = new Map<number, Map<string, number>>();
  campaignsExport.forEach((c, idx) => {
    if (c.distributionMode === "custom" && c.customRanges?.length) {
      customImpressionsMap.set(idx, getImpressionsByDate(c));
    }
  });

  for (const dateIso of dates) {
    const row: (string | number)[] = [dateIso];
    for (let ci = 0; ci < campaignsExport.length; ci++) {
      const c = campaignsExport[ci];
      if (dateIso < c.startDate || dateIso > c.endDate) {
        row.push("");
        continue;
      }
      let impressions = 0;
      if (c.distributionMode === "even") {
        const days = daysInRange(c.startDate, c.endDate);
        if (days > 0) {
          const basePerDay = Math.floor(c.impressionsGoal / days);
          const remainder = c.impressionsGoal - basePerDay * days;
          impressions = dateIso === c.endDate ? basePerDay + remainder : basePerDay;
        }
      } else {
        const darkDates = getDarkDates(c);
        if (darkDates.has(dateIso)) {
          impressions = 0;
        } else {
          const precomputed = customImpressionsMap.get(ci);
          impressions = precomputed?.get(dateIso) ?? 0;
        }
      }
      row.push(impressions);
    }
    rows.push(
      row.map((v) =>
        v === ""
          ? ""
          : escapeCsv(typeof v === "number" ? v.toLocaleString("en-US") : v)
      )
    );
  }

  return rows.map((r) => r.join(",")).join("\n");
}

/** Long-format pivot: Date, Insertion Order ID, Daily allocated impressions goal. 0 for dark days, empty outside flight. Date range = min start to max end across selected campaigns. */
export async function getExportCsvPivotByIo(campaignIds?: number[]): Promise<string> {
  let list = await getCampaigns();
  if (campaignIds != null && campaignIds.length > 0) {
    const idSet = new Set(campaignIds);
    list = list.filter((c) => idSet.has(c.id));
  }
  if (list.length === 0) {
    return "Date,Insertion Order ID,Daily Allocated Impressions Goal\n";
  }

  const startDates = list.map((c) => c.startDate);
  const endDates = list.map((c) => c.endDate);
  const rangeStart = startDates.reduce((a, b) => (a < b ? a : b));
  const rangeEnd = endDates.reduce((a, b) => (a > b ? a : b));

  const dates: string[] = [];
  const d = new Date(rangeStart);
  const end = new Date(rangeEnd);
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  function escapeCsv(val: string | number): string {
    const s = String(val);
    if (s === "") return "";
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function daysInRange(startIso: string, endIso: string): number {
    const a = new Date(startIso);
    const b = new Date(endIso);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }

  function dateInRange(dateIso: string, startIso: string, endIso: string): boolean {
    return dateIso >= startIso && dateIso <= endIso;
  }

  type CampaignExport = {
    insertionOrderId: string;
    startDate: string;
    endDate: string;
    impressionsGoal: number;
    distributionMode: string;
    customRanges: CustomRange[];
  };

  function parseCsvData(c: { csvData: string }): Record<string, string> {
    try {
      return (JSON.parse(c.csvData ?? "{}") as Record<string, string>) ?? {};
    } catch {
      return {};
    }
  }

  const campaignsExport: CampaignExport[] = list.map((c) => {
    const csvData = parseCsvData(c);
    return {
      insertionOrderId: (csvData["Insertion Order ID"] ?? c.name ?? String(c.id)).trim() || String(c.id),
      startDate: c.startDate,
      endDate: c.endDate,
      impressionsGoal: c.impressionsGoal ?? 0,
      distributionMode: c.distributionMode ?? "even",
      customRanges: parseCustomRanges(c.customRanges) as CustomRange[],
    };
  });

  function getDarkDates(c: CampaignExport): Set<string> {
    const dark = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return dark;
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      for (const r of c.customRanges) {
        if ("isDark" in r && r.isDark && dateInRange(dateIso, r.startDate, r.endDate)) {
          dark.add(dateIso);
          break;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return dark;
  }

  function getDatesInAnyRange(c: CampaignExport): Set<string> {
    const covered = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return covered;
    for (const r of c.customRanges) {
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        covered.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return covered;
  }

  function getImpressionsByDate(c: CampaignExport): Map<string, number> {
    const map = new Map<string, number>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return map;

    let totalAllocatedInRanges = 0;

    for (const r of c.customRanges) {
      if ("isDark" in r && r.isDark) continue;
      if (!("impressionsGoal" in r) || typeof r.impressionsGoal !== "number") continue;
      const days = daysInRange(r.startDate, r.endDate);
      if (days <= 0) continue;
      const goal = r.impressionsGoal;
      totalAllocatedInRanges += goal;
      const basePerDay = Math.floor(goal / days);
      const remainder = goal - basePerDay * days;
      const rangeDates: string[] = [];
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        rangeDates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
      rangeDates.forEach((dateIso, i) => {
        map.set(dateIso, basePerDay + (i === rangeDates.length - 1 ? remainder : 0));
      });
    }

    const datesInRanges = getDatesInAnyRange(c);
    const darkDates = getDarkDates(c);
    const uncovered: string[] = [];
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      if (!datesInRanges.has(dateIso) && !darkDates.has(dateIso)) uncovered.push(dateIso);
      d.setDate(d.getDate() + 1);
    }

    const remaining = Math.max(0, c.impressionsGoal - totalAllocatedInRanges);
    if (remaining > 0 && uncovered.length > 0) {
      const basePerDay = Math.floor(remaining / uncovered.length);
      const remainderDays = remaining - basePerDay * uncovered.length;
      uncovered.forEach((dateIso, i) => {
        const isLast = i === uncovered.length - 1;
        map.set(dateIso, basePerDay + (isLast ? remainderDays : 0));
      });
    }

    return map;
  }

  const customImpressionsMap = new Map<number, Map<string, number>>();
  campaignsExport.forEach((c, idx) => {
    if (c.distributionMode === "custom" && c.customRanges?.length) {
      customImpressionsMap.set(idx, getImpressionsByDate(c));
    }
  });

  const rows: string[][] = [["Date", "Insertion Order ID", "Daily Allocated Impressions Goal"]];

  for (const dateIso of dates) {
    for (let ci = 0; ci < campaignsExport.length; ci++) {
      const c = campaignsExport[ci];
      const inFlight = dateInRange(dateIso, c.startDate, c.endDate);
      let value: string;
      if (!inFlight) {
        value = "";
      } else {
        const darkDates = getDarkDates(c);
        if (darkDates.has(dateIso)) {
          value = "0";
        } else if (c.distributionMode === "even") {
          const days = daysInRange(c.startDate, c.endDate);
          if (days <= 0) {
            value = "0";
          } else {
            const basePerDay = Math.floor(c.impressionsGoal / days);
            const remainder = c.impressionsGoal - basePerDay * days;
            const impressions = dateIso === c.endDate ? basePerDay + remainder : basePerDay;
            value = String(impressions);
          }
        } else {
          const precomputed = customImpressionsMap.get(ci);
          value = String(precomputed?.get(dateIso) ?? 0);
        }
      }
      rows.push([
        dateIso,
        escapeCsv(c.insertionOrderId),
        value === "" ? "" : value,
      ]);
    }
  }

  return rows.map((r) => r.join(",")).join("\n");
}

/** Aggregate daily impressions by year-month. Data from campaigns only (optionally filtered by campaignIds or tableId). */
export type ImpressionsByYearMonthRow = {
  yearMonth: string;
  sumImpressions: number;
  /** Number of campaigns active in that year-month (at least one day in flight). */
  activeCampaignCount: number;
  /** Sum of impressions goals of all campaigns active in that year-month. */
  sumGoal: number;
};

export async function getImpressionsByYearMonth(options?: {
  campaignIds?: number[];
  tableId?: string;
}): Promise<{ rows: ImpressionsByYearMonthRow[]; totalUniqueCampaignCount: number }> {
  let list = await getCampaigns();
  if (options?.campaignIds != null && options.campaignIds.length > 0) {
    const idSet = new Set(options.campaignIds);
    list = list.filter((c) => idSet.has(c.id));
  } else if (options?.tableId) {
    const { getCampaignIdsForTable } = await import("@/lib/tables");
    const ids = await getCampaignIdsForTable(options.tableId);
    if (ids.length > 0) {
      const idSet = new Set(ids);
      list = list.filter((c) => idSet.has(c.id));
    }
  }
  if (list.length === 0) return { rows: [], totalUniqueCampaignCount: 0 };

  function daysInRange(startIso: string, endIso: string): number {
    const a = new Date(startIso);
    const b = new Date(endIso);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }
  function dateInRange(dateIso: string, startIso: string, endIso: string): boolean {
    return dateIso >= startIso && dateIso <= endIso;
  }
  type CExp = {
    startDate: string;
    endDate: string;
    impressionsGoal: number;
    distributionMode: string;
    customRanges: CustomRange[];
  };
  const campaignsExport: CExp[] = list.map((c) => ({
    startDate: c.startDate,
    endDate: c.endDate,
    impressionsGoal: c.impressionsGoal ?? 0,
    distributionMode: c.distributionMode ?? "even",
    customRanges: parseCustomRanges(c.customRanges) as CustomRange[],
  }));

  function getDarkDates(c: CExp): Set<string> {
    const dark = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return dark;
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      for (const r of c.customRanges) {
        if ("isDark" in r && r.isDark && dateInRange(dateIso, r.startDate, r.endDate)) {
          dark.add(dateIso);
          break;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return dark;
  }
  function getDatesInAnyRange(c: CExp): Set<string> {
    const covered = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return covered;
    for (const r of c.customRanges) {
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        covered.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return covered;
  }
  function getImpressionsByDate(c: CExp): Map<string, number> {
    const map = new Map<string, number>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return map;
    let totalAllocatedInRanges = 0;
    for (const r of c.customRanges) {
      if ("isDark" in r && r.isDark) continue;
      if (!("impressionsGoal" in r) || typeof r.impressionsGoal !== "number") continue;
      const days = daysInRange(r.startDate, r.endDate);
      if (days <= 0) continue;
      const goal = r.impressionsGoal;
      totalAllocatedInRanges += goal;
      const basePerDay = Math.floor(goal / days);
      const remainder = goal - basePerDay * days;
      const rangeDates: string[] = [];
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        rangeDates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
      rangeDates.forEach((dateIso, i) => {
        map.set(dateIso, basePerDay + (i === rangeDates.length - 1 ? remainder : 0));
      });
    }
    const datesInRanges = getDatesInAnyRange(c);
    const darkDates = getDarkDates(c);
    const uncovered: string[] = [];
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      if (!datesInRanges.has(dateIso) && !darkDates.has(dateIso)) uncovered.push(dateIso);
      d.setDate(d.getDate() + 1);
    }
    const remaining = Math.max(0, c.impressionsGoal - totalAllocatedInRanges);
    if (remaining > 0 && uncovered.length > 0) {
      const basePerDay = Math.floor(remaining / uncovered.length);
      const remainderDays = remaining - basePerDay * uncovered.length;
      uncovered.forEach((dateIso, i) => {
        const isLast = i === uncovered.length - 1;
        map.set(dateIso, basePerDay + (isLast ? remainderDays : 0));
      });
    }
    return map;
  }

  const dailyTotal = new Map<string, number>();
  /** For each year-month, set of campaign indices active in that month. */
  const activeCampaignsByMonth = new Map<string, Set<number>>();
  function addActiveCampaign(dateIso: string, campaignIndex: number) {
    const yearMonth = dateIso.slice(0, 7);
    let set = activeCampaignsByMonth.get(yearMonth);
    if (!set) {
      set = new Set();
      activeCampaignsByMonth.set(yearMonth, set);
    }
    set.add(campaignIndex);
  }

  for (let ci = 0; ci < campaignsExport.length; ci++) {
    const c = campaignsExport[ci];
    if (c.distributionMode === "even") {
      const days = daysInRange(c.startDate, c.endDate);
      if (days <= 0) continue;
      const basePerDay = Math.floor(c.impressionsGoal / days);
      const remainder = c.impressionsGoal - basePerDay * days;
      const d = new Date(c.startDate);
      const end = new Date(c.endDate);
      let i = 0;
      while (d <= end) {
        const dateIso = d.toISOString().split("T")[0];
        addActiveCampaign(dateIso, ci);
        const imp = i === days - 1 ? basePerDay + remainder : basePerDay;
        dailyTotal.set(dateIso, (dailyTotal.get(dateIso) ?? 0) + imp);
        d.setDate(d.getDate() + 1);
        i++;
      }
    } else {
      const darkDates = getDarkDates(c);
      const customMap = getImpressionsByDate(c);
      const d = new Date(c.startDate);
      const end = new Date(c.endDate);
      while (d <= end) {
        const dateIso = d.toISOString().split("T")[0];
        addActiveCampaign(dateIso, ci);
        const imp = darkDates.has(dateIso) ? 0 : (customMap.get(dateIso) ?? 0);
        if (imp > 0) dailyTotal.set(dateIso, (dailyTotal.get(dateIso) ?? 0) + imp);
        d.setDate(d.getDate() + 1);
      }
    }
  }

  const byMonth = new Map<string, number>();
  for (const [dateIso, sum] of dailyTotal) {
    const yearMonth = dateIso.slice(0, 7);
    byMonth.set(yearMonth, (byMonth.get(yearMonth) ?? 0) + sum);
  }
  const allActiveCampaignIndices = new Set<number>();
  for (const set of activeCampaignsByMonth.values()) {
    for (const ci of set) allActiveCampaignIndices.add(ci);
  }
  const rows = Array.from(byMonth.entries())
    .map(([yearMonth, sumImpressions]) => {
      const activeSet = activeCampaignsByMonth.get(yearMonth);
      let sumGoal = 0;
      if (activeSet) {
        for (const ci of activeSet) sumGoal += campaignsExport[ci]?.impressionsGoal ?? 0;
      }
      return {
        yearMonth,
        sumImpressions,
        activeCampaignCount: activeSet?.size ?? 0,
        sumGoal,
      };
    })
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return { rows, totalUniqueCampaignCount: allActiveCampaignIndices.size };
}

/** Per-campaign, per-year-month impressions for monitor dimension view. Requires tableId. */
export type ImpressionsByYearMonthPerCampaignRow = {
  campaignId: number;
  yearMonth: string;
  sumImpressions: number;
};

export async function getImpressionsByYearMonthPerCampaign(options: {
  tableId: string;
}): Promise<ImpressionsByYearMonthPerCampaignRow[]> {
  const { getCampaignIdsForTable } = await import("@/lib/tables");
  const ids = await getCampaignIdsForTable(options.tableId);
  if (ids.length === 0) return [];
  const list = await getCampaignsByIds(ids);
  const idSet = new Set(ids);
  const listOrdered = ids.map((id) => list.find((c) => c.id === id)).filter(Boolean) as Awaited<ReturnType<typeof getCampaignsByIds>>[number][];
  if (listOrdered.length === 0) return [];

  function daysInRange(startIso: string, endIso: string): number {
    const a = new Date(startIso);
    const b = new Date(endIso);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }
  type CExp = {
    startDate: string;
    endDate: string;
    impressionsGoal: number;
    distributionMode: string;
    customRanges: CustomRange[];
  };
  const campaignsExport: CExp[] = listOrdered.map((c) => ({
    startDate: c.startDate,
    endDate: c.endDate,
    impressionsGoal: c.impressionsGoal ?? 0,
    distributionMode: c.distributionMode ?? "even",
    customRanges: parseCustomRanges(c.customRanges) as CustomRange[],
  }));

  function getDarkDates(c: CExp): Set<string> {
    const dark = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return dark;
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      for (const r of c.customRanges) {
        if ("isDark" in r && r.isDark && dateInRange(dateIso, r.startDate, r.endDate)) {
          dark.add(dateIso);
          break;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return dark;
  }
  function getDatesInAnyRange(c: CExp): Set<string> {
    const covered = new Set<string>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return covered;
    for (const r of c.customRanges) {
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        covered.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return covered;
  }
  function dateInRange(dateIso: string, startIso: string, endIso: string): boolean {
    return dateIso >= startIso && dateIso <= endIso;
  }
  function getImpressionsByDate(c: CExp): Map<string, number> {
    const map = new Map<string, number>();
    if (c.distributionMode !== "custom" || !c.customRanges?.length) return map;
    let totalAllocatedInRanges = 0;
    for (const r of c.customRanges) {
      if ("isDark" in r && r.isDark) continue;
      if (!("impressionsGoal" in r) || typeof r.impressionsGoal !== "number") continue;
      const days = daysInRange(r.startDate, r.endDate);
      if (days <= 0) continue;
      const goal = r.impressionsGoal;
      totalAllocatedInRanges += goal;
      const basePerDay = Math.floor(goal / days);
      const remainder = goal - basePerDay * days;
      const rangeDates: string[] = [];
      const d = new Date(r.startDate);
      const end = new Date(r.endDate);
      while (d <= end) {
        rangeDates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
      rangeDates.forEach((dateIso, i) => {
        map.set(dateIso, basePerDay + (i === rangeDates.length - 1 ? remainder : 0));
      });
    }
    const datesInRanges = getDatesInAnyRange(c);
    const darkDates = getDarkDates(c);
    const uncovered: string[] = [];
    const d = new Date(c.startDate);
    const end = new Date(c.endDate);
    while (d <= end) {
      const dateIso = d.toISOString().split("T")[0];
      if (!datesInRanges.has(dateIso) && !darkDates.has(dateIso)) uncovered.push(dateIso);
      d.setDate(d.getDate() + 1);
    }
    const remaining = Math.max(0, c.impressionsGoal - totalAllocatedInRanges);
    if (remaining > 0 && uncovered.length > 0) {
      const basePerDay = Math.floor(remaining / uncovered.length);
      const remainderDays = remaining - basePerDay * uncovered.length;
      uncovered.forEach((dateIso, i) => {
        const isLast = i === uncovered.length - 1;
        map.set(dateIso, basePerDay + (isLast ? remainderDays : 0));
      });
    }
    return map;
  }

  const perCampaignMonth = new Map<string, number>();

  for (let ci = 0; ci < campaignsExport.length; ci++) {
    const c = campaignsExport[ci];
    const campaignId = listOrdered[ci].id;
    if (c.distributionMode === "even") {
      const days = daysInRange(c.startDate, c.endDate);
      if (days <= 0) continue;
      const basePerDay = Math.floor(c.impressionsGoal / days);
      const remainder = c.impressionsGoal - basePerDay * days;
      const d = new Date(c.startDate);
      const end = new Date(c.endDate);
      let i = 0;
      while (d <= end) {
        const dateIso = d.toISOString().split("T")[0];
        const yearMonth = dateIso.slice(0, 7);
        const key = `${campaignId}-${yearMonth}`;
        const imp = i === days - 1 ? basePerDay + remainder : basePerDay;
        perCampaignMonth.set(key, (perCampaignMonth.get(key) ?? 0) + imp);
        d.setDate(d.getDate() + 1);
        i++;
      }
    } else {
      const darkDates = getDarkDates(c);
      const customMap = getImpressionsByDate(c);
      const d = new Date(c.startDate);
      const end = new Date(c.endDate);
      while (d <= end) {
        const dateIso = d.toISOString().split("T")[0];
        const imp = darkDates.has(dateIso) ? 0 : (customMap.get(dateIso) ?? 0);
        if (imp > 0) {
          const yearMonth = dateIso.slice(0, 7);
          const key = `${campaignId}-${yearMonth}`;
          perCampaignMonth.set(key, (perCampaignMonth.get(key) ?? 0) + imp);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  return Array.from(perCampaignMonth.entries())
    .map(([key, sumImpressions]) => {
      const parts = key.split("-");
      const campaignId = Number(parts[0]);
      const yearMonth = parts.length >= 3 ? `${parts[1]}-${parts[2]}` : "";
      return { campaignId, yearMonth, sumImpressions };
    })
    .filter((r) => r.yearMonth.length === 7)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || a.campaignId - b.campaignId);
}

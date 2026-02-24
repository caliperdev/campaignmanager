/** App-facing campaign type (camelCase). */
export type CustomRange =
  | { startDate: string; endDate: string; impressionsGoal: number }
  | { startDate: string; endDate: string; isDark: true };

export interface Campaign {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode: string;
  customRanges: string | null;
  csvData: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Row shape returned by Supabase (snake_case). */
interface CampaignRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  impressions_goal: number;
  distribution_mode: string;
  custom_ranges: string | null;
  csv_data: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Insert payload for Supabase (snake_case). */
interface CampaignInsert {
  name?: string;
  start_date: string;
  end_date: string;
  impressions_goal: number;
  distribution_mode?: string;
  custom_ranges?: string | null;
  csv_data?: string;
}

/** Update payload for Supabase (snake_case, partial). */
interface CampaignUpdate {
  name?: string;
  start_date?: string;
  end_date?: string;
  impressions_goal?: number;
  distribution_mode?: string;
  custom_ranges?: string | null;
  csv_data?: string;
  updated_at?: string;
}

export const CAMPAIGNS_TABLE = "campaigns";

export function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    impressionsGoal: row.impressions_goal,
    distributionMode: row.distribution_mode,
    customRanges: row.custom_ranges,
    csvData: row.csv_data ?? "{}",
    notes: row.notes ?? "{}",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function campaignToInsert(p: {
  name: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode?: string;
  customRanges?: string | null;
  csvData?: string;
}): CampaignInsert {
  return {
    name: p.name,
    start_date: p.startDate,
    end_date: p.endDate,
    impressions_goal: p.impressionsGoal,
    distribution_mode: p.distributionMode ?? "even",
    custom_ranges: p.customRanges ?? null,
    csv_data: p.csvData ?? "{}",
  };
}

export function campaignToUpdate(p: {
  name: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode?: string;
  customRanges?: string | null;
  csvData?: string;
}): CampaignUpdate {
  return {
    name: p.name,
    start_date: p.startDate,
    end_date: p.endDate,
    impressions_goal: p.impressionsGoal,
    distribution_mode: p.distributionMode ?? "even",
    custom_ranges: p.customRanges ?? null,
    ...(p.csvData != null && { csv_data: p.csvData }),
    updated_at: new Date().toISOString(),
  };
}

// --- Data entries (isolated pipeline for Data section imports) ---

export const DATA_ENTRIES_TABLE = "data_entries";
export const TABLE_DATA_ENTRIES_TABLE = "table_data_entries";

export interface DataEntry {
  id: number;
  reportDate: string;
  impressions: number;
  csvData: string;
  createdAt: string;
}

interface DataEntryRow {
  id: number;
  report_date: string;
  impressions: number;
  csv_data: string;
  created_at: string;
}

export interface DataEntryInsert {
  report_date: string;
  impressions: number;
  csv_data?: string;
}

export function rowToDataEntry(row: DataEntryRow): DataEntry {
  return {
    id: row.id,
    reportDate: row.report_date,
    impressions: row.impressions,
    csvData: row.csv_data ?? "{}",
    createdAt: row.created_at,
  };
}

export function dataEntryToInsert(p: {
  reportDate: string;
  impressions: number;
  csvData?: string;
}): DataEntryInsert {
  return {
    report_date: p.reportDate,
    impressions: p.impressions,
    csv_data: p.csvData ?? "{}",
  };
}

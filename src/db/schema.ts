/** Campaign registry: each row = one campaign with its own dynamic Postgres table. */
export interface Campaign {
  id: string;
  name: string;
  dynamicTableName: string;
  columnHeaders?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Source registry: sources pipeline (read-only). CSV sources have dynamicTableName; Dataverse sources have entitySetName + logicalName. */
export interface Source {
  id: string;
  name: string;
  dynamicTableName?: string;
  entitySetName?: string;
  logicalName?: string;
  columnHeaders?: string[];
  createdAt: string;
}

/** Pre-computed monitor row (one per year-month). */
export interface MonitorRow {
  id: number;
  yearMonth: string;
  bookedImpressions: number;
  deliveredImpressions: number;
  deliveredLines: number;
  mediaCost: number;
  mediaFees: number;
  celtraCost: number;
  totalCost: number;
  bookedRevenue: number;
  updatedAt?: string;
}

export const CAMPAIGNS_TABLE = "campaigns";
export const SOURCES_TABLE = "sources";
export const MONITOR_TABLE = "monitor";

/** Order registry: each row = one order. Placements stored in placements table. */
export interface Order {
  id: string;
  name: string;
  dynamicTableName?: string | null;
  columnHeaders?: string[];
  campaignId: string;
  documentPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Source registry: sources pipeline (read-only). Sources with dynamic tables have dynamicTableName; Dataverse sources have entitySetName + logicalName. */
export interface Source {
  id: string;
  name: string;
  dynamicTableName?: string;
  entitySetName?: string;
  logicalName?: string;
  columnHeaders?: string[];
  createdAt: string;
}

/** Client registry. Clients are above agencies in the hierarchy. */
export interface Client {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Agency registry. Optional reference on campaigns. */
export interface Agency {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Advertiser registry. Name + counts. Campaigns belong to advertisers. */
export interface Advertiser {
  id: string;
  advertiser: string;
  orderCount: number;
  campaignCount: number;
  placementCount: number;
  activePlacementCount: number;
}

/** Campaign registry. Campaigns belong to advertisers, agency, and client. All three required. */
export interface Campaign {
  id: string;
  name: string;
  advertiserId: string;
  agencyId: string;
  clientId: string;
  externalId?: string | null;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Placement registry. Placements belong to orders. */
export interface Placement {
  id: number;
  orderId: string;
  placementId?: string | null;
  placement?: string | null;
  trafficker?: string | null;
  am?: string | null;
  qaAm?: string | null;
  format?: string | null;
  deal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  impressions?: string | null;
  cpmClient?: string | null;
  cpmAdops?: string | null;
  insertionOrderIdDsp?: string | null;
  insertionOrderName?: string | null;
  darkDays?: string | null;
  perDayImpressions?: string | null;
  darkRanges?: string | null;
  assignedRanges?: string | null;
  cpmCeltra?: string | null;
  budgetAdops?: string | null;
  budgetClient?: string | null;
  pacing?: string | null;
  targetingAudience?: string | null;
  important?: string | null;
  kpi?: string | null;
  kpiVcr?: string | null;
  kpiCtr?: string | null;
  kpiView?: string | null;
  kpiBsafe?: string | null;
  kpiOog?: string | null;
  kpiIvt?: string | null;
  teamsSharepoint?: string | null;
  dsp?: string | null;
  ads?: string | null;
  vrf?: string | null;
  placementGroupId?: string | null;
  createdAt: string;
  updatedAt: string;
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

export const ORDERS_TABLE = "orders";
export const SOURCES_TABLE = "sources";
export const CLIENTS_TABLE = "clients";
export const AGENCIES_TABLE = "agencies";
export const ADVERTISERS_TABLE = "advertisers";
export const CAMPAIGNS_TABLE = "campaigns";
export const PLACEMENTS_TABLE = "placements";
export const MONITOR_TABLE = "monitor";

export const TRAFFICKERS = "traffickers";
export const AMS = "ams";
export const QA_AMS = "qa_ams";
export const FORMATS = "formats";
export const CATEGORIES = "categories";
export const DEALS = "deals";

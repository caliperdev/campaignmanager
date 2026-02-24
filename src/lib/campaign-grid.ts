import type { Campaign, DataEntry } from "@/db/schema";

/** Column headers from Relevant+.csv in display order. */
export const RELEVANT_CSV_COLUMNS: { id: string; header: string }[] = [
  { id: "Insertion Order Name", header: "Insertion Order Name" },
  { id: "Client", header: "Client" },
  { id: "Internal Campaign", header: "Internal Campaign" },
  { id: "Period", header: "Period" },
  { id: "Filter", header: "Filter" },
  { id: "Format", header: "Format" },
  { id: "Deal", header: "Deal" },
  { id: "Status", header: "Status" },
  { id: "Start Date", header: "Start Date" },
  { id: "End Date", header: "End Date" },
  { id: "Impressions Goal", header: "Impressions Goal" },
  { id: "CPM", header: "CPM" },
  { id: "CPM Celtra", header: "CPM Celtra" },
  { id: "Budget", header: "Budget" },
  { id: "CPM R+", header: "CPM R+" },
  { id: "Budget R+", header: "Budget R+" },
  { id: "Pacing", header: "Pacing" },
  { id: "Targeting Audience", header: "Targeting Audience" },
  { id: "Important", header: "Important" },
  { id: "KPI", header: "KPI" },
  { id: "KPI - VCR", header: "KPI - VCR" },
  { id: "KPI - CTR", header: "KPI - CTR" },
  { id: "KPI - VIEW", header: "KPI - VIEW" },
  { id: "KPI - BSAFE", header: "KPI - BSAFE" },
  { id: "KPI - OOG", header: "KPI - OOG" },
  { id: "KPI - IVT", header: "KPI - IVT" },
  { id: "Teams SharePoint", header: "Teams SharePoint" },
  { id: "DSP", header: "DSP" },
  { id: "Insertion Order ID", header: "Insertion Order ID" },
  { id: "DSP Report ID", header: "DSP Report ID" },
  { id: "AdServer", header: "AdServer" },
  { id: "Placement Group ID", header: "Placement Group ID" },
  { id: "AdS Report ID", header: "AdS Report ID" },
  { id: "Verifier", header: "Verifier" },
  { id: "VRF Report ID", header: "VRF Report ID" },
  { id: "Verifier ID", header: "Verifier ID" },
  { id: "Category", header: "Category" },
  { id: "Agency", header: "Agency" },
  { id: "Trafficker", header: "Trafficker" },
  { id: "AM", header: "AM" },
  { id: "QA AM", header: "QA AM" },
];

export interface CampaignListItem {
  id: number;
  csvData: Record<string, string>;
  startDate: string;
  endDate: string;
  name: string;
  notes: Record<string, string>;
}

function parseCsvData(c: Campaign): Record<string, string> {
  try {
    return (JSON.parse(c.csvData ?? "{}") as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

function parseNotes(c: Campaign): Record<string, string> {
  try {
    return (JSON.parse(c.notes ?? "{}") as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

/** Build campaign list items from DB; row data from csvData (any keys). */
export function buildCampaignListItems(list: Campaign[]): CampaignListItem[] {
  return list.map((c) => ({
    id: c.id,
    csvData: parseCsvData(c),
    startDate: c.startDate,
    endDate: c.endDate,
    name: c.name ?? "",
    notes: parseNotes(c),
  }));
}

/** Build list items from DataEntry rows (Data pipeline). */
export function buildDataEntryListItems(list: DataEntry[]): CampaignListItem[] {
  return list.map((e) => {
    let csvData: Record<string, string> = {};
    try {
      csvData = (JSON.parse(e.csvData ?? "{}") as Record<string, string>) ?? {};
    } catch { /* ignore */ }
    return {
      id: e.id,
      csvData,
      startDate: e.reportDate,
      endDate: e.reportDate,
      name: e.reportDate,
      notes: {},
    };
  });
}

/** Derive column headers from campaigns' csvData: first campaign's keys, then any extra keys from others. */
export function deriveColumnHeaders(campaigns: CampaignListItem[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const c of campaigns) {
    for (const k of Object.keys(c.csvData)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

/** Build headers + rows for dynamic grid from campaigns (full CSV data + our columns). */
export function buildListGridData(list: Campaign[]): {
  headers: string[];
  rows: (Record<string, string | number>)[];
} {
  const allCsvKeys = new Set<string>();
  const rows: (Record<string, string | number>)[] = [];

  for (const c of list) {
    const csvData: Record<string, string> = (() => {
      try {
        return JSON.parse(c.csvData ?? "{}") as Record<string, string>;
      } catch {
        return {};
      }
    })();
    for (const k of Object.keys(csvData)) allCsvKeys.add(k);
    rows.push({
      _campaignId: c.id,
      ...csvData,
      name: c.name ?? "",
      startDate: c.startDate,
      endDate: c.endDate,
    });
  }

  const headers = [...allCsvKeys];
  return { headers, rows };
}

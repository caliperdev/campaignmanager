"use server";

import { supabase } from "@/db";
import { getOrder, getCampaign, getAgency, getAdvertiser, getSource, getPlacementById, getPlacementsForOrder as getPlacementsForOrderFromTable, getTraffickerOptions, getAmOptions, getQaAmOptions, getFormatOptions, getCategoryOptions, getDealOptions } from "@/lib/tables";
import { fetchDynamicTableChunk } from "@/lib/table-actions";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import { fetchDataverseSourceChunkFirst, fetchDataverseTableFull, fetchDataverseTableFiltered } from "@/lib/dataverse-source";
import type { Order, Source } from "@/db/schema";

const PLACEMENT_LIMIT = 500;

export type PlacementRow = { id: number; [k: string]: unknown };

export async function getPlacementsForOrder(orderId: string): Promise<{ rows: PlacementRow[]; order: Order | null }> {
  const order = await getOrder(orderId);
  if (!order) return { rows: [], order: null };
  const { rows } = await getPlacementsForOrderFromTable(orderId, 0, PLACEMENT_LIMIT);
  return { rows: rows as PlacementRow[], order };
}

export type PlacementDetail = {
  order: Order;
  orderName: string;
  campaignDisplayId: string;
  orderAgencyName?: string;
  orderAdvertiser?: string;
  category: string;
  placementRow: Record<string, unknown>;
  traffickerOptions: string[];
  amOptions: string[];
  qaAmOptions: string[];
  formatOptions: string[];
  dealOptions: string[];
};

export async function getPlacementDetail(orderId: string, placementId: number): Promise<PlacementDetail | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  const [placementRow, campaign, traffickerOptions, amOptions, qaAmOptions, formatOptions, categoryOptions, dealOptions] = await Promise.all([
    getPlacementById(orderId, placementId),
    getCampaign(order.campaignId),
    getTraffickerOptions(),
    getAmOptions(),
    getQaAmOptions(),
    getFormatOptions(),
    getCategoryOptions(),
    getDealOptions(),
  ]);
  if (!placementRow) return null;
  const displayCampaignId = campaign?.externalId?.trim() || campaign?.name || order.campaignId;
  const [agency, advertiser] = await Promise.all([
    campaign?.agencyId ? getAgency(campaign.agencyId) : null,
    campaign ? getAdvertiser(campaign.advertiserId) : null,
  ]);
  const category = campaign?.category ?? "";
  return {
    order,
    orderName: order.name,
    campaignDisplayId: displayCampaignId,
    orderAgencyName: agency?.name,
    orderAdvertiser: advertiser?.advertiser,
    category,
    placementRow: placementRow as Record<string, unknown>,
    traffickerOptions,
    amOptions,
    qaAmOptions,
    formatOptions,
    dealOptions,
  };
}

export type SourceData = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
};

/** Resolve source by type: DSP, ADS, or VRF. Returns first Dataverse source whose name contains the type. */
export async function getSourceByType(type: "DSP" | "ADS" | "VRF"): Promise<Source | null> {
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, dynamic_table_name, entity_set_name, logical_name, column_headers, created_at")
    .not("entity_set_name", "is", null)
    .ilike("name", `%${type}%`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name ?? "",
    dynamicTableName: data.dynamic_table_name ?? undefined,
    entitySetName: data.entity_set_name ?? undefined,
    logicalName: data.logical_name ?? undefined,
    columnHeaders: Array.isArray(data.column_headers) ? data.column_headers : undefined,
    createdAt: data.created_at,
  } as Source;
}

export async function getSourceData(sourceId: string, limit: number = 500): Promise<SourceData | null> {
  const source = await getSource(sourceId);
  if (!source) return null;
  if (source.entitySetName && source.logicalName) {
    const result = await fetchDataverseSourceChunkFirst(source.entitySetName, source.logicalName, limit, null, true);
    return { columns: result.columns, rows: result.rows, total: result.total };
  }
  if (source.dynamicTableName) {
    const cols = source.columnHeaders ?? [];
    const { rows, total } = await fetchDynamicTableChunk(source.dynamicTableName, 0, limit);
    const columns = cols.length > 0 ? cols : (rows[0] ? Object.keys(rows[0]).filter((k) => k !== "id") : []);
    return { columns, rows: rows as Record<string, string>[], total };
  }
  return null;
}

/** Fetch all source rows (no limit). For Dataverse: full table. For Supabase dynamic: paginated until exhausted. */
export async function getSourceDataFull(sourceId: string): Promise<SourceData | null> {
  const source = await getSource(sourceId);
  if (!source) return null;
  if (source.entitySetName && source.logicalName) {
    const result = await fetchDataverseTableFull(source.entitySetName, source.logicalName);
    return { columns: result.columns, rows: result.rows, total: result.total };
  }
  if (source.dynamicTableName) {
    const cols = source.columnHeaders ?? [];
    const PAGE = 2000;
    const allRows: Record<string, string>[] = [];
    let offset = 0;
    let total = 0;
    while (true) {
      const { rows, total: t } = await fetchDynamicTableChunk(source.dynamicTableName, offset, PAGE);
      total = t;
      for (const r of rows) {
        allRows.push(r as Record<string, string>);
      }
      if (allRows.length >= total || rows.length < PAGE) break;
      offset += PAGE;
    }
    const columns = cols.length > 0 ? cols : (allRows[0] ? Object.keys(allRows[0]).filter((k) => k !== "id") : []);
    return { columns, rows: allRows, total };
  }
  return null;
}

/** Fetch source rows filtered by column = value (exact match). Uses $filter for Dataverse, eq for Supabase. */
export async function getSourceDataFiltered(
  sourceId: string,
  filterColumn: string,
  filterValue: string
): Promise<SourceData | null> {
  if (!filterValue.trim()) return getSourceDataFull(sourceId);
  const source = await getSource(sourceId);
  if (!source) return null;
  if (source.entitySetName && source.logicalName) {
    const result = await fetchDataverseTableFiltered(
      source.entitySetName,
      source.logicalName,
      filterColumn,
      filterValue
    );
    return { columns: result.columns, rows: result.rows, total: result.total };
  }
  if (source.dynamicTableName) {
    const cols = source.columnHeaders ?? [];
    const PAGE = 2000;
    const allRows: Record<string, string>[] = [];
    let offset = 0;
    let total = 0;
    const filter = { column: filterColumn, value: filterValue };
    while (true) {
      const { rows, total: t } = await fetchDynamicTableChunk(
        source.dynamicTableName,
        offset,
        PAGE,
        null,
        true,
        filter
      );
      total = t;
      for (const r of rows) {
        allRows.push(r as Record<string, string>);
      }
      if (allRows.length >= total || rows.length < PAGE) break;
      offset += PAGE;
    }
    const columns = cols.length > 0 ? cols : (allRows[0] ? Object.keys(allRows[0]).filter((k) => k !== "id") : []);
    return { columns, rows: allRows, total };
  }
  return null;
}

function getVal(row: Record<string, unknown>, col: string): string {
  const target = sanitizeDynamicColumnKey(col);
  const key =
    Object.keys(row).find((k) => k === col) ??
    Object.keys(row).find((k) => k === target) ??
    Object.keys(row).find((k) => sanitizeDynamicColumnKey(k) === target);
  const v = key != null ? row[key] : undefined;
  return v !== undefined && v !== null ? String(v) : "";
}

export type JoinedRow = Record<string, string>;

const JOIN_LEFT_COL = "insertion_order_id_dsp";
const JOIN_RIGHT_COL = "cr4fe_insertionordergid";
const DEFAULT_SOURCE_COLS = ["cr4fe_date", "cr4fe_impressions", "cr4fe_totalmediacost", "cr4fe_insertionordergid"];

export async function getJoinedPlacementSource(
  orderId: string,
  placementId: number,
  sourceId: string,
): Promise<{
  joinedRows: JoinedRow[];
  sourceColumns: string[];
  leftValue: string;
  sourceRowCount: number;
} | null> {
  const placementDetail = await getPlacementDetail(orderId, placementId);
  if (!placementDetail) return null;

  const placementRow = placementDetail.placementRow as Record<string, unknown>;
  const leftValue = getVal(placementRow, JOIN_LEFT_COL);

  const sourceData = leftValue.trim()
    ? await getSourceDataFiltered(sourceId, JOIN_RIGHT_COL, leftValue)
    : await getSourceDataFull(sourceId);
  if (!sourceData) return null;

  const sourceColumns = sourceData.columns;
  let rightColsToShow = DEFAULT_SOURCE_COLS.filter((c) => sourceColumns.includes(c));
  if (rightColsToShow.length === 0) rightColsToShow = sourceColumns.slice(0, 5);

  const joinedRows: JoinedRow[] = [];
  for (const srcRow of sourceData.rows) {
    const rightVal = getVal(srcRow as Record<string, unknown>, JOIN_RIGHT_COL);
    if (leftValue !== "" && leftValue === rightVal) {
      const row: JoinedRow = {};
      row[`left_${JOIN_LEFT_COL}`] = leftValue;
      for (const col of rightColsToShow) {
        row[`right_${col}`] = getVal(srcRow as Record<string, unknown>, col);
      }
      joinedRows.push(row);
    }
  }
  if (joinedRows.length === 0 && sourceData.rows.length > 0) {
    const row: JoinedRow = {};
    row[`left_${JOIN_LEFT_COL}`] = leftValue;
    for (const col of rightColsToShow) {
      row[`right_${col}`] = "";
    }
    joinedRows.push(row);
  }

  return { joinedRows, sourceColumns, leftValue, sourceRowCount: sourceData.rows.length };
}

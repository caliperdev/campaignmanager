"use server";

import { revalidatePath, updateTag } from "next/cache";
import { supabase } from "@/db";
import { ORDERS_TABLE, SOURCES_TABLE, CLIENTS_TABLE, AGENCIES_TABLE, ADVERTISERS_TABLE, CAMPAIGNS_TABLE, PLACEMENTS_TABLE } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import { getDynamicTableChunkWithCount, getPlacementsForOrder } from "@/lib/tables";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";

const APP_DATA_TAG = "app-data";

function invalidateAppData() {
  updateTag(APP_DATA_TAG);
  revalidatePath("/");
}

async function refreshAdvertiserCounts() {
  await supabase.rpc("refresh_advertiser_counts");
}

export async function refreshAppCache() {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  updateTag(APP_DATA_TAG);
  revalidatePath("/");
}

export async function createOrder(
  displayName: string,
  campaignId: string,
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const name = displayName?.trim() ?? "";
  if (!name) return { success: false, error: "Order # is required." };
  if (!campaignId?.trim()) return { success: false, error: "Campaign is required." };
  const { data: existing } = await supabase.from(ORDERS_TABLE).select("id").eq("name", name).limit(1).maybeSingle();
  if (existing) return { success: false, error: "An order with this name already exists." };
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .insert({
      name,
      campaign_id: campaignId,
      dynamic_table_name: null,
      column_headers: null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createOrder] insert failed:", error);
    return { success: false, error: error.message };
  }
  if (!data?.id) return { success: false, error: "No order id returned." };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true, orderId: data.id as string };
}

const ORDER_DOCUMENTS_BUCKET = "order_documents";

/** Upload IO PDF for an order. Call after createOrder. */
export async function uploadOrderDocument(orderId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof Blob)) return { success: false, error: "No file provided." };
  const buffer = await file.arrayBuffer();
  const path = `${orderId}/io.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(ORDER_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("[uploadOrderDocument] upload failed:", uploadError);
    return { success: false, error: uploadError.message };
  }
  const { error: updateError } = await supabase.from(ORDERS_TABLE).update({ document_path: path }).eq("id", orderId);
  if (updateError) return { success: false, error: updateError.message };
  invalidateAppData();
  return { success: true };
}

export async function updateOrder(id: string, update: { name?: string; columnHeaders?: string[] }): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (update.name !== undefined) {
    const name = update.name.trim();
    if (!name) return { success: false, error: "Order # is required." };
    const { data: existing } = await supabase.from(ORDERS_TABLE).select("id").eq("name", name).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "An order with this name already exists." };
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim();
  if (update.columnHeaders !== undefined) payload.column_headers = update.columnHeaders;
  const { error } = await supabase.from(ORDERS_TABLE).update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  invalidateAppData();
  return { success: true };
}

export async function deleteOrder(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(ORDERS_TABLE).delete().eq("id", id);
  if (error) return false;
  await refreshAdvertiserCounts();
  invalidateAppData();
  return true;
}

export async function updateSource(id: string, update: { name?: string }): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const payload: Record<string, unknown> = {};
  if (update.name !== undefined) payload.name = update.name.trim() || "Source";
  if (Object.keys(payload).length === 0) return true;
  const { error } = await supabase.from(SOURCES_TABLE).update(payload).eq("id", id);
  if (error) return false;
  invalidateAppData();
  return true;
}

export async function createClient(displayName: string): Promise<{ success: boolean; clientId?: string; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const name = displayName?.trim() ?? "";
  if (!name) return { success: false, error: "Name is required." };
  const { data: existing } = await supabase.from(CLIENTS_TABLE).select("id").eq("name", name).limit(1).maybeSingle();
  if (existing) return { success: false, error: "A client with this name already exists." };
  const { data, error } = await supabase
    .from(CLIENTS_TABLE)
    .insert({ name })
    .select("id")
    .single();
  if (error) {
    console.error("[createClient] insert failed:", error);
    return { success: false, error: error.message };
  }
  if (!data?.id) return { success: false, error: "No client id returned." };
  invalidateAppData();
  return { success: true, clientId: data.id as string };
}

export async function updateClient(id: string, update: { name?: string }): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (update.name !== undefined) {
    const name = update.name.trim();
    if (!name) return { success: false, error: "Name is required." };
    const { data: existing } = await supabase.from(CLIENTS_TABLE).select("id").eq("name", name).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "A client with this name already exists." };
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim();
  const { error } = await supabase.from(CLIENTS_TABLE).update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  invalidateAppData();
  return { success: true };
}

export async function deleteClient(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { error } = await supabase.from(CLIENTS_TABLE).delete().eq("id", id);
  if (error) {
    console.error("[deleteClient] failed:", error.message);
    return false;
  }
  invalidateAppData();
  return true;
}

export async function createAgency(displayName: string): Promise<{ success: boolean; agencyId?: string; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const name = displayName?.trim() ?? "";
  if (!name) return { success: false, error: "Name is required." };
  const { data: existing } = await supabase.from(AGENCIES_TABLE).select("id").eq("name", name).limit(1).maybeSingle();
  if (existing) return { success: false, error: "An agency with this name already exists." };
  const { data, error } = await supabase
    .from(AGENCIES_TABLE)
    .insert({ name })
    .select("id")
    .single();
  if (error) {
    console.error("[createAgency] insert failed:", error);
    return { success: false, error: error.message };
  }
  if (!data?.id) return { success: false, error: "No agency id returned." };
  invalidateAppData();
  return { success: true, agencyId: data.id as string };
}

export async function updateAgency(id: string, update: { name?: string }): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (update.name !== undefined) {
    const name = update.name.trim();
    if (!name) return { success: false, error: "Name is required." };
    const { data: existing } = await supabase.from(AGENCIES_TABLE).select("id").eq("name", name).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "An agency with this name already exists." };
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim();
  const { error } = await supabase.from(AGENCIES_TABLE).update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  invalidateAppData();
  return { success: true };
}

export async function deleteAgency(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  // Campaigns.agency_id is optional; FK is ON DELETE SET NULL. Just delete the agency.
  const { error } = await supabase.from(AGENCIES_TABLE).delete().eq("id", id);
  if (error) {
    console.error("[deleteAgency] failed:", error.message);
    return false;
  }
  invalidateAppData();
  return true;
}

export async function createAdvertiser(displayName: string): Promise<{ success: boolean; advertiserId?: string; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const advertiser = displayName?.trim() ?? "";
  if (!advertiser) return { success: false, error: "Name is required." };
  const { data: existing } = await supabase.from(ADVERTISERS_TABLE).select("id").eq("advertiser", advertiser).limit(1).maybeSingle();
  if (existing) return { success: false, error: "An advertiser with this name already exists." };
  const { data, error } = await supabase
    .from(ADVERTISERS_TABLE)
    .insert({ advertiser })
    .select("id")
    .single();
  if (error) {
    console.error("[createAdvertiser] insert failed:", error);
    return { success: false, error: error.message };
  }
  if (!data?.id) return { success: false, error: "No advertiser id returned." };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true, advertiserId: data.id as string };
}

export async function updateAdvertiser(id: string, update: { advertiser?: string }): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (update.advertiser !== undefined) {
    const advertiser = update.advertiser.trim();
    if (!advertiser) return { success: false, error: "Name is required." };
    const { data: existing } = await supabase.from(ADVERTISERS_TABLE).select("id").eq("advertiser", advertiser).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "An advertiser with this name already exists." };
  }
  const payload: Record<string, unknown> = {};
  if (update.advertiser !== undefined) payload.advertiser = update.advertiser.trim();
  if (Object.keys(payload).length === 0) return { success: true };
  const { error } = await supabase.from(ADVERTISERS_TABLE).update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true };
}

export async function deleteAdvertiser(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  // Cascade: campaigns belong to advertiser. Delete each campaign's orders first, then campaign, then advertiser.
  const { data: campaigns } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("id")
    .eq("advertiser_id", id);
  for (const camp of campaigns ?? []) {
    const ok = await deleteCampaign(camp.id);
    if (!ok) {
      console.error("[deleteAdvertiser] failed to delete campaign:", camp.id);
      return false;
    }
  }
  const { error } = await supabase.from(ADVERTISERS_TABLE).delete().eq("id", id);
  if (error) {
    console.error("[deleteAdvertiser] failed:", error.message);
    return false;
  }
  await refreshAdvertiserCounts();
  invalidateAppData();
  return true;
}

export async function createCampaign(
  advertiserId: string,
  displayName: string,
  agencyId: string,
  clientId: string,
  externalId: string,
  category: string,
): Promise<{ success: boolean; campaignId?: string; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const name = displayName?.trim();
  if (!name) return { success: false, error: "Campaign name is required." };
  const extId = externalId?.trim();
  if (!extId) return { success: false, error: "Campaign ID is required." };
  const cat = category?.trim();
  if (!cat) return { success: false, error: "Category is required." };
  const { data: existingName } = await supabase.from(CAMPAIGNS_TABLE).select("id").eq("name", name).limit(1).maybeSingle();
  if (existingName) return { success: false, error: "A campaign with this name already exists." };
  const { data: existingExtId } = await supabase.from(CAMPAIGNS_TABLE).select("id").eq("external_id", extId).limit(1).maybeSingle();
  if (existingExtId) return { success: false, error: "A campaign with this Campaign ID already exists." };
  const payload: Record<string, unknown> = {
    advertiser_id: advertiserId,
    agency_id: agencyId.trim(),
    client_id: clientId.trim(),
    name,
    external_id: extId,
    category: cat,
  };
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.error("[createCampaign] insert failed:", error);
    return { success: false, error: error.message };
  }
  if (!data?.id) return { success: false, error: "No campaign id returned." };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true, campaignId: data.id as string };
}

export async function updateCampaign(id: string, update: { name?: string; externalId?: string | null; advertiserId?: string; agencyId?: string; clientId?: string; category?: string | null }): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (update.name !== undefined) {
    const name = update.name.trim();
    if (!name) return { success: false, error: "Name is required." };
    const { data: existing } = await supabase.from(CAMPAIGNS_TABLE).select("id").eq("name", name).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "A campaign with this name already exists." };
  }
  if (update.externalId !== undefined) {
    const extId = update.externalId?.trim() ?? "";
    if (!extId) return { success: false, error: "Campaign ID is required." };
    const { data: existing } = await supabase.from(CAMPAIGNS_TABLE).select("id").eq("external_id", extId).neq("id", id).limit(1).maybeSingle();
    if (existing) return { success: false, error: "A campaign with this Campaign ID already exists." };
  }
  if (update.advertiserId !== undefined && !update.advertiserId.trim()) return { success: false, error: "Advertiser is required." };
  if (update.agencyId !== undefined && !update.agencyId.trim()) return { success: false, error: "Agency is required." };
  if (update.clientId !== undefined && !update.clientId.trim()) return { success: false, error: "Client is required." };
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim();
  if (update.externalId !== undefined) payload.external_id = update.externalId?.trim() ?? null;
  if (update.advertiserId !== undefined) payload.advertiser_id = update.advertiserId.trim();
  if (update.agencyId !== undefined) payload.agency_id = update.agencyId.trim();
  if (update.clientId !== undefined) payload.client_id = update.clientId.trim();
  if (update.category !== undefined) payload.category = update.category?.trim() || null;
  const { error } = await supabase.from(CAMPAIGNS_TABLE).update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true };
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: orders } = await supabase
    .from(ORDERS_TABLE)
    .select("id")
    .eq("campaign_id", id);
  for (const order of orders ?? []) {
    const ok = await deleteOrder(order.id);
    if (!ok) {
      console.error("[deleteCampaign] failed to delete order:", order.id);
      return false;
    }
  }
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().eq("id", id);
  if (error) return false;
  await refreshAdvertiserCounts();
  invalidateAppData();
  return true;
}

export async function deleteSource(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: row } = await supabase
    .from(SOURCES_TABLE)
    .select("dynamic_table_name")
    .eq("id", id)
    .single();
  if (row?.dynamic_table_name != null && row.dynamic_table_name !== "") {
    const { error: rpcError } = await supabase.rpc("drop_dynamic_table", {
      p_table_name: row.dynamic_table_name,
    });
    if (rpcError) console.error("[deleteSource] drop_dynamic_table RPC error:", rpcError);
  }
  const { error } = await supabase.from(SOURCES_TABLE).delete().eq("id", id);
  if (error) return false;
  invalidateAppData();
  return true;
}

export async function fetchPlacementsChunk(
  orderId: string,
  offset: number,
  limit: number,
  campaignFilter?: { or: Array<{ column: string; value: string }> } | null,
) {
  return getPlacementsForOrder(orderId, offset, limit, campaignFilter);
}

/** Fetch chunk from a dynamic table (e.g. source data_*). Used by test-link and sources. */
export async function fetchDynamicTableChunk(
  dynamicTableName: string,
  offset: number,
  limit: number,
  sortColumn?: string | null,
  sortAsc: boolean = true,
  filter?: { column: string; value: string } | { or: Array<{ column: string; value: string }> } | null,
) {
  return getDynamicTableChunkWithCount(dynamicTableName, offset, limit, sortColumn, sortAsc, filter);
}

/** Check if placement_id or placement is already used anywhere (placements table, globally). */
async function checkPlacementDuplicateGlobal(
  placementIdVal: string,
  placementVal: string,
  excludeId?: number,
): Promise<string | null> {
  if (!placementIdVal.trim() && !placementVal.trim()) return null;
  let query = supabase
    .from(PLACEMENTS_TABLE)
    .select("id, placement_id, placement");
  if (excludeId != null) query = query.neq("id", excludeId);
  const { data } = await query;
  const rows = data ?? [];
  const newPid = placementIdVal.trim();
  const newPname = placementVal.trim();
  for (const row of rows) {
    const existing = row as { id: number; placement_id?: string | null; placement?: string | null };
    const pid = String(existing.placement_id ?? "").trim();
    const pname = String(existing.placement ?? "").trim();
    if (newPid && pid === newPid) return "Placement ID is already used by another placement.";
    if (newPname && pname === newPname) return "Placement name is already used by another placement.";
  }
  return null;
}

/** Update a row in a dynamic table (e.g. source data_*). Used by sources view. */
export async function updateDynamicTableRow(
  dynamicTableName: string,
  rowId: number,
  payload: Record<string, string | number>,
): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const { error } = await supabase.from(dynamicTableName).update(payload).eq("id", rowId);
  if (error) return { success: false, error: error.message };
  invalidateAppData();
  return { success: true };
}

/** Delete a row from a dynamic table (e.g. source data_*). Used by sources view. */
export async function deleteDynamicTableRow(
  dynamicTableName: string,
  rowId: number,
): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) return false;
  const { error } = await supabase.from(dynamicTableName).delete().eq("id", rowId);
  if (error) return false;
  invalidateAppData();
  return true;
}

export async function updatePlacement(
  placementId: number,
  payload: Record<string, string | number>,
): Promise<{ success: boolean; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const placementIdVal = String(payload.placement_id ?? "").trim();
  const placementVal = String(payload.placement ?? "").trim();
  if (placementIdVal || placementVal) {
    const err = await checkPlacementDuplicateGlobal(placementIdVal, placementVal, placementId);
      if (err) return { success: false, error: err };
  }
  const { error } = await supabase.from(PLACEMENTS_TABLE).update({ ...payload, updated_at: new Date().toISOString() }).eq("id", placementId);
  if (error) return { success: false, error: error.message };
  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true };
}

export async function deletePlacement(placementId: number): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) return false;
  const { error } = await supabase.from(PLACEMENTS_TABLE).delete().eq("id", placementId);
  if (error) return false;
  await refreshAdvertiserCounts();
  invalidateAppData();
  return true;
}

export async function insertDynamicTableRow(
  dynamicTableName: string,
  columnHeaders: string[],
  formData?: Record<string, string>,
): Promise<{ success: boolean; id?: number; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  const payload: Record<string, string> = {};
  for (const col of columnHeaders) {
    payload[sanitizeDynamicColumnKey(col)] = formData?.[col] ?? "";
  }
  const { data, error } = await supabase
    .from(dynamicTableName)
    .insert(payload)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  invalidateAppData();
  return { success: true, id: data?.id as number };
}

function rowToPlacementPayload(orderId: string, row: Record<string, string>): Record<string, unknown> {
  const get = (displayKey: string) => row[displayKey] ?? row[sanitizeDynamicColumnKey(displayKey)] ?? "";
  return {
    order_id: orderId,
    placement_id: get("Placement ID"),
    placement: get("Placement"),
    trafficker: get("Trafficker"),
    am: get("AM"),
    qa_am: get("QA AM"),
    format: get("Format"),
    deal: get("Deal"),
    start_date: get("Start Date"),
    end_date: get("End Date"),
    impressions: get("Impressions"),
    cpm_client: get("CPM Client"),
    cpm_adops: get("CPM AdOps"),
    insertion_order_id_dsp: get("Insertion Order ID - DSP"),
    insertion_order_name: (get("Insertion Order Name") || row.insertion_order_name) ?? null,
    order_campaign_id: (get("Order Campaign ID") || row.order_campaign_id) ?? null,
    order_campaign: (get("Order Campaign") || row.order_campaign) ?? null,
    dark_days: row.dark_days ?? null,
    per_day_impressions: row.per_day_impressions ?? null,
    dark_ranges: row.dark_ranges ?? null,
    assigned_ranges: row.assigned_ranges ?? null,
    cpm_celtra: (get("CPM Celtra") || row.cpm_celtra) ?? null,
    budget_adops: (get("Budget AdOps") || row.budget_adops) ?? null,
    budget_client: (get("Budget Client") || row.budget_client) ?? null,
    pacing: (get("Pacing") || row.pacing) ?? null,
    targeting_audience: (get("Targeting Audience") || row.targeting_audience) ?? null,
    important: (get("Important") || row.important) ?? null,
    kpi: (get("KPI") || row.kpi) ?? null,
    kpi_vcr: (get("KPI VCR") || row.kpi_vcr) ?? null,
    kpi_ctr: (get("KPI CTR") || row.kpi_ctr) ?? null,
    kpi_view: (get("KPI View") || row.kpi_view) ?? null,
    kpi_bsafe: (get("KPI BSafe") || row.kpi_bsafe) ?? null,
    kpi_oog: (get("KPI OOG") || row.kpi_oog) ?? null,
    kpi_ivt: (get("KPI IVT") || row.kpi_ivt) ?? null,
    teams_sharepoint: (get("Teams SharePoint") || row.teams_sharepoint) ?? null,
    dsp: (get("DSP") || row.dsp) ?? null,
    ads: (get("ADS") || row.ads) ?? null,
    vrf: (get("VRF") || row.vrf) ?? null,
    placement_group_id: (get("Placement Group ID") || row.placement_group_id) ?? null,
  };
}

function getPlacementIdAndName(row: Record<string, string>): { placementId: string; placement: string } {
  const get = (key: string) => String(row[key] ?? row[sanitizeDynamicColumnKey(key)] ?? "").trim();
  return { placementId: get("Placement ID"), placement: get("Placement") };
}

export async function insertPlacementsBatch(
  columnHeaders: string[],
  rows: Record<string, string>[],
  orderId: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (await isReadOnlyMonitorUser()) return { success: false, error: "Forbidden" };
  if (!orderId) return { success: false, error: "orderId is required" };

  const seenPlacementIds = new Set<string>();
  const seenPlacements = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const { placementId, placement } = getPlacementIdAndName(rows[i]);
    if (placementId) {
      if (seenPlacementIds.has(placementId)) return { success: false, error: `Placement ID "${placementId}" is duplicated in the form.` };
      seenPlacementIds.add(placementId);
    }
    if (placement) {
      if (seenPlacements.has(placement)) return { success: false, error: `Placement name "${placement}" is duplicated in the form.` };
      seenPlacements.add(placement);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const { placementId, placement } = getPlacementIdAndName(rows[i]);
    const err = await checkPlacementDuplicateGlobal(placementId, placement);
    if (err) return { success: false, error: err };
  }

  const placementPayloads = rows.map((row) => rowToPlacementPayload(orderId, row));
  const { error: placementsError } = await supabase.from(PLACEMENTS_TABLE).insert(placementPayloads);
  if (placementsError) {
    console.error("[insertPlacementsBatch] placements insert failed:", placementsError);
    return { success: false, error: placementsError.message };
  }

  await refreshAdvertiserCounts();
  invalidateAppData();
  return { success: true, count: placementPayloads.length };
}

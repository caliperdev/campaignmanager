"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/db";
import { CAMPAIGNS_TABLE, SOURCES_TABLE } from "@/db/schema";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import { getDynamicTableChunkWithCount } from "@/lib/tables";

const APP_DATA_TAG = "app-data";

function invalidateAppData() {
  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
}

export async function refreshAppCache() {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  revalidateTag(APP_DATA_TAG, "max");
  revalidatePath("/");
}

export async function updateCampaign(id: string, update: { name?: string; columnHeaders?: string[] }): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) payload.name = update.name.trim() || "Campaign";
  if (update.columnHeaders !== undefined) payload.column_headers = update.columnHeaders;
  const { error } = await supabase.from(CAMPAIGNS_TABLE).update(payload).eq("id", id);
  if (error) return false;
  invalidateAppData();
  return true;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) throw new Error("Forbidden");
  const { data: row } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("dynamic_table_name")
    .eq("id", id)
    .single();
  if (row?.dynamic_table_name) {
    const { error: rpcError } = await supabase.rpc("drop_dynamic_table", {
      p_table_name: row.dynamic_table_name,
    });
    if (rpcError) console.error("[deleteCampaign] drop_dynamic_table RPC error:", rpcError);
  }
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().eq("id", id);
  if (error) return false;
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

export async function fetchDynamicTableChunk(
  dynamicTableName: string,
  offset: number,
  limit: number,
) {
  return getDynamicTableChunkWithCount(dynamicTableName, offset, limit);
}

export async function updateDynamicTableRow(
  dynamicTableName: string,
  rowId: number,
  payload: Record<string, string | number>,
): Promise<boolean> {
  if (await isReadOnlyMonitorUser()) return false;
  const { error } = await supabase.from(dynamicTableName).update(payload).eq("id", rowId);
  if (error) return false;
  invalidateAppData();
  return true;
}

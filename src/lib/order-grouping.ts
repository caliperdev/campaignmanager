/**
 * Order grouping: campaign sub-groups within an order.
 * Server-safe (no "use client"); used by server and client components.
 */
import type { DynamicTableRow } from "@/lib/tables";

const ORDER_CAMPAIGN_COLS = ["order_campaign_id", "order_campaign"] as const;

export function getCampaignValue(row: DynamicTableRow): string {
  for (const col of ORDER_CAMPAIGN_COLS) {
    const v = row[col];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "Uncategorized";
}

export type CampaignGroup = { id: string; name: string; count: number };

export function groupRowsByCampaign(rows: DynamicTableRow[]): CampaignGroup[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const val = getCampaignValue(row);
    const existing = map.get(val);
    if (existing) existing.count++;
    else map.set(val, { name: val, count: 1 });
  }
  return Array.from(map.entries()).map(([id, { name, count }]) => ({ id, name, count }));
}

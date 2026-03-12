import Link from "next/link";
import { getOrders, getAgencies, getCampaigns, getAdvertisers, getCampaign, getPlacementsForOrder } from "@/lib/tables";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { getCampaignValue } from "@/lib/order-grouping";
import { getPlacementStatusLabel } from "@/lib/placement-status";
import { AllPlacementsRow, PlacementsTableHeader } from "@/components/AllPlacementsRow";
import type { DynamicTableRow } from "@/lib/tables";

export const metadata = {
  title: "Placements",
  description: "Browse all placements",
};

const GROUP_OPTIONS = [
  { value: "none", label: "—" },
  { value: "agency", label: "Agency" },
  { value: "advertiser", label: "Advertiser" },
  { value: "order", label: "Order" },
  { value: "campaign", label: "Campaign" },
  { value: "status", label: "Status" },
  { value: "creationYearMonth", label: "Creation year-month" },
] as const;

type GroupBy = (typeof GROUP_OPTIONS)[number]["value"];

function formatCreationYearMonth(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  } catch {
    return iso.slice(0, 7);
  }
}

type FlatItem = {
  row: DynamicTableRow;
  order: { id: string; name: string; createdAt: string };
  campaignDisplayName: string;
  campaignUuid: string;
  advertiserId: string | null;
  advertiserName: string;
  agencyName: string;
  orderCreatedAt: string;
  statusLabel: "Upcoming" | "Live" | "Ended" | "Unknown";
};

const SORT_COLUMNS = [
  { key: "placement", label: "Placement" },
  { key: "advertiser", label: "Advertiser" },
  { key: "campaignId", label: "Campaign ID" },
  { key: "order", label: "Order#" },
  { key: "format", label: "Format" },
  { key: "deal", label: "Deal" },
  { key: "startEnd", label: "Start – End" },
  { key: "impressions", label: "Impressions Goal" },
] as const;

type SortBy = (typeof SORT_COLUMNS)[number]["key"];

function getRowVal(row: Record<string, unknown>, ...keys: string[]): string {
  for (const col of keys) {
    const k = col.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 63) || "col";
    const v = row[k] ?? row[col];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function getSortValue(item: FlatItem, sortBy: SortBy): string | number {
  const row = item.row as Record<string, unknown>;
  const get = (col: string) => {
    const k = col.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 63) || "col";
    const v = row[k] ?? row[col];
    return String(v ?? "");
  };
  switch (sortBy) {
    case "placement":
      return get("placement_id") || get("Placement ID") || get("Placement") || "";
    case "advertiser":
      return item.advertiserName || "";
    case "campaignId":
      return item.campaignDisplayName || "";
    case "order":
      return get("Order Number") || item.order.name || "";
    case "format":
      return get("Format") || "";
    case "deal":
      return get("Deal") || "";
    case "startEnd": {
      const start = get("Start Date") || get("start_date") || "";
      return start;
    }
    case "impressions": {
      const s = get("Impressions") || get("impressions") || "";
      const n = parseInt(s.replace(/\D/g, ""), 10);
      return isNaN(n) ? -1 : n;
    }
    default:
      return "";
  }
}

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; sortBy?: string; sortOrder?: string; filterStatus?: string; filterAdvertiser?: string; filterAgency?: string; filterOrder?: string; filterCampaign?: string; filterFormat?: string; filterDeal?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { groupBy: rawGroupBy, search = "", sortBy: rawSortBy, sortOrder: rawSortOrder } = params;
  const currentFilters: Record<string, string[]> = {
    status: parseFilterParam(params.filterStatus),
    advertiser: parseFilterParam(params.filterAdvertiser),
    agency: parseFilterParam(params.filterAgency),
    order: parseFilterParam(params.filterOrder),
    campaign: parseFilterParam(params.filterCampaign),
    format: parseFilterParam(params.filterFormat),
    deal: parseFilterParam(params.filterDeal),
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };
  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const sortBy: SortBy | null =
    SORT_COLUMNS.some((c) => c.key === rawSortBy) ? (rawSortBy as SortBy) : null;
  const sortOrder = rawSortOrder === "desc" ? "desc" : "asc";

  const [orders, agencies, campaigns, advertisers] = await Promise.all([
    getOrders(),
    getAgencies(),
    getCampaigns(),
    getAdvertisers(),
  ]);
  const agencyById = new Map(agencies.map((a) => [a.id, a]));
  const advertiserById = new Map(advertisers.map((a) => [a.id, a]));
  const campaignUuidByDisplay = new Map<string, string>();
  for (const c of campaigns) {
    const displayId = (c.externalId?.trim() || c.name || "").trim() || c.id;
    campaignUuidByDisplay.set(c.id, c.id);
    campaignUuidByDisplay.set(displayId, c.id);
  }

  const flat: FlatItem[] = [];
  const ROW_LIMIT = 5000;

  for (const order of orders) {
    const campaign = await getCampaign(order.campaignId);
    const agency = campaign?.agencyId ? agencyById.get(campaign.agencyId) : null;
    const agencyName = agency?.name ?? "No agency";
    const advertiserId = campaign?.advertiserId ?? null;
    const advertiserName = advertiserId ? advertiserById.get(advertiserId)?.advertiser ?? "" : "";
    const campaignDisplayName = campaign?.externalId?.trim() || campaign?.name || order.campaignId || "";
    const campaignUuid = campaign?.id ?? order.campaignId;
    const orderCreatedAt = order.createdAt;

    const { rows } = await getPlacementsForOrder(order.id, 0, ROW_LIMIT);
    for (const row of rows) {
      const rowCampaignDisplay = getCampaignValue(row);
      const rowCampaignUuid = campaignUuidByDisplay.get(rowCampaignDisplay) ?? rowCampaignDisplay;
      flat.push({
        row,
        order: { id: order.id, name: order.name, createdAt: orderCreatedAt },
        campaignDisplayName: rowCampaignDisplay || campaignDisplayName,
        campaignUuid: rowCampaignUuid || campaignUuid,
        advertiserId,
        advertiserName,
        agencyName,
        orderCreatedAt,
        statusLabel: getPlacementStatusLabel(row as Record<string, unknown>),
      });
    }
  }

  let filteredFlat = search.trim()
    ? flat.filter((item) =>
        matchesSearch(
          search,
          item.order.name,
          item.campaignDisplayName,
          item.advertiserName,
          item.agencyName,
          ...Object.values(item.row).filter((v): v is string => typeof v === "string"),
        )
      )
    : flat;

  const applyFilter = (items: FlatItem[]) => {
    let out = items;
    const statusSet = currentFilters.status.length ? new Set(currentFilters.status) : null;
    if (statusSet) out = out.filter((i) => statusSet.has(i.statusLabel));
    const advSet = currentFilters.advertiser.length ? new Set(currentFilters.advertiser) : null;
    if (advSet) out = out.filter((i) => i.advertiserId && advSet.has(i.advertiserId));
    const agencySet = currentFilters.agency.length ? new Set(currentFilters.agency) : null;
    if (agencySet) out = out.filter((i) => agencySet.has(i.agencyName));
    const orderSet = currentFilters.order.length ? new Set(currentFilters.order) : null;
    if (orderSet) out = out.filter((i) => orderSet.has(i.order.id));
    const campaignSet = currentFilters.campaign.length ? new Set(currentFilters.campaign) : null;
    if (campaignSet) out = out.filter((i) => campaignSet.has(i.campaignDisplayName));
    const formatSet = currentFilters.format.length ? new Set(currentFilters.format) : null;
    if (formatSet) out = out.filter((i) => {
      const f = getRowVal(i.row as Record<string, unknown>, "Format", "format");
      return f && formatSet.has(f);
    });
    const dealSet = currentFilters.deal.length ? new Set(currentFilters.deal) : null;
    if (dealSet) out = out.filter((i) => {
      const d = getRowVal(i.row as Record<string, unknown>, "Deal", "deal");
      return d && dealSet.has(d);
    });
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (ymSet) out = out.filter((i) => {
      const key = (i.orderCreatedAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
    return out;
  };
  filteredFlat = applyFilter(filteredFlat);

  const filterDimensions: FilterDimension[] = (() => {
    const statusOpts = ["Upcoming", "Live", "Ended", "Unknown"] as const;
    const statusOptions = statusOpts.filter((s) => flat.some((i) => i.statusLabel === s));
    const advMap = new Map<string, string>();
    const agencySet = new Set<string>();
    const orderMap = new Map<string, string>();
    const campaignSet = new Set<string>();
    const formatSet = new Set<string>();
    const dealSet = new Set<string>();
    const ymMap = new Map<string, string>();
    for (const i of flat) {
      if (i.advertiserId && i.advertiserName) advMap.set(i.advertiserId, i.advertiserName);
      if (i.agencyName) agencySet.add(i.agencyName);
      orderMap.set(i.order.id, i.order.name);
      if (i.campaignDisplayName) campaignSet.add(i.campaignDisplayName);
      const f = getRowVal(i.row as Record<string, unknown>, "Format", "format");
      if (f) formatSet.add(f);
      const d = getRowVal(i.row as Record<string, unknown>, "Deal", "deal");
      if (d) dealSet.add(d);
      const key = (i.orderCreatedAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(i.orderCreatedAt ?? ""));
    }
    const dims: FilterDimension[] = [];
    if (statusOptions.length) dims.push({ key: "status", label: "Status", options: statusOptions.map((v) => ({ value: v, label: v })) });
    if (advMap.size) dims.push({ key: "advertiser", label: "Advertiser", options: [...advMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (agencySet.size) dims.push({ key: "agency", label: "Agency", options: [...agencySet].sort().map((v) => ({ value: v, label: v })) });
    if (orderMap.size) dims.push({ key: "order", label: "Order", options: [...orderMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (campaignSet.size) dims.push({ key: "campaign", label: "Campaign", options: [...campaignSet].sort().map((v) => ({ value: v, label: v })) });
    if (formatSet.size) dims.push({ key: "format", label: "Format", options: [...formatSet].sort().map((v) => ({ value: v, label: v })) });
    if (dealSet.size) dims.push({ key: "deal", label: "Deal", options: [...dealSet].sort().map((v) => ({ value: v, label: v })) });
    if (ymMap.size) dims.push({ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) });
    return dims;
  })();

  if (sortBy) {
    filteredFlat = [...filteredFlat].sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }

  const totalPlacements = filteredFlat.length;
  const hasData = flat.length > 0;
  const hasResults = totalPlacements > 0;

  type Group = { key: string; label: string; items: FlatItem[] };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "", items: filteredFlat }];
  } else if (groupBy === "order") {
    const byOrder = new Map<string, FlatItem[]>();
    for (const item of filteredFlat) {
      const key = item.order.id;
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key)!.push(item);
    }
    groups = orders
      .filter((o) => byOrder.has(o.id))
      .map((order) => ({
        key: order.id,
        label: order.name,
        items: byOrder.get(order.id)!,
      }));
  } else if (groupBy === "advertiser") {
    const byAdvertiser = new Map<string, FlatItem[]>();
    for (const item of filteredFlat) {
      const key = item.advertiserId ?? "__none";
      if (!byAdvertiser.has(key)) byAdvertiser.set(key, []);
      byAdvertiser.get(key)!.push(item);
    }
    groups = [...byAdvertiser.entries()]
      .sort(([a], [b]) => {
        if (a === "__none") return 1;
        if (b === "__none") return -1;
        return (advertiserById.get(a)?.advertiser ?? "").localeCompare(advertiserById.get(b)?.advertiser ?? "", undefined, { sensitivity: "base" });
      })
      .map(([key, items]) => ({
        key,
        label: key === "__none" ? "No advertiser" : (advertiserById.get(key)?.advertiser ?? "—"),
        items,
      }));
  } else if (groupBy === "agency") {
    const byAgency = new Map<string, FlatItem[]>();
    for (const item of filteredFlat) {
      const label = item.agencyName;
      if (!byAgency.has(label)) byAgency.set(label, []);
      byAgency.get(label)!.push(item);
    }
    groups = [...byAgency.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([label, items]) => ({ key: label, label, items }));
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, FlatItem[]>();
    for (const item of filteredFlat) {
      const key = item.orderCreatedAt.slice(0, 7);
      const label = formatCreationYearMonth(item.orderCreatedAt);
      if (!byYearMonth.has(key)) byYearMonth.set(key, []);
      byYearMonth.get(key)!.push(item);
    }
    groups = [...byYearMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({ key, label: formatCreationYearMonth(items[0]!.orderCreatedAt), items }));
  } else if (groupBy === "status") {
    const byStatus = new Map<string, FlatItem[]>();
    const order: ("Upcoming" | "Live" | "Ended" | "Unknown")[] = ["Live", "Upcoming", "Ended", "Unknown"];
    for (const item of filteredFlat) {
      const key = item.statusLabel;
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key)!.push(item);
    }
    groups = order
      .filter((k) => byStatus.has(k))
      .map((key) => ({ key, label: key, items: byStatus.get(key)! }));
  } else {
    const byCampaign = new Map<string, FlatItem[]>();
    for (const item of filteredFlat) {
      const key = `${item.order.id}\t${item.campaignUuid}`;
      if (!byCampaign.has(key)) byCampaign.set(key, []);
      byCampaign.get(key)!.push(item);
    }
    groups = [...byCampaign.entries()].map(([key, items]) => ({
      key,
      label: items[0]!.campaignDisplayName,
      items,
    }));
  }

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">All Placements</button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
              <Link
                href="/placements/new"
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background: "var(--accent-mint)",
                  border: "none",
                  borderRadius: "var(--radius-s)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                New placement
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No placements yet. Add orders and create placements to see them here.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Placements (0)
                </p>
                <DebouncedSearchInput placeholder="Search placements…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={flat.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/placements/new"
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "white",
                    background: "var(--accent-mint)",
                    border: "none",
                    borderRadius: "var(--radius-s)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  New placement
                </Link>
              </div>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No results for &quot;{search}&quot;. Try a different search.
            </p>
          </>
        ) : (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Placements ({totalPlacements})
                </p>
                <DebouncedSearchInput placeholder="Search placements…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={flat.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/placements/new"
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "white",
                    background: "var(--accent-mint)",
                    border: "none",
                    borderRadius: "var(--radius-s)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  New placement
                </Link>
              </div>
            </div>
            <div className="table-grid table-grid--placements">
              <PlacementsTableHeader sortBy={sortBy ?? undefined} sortOrder={sortOrder} />
              {groups.map(({ key, label, items }) => (
                <span key={key} style={{ display: "contents" }}>
                  {groupBy !== "none" && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginTop: 12,
                        marginBottom: 4,
                      }}
                    >
                      {groupBy === "advertiser" && key !== "__none" ? (
                        <Link href={`/advertisers/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </div>
                  )}
                  {items.map(({ row, order, campaignDisplayName, campaignUuid, advertiserId, advertiserName }) => (
                    <AllPlacementsRow
                      key={`${order.id}-${campaignUuid}-${row.id}`}
                      row={row}
                      order={order}
                      campaignUuid={campaignUuid}
                      campaignDisplayName={campaignDisplayName}
                      advertiserId={advertiserId}
                      advertiserName={advertiserName}
                    />
                  ))}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

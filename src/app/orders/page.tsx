import Link from "next/link";
import { getOrders, getCampaigns, getAgencies, getAdvertisers, getOrderPlacementCount, getOrderActivePlacementCount } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { OrderListRow, OrdersTableHeader, type OrderListItem } from "@/components/OrderListRow";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export const metadata = {
  title: "Orders",
  description: "Manage your orders",
};

const GROUP_OPTIONS = [
  { value: "none", label: "—" },
  { value: "agency", label: "Agency" },
  { value: "advertiser", label: "Advertiser" },
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; filterStatus?: string; filterAdvertiser?: string; filterAgency?: string; filterCampaign?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { groupBy: rawGroupBy, search = "" } = params;
  const currentFilters: Record<string, string[]> = {
    status: parseFilterParam(params.filterStatus),
    advertiser: parseFilterParam(params.filterAdvertiser),
    agency: parseFilterParam(params.filterAgency),
    campaign: parseFilterParam(params.filterCampaign),
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };
  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const [orders, campaigns, agencies, advertisers] = await Promise.all([
    getOrders(),
    getCampaigns(),
    getAgencies(),
    getAdvertisers(),
  ]);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const agencyById = new Map(agencies.map((a) => [a.id, a]));
  const advertiserById = new Map(advertisers.map((a) => [a.id, a]));

  const ordersWithStats: OrderListItem[] = await Promise.all(
    orders.map(async (order) => {
      const campaign = campaignById.get(order.campaignId);
      const agency = campaign?.agencyId ? agencyById.get(campaign.agencyId) : null;
      const campaignName = (campaign?.externalId?.trim() || campaign?.name) ?? "—";
      const advertiser = campaign?.advertiserId ? advertiserById.get(campaign.advertiserId) : null;
      const [placementsCount, activePlacementCount] = await Promise.all([
        getOrderPlacementCount(order),
        getOrderActivePlacementCount(order.id),
      ]);
      const statusLabel = activePlacementCount > 0 ? "Live" : "Ended";
      return {
        id: order.id,
        name: order.name,
        campaignId: order.campaignId,
        campaignName,
        advertiserId: campaign?.advertiserId,
        advertiserName: advertiser?.advertiser ?? "—",
        agencyId: campaign?.agencyId,
        agencyName: agency?.name ?? "—",
        createdAt: order.createdAt,
        statusLabel,
        placementsCount,
        activePlacementCount,
        documentPath: order.documentPath,
      };
    }),
  );
  let filteredOrders = search.trim()
    ? ordersWithStats.filter((o) => matchesSearch(search, o.name, o.campaignName, o.advertiserName))
    : ordersWithStats;

  const applyFilter = (items: OrderListItem[]) => {
    let out = items;
    const statusSet = currentFilters.status.length ? new Set(currentFilters.status) : null;
    if (statusSet) out = out.filter((o) => statusSet.has(o.statusLabel ?? ""));
    const advSet = currentFilters.advertiser.length ? new Set(currentFilters.advertiser) : null;
    if (advSet) out = out.filter((o) => o.advertiserId && advSet.has(o.advertiserId));
    const agencySet = currentFilters.agency.length ? new Set(currentFilters.agency) : null;
    if (agencySet) out = out.filter((o) => o.agencyId && agencySet.has(o.agencyId));
    const campaignSet = currentFilters.campaign.length ? new Set(currentFilters.campaign) : null;
    if (campaignSet) out = out.filter((o) => campaignSet.has(o.campaignId));
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (ymSet) out = out.filter((o) => {
      const key = (o.createdAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
    return out;
  };
  filteredOrders = applyFilter(filteredOrders);

  const filterDimensions: FilterDimension[] = (() => {
    const advMap = new Map<string, string>();
    const agencyMap = new Map<string, string>();
    const campaignMap = new Map<string, string>();
    const ymMap = new Map<string, string>();
    for (const o of ordersWithStats) {
      if (o.advertiserId && o.advertiserName) advMap.set(o.advertiserId, o.advertiserName);
      if (o.agencyId && o.agencyName) agencyMap.set(o.agencyId, o.agencyName);
      if (o.campaignId && o.campaignName) campaignMap.set(o.campaignId, o.campaignName);
      const key = (o.createdAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(o.createdAt ?? ""));
    }
    const dims: FilterDimension[] = [
      { key: "status", label: "Status", options: [{ value: "Live", label: "Live" }, { value: "Ended", label: "Ended" }] },
    ];
    if (advMap.size) dims.push({ key: "advertiser", label: "Advertiser", options: [...advMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (agencyMap.size) dims.push({ key: "agency", label: "Agency", options: [...agencyMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (campaignMap.size) dims.push({ key: "campaign", label: "Campaign", options: [...campaignMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (ymMap.size) dims.push({ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) });
    return dims;
  })();

  type Group = { key: string; label: string; orders: OrderListItem[] };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "All", orders: filteredOrders }];
  } else if (groupBy === "campaign") {
    const byCampaign = new Map<string, OrderListItem[]>();
    for (const order of filteredOrders) {
      const key = order.campaignId;
      if (!byCampaign.has(key)) byCampaign.set(key, []);
      byCampaign.get(key)!.push(order);
    }
    groups = [...byCampaign.entries()].map(([key, list]) => {
      const campaign = campaignById.get(key);
      const label = (campaign?.externalId?.trim() || campaign?.name) ?? "—";
      return { key, label, orders: list };
    });
  } else if (groupBy === "agency") {
    const byAgency = new Map<string, OrderListItem[]>();
    for (const order of filteredOrders) {
      const agencyId = order.agencyId ?? "__none";
      const key = agencyId;
      if (!byAgency.has(key)) byAgency.set(key, []);
      byAgency.get(key)!.push(order);
    }
    groups = [...byAgency.entries()]
      .sort(([a], [b]) => (a === "__none" ? 1 : b === "__none" ? -1 : (agencyById.get(a)?.name ?? "").localeCompare(agencyById.get(b)?.name ?? "", undefined, { sensitivity: "base" })))
      .map(([key, orders]) => ({
        key,
        label: key === "__none" ? "No agency" : (agencyById.get(key)?.name ?? "—"),
        orders,
      }));
  } else if (groupBy === "status") {
    const byStatus = new Map<string, OrderListItem[]>();
    const statusOrder: ("Live" | "Ended")[] = ["Live", "Ended"];
    for (const o of filteredOrders) {
      const key = o.statusLabel ?? "Ended";
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key)!.push(o);
    }
    groups = statusOrder
      .filter((k) => byStatus.has(k))
      .map((key) => ({ key, label: key, orders: byStatus.get(key)! }));
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, OrderListItem[]>();
    for (const order of filteredOrders) {
      const created = order.createdAt ?? "";
      const key = created.slice(0, 7);
      const label = formatCreationYearMonth(created);
      if (!byYearMonth.has(key)) byYearMonth.set(key, []);
      byYearMonth.get(key)!.push(order);
    }
    groups = [...byYearMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({ key, label: formatCreationYearMonth(items[0]!.createdAt ?? ""), orders: items }));
  } else {
    const byAdvertiser = new Map<string, OrderListItem[]>();
    for (const order of filteredOrders) {
      const campaign = campaignById.get(order.campaignId);
      const advertiserId = campaign?.advertiserId ?? "__none";
      const key = advertiserId;
      if (!byAdvertiser.has(key)) byAdvertiser.set(key, []);
      byAdvertiser.get(key)!.push(order);
    }
    groups = [...byAdvertiser.entries()]
      .sort(([a], [b]) => {
        if (a === "__none") return 1;
        if (b === "__none") return -1;
        return (advertiserById.get(a)?.advertiser ?? "").localeCompare(advertiserById.get(b)?.advertiser ?? "", undefined, { sensitivity: "base" });
      })
      .map(([key, orders]) => ({
        key,
        label: key === "__none" ? "No advertiser" : (advertiserById.get(key)?.advertiser ?? "—"),
        orders,
      }));
  }

  const totalOrders = filteredOrders.length;
  const hasData = ordersWithStats.length > 0;
  const hasResults = totalOrders > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">All Orders</button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
              <Link
                href="/orders/new"
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
                New order
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No orders yet. Create a campaign first, then create an order.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Orders (0)
                </p>
                <DebouncedSearchInput placeholder="Search orders…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={ordersWithStats.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/orders/new"
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
                  New order
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
                  Orders ({totalOrders})
                </p>
                <DebouncedSearchInput placeholder="Search orders…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={ordersWithStats.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/orders/new"
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
                New order
              </Link>
              </div>
            </div>
            {groups.map(({ key, label, orders: groupOrders }) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {groupBy !== "none" && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {groupBy === "agency" && key !== "__none" ? (
                      <Link href={`/agencies/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : groupBy === "advertiser" && key !== "__none" ? (
                      <Link href={`/advertisers/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                )}
                <div className="table-grid table-grid--orders" style={{ marginLeft: groupBy === "none" ? 0 : 12 }}>
                  <OrdersTableHeader marginLeft={0} />
                  {groupOrders.map((order) => (
                    <OrderListRow key={order.id} order={order} marginLeft={0} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

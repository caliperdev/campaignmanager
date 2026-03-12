import Link from "next/link";
import { getCampaigns, getAgencies, getAdvertisers, getClients, getOrdersForCampaign, getCampaignCountsMap, getCampaignStatusesMap, getCampaignPlacementCountsByStatusMap, type PlacementCountsByStatus } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { CampaignListRow, CampaignsTableHeader } from "@/components/CampaignListRow";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export const metadata = {
  title: "Campaigns",
  description: "Browse all campaigns",
};

const GROUP_OPTIONS = [
  { value: "none", label: "—" },
  { value: "client", label: "Client" },
  { value: "agency", label: "Agency" },
  { value: "advertiser", label: "Advertiser" },
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

export type CampaignListItem = {
  id: string;
  name: string;
  advertiserId: string;
  advertiserName: string;
  agencyId: string;
  agencyName: string;
  clientId: string;
  clientName: string;
  externalId?: string | null;
  createdAt: string;
  ordersCount: number;
  placementsCount: number;
  activePlacementCount: number;
  statusLabel: "Upcoming" | "Live" | "Ended";
  placementCountsByStatus?: PlacementCountsByStatus;
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; filterStatus?: string; filterClient?: string; filterAdvertiser?: string; filterAgency?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { groupBy: rawGroupBy, search = "" } = params;
  const currentFilters: Record<string, string[]> = {
    status: parseFilterParam(params.filterStatus),
    client: parseFilterParam(params.filterClient),
    advertiser: parseFilterParam(params.filterAdvertiser),
    agency: parseFilterParam(params.filterAgency),
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };
  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const [campaigns, agencies, advertisers, clients, campaignCountsMap, campaignStatusesMap, campaignPlacementCountsByStatusMap] = await Promise.all([
    getCampaigns(),
    getAgencies(),
    getAdvertisers(),
    getClients(),
    getCampaignCountsMap(),
    getCampaignStatusesMap(),
    getCampaignPlacementCountsByStatusMap(),
  ]);
  const agenciesFiltered = agencies.filter((a) => a.name !== "No agency");
  const clientsFiltered = clients.filter((c) => c.name !== "No client");
  const agencyById = new Map(agencies.map((a) => [a.id, a]));
  const advertiserById = new Map(advertisers.map((a) => [a.id, a]));
  const clientById = new Map(clients.map((c) => [c.id, c.name]));

  const allItems: CampaignListItem[] = await Promise.all(
    campaigns.map(async (c) => {
      const orders = await getOrdersForCampaign(c.id);
      const ordersCount = orders.length;
      const placementsCount = orders.reduce((s, o) => s + (o.count ?? 0), 0);
      const adv = advertiserById.get(c.advertiserId);
      const agency = c.agencyId ? agencyById.get(c.agencyId) : null;
      const clientName = c.clientId ? (clientById.get(c.clientId) ?? "—") : "—";
      const activePlacementCount = campaignCountsMap.get(c.id) ?? 0;
      const statusLabel = campaignStatusesMap.get(c.id) ?? "Ended";
      const placementCountsByStatus = campaignPlacementCountsByStatusMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        advertiserId: c.advertiserId,
        advertiserName: adv?.advertiser ?? "—",
        agencyId: c.agencyId,
        agencyName: agency?.name ?? "—",
        clientId: c.clientId,
        clientName,
        externalId: c.externalId ?? undefined,
        createdAt: c.createdAt,
        ordersCount,
        placementsCount,
        activePlacementCount,
        statusLabel,
        placementCountsByStatus,
      };
    }),
  );
  let items = search.trim()
    ? allItems.filter((i) =>
        matchesSearch(search, i.name, i.externalId ?? undefined, i.advertiserName, i.agencyName, i.clientName)
      )
    : allItems;

  const applyFilter = (list: CampaignListItem[]) => {
    let out = list;
    const statusSet = currentFilters.status.length ? new Set(currentFilters.status) : null;
    if (statusSet) out = out.filter((i) => statusSet.has(i.statusLabel));
    const clientSet = currentFilters.client.length ? new Set(currentFilters.client) : null;
    if (clientSet) out = out.filter((i) => i.clientId && clientSet.has(i.clientId));
    const advSet = currentFilters.advertiser.length ? new Set(currentFilters.advertiser) : null;
    if (advSet) out = out.filter((i) => advSet.has(i.advertiserId));
    const agencySet = currentFilters.agency.length ? new Set(currentFilters.agency) : null;
    if (agencySet) out = out.filter((i) => agencySet.has(i.agencyId));
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (ymSet) out = out.filter((i) => {
      const key = (i.createdAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
    return out;
  };
  items = applyFilter(items);

  const filterDimensions: FilterDimension[] = (() => {
    const clientMap = new Map<string, string>();
    const advMap = new Map<string, string>();
    const agencyMap = new Map<string, string>();
    const ymMap = new Map<string, string>();
    for (const i of allItems) {
      if (i.clientId && i.clientName) clientMap.set(i.clientId, i.clientName);
      advMap.set(i.advertiserId, i.advertiserName);
      agencyMap.set(i.agencyId, i.agencyName);
      const key = (i.createdAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(i.createdAt ?? ""));
    }
    const dims: FilterDimension[] = [
      { key: "status", label: "Status", options: [{ value: "Upcoming", label: "Upcoming" }, { value: "Live", label: "Live" }, { value: "Ended", label: "Ended" }] },
    ];
    if (clientMap.size) dims.push({ key: "client", label: "Client", options: [...clientMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (advMap.size) dims.push({ key: "advertiser", label: "Advertiser", options: [...advMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (agencyMap.size) dims.push({ key: "agency", label: "Agency", options: [...agencyMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (ymMap.size) dims.push({ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) });
    return dims;
  })();

  type Group = { key: string; label: string; items: CampaignListItem[] };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "", items }];
  } else if (groupBy === "client") {
    const byClient = new Map<string, CampaignListItem[]>();
    for (const item of items) {
      const key = item.clientId ?? "__none";
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(item);
    }
    groups = [...byClient.entries()]
      .sort(([a], [b]) => {
        if (a === "__none") return 1;
        if (b === "__none") return -1;
        return (clientById.get(a) ?? "").localeCompare(clientById.get(b) ?? "", undefined, { sensitivity: "base" });
      })
      .map(([key, list]) => ({
        key,
        label: key === "__none" ? "No client" : (clientById.get(key) ?? "—"),
        items: list,
      }));
  } else if (groupBy === "agency") {
    const byAgency = new Map<string, CampaignListItem[]>();
    for (const item of items) {
      const key = item.agencyId ?? "__none";
      if (!byAgency.has(key)) byAgency.set(key, []);
      byAgency.get(key)!.push(item);
    }
    groups = [...byAgency.entries()]
      .sort(([a], [b]) => (a === "__none" ? 1 : b === "__none" ? -1 : (agencyById.get(a)?.name ?? "").localeCompare(agencyById.get(b)?.name ?? "", undefined, { sensitivity: "base" })))
      .map(([key, list]) => ({ key, label: key === "__none" ? "No agency" : (agencyById.get(key)?.name ?? "—"), items: list }));
  } else if (groupBy === "advertiser") {
    const byAdvertiser = new Map<string, CampaignListItem[]>();
    for (const item of items) {
      const key = item.advertiserId;
      if (!byAdvertiser.has(key)) byAdvertiser.set(key, []);
      byAdvertiser.get(key)!.push(item);
    }
    groups = [...byAdvertiser.entries()]
      .sort(([, a], [, b]) => (a[0]?.advertiserName ?? "").localeCompare(b[0]?.advertiserName ?? "", undefined, { sensitivity: "base" }))
      .map(([key, list]) => ({ key, label: list[0]?.advertiserName ?? "—", items: list }));
  } else if (groupBy === "status") {
    const byStatus = new Map<string, CampaignListItem[]>();
    const statusOrder: ("Upcoming" | "Live" | "Ended")[] = ["Live", "Upcoming", "Ended"];
    for (const item of items) {
      const key = item.statusLabel;
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key)!.push(item);
    }
    groups = statusOrder
      .filter((k) => byStatus.has(k))
      .map((key) => ({ key, label: key, items: byStatus.get(key)! }));
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, CampaignListItem[]>();
    for (const item of items) {
      const key = item.createdAt.slice(0, 7);
      if (!byYearMonth.has(key)) byYearMonth.set(key, []);
      byYearMonth.get(key)!.push(item);
    }
    groups = [...byYearMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => ({ key, label: formatCreationYearMonth(list[0]!.createdAt), items: list }));
  }

  const hasData = allItems.length > 0;
  const hasResults = items.length > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">All Campaigns</button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
              <Link
                href="/campaigns/new"
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
                New campaign
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No campaigns yet. Create a campaign from the New campaign button.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Campaigns (0)
                </p>
                <DebouncedSearchInput placeholder="Search campaigns…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={items.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/campaigns/new"
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
                New campaign
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
                  Campaigns ({items.length})
                </p>
                <DebouncedSearchInput placeholder="Search campaigns…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={items.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/campaigns/new"
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
                New campaign
              </Link>
              </div>
            </div>
            {groups.map(({ key, label, items: groupItems }) => (
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
                    {groupBy === "advertiser" ? (
                      <Link href={`/advertisers/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : groupBy === "client" && key !== "__none" ? (
                      <Link href={`/clients/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : groupBy === "agency" && key !== "__none" ? (
                      <Link href={`/agencies/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                )}
                <div className="table-grid table-grid--campaigns" style={{ marginLeft: groupBy === "none" ? 0 : 12 }}>
                  <CampaignsTableHeader marginLeft={0} />
                  {groupItems.map((item) => (
                    <CampaignListRow key={item.id} campaign={item} advertisers={advertisers} agencies={agenciesFiltered} clients={clientsFiltered} marginLeft={0} />
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

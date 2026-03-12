import Link from "next/link";
import { getAdvertisers, getCampaigns, getAgencies, getCampaignStatusesMap, getCampaignPlacementCountsByStatusMap, type PlacementCountsByStatus } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { AdvertiserListRow, AdvertisersTableHeader } from "@/components/AdvertiserListRow";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}
import type { Advertiser } from "@/db/schema";

export const metadata = {
  title: "Advertisers",
  description: "Advertisers overview",
};

const GROUP_OPTIONS = [
  { value: "none", label: "—" },
  { value: "agency", label: "Agency" },
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

type AdvertiserItem = Advertiser & {
  agencyId: string | null;
  agencyName: string;
  createdAt: string;
  statusLabel: "Upcoming" | "Live" | "Ended";
  placementCountsByStatus?: PlacementCountsByStatus;
};

export default async function AdvertisersPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; filterAgency?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { search = "", groupBy: rawGroupBy } = params;
  const currentFilters: Record<string, string[]> = {
    agency: parseFilterParam(params.filterAgency),
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };

  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const [advertisers, campaigns, agencies, campaignStatusesMap, campaignPlacementCountsByStatusMap] = await Promise.all([
    getAdvertisers(),
    getCampaigns(),
    getAgencies(),
    getCampaignStatusesMap(),
    getCampaignPlacementCountsByStatusMap(),
  ]);
  const agencyById = new Map(agencies.map((a) => [a.id, a]));
  const campaignsByAdvertiser = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    if (!campaignsByAdvertiser.has(c.advertiserId)) campaignsByAdvertiser.set(c.advertiserId, []);
    campaignsByAdvertiser.get(c.advertiserId)!.push(c);
  }

  const items: AdvertiserItem[] = advertisers.map((a) => {
    const advCampaigns = campaignsByAdvertiser.get(a.id) ?? [];
    const firstCampaign = advCampaigns[0];
    const agencyId = firstCampaign?.agencyId ?? null;
    const agencyName = agencyId ? (agencyById.get(agencyId)?.name ?? "—") : "—";
    const createdAt = advCampaigns.length > 0
      ? advCampaigns.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), advCampaigns[0].createdAt)
      : "";
    const campaignStatuses = advCampaigns.map((c) => campaignStatusesMap.get(c.id) ?? "Ended");
    const statusLabel = campaignStatuses.some((s) => s === "Live") ? "Live" : campaignStatuses.some((s) => s === "Upcoming") ? "Upcoming" : "Ended";
    const placementCountsByStatus = advCampaigns.reduce<PlacementCountsByStatus>(
      (acc, c) => {
        const counts = campaignPlacementCountsByStatusMap.get(c.id);
        if (counts) {
          acc.liveCount += counts.liveCount;
          acc.upcomingCount += counts.upcomingCount;
          acc.endedCount += counts.endedCount;
        }
        return acc;
      },
      { liveCount: 0, upcomingCount: 0, endedCount: 0 }
    );
    return {
      ...a,
      agencyId,
      agencyName,
      createdAt,
      statusLabel,
      placementCountsByStatus,
    };
  });

  let filteredItems = search.trim()
    ? items.filter((a) => matchesSearch(search, a.advertiser))
    : items;

  const applyFilter = (list: AdvertiserItem[]) => {
    let out = list;
    const agencySet = currentFilters.agency.length ? new Set(currentFilters.agency) : null;
    if (agencySet) out = out.filter((i) => i.agencyId && agencySet.has(i.agencyId));
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (ymSet) out = out.filter((i) => {
      const key = (i.createdAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
    return out;
  };
  filteredItems = applyFilter(filteredItems);

  const filterDimensions: FilterDimension[] = (() => {
    const agencyMap = new Map<string, string>();
    const ymMap = new Map<string, string>();
    for (const i of items) {
      if (i.agencyId && i.agencyName) agencyMap.set(i.agencyId, i.agencyName);
      const key = (i.createdAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(i.createdAt ?? ""));
    }
    const dims: FilterDimension[] = [];
    if (agencyMap.size) dims.push({ key: "agency", label: "Agency", options: [...agencyMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ value: v, label: l })) });
    if (ymMap.size) dims.push({ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) });
    return dims;
  })();

  type Group = { key: string; label: string; items: AdvertiserItem[] };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "", items: filteredItems }];
  } else if (groupBy === "agency") {
    const byAgency = new Map<string, AdvertiserItem[]>();
    for (const item of filteredItems) {
      const key = item.agencyId ?? "__none";
      if (!byAgency.has(key)) byAgency.set(key, []);
      byAgency.get(key)!.push(item);
    }
    groups = [...byAgency.entries()]
      .sort(([a], [b]) => (a === "__none" ? 1 : b === "__none" ? -1 : (agencyById.get(a)?.name ?? "").localeCompare(agencyById.get(b)?.name ?? "", undefined, { sensitivity: "base" })))
      .map(([key, list]) => ({
        key,
        label: key === "__none" ? "No agency" : (agencyById.get(key)?.name ?? "—"),
        items: list,
      }));
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, AdvertiserItem[]>();
    for (const item of filteredItems) {
      const key = item.createdAt ? item.createdAt.slice(0, 7) : "__none";
      if (!byYearMonth.has(key)) byYearMonth.set(key, []);
      byYearMonth.get(key)!.push(item);
    }
    groups = [...byYearMonth.entries()]
      .filter(([k]) => k !== "__none")
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => ({ key, label: formatCreationYearMonth(list[0]!.createdAt), items: list }));
    const noDate = byYearMonth.get("__none");
    if (noDate?.length) {
      groups.push({ key: "__none", label: "No creation date", items: noDate });
    }
  }

  const hasData = advertisers.length > 0;
  const hasResults = filteredItems.length > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">
          All Advertisers
        </button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
              <Link
                href="/advertisers/new"
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
                New advertiser
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No advertisers yet. Create an advertiser below. If you just added advertisers, use <strong>Refresh</strong> in the sidebar to reload data.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Advertisers (0)
                </p>
                <DebouncedSearchInput placeholder="Search advertisers…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filteredItems.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/advertisers/new"
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
                New advertiser
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
                  Advertisers ({filteredItems.length})
                </p>
                <DebouncedSearchInput placeholder="Search advertisers…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filteredItems.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/advertisers/new"
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
                New advertiser
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
                    {groupBy === "agency" && key !== "__none" ? (
                      <Link href={`/agencies/${key}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                )}
                <div className="table-grid table-grid--advertisers" style={{ marginLeft: groupBy === "none" ? 0 : 12 }}>
                  <AdvertisersTableHeader marginLeft={0} />
                  {groupItems.map((advertiser) => (
                    <AdvertiserListRow key={advertiser.id} advertiser={advertiser} />
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

import Link from "next/link";
import { getClients, getClientCountsMap, getCampaigns, getCampaignPlacementCountsByStatusMap, type PlacementCountsByStatus } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { ClientListRow, ClientsTableHeader } from "@/components/ClientListRow";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}
import type { Client } from "@/db/schema";

export const metadata = {
  title: "Clients",
  description: "Clients overview",
};

const GROUP_OPTIONS = [
  { value: "none", label: "—" },
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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { search = "", groupBy: rawGroupBy } = params;
  const currentFilters: Record<string, string[]> = {
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };

  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const [clients, countsMap, campaigns, campaignPlacementCountsByStatusMap] = await Promise.all([
    getClients(),
    getClientCountsMap(),
    getCampaigns(),
    getCampaignPlacementCountsByStatusMap(),
  ]);
  const clientPlacementCountsByStatusMap = new Map<string, PlacementCountsByStatus>();
  for (const c of campaigns) {
    if (!c.clientId) continue;
    const existing = clientPlacementCountsByStatusMap.get(c.clientId) ?? { liveCount: 0, upcomingCount: 0, endedCount: 0 };
    const counts = campaignPlacementCountsByStatusMap.get(c.id);
    if (counts) {
      existing.liveCount += counts.liveCount;
      existing.upcomingCount += counts.upcomingCount;
      existing.endedCount += counts.endedCount;
    }
    clientPlacementCountsByStatusMap.set(c.clientId, existing);
  }
  let filtered = search.trim()
    ? clients.filter((c) => matchesSearch(search, c.name))
    : clients;

  const applyFilter = (list: Client[]) => {
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (!ymSet) return list;
    return list.filter((c) => {
      const key = (c.createdAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
  };
  filtered = applyFilter(filtered);

  const filterDimensions: FilterDimension[] = (() => {
    const ymMap = new Map<string, string>();
    for (const c of clients) {
      const key = (c.createdAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(c.createdAt ?? ""));
    }
    if (ymMap.size === 0) return [];
    return [{ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) }];
  })();

  type Group = { key: string; label: string; clients: Client[] };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "", clients: filtered }];
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, Client[]>();
    for (const c of filtered) {
      const key = (c.createdAt ?? "").slice(0, 7);
      const k = key || "__none";
      if (!byYearMonth.has(k)) byYearMonth.set(k, []);
      byYearMonth.get(k)!.push(c);
    }
    groups = [...byYearMonth.entries()]
      .filter(([k]) => k !== "__none")
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, clients]) => ({
        key,
        label: formatCreationYearMonth(clients[0]!.createdAt ?? ""),
        clients,
      }));
    const noDate = byYearMonth.get("__none");
    if (noDate?.length) {
      groups.push({ key: "__none", label: "No creation date", clients: noDate });
    }
  }

  const hasData = clients.length > 0;
  const hasResults = filtered.length > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">All Clients</button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
              <Link
                href="/clients/new"
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
                New client
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No clients yet. Create a client below.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Clients (0)
                </p>
                <DebouncedSearchInput placeholder="Search clients…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filtered.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/clients/new"
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
                New client
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
                  Clients ({filtered.length})
                </p>
                <DebouncedSearchInput placeholder="Search clients…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filtered.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/clients/new"
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
                New client
              </Link>
              </div>
            </div>
            {groups.map(({ key, label, clients: groupClients }) => (
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
                    {label}
                  </span>
                )}
                <div className="table-grid table-grid--clients" style={{ marginLeft: groupBy === "none" ? 0 : 12 }}>
                  <ClientsTableHeader />
                  {groupClients.map((client) => (
                    <ClientListRow key={client.id} client={client} counts={countsMap.get(client.id)} placementCountsByStatus={clientPlacementCountsByStatusMap.get(client.id)} />
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

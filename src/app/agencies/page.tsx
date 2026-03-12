import Link from "next/link";
import { getAgencies, getAgencyCountsMap } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { AgencyListRow, AgenciesTableHeader } from "@/components/AgencyListRow";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { GroupByDropdown } from "@/components/GroupByDropdown";
import { FilterBy, type FilterDimension } from "@/components/FilterBy";
import { matchesSearch } from "@/lib/search";

function parseFilterParam(val: string | undefined): string[] {
  if (!val?.trim()) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export const metadata = {
  title: "Agencies",
  description: "Agencies overview",
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

export default async function AgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string; filterCreationYearMonth?: string }>;
}) {
  await enforceNotReadOnly();
  const params = await searchParams;
  const { groupBy: rawGroupBy, search = "" } = params;
  const currentFilters: Record<string, string[]> = {
    creationYearMonth: parseFilterParam(params.filterCreationYearMonth),
  };
  const groupBy: GroupBy =
    GROUP_OPTIONS.some((o) => o.value === rawGroupBy) ? (rawGroupBy as GroupBy) : "none";

  const [agencies, countsMap] = await Promise.all([
    getAgencies(),
    getAgencyCountsMap(),
  ]);
  let filteredAgencies = search.trim()
    ? agencies.filter((a) => matchesSearch(search, a.name))
    : agencies;

  const applyFilter = (list: typeof agencies) => {
    let out = list;
    const ymSet = currentFilters.creationYearMonth.length ? new Set(currentFilters.creationYearMonth) : null;
    if (ymSet) out = out.filter((a) => {
      const key = (a.createdAt ?? "").slice(0, 7);
      return key && ymSet.has(key);
    });
    return out;
  };
  filteredAgencies = applyFilter(filteredAgencies);

  const filterDimensions: FilterDimension[] = (() => {
    const ymMap = new Map<string, string>();
    for (const a of agencies) {
      const key = (a.createdAt ?? "").slice(0, 7);
      if (key) ymMap.set(key, formatCreationYearMonth(a.createdAt ?? ""));
    }
    const dims: FilterDimension[] = [];
    if (ymMap.size) dims.push({ key: "creationYearMonth", label: "Creation year-month", options: [...ymMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([v, l]) => ({ value: v, label: l })) });
    return dims;
  })();

  type Group = { key: string; label: string; agencies: typeof agencies };
  let groups: Group[] = [];

  if (groupBy === "none") {
    groups = [{ key: "all", label: "", agencies: filteredAgencies }];
  } else if (groupBy === "creationYearMonth") {
    const byYearMonth = new Map<string, typeof agencies>();
    for (const a of filteredAgencies) {
      const key = (a.createdAt ?? "").slice(0, 7);
      const k = key || "__none";
      if (!byYearMonth.has(k)) byYearMonth.set(k, []);
      byYearMonth.get(k)!.push(a);
    }
    groups = [...byYearMonth.entries()]
      .filter(([k]) => k !== "__none")
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, agencies]) => ({
        key,
        label: formatCreationYearMonth(agencies[0]!.createdAt ?? ""),
        agencies,
      }));
    const noDate = byYearMonth.get("__none");
    if (noDate?.length) {
      groups.push({ key: "__none", label: "No creation date", agencies: noDate });
    }
  }

  const hasData = agencies.length > 0;
  const hasResults = filteredAgencies.length > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">
          All Agencies
        </button>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {!hasData ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0 8px" }}>
              <Link
                href="/agencies/new"
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
                New agency
              </Link>
            </div>
            <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
              No agencies yet. Create an agency below. If you just added agencies, use <strong>Refresh</strong> in the sidebar to reload data.
            </p>
          </>
        ) : !hasResults ? (
          <>
            <div className="list-page-toolbar">
              <div className="list-page-toolbar-inner">
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Agencies (0)
                </p>
                <DebouncedSearchInput placeholder="Search agencies…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filteredAgencies.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/agencies/new"
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
                New agency
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
                  Agencies ({filteredAgencies.length})
                </p>
                <DebouncedSearchInput placeholder="Search agencies…" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 24 }}>
                  Group by
                </span>
                <GroupByDropdown value={groupBy} options={[...GROUP_OPTIONS]} />
                <FilterBy dimensions={filterDimensions} currentFilters={currentFilters} totalCount={filteredAgencies.length} paramPrefix="filter" />
              </div>
              <div className="list-page-toolbar-actions">
                <Link
                  href="/agencies/new"
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
                New agency
              </Link>
              </div>
            </div>
            {groups.map(({ key, label, agencies: groupAgencies }) => (
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
                <div className="table-grid table-grid--agencies" style={{ marginLeft: groupBy === "none" ? 0 : 12 }}>
                  <AgenciesTableHeader marginLeft={0} />
                  {groupAgencies.map((agency) => (
                    <AgencyListRow
                    key={agency.id}
                    agency={agency}
                    counts={countsMap.get(agency.id)}
                    marginLeft={0}
                  />
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

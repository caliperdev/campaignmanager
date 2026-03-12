import Link from "next/link";
import { getOrders, getAgencies, getAdvertisers, getClients, getSources, getCampaigns, getOrderPlacementCount, getOrderPlacementCountsByStatusMap, isHierarchyMigrationApplied } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { PlacementsCountWithStatus } from "@/components/PlacementsCountWithStatus";

export const metadata = {
  title: "Home",
  description: "Campaign Manager — Home",
};

export default async function HomePage() {
  await enforceNotReadOnly();
  const [orders, agencies, advertisers, clients, sources, campaigns, migrationApplied] = await Promise.all([
    getOrders(),
    getAgencies(),
    getAdvertisers(),
    getClients(),
    getSources(),
    getCampaigns(),
    isHierarchyMigrationApplied(),
  ]);
  const totalCampaigns = campaigns.length;

  const [placementCounts, orderPlacementCountsByStatusMap] = await Promise.all([
    Promise.all(orders.map((o) => getOrderPlacementCount(o))),
    getOrderPlacementCountsByStatusMap(),
  ]);
  const totalPlacements = placementCounts.reduce((sum, n) => sum + n, 0);
  const placementCountsByStatus = Array.from(orderPlacementCountsByStatusMap.values()).reduce(
    (acc, c) => ({
      liveCount: acc.liveCount + c.liveCount,
      upcomingCount: acc.upcomingCount + c.upcomingCount,
      endedCount: acc.endedCount + c.endedCount,
    }),
    { liveCount: 0, upcomingCount: 0, endedCount: 0 }
  );

  const showMigrationHint = !migrationApplied && agencies.length > 0;

  return (
    <main className="main-content">
      <header className="top-bar">
        <button className="section-tab active">Home</button>
      </header>

      {showMigrationHint && (
        <div
          style={{
            marginBottom: 24,
            padding: 24,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 15, color: "var(--text-primary)", fontWeight: 500 }}>
            Database migration required
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-secondary)" }}>
            Orders, campaigns, and placements are not visible until the hierarchy migration is applied. In your Supabase project, run the SQL in <code style={{ fontSize: 13, background: "var(--bg-primary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>supabase/migrations/044_swap_campaign_order_hierarchy.sql</code> (SQL Editor or <code style={{ fontSize: 13, background: "var(--bg-primary)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>supabase db push</code>). This migrates existing data so campaigns sit above orders.
          </p>
          <a
            href="https://supabase.com/docs/guides/cli/local-development#running-migrations"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 14,
              color: "var(--accent-mint)",
              textDecoration: "underline",
            }}
          >
            Supabase migrations docs
          </a>
        </div>
      )}

      {agencies.length === 0 && !showMigrationHint && (
        <div
          style={{
            marginBottom: 24,
            padding: 24,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <p style={{ margin: "0 0 16px", fontSize: 15, color: "var(--text-primary)" }}>
            Create your first agency to get started. Orders, campaigns, and placements are organized under agencies.
          </p>
          <Link
            href="/agencies/new"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              color: "white",
              background: "var(--accent-mint)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Create your first agency
          </Link>
        </div>
      )}

      <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Orders
      </div>
      <div className="metrics-grid" style={{ marginBottom: 32 }}>
        <Link href="/clients" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{clients.length}</div>
            <div className="metric-label">Clients</div>
          </div>
        </Link>

        <Link href="/agencies" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{agencies.length}</div>
            <div className="metric-label">Agencies</div>
          </div>
        </Link>

        <Link href="/advertisers" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9"></line>
                <line x1="4" y1="15" x2="20" y2="15"></line>
                <line x1="10" y1="3" x2="8" y2="21"></line>
                <line x1="16" y1="3" x2="14" y2="21"></line>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{advertisers.length}</div>
            <div className="metric-label">Advertisers</div>
          </div>
        </Link>

        <Link href="/campaigns" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9"></line>
                <line x1="4" y1="15" x2="20" y2="15"></line>
                <line x1="10" y1="3" x2="8" y2="21"></line>
                <line x1="16" y1="3" x2="14" y2="21"></line>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{totalCampaigns}</div>
            <div className="metric-label">Campaigns</div>
          </div>
        </Link>

        <Link href="/orders" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{orders.length}</div>
            <div className="metric-label">Orders</div>
          </div>
        </Link>

        <Link href="/placements" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <PlacementsCountWithStatus total={totalPlacements} counts={placementCountsByStatus} totalClassName="metric-value" />
            <div className="metric-label">Placements</div>
          </div>
        </Link>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Sources
      </div>
      <div className="metrics-grid">
        <Link href="/sources" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="metric-header">
            <div className="icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
            </div>
            <div className="metric-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </div>
          <div>
            <div className="metric-value">{sources.length}</div>
            <div className="metric-label">Sources</div>
          </div>
        </Link>
      </div>
    </main>
  );
}

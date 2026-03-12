"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Order, Source } from "@/db/schema";
import { createClient } from "@/lib/supabase/client";
import { refreshAppCache } from "@/lib/table-actions";
import { useConfirm } from "@/components/ConfirmModal";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const RESIZE_HANDLE_WIDTH = 6;
const EMPTY_ITEMS: (Order | Source)[] = [];
const EMPTY_STYLE: React.CSSProperties = {};

function Icon({ children, style = EMPTY_STYLE }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      style={{ width: "16px", height: "16px", fill: "currentColor", opacity: 0.7, ...style }}
    >
      {children}
    </svg>
  );
}

export function Sidebar({
  isMobile = false,
  orders: _orders = EMPTY_ITEMS,
  sources: _sources = EMPTY_ITEMS,
  readOnlyUser = false,
}: {
  isMobile?: boolean;
  orders?: (Order | Source)[];
  sources?: (Order | Source)[];
  readOnlyUser?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [advertiserExpanded, setAdvertiserExpanded] = useState(() =>
    pathname.startsWith("/advertisers") || pathname.startsWith("/orders") || pathname === "/placements" || pathname.startsWith("/campaigns")
  );
  const [ordersExpanded, setOrdersExpanded] = useState(() =>
    pathname.startsWith("/orders") || pathname.startsWith("/advertisers") || pathname === "/placements" || pathname.startsWith("/campaigns")
  );
  const [campaignExpanded, setCampaignExpanded] = useState(() =>
    pathname.startsWith("/orders") || pathname.startsWith("/advertisers") || pathname === "/placements" || pathname.startsWith("/campaigns")
  );
  const startX = useRef(0);
  const startWidth = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    if (pathname.startsWith("/advertisers") || pathname.startsWith("/orders") || pathname.startsWith("/clients") || pathname === "/placements" || pathname.startsWith("/campaigns")) {
      setAdvertiserExpanded(true);
      setOrdersExpanded(true);
      setCampaignExpanded(true);
    }
  }, [pathname]);

  const syncUserEmail = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    syncUserEmail();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(syncUserEmail);
    return () => subscription.unsubscribe();
  }, [syncUserEmail]);

  useEffect(() => {
    if (isMobile || !resizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isMobile, resizing]);

  const isHomePage = pathname === "/home";
  const isClientsPage = pathname.startsWith("/clients");
  const isAgenciesPage = pathname.startsWith("/agencies");
  const isAdvertisersPage = pathname.startsWith("/advertisers");
  const isDashboardPage = pathname === "/dashboard";
  const isOrdersList = pathname.startsWith("/orders");
  const isCampaignsList = pathname.startsWith("/campaigns");
  const isPlacementsList = pathname.startsWith("/placements");
  const isSourcesList = pathname.startsWith("/sources");
  const isInAdvertiserSection = isAdvertisersPage || isOrdersList || isCampaignsList || isPlacementsList;
  const isAdvertiserSectionParent = isInAdvertiserSection && !isAdvertisersPage;

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setResizing(true);
  };

  return (
    <div style={{ display: "flex", flexShrink: 0, ...(isMobile ? { width: "100%" } : {}) }}>
      <nav className="sidebar" style={{
        width: isMobile ? "100%" : width,
        minWidth: isMobile ? "100%" : width,
        borderRight: isMobile ? "none" : "1px solid #E5E7EB",
        display: "flex",
        flexDirection: "column",
        padding: "var(--space-l) var(--space-m)",
        background: "#FFFFFF",
      }}>
        <Link href="/home" className="agency-selector" style={{ textDecoration: "none", color: "inherit" }}>
            <img src="/logo.jpeg" alt="Buho Media" className="agency-logo" />
            <div className="agency-name">Buho Media</div>
        </Link>

        <div className="nav-group">
            {!readOnlyUser && (
              <Link href="/home" className={`nav-item-new ${isHomePage ? "active" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                      <svg className="nav-icon" viewBox="0 0 24 24">
                          <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"></path>
                      </svg>
                      Home
                  </div>
              </Link>
            )}
            
            <Link href="/clients" className={`nav-item-new ${isClientsPage ? "active" : ""}`}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <svg className="nav-icon" viewBox="0 0 24 24">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"></path>
                    </svg>
                    Clients
                </div>
            </Link>

            <Link href="/agencies" className={`nav-item-new ${isAgenciesPage ? "active" : ""}`}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <svg className="nav-icon" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
                    </svg>
                    Agencies
                </div>
            </Link>

            <Link
              href="/advertisers"
              className={`nav-item-new ${isAdvertisersPage ? "active" : ""} ${isAdvertiserSectionParent ? "active-parent" : ""}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textDecoration: "none" }}
              aria-expanded={advertiserExpanded}
            >
                <span style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                    <svg className="nav-icon" viewBox="0 0 24 24">
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                    </svg>
                    Advertisers
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdvertiserExpanded((prev) => !prev); }}
                  aria-label={advertiserExpanded ? "Collapse" : "Expand"}
                  style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      width: 14,
                      height: 14,
                      transform: advertiserExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
            </Link>
            
            {advertiserExpanded && (
              <div className="nav-nested">
                <Link
                  href="/campaigns"
                  className={`sub-item sub-item-expandable ${isCampaignsList ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textDecoration: "none" }}
                  aria-expanded={campaignExpanded}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>Campaigns</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCampaignExpanded((prev) => !prev); }}
                    aria-label={campaignExpanded ? "Collapse" : "Expand"}
                    style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        width: 12,
                        height: 12,
                        transform: campaignExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </Link>
                {campaignExpanded && (
                  <div className="nav-nested nav-nested-2">
                    <Link
                      href="/orders"
                      className={`sub-item sub-item-expandable ${isOrdersList ? "active" : ""}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textDecoration: "none" }}
                      aria-expanded={ordersExpanded}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>Orders</span>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOrdersExpanded((prev) => !prev); }}
                        aria-label={ordersExpanded ? "Collapse" : "Expand"}
                        style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            width: 12,
                            height: 12,
                            transform: ordersExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                          }}
                        >
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </Link>
                    {ordersExpanded && (
                      <div className="nav-nested nav-nested-3">
                        <Link href="/placements" className={`sub-item ${isPlacementsList ? "active" : ""}`}>
                          Placements
                          {isPlacementsList && <div className="status-dot" style={{ width: 4, height: 4 }} />}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Link href="/sources" className={`nav-item-new ${isSourcesList ? "active" : ""}`}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <svg className="nav-icon" viewBox="0 0 24 24">
                        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"></path>
                    </svg>
                    Sources
                </div>
            </Link>

            <Link href="/dashboard" className={`nav-item-new ${isDashboardPage ? "active" : ""}`}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <svg className="nav-icon" viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"></path>
                    </svg>
                    Dashboard
                </div>
            </Link>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
          {userEmail && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 14,
                color: "var(--text-tertiary-new)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={userEmail}
            >
              {userEmail}
            </div>
          )}
          <Link
            href="/test-link"
            className={`sidebar-footer-btn ${pathname === "/test-link" ? "active" : ""}`}
            style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit", marginBottom: 8 }}
          >
            Test page
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!readOnlyUser && (
              <button
                type="button"
                className="sidebar-footer-btn"
                onClick={async () => {
                  const first = await showConfirm({ message: "Refresh app data? This will refetch all tables.", confirmLabel: "Continue" });
                  if (!first) return;
                  const second = await showConfirm({ message: "Really refresh? All data will be reloaded.", confirmLabel: "Refresh" });
                  if (!second) return;
                  await refreshAppCache();
                  router.refresh();
                }}
                title="Refresh app data"
              >
                <Icon>
                  <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                </Icon>
                <span style={{ marginLeft: 6 }}>Refresh</span>
              </button>
            )}
            <button
              type="button"
              className="sidebar-footer-btn"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.refresh();
                router.push("/");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          style={{
            width: RESIZE_HANDLE_WIDTH,
            cursor: "col-resize",
            flexShrink: 0,
            background: resizing ? "var(--accent-mint)" : "transparent",
            transition: resizing ? "none" : "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!resizing) e.currentTarget.style.background = "#E5E7EB";
          }}
          onMouseLeave={(e) => {
            if (!resizing) e.currentTarget.style.background = "transparent";
          }}
        />
      )}
    </div>
  );
}

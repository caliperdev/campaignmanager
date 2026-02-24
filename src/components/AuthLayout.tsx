"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import type { Table } from "@/lib/tables";

const PUBLIC_PATHS = ["/", "/login"];
const SHARE_PATH = "/share";
const MOBILE_BREAKPOINT = 768;
const EMPTY_TABLES: Table[] = [];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const listener = () => setIsMobile(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isMobile;
}

export function AuthLayout({
  children,
  tablesCampaigns = EMPTY_TABLES,
  tablesData = EMPTY_TABLES,
}: {
  children: React.ReactNode;
  tablesCampaigns?: Table[];
  tablesData?: Table[];
}) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isShare = pathname === SHARE_PATH;

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, pathname]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (isPublic || isShare) {
    return <>{children}</>;
  }

  return (
    <div className="app-container">
      <div className="sidebar-desktop-only" style={{ display: "flex", flexShrink: 0 }}>
        <Sidebar isMobile={false} tablesCampaigns={tablesCampaigns} tablesData={tablesData} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {isMobile && (
          <header className="mobile-header">
            <button
              type="button"
              onClick={openSidebar}
              aria-label="Open menu"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                padding: 0,
                border: "none",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                borderRadius: "var(--radius-md)",
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: "currentColor" }}>
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
              </svg>
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Campaign Manager
            </span>
          </header>
        )}
        {isMobile && sidebarOpen && (
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.3)",
                zIndex: 50,
              }}
              onClick={closeSidebar}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSidebar();
              }}
              role="button"
              tabIndex={-1}
              aria-label="Close menu"
            />
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: 280,
                zIndex: 51,
                background: "var(--bg-secondary)",
                boxShadow: "2px 0 8px rgba(0,0,0,0.1)",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 12px 0" }}>
                <button
                  type="button"
                  onClick={closeSidebar}
                  aria-label="Close menu"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: "currentColor" }}>
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </button>
              </div>
              <Sidebar isMobile={true} tablesCampaigns={tablesCampaigns} tablesData={tablesData} />
            </div>
          </>
        )}
        {children}
      </div>
    </div>
  );
}

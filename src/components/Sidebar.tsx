"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign, Source } from "@/db/schema";
import { createClient } from "@/lib/supabase/client";
import { refreshAppCache } from "@/lib/table-actions";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const RESIZE_HANDLE_WIDTH = 6;
type NavItem = { id: string; name: string };
const EMPTY_ITEMS: (Campaign | Source)[] = [];
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 16,
        height: 16,
        fill: "currentColor",
        opacity: 0.7,
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.2s",
      }}
    >
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
    </svg>
  );
}

export function Sidebar({
  isMobile = false,
  campaigns = EMPTY_ITEMS,
  sources = EMPTY_ITEMS,
}: {
  isMobile?: boolean;
  campaigns?: (Campaign | Source)[];
  sources?: (Campaign | Source)[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (pathname.startsWith("/campaigns")) s.add("campaigns");
    if (pathname.startsWith("/sources")) s.add("sources");
    return s;
  });
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(SIDEBAR_DEFAULT);

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

  useEffect(() => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (pathname.startsWith("/campaigns")) next.add("campaigns");
      if (pathname.startsWith("/sources")) next.add("sources");
      return next;
    });
  }, [pathname]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isHomePage = pathname === "/home";
  const isMonitorPage = pathname === "/monitor";
  const isCampaignsList = pathname === "/campaigns";
  const isSourcesList = pathname === "/sources";
  const isBoardPage = (basePath: string, id: string) => pathname === `${basePath}/${id}`;

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setResizing(true);
  };

  const navStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    padding: isMobile ? "16px" : "24px 16px",
    background: "var(--bg-secondary)",
    ...(isMobile
      ? { width: "100%", minWidth: 0, borderRight: "none" }
      : { width, minWidth: width, borderRight: "1px solid var(--border-light)" }),
  };

  function renderItemList(items: NavItem[], basePath: string, emptyLabel: string) {
    if (items.length === 0) {
      return (
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", paddingLeft: 12 }}>
          {emptyLabel}
        </span>
      );
    }
    return items.map((t) => {
      const isActive = isBoardPage(basePath, t.id);
      return (
        <Link
          key={t.id}
          href={`${basePath}/${t.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 12px 6px 12px",
            color: isActive ? "var(--accent-dark)" : "var(--text-secondary)",
            textDecoration: "none",
            borderRadius: "var(--radius-sm)",
            marginBottom: 1,
            fontSize: 13,
            fontWeight: isActive ? 600 : 500,
            background: isActive ? "#E8EBEB" : "transparent",
          }}
        >
          <span style={{ marginRight: 8, opacity: 0.7 }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: "currentColor" }}>
              <path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2v2h2v-2H5zm4-8h10v10H9V7zm2 2v6h6V9h-6z" />
            </svg>
          </span>
          {t.name}
        </Link>
      );
    });
  }

  function renderSection(
    key: string,
    label: string,
    href: string,
    isListActive: boolean,
    items: NavItem[],
    basePath: string,
    emptyLabel: string,
    icon: React.ReactNode,
  ) {
    const isOpen = expandedSections.has(key);
    return (
      <div key={key} style={{ marginTop: 2 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "2px" }}>
          <button
            type="button"
            onClick={() => toggleSection(key)}
            aria-expanded={isOpen}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 32,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Chevron open={isOpen} />
          </button>
          <Link
            href={href}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              padding: "8px 12px 8px 4px",
              color: isListActive ? "var(--accent-dark)" : "var(--text-secondary)",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              transition: "color 0.2s var(--anim-ease), background 0.2s var(--anim-ease), font-weight 0.2s var(--anim-ease)",
              fontWeight: isListActive ? 600 : 500,
              background: isListActive ? "#E8EBEB" : "transparent",
            }}
          >
            <span style={{ marginRight: 8 }}>{icon}</span>
            {label}
          </Link>
        </div>
        {isOpen && (
          <div style={{ paddingLeft: 28, marginBottom: 4 }}>
            {renderItemList(items, basePath, emptyLabel)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexShrink: 0, ...(isMobile ? { width: "100%" } : {}) }}>
      <nav style={navStyle}>
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "32px",
            paddingLeft: "12px",
            letterSpacing: "-0.02em",
          }}
        >
          Campaign Manager
        </div>

        <div style={{ marginBottom: "24px" }}>
          {/* HOME */}
          <Link
            href="/home"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 12px",
              color: isHomePage ? "var(--accent-dark)" : "var(--text-secondary)",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              transition: "color 0.2s var(--anim-ease), background 0.2s var(--anim-ease), font-weight 0.2s var(--anim-ease)",
              marginBottom: "2px",
              fontWeight: isHomePage ? 600 : 500,
              background: isHomePage ? "#E8EBEB" : "transparent",
            }}
          >
            <span style={{ marginRight: "12px" }}>
              <Icon><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></Icon>
            </span>
            Home
          </Link>

          {/* CAMPAIGNS section */}
          {renderSection(
            "campaigns",
            "Campaigns",
            "/campaigns",
            isCampaignsList,
            campaigns,
            "/campaigns",
            "No campaigns",
            <Icon><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></Icon>,
          )}

          {/* SOURCES section */}
          {renderSection(
            "sources",
            "Sources",
            "/sources",
            isSourcesList,
            sources,
            "/sources",
            "No sources",
            <Icon><path d="M20 6H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H4V8h16v8zM6 12h2v2H6v-2zm3-2h2v2H9v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2z" /></Icon>,
          )}

          {/* MONITOR */}
          <Link
            href="/monitor"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 12px",
              color: isMonitorPage ? "var(--accent-dark)" : "var(--text-secondary)",
              textDecoration: "none",
              borderRadius: "var(--radius-md)",
              transition: "color 0.2s var(--anim-ease), background 0.2s var(--anim-ease), font-weight 0.2s var(--anim-ease)",
              marginBottom: "2px",
              fontWeight: isMonitorPage ? 600 : 500,
              background: isMonitorPage ? "#E8EBEB" : "transparent",
            }}
          >
            <span style={{ marginRight: "12px" }}>
              <Icon><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></Icon>
            </span>
            Monitor
          </Link>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
          {userEmail && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--text-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={userEmail}
            >
              {userEmail}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Refresh app data? This will refetch all tables.")) return;
                if (!window.confirm("Really refresh? All data will be reloaded.")) return;
                await refreshAppCache();
                router.refresh();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 14,
                cursor: "pointer",
                borderRadius: "var(--radius-md)",
                textAlign: "left",
              }}
              title="Refresh app data"
            >
              <Icon>
                <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </Icon>
              <span style={{ marginLeft: 6 }}>Refresh</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.refresh();
                router.push("/");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 14,
                cursor: "pointer",
                borderRadius: "var(--radius-md)",
                textAlign: "left",
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
            background: resizing ? "var(--accent-dark)" : "transparent",
            transition: resizing ? "none" : "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!resizing) e.currentTarget.style.background = "var(--border-light)";
          }}
          onMouseLeave={(e) => {
            if (!resizing) e.currentTarget.style.background = "transparent";
          }}
        />
      )}
    </div>
  );
}

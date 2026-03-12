"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const ANIM_DURATION_MS = 250;
const COLLAPSED_OPTIONS_COUNT = 5;

export type FilterDimension = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export function FilterBy({
  dimensions,
  currentFilters,
  totalCount,
  paramPrefix = "filter",
}: {
  dimensions: FilterDimension[];
  currentFilters: Record<string, string[]>;
  totalCount: number;
  paramPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(true);
  const [closing, setClosing] = useState(false);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());
  const [localFilters, setLocalFilters] = useState<Record<string, string[]>>(currentFilters);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && entering) {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
      return () => cancelAnimationFrame(id);
    }
  }, [open, entering]);

  const handleClose = useCallback(() => {
    if (closeTimeoutRef.current) return;
    setClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimeoutRef.current = null;
    }, ANIM_DURATION_MS);
  }, []);

  useEffect(() => () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggleOption = useCallback((dimKey: string, value: string, checked: boolean) => {
    setLocalFilters((prev) => {
      const arr = prev[dimKey] ?? [];
      const next = checked ? [...arr, value] : arr.filter((v) => v !== value);
      return next.length ? { ...prev, [dimKey]: next } : { ...prev, [dimKey]: [] };
    });
  }, []);

  const handleApply = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    for (const dim of dimensions) {
      const key = `${paramPrefix}${dim.key.charAt(0).toUpperCase() + dim.key.slice(1)}`;
      next.delete(key);
      const vals = localFilters[dim.key];
      if (vals?.length) next.set(key, vals.join(","));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    handleClose();
  }, [dimensions, localFilters, paramPrefix, pathname, router, searchParams, handleClose]);

  const handleOpen = useCallback(() => {
    setLocalFilters(currentFilters);
    setExpandedDims(new Set());
    setEntering(true);
    setOpen(true);
  }, [currentFilters]);

  const toggleExpanded = useCallback((dimKey: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dimKey)) next.delete(dimKey);
      else next.add(dimKey);
      return next;
    });
  }, []);

  if (dimensions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Filter by"
        title="Filter by"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          padding: 0,
          marginLeft: 8,
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      {open && (
        <>
          <div
            role="presentation"
            onClick={handleClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
              zIndex: 999,
              opacity: entering ? 0 : closing ? 0 : 1,
              transition: `opacity ${ANIM_DURATION_MS}ms ease-in-out`,
            }}
          />
          <div
            role="dialog"
            aria-label="Filters"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(360px, 90vw)",
              background: "var(--bg-card)",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              transform: entering || closing ? "translateX(100%)" : "translateX(0)",
              transition: `transform ${ANIM_DURATION_MS}ms ease-in-out`,
            }}
          >
            <div style={{ padding: "var(--space-l)", borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-primary-new)" }}>
                  Filters
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  style={{
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary-new)" }}>
                {totalCount >= 100 ? "100 or more" : totalCount} items
              </p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-m)" }}>
              {dimensions.map((dim) => {
                const showAll = expandedDims.has(dim.key);
                const hasMore = dim.options.length > COLLAPSED_OPTIONS_COUNT;
                const visibleOptions = hasMore && !showAll
                  ? dim.options.slice(0, COLLAPSED_OPTIONS_COUNT)
                  : dim.options;
                return (
                  <div key={dim.key} style={{ marginBottom: "var(--space-l)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      {dim.label}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {visibleOptions.map((opt) => {
                        const checked = (localFilters[dim.key] ?? []).includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 14,
                              color: "var(--text-primary-new)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleOption(dim.key, opt.value, e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: "var(--accent-mint)" }}
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(dim.key)}
                          style={{
                            alignSelf: "flex-start",
                            padding: "4px 0",
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--accent-mint)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {showAll ? "See less" : "See All"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "var(--space-l)", borderTop: "1px solid var(--border-light)", flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleApply}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "white",
                  background: "var(--accent-mint)",
                  border: "none",
                  borderRadius: "var(--radius-s)",
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

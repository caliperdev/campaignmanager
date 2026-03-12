"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DebouncedSearchInput({
  placeholder = "Search…",
  paramName = "search",
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(paramName) ?? "";
  const [localValue, setLocalValue] = useState(urlValue);

  useEffect(() => {
    setLocalValue(urlValue);
  }, [urlValue]);

  const applySearch = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    const trimmed = localValue.trim();
    if (trimmed) {
      next.set(paramName, trimmed);
    } else {
      next.delete(paramName);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [localValue, paramName, pathname, router, searchParams]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applySearch();
      }
    },
    [applySearch]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setLocalValue(next);
      if (next.trim() === "") {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete(paramName);
        const qs = nextParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [paramName, pathname, router, searchParams]
  );

  return (
    <input
      type="search"
      value={localValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label="Search"
      className="debounced-search-input"
      style={{
        padding: "8px 14px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "2px solid var(--accent-mint)",
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        minWidth: 360,
      }}
    />
  );
}

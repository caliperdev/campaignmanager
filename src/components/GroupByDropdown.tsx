"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type GroupByOption = { value: string; label: string };

export function GroupByDropdown({
  value,
  options,
  searchParam = "search",
}: {
  value: string;
  options: GroupByOption[];
  searchParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    const val = e.target.value;
    if (val === "none") {
      next.delete("groupBy");
    } else {
      next.set("groupBy", val);
    }
    const search = searchParams.get(searchParam);
    if (search?.trim()) next.set(searchParam, search.trim());
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      aria-label="Group by"
      style={{
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 500,
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-light)",
        cursor: "pointer",
      }}
    >
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

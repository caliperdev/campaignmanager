"use client";

import { useRouter, usePathname } from "next/navigation";

type TableOption = { id: string; name: string };

type Props = {
  campaignTables: TableOption[];
  dataTables: TableOption[];
  selectedCt: string | null;
  selectedDt: string | null;
};

export default function MonitorPickers({
  campaignTables,
  dataTables,
  selectedCt,
  selectedDt,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParams(ct: string | null, dt: string | null) {
    const params = new URLSearchParams();
    if (ct) params.set("ct", ct);
    if (dt) params.set("dt", dt);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleCampaignChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    updateParams(value, selectedDt);
  }

  function handleDataChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    updateParams(selectedCt, value);
  }

  const labelStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 4,
  };
  const selectStyle = {
    padding: "8px 12px",
    fontSize: 14,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-light)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    minWidth: 160,
  };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <label htmlFor="monitor-ct" style={labelStyle}>
          Campaign table
        </label>
        <select
          id="monitor-ct"
          value={selectedCt ?? ""}
          onChange={handleCampaignChange}
          style={selectStyle}
          aria-label="Select campaign table"
        >
          <option value="">All</option>
          {campaignTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="monitor-dt" style={labelStyle}>
          Source
        </label>
        <select
          id="monitor-dt"
          value={selectedDt ?? ""}
          onChange={handleDataChange}
          style={selectStyle}
          aria-label="Select source"
        >
          <option value="">All</option>
          {dataTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

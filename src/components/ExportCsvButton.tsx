"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { Button } from "@/components/ui";
import { getExportCsvPivot, getExportCsvPivotByIo } from "@/lib/campaign";

export interface ExportCsvButtonProps {
  /** When provided, user can choose "All campaigns" or "Filtered (visible)". When omitted, exports all. */
  filteredCampaignIds?: number[];
}

export default function ExportCsvButton({ filteredCampaignIds }: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);
  const [loadingByIo, setLoadingByIo] = useState(false);
  const [open, setOpen] = useState(false);
  const [openByIo, setOpenByIo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerByIoRef = useRef<HTMLDivElement>(null);

  async function handleExport(campaignIds?: number[]) {
    setLoading(true);
    setOpen(false);
    try {
      const csv = await getExportCsvPivot(campaignIds);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaigns-pivot-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportByIo(campaignIds?: number[]) {
    setLoadingByIo(true);
    setOpenByIo(false);
    try {
      const csv = await getExportCsvPivotByIo(campaignIds);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaigns-pivot-by-io-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoadingByIo(false);
    }
  }

  useClickOutside(containerRef, () => setOpen(false), open);
  useClickOutside(containerByIoRef, () => setOpenByIo(false), openByIo);

  const showChoice = filteredCampaignIds != null && filteredCampaignIds.length >= 0;

  const dropdownStyle = {
    position: "absolute" as const,
    top: "100%",
    right: 0,
    marginTop: "4px",
    minWidth: "180px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    zIndex: 50,
    overflow: "hidden" as const,
  };

  const optionStyle = {
    display: "block" as const,
    width: "100%",
    padding: "10px 14px",
    textAlign: "left" as const,
    border: "none",
    background: "none",
    fontSize: "13px",
    color: "var(--text-primary)",
    cursor: "pointer" as const,
  };

  if (showChoice) {
    return (
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div ref={containerRef} style={{ position: "relative" }}>
          <Button
            variant="secondary"
            onClick={() => setOpen((o) => !o)}
            disabled={loading}
            style={{ gap: "4px" }}
          >
            {loading ? "Exporting…" : "Export CSV"}
            <span style={{ opacity: 0.8 }}>▼</span>
          </Button>
          {open && (
            <div style={dropdownStyle}>
              <button type="button" onClick={() => handleExport()} style={optionStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                All campaigns
              </button>
              <button type="button" onClick={() => handleExport(filteredCampaignIds)} style={optionStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                Filtered (visible)
              </button>
            </div>
          )}
        </div>
        <div ref={containerByIoRef} style={{ position: "relative" }}>
          <Button
            variant="secondary"
            onClick={() => setOpenByIo((o) => !o)}
            disabled={loadingByIo}
            style={{ gap: "4px" }}
          >
            {loadingByIo ? "Exporting…" : "Export CSV (by IO)"}
            <span style={{ opacity: 0.8 }}>▼</span>
          </Button>
          {openByIo && (
            <div style={dropdownStyle}>
              <button type="button" onClick={() => handleExportByIo()} style={optionStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                All campaigns
              </button>
              <button type="button" onClick={() => handleExportByIo(filteredCampaignIds)} style={optionStyle} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                Filtered (visible)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <Button variant="secondary" onClick={() => handleExport()} disabled={loading}>
        {loading ? "Exporting…" : "Export CSV"}
      </Button>
      <Button variant="secondary" onClick={() => handleExportByIo()} disabled={loadingByIo}>
        {loadingByIo ? "Exporting…" : "Export CSV (by IO)"}
      </Button>
    </div>
  );
}

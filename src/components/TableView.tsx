"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateTable, deleteTable } from "@/lib/table-actions";
import type { Table } from "@/lib/tables";
import { CampaignsView } from "@/components/campaigns/CampaignsView";
import type { CampaignListItem } from "@/lib/campaign-grid";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

export function TableView({
  table,
  basePath,
  initialCampaigns,
  totalCount,
  fetchChunk,
}: {
  table: Table;
  basePath: string;
  initialCampaigns: CampaignListItem[];
  totalCount: number;
  fetchChunk?: (tableId: string, offset: number, limit: number) => Promise<CampaignListItem[]>;
}) {
  const router = useRouter();
  const [editingTable, setEditingTable] = useState(false);
  const [editTableName, setEditTableName] = useState("");
  const [editTableSubtitle, setEditTableSubtitle] = useState("");

  const sectionLabel = basePath === "/data" ? "Data" : "Campaigns";
  const readOnly = basePath === "/data";

  const startEditTable = () => {
    setEditTableName(table.name);
    setEditTableSubtitle(table.subtitle ?? "");
    setEditingTable(true);
  };

  const saveEditTable = async () => {
    const ok = await updateTable(table.id, {
      name: editTableName.trim() || "Table",
      subtitle: editTableSubtitle.trim() || undefined,
    });
    if (ok) {
      router.refresh();
      setEditingTable(false);
    }
  };

  const cancelEditTable = () => setEditingTable(false);

  const handleDeleteTable = async () => {
    if (!window.confirm(`Delete table "${table.name}"? This cannot be undone.`)) return;
    const ok = await deleteTable(table.id);
    if (ok) router.push(basePath);
  };

  return (
    <>
      <div
        style={{
          padding: "8px 32px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Link href={basePath} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {sectionLabel}
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        {editingTable ? (
          <>
            <input
              type="text"
              value={editTableName}
              onChange={(e) => setEditTableName(e.target.value)}
              placeholder="Table name"
              style={{
                padding: "4px 8px",
                fontSize: 13,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                width: 160,
              }}
            />
            <input
              type="text"
              value={editTableSubtitle}
              onChange={(e) => setEditTableSubtitle(e.target.value)}
              placeholder="Subtitle"
              style={{
                padding: "4px 8px",
                fontSize: 13,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                width: 120,
              }}
            />
            <button
              type="button"
              onClick={saveEditTable}
              disabled={!editTableName.trim()}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 500,
                color: "white",
                background: "var(--accent-dark)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEditTable}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{table.name}</span>
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={startEditTable}
                  aria-label="Edit table"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTable}
                  aria-label="Delete table"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <Icon><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
                </button>
              </>
            )}
          </>
        )}
      </div>
      <CampaignsView
        key={table.id}
        initialCampaigns={initialCampaigns}
        totalCount={totalCount}
        tableId={table.id}
        tableName={table.name}
        columnHeaders={table.columnHeaders}
        returnToBase={basePath}
        readOnly={readOnly}
        fetchChunk={fetchChunk}
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateAgency, deleteAgency } from "@/lib/table-actions";
import { useConfirm } from "@/components/ConfirmModal";
import type { Agency, Campaign } from "@/db/schema";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

const labelStyle = { fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 };
const inputStyle = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
};

export function AgencyDetailClient({
  agency,
  campaigns,
}: {
  agency: Agency;
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agency.name);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);
    const result = await updateAgency(agency.id, {
      name: editName.trim() || "Untitled",
    });
    if (result.success) {
      setEditing(false);
      router.refresh();
    } else {
      setSaveError(result.error ?? "Failed to update.");
    }
  };

  const handleDelete = async () => {
    const first = await showConfirm({
      title: `Delete "${agency.name}"?`,
      message: "This will permanently delete the agency. Campaigns that reference this agency will have their agency cleared. This cannot be undone.\n\nClick OK to continue.",
      variant: "danger",
      confirmLabel: "Continue",
    });
    if (!first) return;
    const second = await showConfirm({
      title: "Final confirmation",
      message: `Delete "${agency.name}" and all associated data?`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!second) return;
    const ok = await deleteAgency(agency.id);
    if (ok) {
      router.push("/agencies");
      router.refresh();
    } else {
      window.alert("Failed to delete. Please try again.");
    }
  };
  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
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
        <Link href="/agencies" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Agencies
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{agency.name}</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {saveError && (
                <div style={{ padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Agency name"
                  style={{
                    ...inputStyle,
                    padding: "8px 12px",
                    fontSize: 18,
                    fontWeight: 600,
                    width: 300,
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!editName.trim()}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "white",
                      background: "var(--accent-mint)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditName(agency.name);
                      setSaveError(null);
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      background: "transparent",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {agency.name}
                <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit name"
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
                <Icon>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </Icon>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                aria-label="Delete"
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
                <Icon>
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </Icon>
              </button>
              </div>
            </div>
          )}
        </h1>

        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Campaigns referencing this agency ({campaigns.length})
            </h2>
            <Link
              href={`/campaigns/new?agency=${agency.id}`}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                color: "white",
                background: "var(--accent-mint)",
                border: "none",
                borderRadius: "var(--radius-s)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              New campaign
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
              No campaigns reference this agency. Campaigns are created under advertisers; you can optionally assign an agency when creating or editing a campaign.
            </p>
          ) : (
            <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="campaign-row"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="status-dot" />
                  <div className="row-meta">
                    <div className="row-primary-text">{campaign.name}</div>
                    <div className="row-sub-text">Campaign</div>
                  </div>
                  <div className="row-meta" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

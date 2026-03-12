"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemRowActions } from "@/components/ItemRowActions";
import { updateAgency, deleteAgency } from "@/lib/table-actions";
import { useConfirm } from "@/components/ConfirmModal";
import type { AgencyCounts } from "@/lib/tables";
import { getStatusDotClass } from "@/lib/placement-status";
import { PlacementsCountWithStatus } from "@/components/PlacementsCountWithStatus";

type Agency = { id: string; name: string };

const AGENCY_DELETE_WARNING =
  "This will permanently delete the agency and all associated data in cascade: orders, campaigns, placements, and their dynamic tables. This cannot be undone.";

const editModalStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.4)",
};
const editModalContentStyle = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  maxWidth: 400,
  width: "90%",
  padding: 24,
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

const AGENCY_ROW_COLUMNS = [
  { label: "Agency" },
  { label: "Advertisers" },
  { label: "Orders" },
  { label: "Campaigns" },
  { label: "Placements" },
] as const;

export function AgenciesTableHeader({ marginLeft = 0 }: { marginLeft?: number }) {
  return (
    <div className="campaign-row campaign-row--orders campaign-row--agency agencies-header" style={{ marginLeft }}>
      <div />
      {AGENCY_ROW_COLUMNS.map(({ label }) => (
        <div key={label} className="row-meta">
          <div className="row-label">{label}</div>
        </div>
      ))}
      <div />
    </div>
  );
}

export function AgencyListRow({
  agency,
  counts,
  placementCountsByStatus,
  marginLeft,
}: {
  agency: Agency;
  counts?: AgencyCounts | null;
  placementCountsByStatus?: { liveCount: number; upcomingCount: number; endedCount: number };
  marginLeft?: number;
}) {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(agency.name);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleDelete = async () => {
    const first = await showConfirm({
      title: `Delete "${agency.name}"?`,
      message: AGENCY_DELETE_WARNING + "\n\nClick OK to continue.",
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
      router.refresh();
    } else {
      window.alert("Failed to delete. Please try again.");
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Please fill in: Name");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = await updateAgency(agency.id, { name: trimmed });
      if (result.success) {
        router.refresh();
        setShowEdit(false);
      } else {
        setEditError(result.error ?? "Failed to update. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className="campaign-row campaign-row--orders campaign-row--agency"
        style={{ marginLeft: marginLeft ?? 0, color: "inherit", textDecoration: "none", cursor: "pointer" }}
        data-navigates
        data-href={`/agencies/${agency.id}`}
        onClick={() => router.push(`/agencies/${agency.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/agencies/${agency.id}`)}
      >
        <div className={getStatusDotClass((counts?.activePlacementCount ?? 0) > 0 ? "Live" : "Ended")} />
        <div className="row-meta">
          <div className="row-primary-text">{agency.name}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{counts?.advertiserCount ?? 0}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{counts?.orderCount ?? 0}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{counts?.campaignCount ?? 0}</div>
        </div>
        <div className="row-meta">
          <PlacementsCountWithStatus total={counts?.placementCount ?? 0} counts={placementCountsByStatus} />
        </div>
        <div className="control-group" onClick={(e) => e.stopPropagation()}>
          <ItemRowActions
            editHref={`/agencies/${agency.id}`}
            onEdit={() => {
              setEditName(agency.name);
              setEditError(null);
              setShowEdit(true);
            }}
            onDelete={handleDelete}
            itemName={agency.name}
            skipConfirm
          />
        </div>
      </div>
      {showEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-agency-title"
          style={editModalStyle}
          onClick={(e) => e.target === e.currentTarget && (setShowEdit(false), setEditError(null))}
        >
          <div style={editModalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-agency-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
              Edit agency
            </h2>
            {editError && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                {editError}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Name</span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  padding: "8px 10px",
                  fontSize: 14,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setShowEdit(false); setEditError(null); }}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

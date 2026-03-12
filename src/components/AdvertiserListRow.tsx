"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemRowActions } from "@/components/ItemRowActions";
import { updateAdvertiser, deleteAdvertiser } from "@/lib/table-actions";
import { useConfirm } from "@/components/ConfirmModal";
import type { Advertiser } from "@/db/schema";

const ADVERTISER_DELETE_WARNING =
  "This will permanently delete the advertiser and all associated campaigns, orders, placements, and their data. This cannot be undone.";

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

const ADVERTISER_ROW_COLUMNS = [
  { label: "Advertiser" },
  { label: "Orders" },
  { label: "Campaigns" },
  { label: "Placements" },
] as const;

export function AdvertisersTableHeader({ marginLeft = 0 }: { marginLeft?: number }) {
  return (
    <div className="campaign-row campaign-row--orders campaign-row--advertiser advertisers-header" style={{ marginLeft }}>
      <div />
      {ADVERTISER_ROW_COLUMNS.map(({ label }) => (
        <div key={label} className="row-meta">
          <div className="row-label">{label}</div>
        </div>
      ))}
      <div />
    </div>
  );
}

export function AdvertiserListRow({
  advertiser,
  marginLeft,
}: {
  advertiser: Advertiser;
  marginLeft?: number;
}) {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const [showEdit, setShowEdit] = useState(false);
  const [editAdvertiser, setEditAdvertiser] = useState(advertiser.advertiser);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleDelete = async () => {
    const first = await showConfirm({
      title: `Delete "${advertiser.advertiser}"?`,
      message: ADVERTISER_DELETE_WARNING + "\n\nClick OK to continue.",
      variant: "danger",
      confirmLabel: "Continue",
    });
    if (!first) return;
    const second = await showConfirm({
      title: "Final confirmation",
      message: `Delete "${advertiser.advertiser}" and all associated data?`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!second) return;
    const ok = await deleteAdvertiser(advertiser.id);
    if (ok) {
      router.refresh();
    } else {
      window.alert("Failed to delete. Please try again.");
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editAdvertiser.trim();
    if (!trimmed) {
      setEditError("Please fill in: Advertiser");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = await updateAdvertiser(advertiser.id, { advertiser: trimmed });
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
        className="campaign-row campaign-row--orders campaign-row--advertiser"
        style={{ marginLeft: marginLeft ?? 0, color: "inherit", textDecoration: "none", cursor: "pointer" }}
        data-navigates
        data-href={`/advertisers/${advertiser.id}`}
        onClick={() => router.push(`/advertisers/${advertiser.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/advertisers/${advertiser.id}`)}
      >
        <div className={(advertiser.activePlacementCount ?? 0) > 0 ? "status-dot" : "status-dot paused"} />
        <div className="row-meta">
          <div className="row-primary-text">{advertiser.advertiser}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{advertiser.orderCount}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{advertiser.campaignCount}</div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{advertiser.placementCount}</div>
        </div>
        <div className="control-group" onClick={(e) => e.stopPropagation()}>
          <ItemRowActions
            editHref={`/advertisers/${advertiser.id}`}
            onEdit={() => {
              setEditAdvertiser(advertiser.advertiser);
              setEditError(null);
              setShowEdit(true);
            }}
            onDelete={handleDelete}
            itemName={advertiser.advertiser}
            skipConfirm
          />
        </div>
      </div>
      {showEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-advertiser-title"
          style={editModalStyle}
          onClick={(e) => e.target === e.currentTarget && (setShowEdit(false), setEditError(null))}
        >
          <div style={editModalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-advertiser-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
              Edit advertiser
            </h2>
            {editError && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                {editError}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Advertiser</span>
              <input
                type="text"
                value={editAdvertiser}
                onChange={(e) => setEditAdvertiser(e.target.value)}
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemRowActions } from "@/components/ItemRowActions";
import { updateCampaign, deleteCampaign } from "@/lib/table-actions";
import type { Order } from "@/db/schema";
import { getStatusDotClass } from "@/lib/placement-status";

type CampaignGroup = { id: string; name: string; externalId?: string | null; count: number };

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

export function OrderCampaignsList({
  order,
  campaignGroups,
}: {
  order: Order;
  campaignGroups: CampaignGroup[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingHasExternalId, setEditingHasExternalId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Please fill in: Campaign ID");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = editingHasExternalId
        ? await updateCampaign(editingId, { externalId: trimmed })
        : await updateCampaign(editingId, { name: trimmed });
      if (result.success) {
        router.refresh();
        setEditingId(null);
      } else {
        setEditError(result.error ?? "Failed to update. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "8px 0",
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
        <Link href="/orders" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Orders
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{order.name}</span>
        <Link
          href={`/campaigns/new?order=${order.id}`}
          aria-label="Add campaign"
          style={{
            marginLeft: 8,
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
      <div style={{ padding: 24, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Campaigns ({campaignGroups.length})
        </p>
        <div className="campaign-list" style={{ padding: "var(--space-s)", display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
          {campaignGroups.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
              No campaigns yet.
            </p>
          ) : (
            campaignGroups.map((cg) => (
              <Link
                key={cg.id}
                href={`/orders/${order.id}/campaigns/${encodeURIComponent(cg.id)}`}
                className="campaign-row"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className={getStatusDotClass("Ended")} />
                <div className="row-meta">
                  <div className="row-primary-text">{cg.externalId?.trim() || cg.name || "—"}</div>
                  <div className="row-sub-text">Campaign ID</div>
                </div>
                <div className="row-meta">
                  <div className="row-label">Placements</div>
                  <div className="row-primary-text">{cg.count}</div>
                </div>
                <div className="row-meta" />
                <ItemRowActions
                  editHref={`/orders/${order.id}/campaigns/${encodeURIComponent(cg.id)}`}
                  onEdit={() => {
                    setEditName(cg.externalId?.trim() || cg.name || "");
                    setEditingHasExternalId(Boolean(cg.externalId?.trim()));
                    setEditError(null);
                    setEditingId(cg.id);
                  }}
                  onDelete={async () => {
                    const ok = await deleteCampaign(cg.id);
                    if (ok) router.refresh();
                    else window.alert("Failed to delete. Please try again.");
                  }}
                  itemName={cg.externalId?.trim() || cg.name || "—"}
                />
              </Link>
            ))
          )}
        </div>
      </div>
      {editingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-campaign-title"
          style={editModalStyle}
          onClick={(e) => e.target === e.currentTarget && (setEditingId(null), setEditError(null))}
        >
          <div style={editModalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-campaign-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
              Edit campaign
            </h2>
            {editError && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                {editError}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Campaign ID (required)</span>
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
                onClick={() => { setEditingId(null); setEditError(null); }}
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
    </div>
  );
}

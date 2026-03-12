"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemRowActions } from "@/components/ItemRowActions";
import { updateOrder, deleteOrder } from "@/lib/table-actions";
import { PdfViewPane } from "@/components/PdfViewPane";
import { getOrderDocumentUrl } from "@/lib/order-document-url";
import { getStatusDotClass } from "@/lib/placement-status";
import type { Campaign, Advertiser } from "@/db/schema";

type OrderGroup = { id: string; name: string; count?: number; activePlacementCount?: number; createdAt: string; documentPath?: string | null };

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

export function CampaignOrdersList({
  campaign,
  advertiser,
  orderGroups,
}: {
  campaign: Campaign;
  advertiser: Advertiser | null;
  orderGroups: OrderGroup[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editingOrder = editingId ? orderGroups.find((og) => og.id === editingId) : null;

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError("Please fill in: Order #");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = await updateOrder(editingId, { name: trimmed });
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

  const displayName = campaign.externalId?.trim() || campaign.name || "Campaign";

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
        <Link href="/campaigns" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Campaigns
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        {advertiser ? (
          <>
            <Link
              href={`/advertisers/${advertiser.id}`}
              style={{ color: "var(--text-tertiary)", textDecoration: "none" }}
            >
              {advertiser.advertiser}
            </Link>
            <span style={{ margin: "0 4px" }}>/</span>
          </>
        ) : null}
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{displayName}</span>
        <Link
          href={`/orders/new?campaign=${campaign.id}`}
          aria-label="Add order"
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
          New order
        </Link>
      </div>
      <div style={{ padding: 24, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          Orders ({orderGroups.length})
        </p>
        <div className="campaign-list" style={{ padding: "var(--space-s)", display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
          {orderGroups.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
              No orders yet.
            </p>
          ) : (
            orderGroups.map((og) => (
              <div key={og.id} className="campaign-row campaign-row--orders">
                <Link
                  href={`/orders/${og.id}`}
                  className="campaign-row--orders-link"
                  style={{
                    gridColumn: "1 / span 6",
                    display: "grid",
                    gridTemplateColumns: "subgrid",
                    alignItems: "center",
                    textDecoration: "none",
                    color: "inherit",
                    minWidth: 0,
                  }}
                >
                  <div className={getStatusDotClass((og.activePlacementCount ?? 0) > 0 ? "Live" : "Ended")} />
                  <div className="row-meta">
                    <div className="row-primary-text">{og.name}</div>
                    <div className="row-sub-text">Order</div>
                  </div>
                  <div className="row-meta" />
                  <div className="row-meta" />
                  <div className="row-meta" />
                  <div className="row-meta">
                    <div className="row-label">Placements</div>
                    <div className="row-primary-text">{og.count ?? 0}</div>
                  </div>
                </Link>
                <div style={{ gridColumn: "7", display: "flex", justifyContent: "flex-end" }}>
                  <ItemRowActions
                    editHref={`/orders/${og.id}`}
                    onEdit={() => {
                      setEditName(og.name);
                      setEditError(null);
                      setEditingId(og.id);
                    }}
                    onDelete={async () => {
                      const ok = await deleteOrder(og.id);
                      if (ok) router.refresh();
                      else window.alert("Failed to delete. Please try again.");
                    }}
                    itemName={og.name}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {editingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-order-title"
          style={editModalStyle}
          onClick={(e) => e.target === e.currentTarget && (setEditingId(null), setEditError(null))}
        >
          <div style={editModalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-order-title" style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
              Edit order
            </h2>
            {editError && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13 }}>
                {editError}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Order # (required)</span>
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
            {editingOrder?.documentPath && (
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                View PDF
              </button>
            )}
            <PdfViewPane
              isOpen={showPdfModal}
              onClose={() => setShowPdfModal(false)}
              pdfUrl={getOrderDocumentUrl(editingOrder?.documentPath)}
              title="IO PDF"
            />
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

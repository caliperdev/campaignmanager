"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemRowActions } from "@/components/ItemRowActions";
import { updateCampaign, deleteCampaign } from "@/lib/table-actions";
import { AdvertiserPicker } from "@/components/AdvertiserPicker";
import { AgencyPicker } from "@/components/AgencyPicker";
import { ClientPicker } from "@/components/ClientPicker";
import type { CampaignListItem } from "@/app/campaigns/page";
import { getStatusDotClass } from "@/lib/placement-status";
import { PlacementsCountWithStatus } from "@/components/PlacementsCountWithStatus";
import type { Advertiser, Agency, Client } from "@/db/schema";

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

const CAMPAIGN_ROW_COLUMNS = [
  { label: "Campaign" },
  { label: "Advertiser" },
  { label: "Orders" },
  { label: "Placements" },
] as const;

export function CampaignsTableHeader({ marginLeft = 0 }: { marginLeft?: number }) {
  return (
    <div className="campaign-row campaign-row--orders campaign-row--campaign campaigns-header" style={{ marginLeft }}>
      <div />
      {CAMPAIGN_ROW_COLUMNS.map(({ label }) => (
        <div key={label} className="row-meta">
          <div className="row-label">{label}</div>
        </div>
      ))}
      <div />
    </div>
  );
}

export function CampaignListRow({
  campaign,
  advertisers,
  agencies,
  clients,
  marginLeft,
}: {
  campaign: CampaignListItem;
  advertisers: Advertiser[];
  agencies: Agency[];
  clients: Client[];
  marginLeft?: number;
}) {
  const router = useRouter();
  const displayName = campaign.externalId?.trim() || campaign.name || "—";
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(campaign.name || "");
  const [editExternalId, setEditExternalId] = useState(campaign.externalId ?? "");
  const [editAdvertiserId, setEditAdvertiserId] = useState(campaign.advertiserId ?? "");
  const [editAgencyId, setEditAgencyId] = useState(campaign.agencyId ?? "");
  const [editClientId, setEditClientId] = useState(campaign.clientId ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleDelete = async () => {
    const ok = await deleteCampaign(campaign.id);
    if (ok) {
      router.refresh();
    } else {
      window.alert("Failed to delete. Please try again.");
    }
  };

  const handleSaveEdit = async () => {
    const missing: string[] = [];
    if (!editExternalId.trim()) missing.push("Campaign ID");
    if (!editName.trim()) missing.push("Name");
    if (!editAdvertiserId.trim()) missing.push("Advertiser");
    if (!editAgencyId.trim()) missing.push("Agency");
    if (!editClientId.trim()) missing.push("Client");
    if (missing.length > 0) {
      setEditError(`Please fill in: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = await updateCampaign(campaign.id, {
        name: editName.trim(),
        externalId: editExternalId.trim(),
        advertiserId: editAdvertiserId.trim(),
        agencyId: editAgencyId.trim(),
        clientId: editClientId.trim(),
      });
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
        className="campaign-row campaign-row--orders campaign-row--campaign"
        style={{ marginLeft: marginLeft ?? 0, color: "inherit", textDecoration: "none", cursor: "pointer" }}
        data-navigates
        data-href={`/campaigns/${campaign.id}`}
        onClick={() => router.push(`/campaigns/${campaign.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/campaigns/${campaign.id}`)}
      >
        <div className={getStatusDotClass(campaign.statusLabel)} />
        <div className="row-meta">
          <div className="row-primary-text">{displayName}</div>
        </div>
        <div className="row-meta" onClick={(e) => e.stopPropagation()}>
          <div className="row-primary-text">
            {campaign.advertiserId ? (
              <Link href={`/advertisers/${campaign.advertiserId}`} style={{ color: "inherit", textDecoration: "none" }}>
                {campaign.advertiserName ?? "—"}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="row-meta">
          <div className="row-primary-text">{campaign.ordersCount ?? 0}</div>
        </div>
        <div className="row-meta">
          <PlacementsCountWithStatus total={campaign.placementsCount ?? 0} counts={campaign.placementCountsByStatus} />
        </div>
        <div className="control-group" onClick={(e) => e.stopPropagation()}>
          <ItemRowActions
            editHref={`/campaigns/${campaign.id}`}
            onEdit={() => {
              setEditName(campaign.name || "");
              setEditExternalId(campaign.externalId ?? "");
              setEditAdvertiserId(campaign.advertiserId ?? "");
              setEditAgencyId(campaign.agencyId ?? "");
              setEditClientId(campaign.clientId ?? "");
              setEditError(null);
              setShowEdit(true);
            }}
            onDelete={handleDelete}
            itemName={displayName}
          />
        </div>
      </div>
      {showEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-campaign-title"
          style={editModalStyle}
          onClick={(e) => e.target === e.currentTarget && (setShowEdit(false), setEditError(null))}
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
                value={editExternalId}
                onChange={(e) => setEditExternalId(e.target.value)}
                placeholder="Campaign ID"
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
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginTop: 12 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Name (required)</span>
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
            <div style={{ marginTop: 12 }}>
              <AdvertiserPicker
                advertisers={advertisers}
                label="Advertiser (required)"
                value={editAdvertiserId}
                onChange={setEditAdvertiserId}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <AgencyPicker
                agencies={agencies}
                label="Agency"
                value={editAgencyId}
                onChange={setEditAgencyId}
                optional={false}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <ClientPicker
                clients={clients}
                label="Client"
                value={editClientId}
                onChange={setEditClientId}
                optional={false}
              />
            </div>
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

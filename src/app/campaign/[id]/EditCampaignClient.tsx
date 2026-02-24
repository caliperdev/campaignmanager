"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import CampaignForm from "@/components/CampaignForm";
import { updateCampaign, deleteCampaign } from "@/lib/campaign";
import type { Campaign } from "@/db/schema";

interface EditCampaignClientProps {
  campaign: Campaign;
  returnTo?: string;
}

export default function EditCampaignClient({ campaign, returnTo }: EditCampaignClientProps) {
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);

  const backHref = returnTo ?? "/campaigns";

  const goBack = useCallback(() => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard changes?")) return;
    router.push(backHref);
  }, [isDirty, backHref, router]);

  async function handleDelete() {
    if (!window.confirm("Delete this campaign? This cannot be undone.")) return;
    await deleteCampaign(campaign.id);
  }

  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        overflow: "auto",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
        <button
          type="button"
          onClick={goBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            transition: "color 0.2s var(--anim-ease)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          ← Back to table
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Edit: {campaign.name || `Campaign #${campaign.id}`}
          </h1>
          <button
            type="button"
            onClick={handleDelete}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 500,
              color: "#b22822",
              background: "transparent",
              border: "1px solid rgba(178, 40, 34, 0.5)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "background 0.2s var(--anim-ease), border-color 0.2s var(--anim-ease), color 0.2s var(--anim-ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(178, 40, 34, 0.08)";
              e.currentTarget.style.borderColor = "#b22822";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(178, 40, 34, 0.5)";
            }}
          >
            Delete
          </button>
        </div>

        <CampaignForm
          initial={campaign}
          onDirtyChange={setIsDirty}
          onCancel={goBack}
          onSubmit={async (data) => {
            await updateCampaign(campaign.id, data, returnTo ? { returnTo } : undefined);
          }}
        />
      </div>
    </main>
  );
}

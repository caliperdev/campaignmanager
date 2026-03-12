"use client";

type Campaign = { id: string; name: string; externalId?: string | null; count?: number };

type Props = {
  campaigns: Campaign[];
  label?: string;
  value?: string;
  onChange?: (campaignId: string, campaignName: string) => void;
  hasError?: boolean;
};

export function CampaignPicker({
  campaigns,
  label = "Select campaign",
  value,
  onChange,
  hasError,
}: Props) {
  if (campaigns.length === 0) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
        No campaigns yet. Create a campaign first.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (id && onChange) {
            const campaign = campaigns.find((c) => c.id === id);
            const displayId = (campaign?.externalId?.trim() || campaign?.name) ?? id;
            onChange(id, displayId);
          }
        }}
        required
        style={{
          padding: "10px 12px",
          fontSize: 14,
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          width: "100%",
          ...(hasError ? { borderColor: "rgba(220, 53, 69, 0.6)", outline: "1px solid rgba(220, 53, 69, 0.6)" } : {}),
        }}
      >
        <option value="">Choose a campaign…</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.externalId?.trim() || c.name}{c.count != null ? ` (${c.count} placement${c.count !== 1 ? "s" : ""})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

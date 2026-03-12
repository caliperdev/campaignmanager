"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { insertPlacementsBatch } from "@/lib/table-actions";
import { darkRangesToDarkDays, assignedRangesToPerDay, type DarkRange, type AssignedRange } from "@/lib/placement-allocator";
import { PlacementAllocator } from "@/components/PlacementAllocator";
import { CampaignPicker } from "@/components/CampaignPicker";
import type { DateRange } from "react-day-picker";

const ORDER_FIELDS = [
  "Advertiser",
  "Order Number",
  "Order Campaign ID",
  "Order Campaign",
  "Agency",
  "Category",
  "Trafficker",
  "AM",
  "QA AM",
] as const;

/** Columns sent to DB for new placements. Order Number is inherited from order.name. */
const NEW_PLACEMENT_ORDER_COLUMNS = ["Advertiser", "Order Number", "Order Campaign ID", "Agency", "Category", "Trafficker", "AM", "QA AM"] as const;

/** Fields shown in the form. Excludes Order Campaign ID (set by CampaignPicker), Agency, Advertiser (from order), Order Number, Order Campaign, Category. */
const ORDER_FIELDS_DISPLAY = [] as const;

const PLACEMENT_FIELDS = [
  "Placement ID",
  "Placement",
  "Format",
  "Deal",
  "Start Date",
  "End Date",
  "Impressions",
  "CPM Client",
  "CPM AdOps",
  "CPM Celtra",
  "Budget AdOps",
  "Budget Client",
  "Pacing",
  "Targeting Audience",
  "Important",
  "KPI",
  "KPI VCR",
  "KPI CTR",
  "KPI View",
  "KPI BSafe",
  "KPI OOG",
  "KPI IVT",
  "Teams SharePoint",
  "DSP",
  "Insertion Order Name",
  "Insertion Order ID - DSP",
  "ADS",
  "Placement Group ID",
  "VRF",
] as const;

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseNumberInput(value: string): string {
  return value.replace(/\D/g, "");
}

function parseDecimalInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

/** Budget Client = (Impressions/1000) * CPM Client */
function computeBudgetClient(impressions: string, cpmClient: string): string {
  const imp = parseInt(impressions.replace(/\D/g, ""), 10) || 0;
  const cpm = parseFloat(cpmClient.replace(/[^\d.]/g, "")) || 0;
  if (imp === 0 || cpm === 0) return "";
  return ((imp / 1000) * cpm).toFixed(2);
}

const NUMERIC_PLACEMENT_FIELDS = new Set(["Impressions", "CPM Client", "CPM AdOps"]);
const DECIMAL_PLACEMENT_FIELDS = new Set(["CPM Client", "CPM AdOps"]);

const SHOW_HIDDEN_FIELDS_TOOLTIP = true; // Set to false to remove tooltip
const HIDDEN_PLACEMENT_FIELDS = ["CPM Celtra"];

const ALLOCATOR_COLUMNS = ["dark_days", "per_day_impressions", "dark_ranges", "assigned_ranges"] as const;

type OrderData = Record<(typeof ORDER_FIELDS)[number], string>;
type PlacementData = Record<(typeof PLACEMENT_FIELDS)[number], string>;

const emptyOrder = (): OrderData =>
  ORDER_FIELDS.reduce((acc, f) => ({ ...acc, [f]: "" }), {} as OrderData);

const emptyPlacement = (): PlacementData =>
  PLACEMENT_FIELDS.reduce((acc, f) => ({ ...acc, [f]: "" }), {} as PlacementData);

type Campaign = { id: string; name: string; category?: string | null; count?: number };

type Props = {
  orderId: string;
  campaigns?: Campaign[];
  defaultOrderCampaign?: string;
  defaultOrderCampaignId?: string;
  returnPath?: string;
  /** Agency name from the order (placement inherits from order). */
  orderAgencyName?: string;
  /** Advertiser from the order (placement inherits from order). */
  orderAdvertiser?: string;
  /** Order number/name from the order (placement inherits from order). */
  orderName?: string;
  traffickerOptions: string[];
  amOptions: string[];
  qaAmOptions: string[];
  formatOptions: string[];
  dealOptions: string[];
};

export function NewPlacementForm({
  orderId,
  campaigns = [],
  defaultOrderCampaign,
  defaultOrderCampaignId,
  returnPath,
  orderAgencyName,
  orderAdvertiser,
  orderName,
  traffickerOptions,
  amOptions,
  qaAmOptions,
  formatOptions,
  dealOptions,
}: Props) {
  const router = useRouter();
  const [selectedCampaignId, setSelectedCampaignId] = useState(defaultOrderCampaignId ?? "");
  const [trafficker, setTrafficker] = useState("");
  const [am, setAm] = useState("");
  const [qaAm, setQaAm] = useState("");
  const [orderData, setOrderData] = useState<OrderData>(() => {
    const o = emptyOrder();
    if (defaultOrderCampaign != null) o["Order Campaign"] = defaultOrderCampaign;
    if (defaultOrderCampaign != null) o["Order Campaign ID"] = defaultOrderCampaign;
    return o;
  });
  useEffect(() => {
    if (defaultOrderCampaignId && campaigns.some((c) => c.id === defaultOrderCampaignId)) {
      setSelectedCampaignId(defaultOrderCampaignId);
    }
  }, [defaultOrderCampaignId, campaigns]);

  const handleCampaignSelect = (campaignId: string, campaignDisplayId: string) => {
    setFieldErrors((prev) => { const next = new Set(prev); next.delete("campaign"); return next; });
    setSelectedCampaignId(campaignId);
    setOrderData((prev) => ({
      ...prev,
      "Order Campaign ID": campaignDisplayId,
      "Order Campaign": campaignDisplayId,
    }));
  };
  const [placements, setPlacements] = useState<PlacementData[]>([emptyPlacement()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [darkRangesByPlacement, setDarkRangesByPlacement] = useState<DarkRange[][]>([[]]);
  const [assignedRangesByPlacement, setAssignedRangesByPlacement] = useState<AssignedRange[][]>([[]]);

  const allColumns = [...NEW_PLACEMENT_ORDER_COLUMNS, ...PLACEMENT_FIELDS, ...ALLOCATOR_COLUMNS];

  const updateOrder = (field: (typeof ORDER_FIELDS_DISPLAY)[number], value: string) =>
    setOrderData((prev) => ({ ...prev, [field]: value }));

  const updatePlacement = (idx: number, field: (typeof PLACEMENT_FIELDS)[number], value: string) => {
    setFieldErrors((prev) => {
      const next = new Set(prev);
      if (field === "Placement ID") next.delete(`placement_${idx}_placementId`);
      if (field === "Placement") next.delete(`placement_${idx}_placement`);
      if (field === "Format") next.delete(`placement_${idx}_format`);
      if (field === "Deal") next.delete(`placement_${idx}_deal`);
      if (field === "Start Date") next.delete(`placement_${idx}_startDate`);
      if (field === "End Date") next.delete(`placement_${idx}_endDate`);
      if (field === "Impressions") next.delete(`placement_${idx}_impressions`);
      if (field === "CPM Client") next.delete(`placement_${idx}_cpmClient`);
      if (field === "Teams SharePoint") next.delete(`placement_${idx}_teamsSharepoint`);
      return next;
    });
    setPlacements((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const next = { ...p, [field]: value };
        if (field === "Impressions" || field === "CPM Client") {
          next["Budget Client"] = computeBudgetClient(next["Impressions"], next["CPM Client"]);
        }
        return next;
      })
    );
  };

  const placementToDateRange = (p: PlacementData): DateRange | undefined => {
    const parse = (s: string) => (s ? new Date(s + "T12:00:00") : undefined);
    const start = parse(p["Start Date"]);
    const end = parse(p["End Date"]);
    if (!start || isNaN(start.getTime())) return undefined;
    if (!end || isNaN(end.getTime())) return { from: start };
    return { from: start, to: end };
  };

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const setPlacementDateRange = (idx: number, range: DateRange | undefined) => {
    setFieldErrors((prev) => {
      const next = new Set(prev);
      next.delete(`placement_${idx}_startDate`);
      next.delete(`placement_${idx}_endDate`);
      return next;
    });
    const from = range?.from;
    const to = range?.to ?? range?.from;
    const startStr = from && !isNaN(from.getTime()) ? toDateStr(from) : "";
    const endStr = to && !isNaN(to.getTime()) ? toDateStr(to) : "";
    setPlacements((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, "Start Date": startStr, "End Date": endStr } : p
      )
    );
  };

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    if (campaigns.length > 0 && !selectedCampaignId) errors.push("Campaign");
    if (!trafficker.trim()) errors.push("Trafficker");
    if (!am.trim()) errors.push("AM");
    if (!qaAm.trim()) errors.push("QA AM");
    placements.forEach((p, idx) => {
      if (!p["Placement ID"]?.trim()) errors.push(`Placement ${idx + 1}: Placement ID`);
      if (!p["Placement"]?.trim()) errors.push(`Placement ${idx + 1}: Placement`);
      if (!p["Format"]?.trim()) errors.push(`Placement ${idx + 1}: Format`);
      if (!p["Deal"]?.trim()) errors.push(`Placement ${idx + 1}: Deal`);
      if (!p["Start Date"]?.trim()) errors.push(`Placement ${idx + 1}: Start Date`);
      if (!p["End Date"]?.trim()) errors.push(`Placement ${idx + 1}: End Date`);
      const imp = parseInt((p["Impressions"] ?? "").replace(/\D/g, ""), 10) || 0;
      if (imp === 0) errors.push(`Placement ${idx + 1}: Impressions`);
      const cpm = parseFloat((p["CPM Client"] ?? "").replace(/[^\d.]/g, "")) || 0;
      if (cpm === 0) errors.push(`Placement ${idx + 1}: CPM Client`);
      if (!p["Teams SharePoint"]?.trim()) errors.push(`Placement ${idx + 1}: Teams SharePoint`);
    });
    return errors;
  };

  const getFieldErrorKeys = (): Set<string> => {
    const keys = new Set<string>();
    if (campaigns.length > 0 && !selectedCampaignId) keys.add("campaign");
    if (!trafficker.trim()) keys.add("trafficker");
    if (!am.trim()) keys.add("am");
    if (!qaAm.trim()) keys.add("qaAm");
    placements.forEach((p, idx) => {
      if (!p["Placement ID"]?.trim()) keys.add(`placement_${idx}_placementId`);
      if (!p["Placement"]?.trim()) keys.add(`placement_${idx}_placement`);
      if (!p["Format"]?.trim()) keys.add(`placement_${idx}_format`);
      if (!p["Deal"]?.trim()) keys.add(`placement_${idx}_deal`);
      if (!p["Start Date"]?.trim()) keys.add(`placement_${idx}_startDate`);
      if (!p["End Date"]?.trim()) keys.add(`placement_${idx}_endDate`);
      const imp = parseInt((p["Impressions"] ?? "").replace(/\D/g, ""), 10) || 0;
      if (imp === 0) keys.add(`placement_${idx}_impressions`);
      const cpm = parseFloat((p["CPM Client"] ?? "").replace(/[^\d.]/g, "")) || 0;
      if (cpm === 0) keys.add(`placement_${idx}_cpmClient`);
      if (!p["Teams SharePoint"]?.trim()) keys.add(`placement_${idx}_teamsSharepoint`);
    });
    return keys;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationErrors = getValidationErrors();
    if (validationErrors.length > 0) {
      setFieldErrors(getFieldErrorKeys());
      setError(`Please fill in: ${validationErrors.join(", ")}`);
      return;
    }
    setFieldErrors(new Set());
    setSaving(true);
    try {
      const baseOrder = { ...orderData };
      if (orderAgencyName != null) baseOrder["Agency"] = orderAgencyName;
      baseOrder["Advertiser"] = orderAdvertiser ?? "";
      baseOrder["Order Number"] = orderName ?? "";
      const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
      baseOrder["Category"] = selectedCampaign?.category ?? "";
      baseOrder["Trafficker"] = trafficker;
      baseOrder["AM"] = am;
      baseOrder["QA AM"] = qaAm;
      const rows = placements.map((p, idx) => {
        const darkRanges = darkRangesByPlacement[idx] ?? [];
        const assignedRanges = assignedRangesByPlacement[idx] ?? [];
        return {
          ...baseOrder,
          ...p,
          dark_days: JSON.stringify(darkRangesToDarkDays(darkRanges)),
          per_day_impressions: JSON.stringify(assignedRangesToPerDay(assignedRanges)),
          dark_ranges: JSON.stringify(darkRanges),
          assigned_ranges: JSON.stringify(assignedRanges),
        };
      });
      const result = await insertPlacementsBatch(allColumns, rows, orderId);
      if (result.success) {
        router.push(returnPath ?? `/orders/${orderId}`);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to create placements. Please try again.");
      }
    } catch (err) {
      console.error("Create placements error:", err);
      setError(err instanceof Error ? err.message : "Failed to create placements. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const fieldErrorStyle = { borderColor: "rgba(220, 53, 69, 0.6)", outline: "1px solid rgba(220, 53, 69, 0.6)" };
  const errorHintStyle = { fontSize: 12, color: "#dc2626", marginTop: 4 };

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", minWidth: 0 }}>
      {error && !fieldErrors.size && (
        <div style={{ padding: "12px 16px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, alignItems: "end" }}>
        {campaigns.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <CampaignPicker
              campaigns={campaigns}
              label="Campaign (assign placement to)"
              value={selectedCampaignId}
              onChange={handleCampaignSelect}
              hasError={fieldErrors.has("campaign")}
            />
            {fieldErrors.has("campaign") && <span style={errorHintStyle}>Please fill in this field</span>}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, gridColumn: "1 / -1" }}>
            No campaigns yet. <Link href={`/campaigns/new?order=${orderId}`} style={{ color: "var(--accent-mint)", textDecoration: "underline" }}>Create a campaign</Link> first.
          </p>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Trafficker</span>
          <select
            value={trafficker}
            onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("trafficker"); return n; }); setTrafficker(e.target.value); }}
            required
            style={{
              padding: "8px 10px",
              fontSize: 14,
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              width: "100%",
              ...(fieldErrors.has("trafficker") ? fieldErrorStyle : {}),
            }}
            aria-label="Trafficker"
          >
            <option value="">Select trafficker</option>
            {traffickerOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {fieldErrors.has("trafficker") && <span style={errorHintStyle}>Please fill in this field</span>}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>AM</span>
          <select
            value={am}
            onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("am"); return n; }); setAm(e.target.value); }}
            required
            style={{
              padding: "8px 10px",
              fontSize: 14,
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              width: "100%",
              ...(fieldErrors.has("am") ? fieldErrorStyle : {}),
            }}
            aria-label="AM"
          >
            <option value="">Select AM</option>
            {amOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {fieldErrors.has("am") && <span style={errorHintStyle}>Please fill in this field</span>}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>QA AM</span>
          <select
            value={qaAm}
            onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("qaAm"); return n; }); setQaAm(e.target.value); }}
            required
            style={{
              padding: "8px 10px",
              fontSize: 14,
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              width: "100%",
              ...(fieldErrors.has("qaAm") ? fieldErrorStyle : {}),
            }}
            aria-label="QA AM"
          >
            <option value="">Select QA AM</option>
            {qaAmOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {fieldErrors.has("qaAm") && <span style={errorHintStyle}>Please fill in this field</span>}
        </label>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Placement
          </h2>
          {SHOW_HIDDEN_FIELDS_TOOLTIP && (
            <span
              title={`Hidden fields: ${HIDDEN_PLACEMENT_FIELDS.join(", ")}`}
              style={{ fontSize: 12, color: "var(--text-tertiary)", cursor: "help" }}
            >
              (Hidden fields: {HIDDEN_PLACEMENT_FIELDS.length})
            </span>
          )}
        </div>

        {placements.map((placement, idx) => {
          const sidebarInputStyle = {
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            width: "100%",
          };
          const inputStyle = {
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
          };
          return (
            <div key={idx} style={{ display: "flex", gap: 16, alignItems: "stretch", minHeight: 0 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 20,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement ID</span>
                    <input type="text" value={placement["Placement ID"]} onChange={(e) => updatePlacement(idx, "Placement ID", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_placementId`) ? fieldErrorStyle : {}) }} />
                    {fieldErrors.has(`placement_${idx}_placementId`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement</span>
                    <input type="text" value={placement["Placement"]} onChange={(e) => updatePlacement(idx, "Placement", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_placement`) ? fieldErrorStyle : {}) }} />
                    {fieldErrors.has(`placement_${idx}_placement`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Format</span>
                    <select value={placement["Format"]} onChange={(e) => updatePlacement(idx, "Format", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_format`) ? fieldErrorStyle : {}) }} aria-label="Format">
                      <option value="">Select format</option>
                      {formatOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {fieldErrors.has(`placement_${idx}_format`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Deal</span>
                    <select value={placement["Deal"]} onChange={(e) => updatePlacement(idx, "Deal", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_deal`) ? fieldErrorStyle : {}) }} aria-label="Deal">
                      <option value="">Select deal</option>
                      {dealOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {fieldErrors.has(`placement_${idx}_deal`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Start Date</span>
                    <input type="date" value={placement["Start Date"]} onChange={(e) => updatePlacement(idx, "Start Date", e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker()} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_startDate`) ? fieldErrorStyle : {}) }} />
                    {fieldErrors.has(`placement_${idx}_startDate`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>End Date</span>
                    <input type="date" value={placement["End Date"]} onChange={(e) => updatePlacement(idx, "End Date", e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker()} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_endDate`) ? fieldErrorStyle : {}) }} />
                    {fieldErrors.has(`placement_${idx}_endDate`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Impressions</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberWithCommas(placement["Impressions"])}
                      onChange={(e) => updatePlacement(idx, "Impressions", parseNumberInput(e.target.value))}
                      required
                      style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_impressions`) ? fieldErrorStyle : {}) }}
                    />
                    {fieldErrors.has(`placement_${idx}_impressions`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM Client</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={placement["CPM Client"]}
                      onChange={(e) => updatePlacement(idx, "CPM Client", parseDecimalInput(e.target.value))}
                      required
                      style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_cpmClient`) ? fieldErrorStyle : {}) }}
                    />
                    {fieldErrors.has(`placement_${idx}_cpmClient`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget Client</span>
                    <input
                      type="text"
                      value={placement["Budget Client"]}
                      readOnly
                      style={{ ...inputStyle, background: "var(--bg-secondary)", cursor: "default" }}
                      title="(Impressions/1000) × CPM Client"
                    />
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                  Impressions and Dark Weeks allocator
                </span>
                <PlacementAllocator
                  startDate={placement["Start Date"]}
                  endDate={placement["End Date"]}
                  impressions={placement["Impressions"]}
                  darkRanges={darkRangesByPlacement[idx] ?? []}
                  assignedRanges={assignedRangesByPlacement[idx] ?? []}
                  onDarkRangesChange={(darkRanges) =>
                    setDarkRangesByPlacement((prev) => ({ ...prev, [idx]: darkRanges }))
                  }
                  onAssignedRangesChange={(assignedRanges) =>
                    setAssignedRangesByPlacement((prev) => ({ ...prev, [idx]: assignedRanges }))
                  }
                  numberOfMonths={3}
                  compact
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI VCR</span>
                  <input type="text" value={placement["KPI VCR"]} onChange={(e) => updatePlacement(idx, "KPI VCR", e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI CTR</span>
                  <input type="text" value={placement["KPI CTR"]} onChange={(e) => updatePlacement(idx, "KPI CTR", e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Pacing</span>
                  <input type="text" value={placement["Pacing"]} onChange={(e) => updatePlacement(idx, "Pacing", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Targeting Audience</span>
                  <input type="text" value={placement["Targeting Audience"]} onChange={(e) => updatePlacement(idx, "Targeting Audience", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Important</span>
                  <input type="text" value={placement["Important"]} onChange={(e) => updatePlacement(idx, "Important", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI</span>
                  <input type="text" value={placement["KPI"]} onChange={(e) => updatePlacement(idx, "KPI", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                </label>
              </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Teams SharePoint</span>
                    <input type="text" value={placement["Teams SharePoint"]} onChange={(e) => updatePlacement(idx, "Teams SharePoint", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has(`placement_${idx}_teamsSharepoint`) ? fieldErrorStyle : {}) }} />
                    {fieldErrors.has(`placement_${idx}_teamsSharepoint`) && <span style={errorHintStyle}>Please fill in this field</span>}
                  </label>
                </div>
              </div>

              <div
                style={{
                  width: 280,
                  flexShrink: 0,
                  padding: 16,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{DSP}`}</span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>DSP</span>
                    <input type="text" value={placement["DSP"]} onChange={(e) => updatePlacement(idx, "DSP", e.target.value)} style={sidebarInputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order Name</span>
                    <input type="text" value={placement["Insertion Order Name"]} onChange={(e) => updatePlacement(idx, "Insertion Order Name", e.target.value)} style={sidebarInputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order ID - DSP</span>
                    <input type="text" value={placement["Insertion Order ID - DSP"]} onChange={(e) => updatePlacement(idx, "Insertion Order ID - DSP", e.target.value)} style={sidebarInputStyle} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM AdOps</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={placement["CPM AdOps"]}
                        onChange={(e) => updatePlacement(idx, "CPM AdOps", parseDecimalInput(e.target.value))}
                        style={sidebarInputStyle}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget AdOps</span>
                      <input type="text" value={placement["Budget AdOps"]} onChange={(e) => updatePlacement(idx, "Budget AdOps", e.target.value)} style={sidebarInputStyle} />
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{ADS}`}</span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>ADS</span>
                    <input type="text" value={placement["ADS"]} onChange={(e) => updatePlacement(idx, "ADS", e.target.value)} style={sidebarInputStyle} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement Group ID</span>
                    <input type="text" value={placement["Placement Group ID"]} onChange={(e) => updatePlacement(idx, "Placement Group ID", e.target.value)} style={sidebarInputStyle} />
                  </label>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{VRF}`}</span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>VRF</span>
                    <input type="text" value={placement["VRF"]} onChange={(e) => updatePlacement(idx, "VRF", e.target.value)} style={sidebarInputStyle} />
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI View</span>
                      <input type="text" value={placement["KPI View"]} onChange={(e) => updatePlacement(idx, "KPI View", e.target.value)} style={sidebarInputStyle} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI BSafe</span>
                      <input type="text" value={placement["KPI BSafe"]} onChange={(e) => updatePlacement(idx, "KPI BSafe", e.target.value)} style={sidebarInputStyle} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI OOG</span>
                      <input type="text" value={placement["KPI OOG"]} onChange={(e) => updatePlacement(idx, "KPI OOG", e.target.value)} style={sidebarInputStyle} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI IVT</span>
                      <input type="text" value={placement["KPI IVT"]} onChange={(e) => updatePlacement(idx, "KPI IVT", e.target.value)} style={sidebarInputStyle} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-mint)",
            color: "white",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Creating…" : "Create placement"}
        </button>
        <Link
          href={returnPath ?? `/orders/${orderId}`}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            color: "var(--text-primary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

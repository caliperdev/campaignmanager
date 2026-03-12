"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePlacement as updatePlacementInDb } from "@/lib/table-actions";
import { PlacementAllocator } from "@/components/PlacementAllocator";
import {
  darkRangesToDarkDays,
  assignedRangesToPerDay,
  darkDaysToDarkRanges,
  perDayToAssignedRanges,
  type DarkRange,
  type AssignedRange,
} from "@/lib/placement-allocator";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import { PdfViewPane } from "@/components/PdfViewPane";
import { getOrderDocumentUrl } from "@/lib/order-document-url";

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

type PlacementData = Record<(typeof PLACEMENT_FIELDS)[number], string>;

function getRowValue(row: Record<string, unknown>, col: string): string {
  const dbKey = sanitizeDynamicColumnKey(col);
  const v = row[dbKey] ?? row[col];
  return String(v ?? "");
}

type Props = {
  orderId: string;
  campaignId: string;
  placementId: number;
  returnPath: string;
  initialRow: Record<string, unknown>;
  orderName: string;
  orderDocumentPath?: string | null;
  campaignDisplayId: string;
  orderAgencyName?: string;
  orderAdvertiser?: string;
  traffickerOptions: string[];
  amOptions: string[];
  qaAmOptions: string[];
  formatOptions: string[];
  dealOptions: string[];
};

export function EditPlacementForm({
  orderId,
  campaignId,
  placementId,
  returnPath,
  initialRow,
  orderName,
  orderDocumentPath = null,
  campaignDisplayId,
  orderAgencyName,
  orderAdvertiser,
  traffickerOptions,
  amOptions,
  qaAmOptions,
  formatOptions,
  dealOptions,
}: Props) {
  const router = useRouter();
  const [trafficker, setTrafficker] = useState(() => getRowValue(initialRow, "Trafficker"));
  const [am, setAm] = useState(() => getRowValue(initialRow, "AM"));
  const [qaAm, setQaAm] = useState(() => getRowValue(initialRow, "QA AM"));
  const [placement, setPlacement] = useState<PlacementData>(() => {
    const base = PLACEMENT_FIELDS.reduce(
      (acc, f) => ({ ...acc, [f]: getRowValue(initialRow, f) }),
      {} as PlacementData,
    );
    base["Budget Client"] = computeBudgetClient(base["Impressions"], base["CPM Client"]);
    return base;
  });
  const [darkRanges, setDarkRanges] = useState<DarkRange[]>(() => {
    const raw = getRowValue(initialRow, "dark_ranges");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (x): x is DarkRange =>
              x && typeof x === "object" && typeof (x as DarkRange).from === "string" && typeof (x as DarkRange).to === "string"
          );
          if (valid.length > 0) return valid;
        }
      } catch {}
    }
    const darkDaysRaw = getRowValue(initialRow, "dark_days");
    if (!darkDaysRaw) return [];
    try {
      const parsed = JSON.parse(darkDaysRaw) as unknown;
      const days = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      return darkDaysToDarkRanges(days);
    } catch {
      return [];
    }
  });
  const [assignedRanges, setAssignedRanges] = useState<AssignedRange[]>(() => {
    const raw = getRowValue(initialRow, "assigned_ranges");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (x): x is AssignedRange =>
              x &&
              typeof x === "object" &&
              typeof (x as AssignedRange).from === "string" &&
              typeof (x as AssignedRange).to === "string" &&
              typeof (x as AssignedRange).perDay === "object"
          );
          if (valid.length > 0) return valid;
        }
      } catch {}
    }
    const perDayRaw = getRowValue(initialRow, "per_day_impressions");
    if (!perDayRaw) return [];
    try {
      const parsed = JSON.parse(perDayRaw) as unknown;
      const perDay: Record<string, number> = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "number") perDay[k] = v;
        }
      }
      return perDayToAssignedRanges(perDay);
    } catch {}
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [showPdfPane, setShowPdfPane] = useState(false);

  const updatePlacement = (field: (typeof PLACEMENT_FIELDS)[number], value: string) => {
    setFieldErrors((prev) => {
      const next = new Set(prev);
      if (field === "Placement ID") next.delete("placementId");
      if (field === "Placement") next.delete("placement");
      if (field === "Format") next.delete("format");
      if (field === "Deal") next.delete("deal");
      if (field === "Start Date") next.delete("startDate");
      if (field === "End Date") next.delete("endDate");
      if (field === "Impressions") next.delete("impressions");
      if (field === "CPM Client") next.delete("cpmClient");
      if (field === "Teams SharePoint") next.delete("teamsSharepoint");
      return next;
    });
    setPlacement((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "Impressions" || field === "CPM Client") {
        next["Budget Client"] = computeBudgetClient(next["Impressions"], next["CPM Client"]);
      }
      return next;
    });
  };

  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    if (!trafficker.trim()) errors.push("Trafficker");
    if (!am.trim()) errors.push("AM");
    if (!qaAm.trim()) errors.push("QA AM");
    if (!placement["Placement ID"]?.trim()) errors.push("Placement ID");
    if (!placement["Placement"]?.trim()) errors.push("Placement");
    if (!placement["Format"]?.trim()) errors.push("Format");
    if (!placement["Deal"]?.trim()) errors.push("Deal");
    if (!placement["Start Date"]?.trim()) errors.push("Start Date");
    if (!placement["End Date"]?.trim()) errors.push("End Date");
    const imp = parseInt((placement["Impressions"] ?? "").replace(/\D/g, ""), 10) || 0;
    if (imp === 0) errors.push("Impressions");
    const cpm = parseFloat((placement["CPM Client"] ?? "").replace(/[^\d.]/g, "")) || 0;
    if (cpm === 0) errors.push("CPM Client");
    if (!placement["Teams SharePoint"]?.trim()) errors.push("Teams SharePoint");
    return errors;
  };

  const getFieldErrorKeys = (): Set<string> => {
    const keys = new Set<string>();
    if (!trafficker.trim()) keys.add("trafficker");
    if (!am.trim()) keys.add("am");
    if (!qaAm.trim()) keys.add("qaAm");
    if (!placement["Placement ID"]?.trim()) keys.add("placementId");
    if (!placement["Placement"]?.trim()) keys.add("placement");
    if (!placement["Format"]?.trim()) keys.add("format");
    if (!placement["Deal"]?.trim()) keys.add("deal");
    if (!placement["Start Date"]?.trim()) keys.add("startDate");
    if (!placement["End Date"]?.trim()) keys.add("endDate");
    const imp = parseInt((placement["Impressions"] ?? "").replace(/\D/g, ""), 10) || 0;
    if (imp === 0) keys.add("impressions");
    const cpm = parseFloat((placement["CPM Client"] ?? "").replace(/[^\d.]/g, "")) || 0;
    if (cpm === 0) keys.add("cpmClient");
    if (!placement["Teams SharePoint"]?.trim()) keys.add("teamsSharepoint");
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
      const payload: Record<string, string> = {
        trafficker,
        am,
        qa_am: qaAm,
        order_campaign_id: campaignDisplayId,
        order_campaign: campaignDisplayId,
        category: getRowValue(initialRow, "Category") || "",
        dark_days: JSON.stringify(darkRangesToDarkDays(darkRanges)),
        per_day_impressions: JSON.stringify(assignedRangesToPerDay(assignedRanges)),
        dark_ranges: JSON.stringify(darkRanges),
        assigned_ranges: JSON.stringify(assignedRanges),
      };
      for (const f of PLACEMENT_FIELDS) {
        payload[sanitizeDynamicColumnKey(f)] = placement[f] ?? "";
      }
      const result = await updatePlacementInDb(placementId, payload);
      if (result.success) {
        router.push(returnPath);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to update placement. Please try again.");
      }
    } catch (err) {
      console.error("Update placement error:", err);
      setError(err instanceof Error ? err.message : "Failed to update placement. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
  };

  const readOnlyStyle = {
    ...inputStyle,
    background: "var(--bg-secondary)",
  };

  const fieldErrorStyle = { borderColor: "rgba(220, 53, 69, 0.6)", outline: "1px solid rgba(220, 53, 69, 0.6)" };
  const errorHintStyle = { fontSize: 12, color: "#dc2626", marginTop: 4 };

  return (
    <>
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && !fieldErrors.size && (
        <div style={{ padding: "12px 16px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Order & campaign (read-only)
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Order #</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="text" value={orderName} readOnly style={{ ...readOnlyStyle, flex: 1 }} />
              <button
                type="button"
                onClick={() => setShowPdfPane(true)}
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                View PDF
              </button>
            </div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Campaign ID</span>
            <input type="text" value={campaignDisplayId} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Agency</span>
            <input type="text" value={orderAgencyName ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Category</span>
            <input type="text" value={getRowValue(initialRow, "Category")} readOnly style={readOnlyStyle} />
          </label>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Trafficker, AM, QA AM
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Trafficker</span>
            <select value={trafficker} onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("trafficker"); return n; }); setTrafficker(e.target.value); }} style={{ ...inputStyle, ...(fieldErrors.has("trafficker") ? fieldErrorStyle : {}) }} aria-label="Trafficker">
              <option value="">—</option>
              {traffickerOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErrors.has("trafficker") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>AM</span>
            <select value={am} onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("am"); return n; }); setAm(e.target.value); }} style={{ ...inputStyle, ...(fieldErrors.has("am") ? fieldErrorStyle : {}) }} aria-label="AM">
              <option value="">—</option>
              {amOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErrors.has("am") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>QA AM</span>
            <select value={qaAm} onChange={(e) => { setFieldErrors((p) => { const n = new Set(p); n.delete("qaAm"); return n; }); setQaAm(e.target.value); }} style={{ ...inputStyle, ...(fieldErrors.has("qaAm") ? fieldErrorStyle : {}) }} aria-label="QA AM">
              <option value="">—</option>
              {qaAmOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErrors.has("qaAm") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Placement details
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

        <div style={{ display: "flex", gap: 16, alignItems: "stretch", minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement ID</span>
            <input type="text" value={placement["Placement ID"]} onChange={(e) => updatePlacement("Placement ID", e.target.value)} style={{ ...inputStyle, ...(fieldErrors.has("placementId") ? fieldErrorStyle : {}) }} />
            {fieldErrors.has("placementId") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement</span>
            <input type="text" value={placement["Placement"]} onChange={(e) => updatePlacement("Placement", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has("placement") ? fieldErrorStyle : {}) }} />
            {fieldErrors.has("placement") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Format</span>
            <select value={placement["Format"]} onChange={(e) => updatePlacement("Format", e.target.value)} style={{ ...inputStyle, ...(fieldErrors.has("format") ? fieldErrorStyle : {}) }} aria-label="Format">
              <option value="">Select format</option>
              {formatOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErrors.has("format") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Deal</span>
            <select value={placement["Deal"]} onChange={(e) => updatePlacement("Deal", e.target.value)} style={{ ...inputStyle, ...(fieldErrors.has("deal") ? fieldErrorStyle : {}) }} aria-label="Deal">
              <option value="">Select deal</option>
              {dealOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldErrors.has("deal") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Start Date</span>
            <input type="date" value={placement["Start Date"]} onChange={(e) => updatePlacement("Start Date", e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker()} required style={{ ...inputStyle, ...(fieldErrors.has("startDate") ? fieldErrorStyle : {}) }} />
            {fieldErrors.has("startDate") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>End Date</span>
            <input type="date" value={placement["End Date"]} onChange={(e) => updatePlacement("End Date", e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker()} required style={{ ...inputStyle, ...(fieldErrors.has("endDate") ? fieldErrorStyle : {}) }} />
            {fieldErrors.has("endDate") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Impressions</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatNumberWithCommas(placement["Impressions"])}
              onChange={(e) => updatePlacement("Impressions", parseNumberInput(e.target.value))}
              required
              style={{ ...inputStyle, ...(fieldErrors.has("impressions") ? fieldErrorStyle : {}) }}
            />
            {fieldErrors.has("impressions") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM Client</span>
            <input
              type="text"
              inputMode="decimal"
              value={placement["CPM Client"]}
              onChange={(e) => updatePlacement("CPM Client", parseDecimalInput(e.target.value))}
              required
              style={{ ...inputStyle, ...(fieldErrors.has("cpmClient") ? fieldErrorStyle : {}) }}
            />
            {fieldErrors.has("cpmClient") && <span style={errorHintStyle}>Please fill in this field</span>}
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget Client</span>
            <input
              type="text"
              value={placement["Budget Client"]}
              readOnly
              style={readOnlyStyle}
              title="(Impressions/1000) × CPM Client"
            />
          </label>
        </div>

        <div style={{ marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
            Impressions and Dark Weeks allocator
          </span>
          <PlacementAllocator
            startDate={placement["Start Date"]}
            endDate={placement["End Date"]}
            impressions={placement["Impressions"]}
            darkRanges={darkRanges}
            assignedRanges={assignedRanges}
            onDarkRangesChange={setDarkRanges}
            onAssignedRangesChange={setAssignedRanges}
            numberOfMonths={3}
            compact
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI VCR</span>
            <input type="text" value={placement["KPI VCR"]} onChange={(e) => updatePlacement("KPI VCR", e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI CTR</span>
            <input type="text" value={placement["KPI CTR"]} onChange={(e) => updatePlacement("KPI CTR", e.target.value)} style={inputStyle} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Pacing</span>
            <input type="text" value={placement["Pacing"]} onChange={(e) => updatePlacement("Pacing", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Targeting Audience</span>
            <input type="text" value={placement["Targeting Audience"]} onChange={(e) => updatePlacement("Targeting Audience", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Important</span>
            <input type="text" value={placement["Important"]} onChange={(e) => updatePlacement("Important", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI</span>
            <input type="text" value={placement["KPI"]} onChange={(e) => updatePlacement("KPI", e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
          </label>
        </div>

        <div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Teams SharePoint</span>
            <input type="text" value={placement["Teams SharePoint"]} onChange={(e) => updatePlacement("Teams SharePoint", e.target.value)} required style={{ ...inputStyle, ...(fieldErrors.has("teamsSharepoint") ? fieldErrorStyle : {}) }} />
            {fieldErrors.has("teamsSharepoint") && <span style={errorHintStyle}>Please fill in this field</span>}
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
                <input type="text" value={placement["DSP"]} onChange={(e) => updatePlacement("DSP", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order Name</span>
                <input type="text" value={placement["Insertion Order Name"]} onChange={(e) => updatePlacement("Insertion Order Name", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order ID - DSP</span>
                <input type="text" value={placement["Insertion Order ID - DSP"]} onChange={(e) => updatePlacement("Insertion Order ID - DSP", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM AdOps</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={placement["CPM AdOps"]}
                    onChange={(e) => updatePlacement("CPM AdOps", parseDecimalInput(e.target.value))}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget AdOps</span>
                  <input type="text" value={placement["Budget AdOps"]} onChange={(e) => updatePlacement("Budget AdOps", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{ADS}`}</span>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>ADS</span>
                <input type="text" value={placement["ADS"]} onChange={(e) => updatePlacement("ADS", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement Group ID</span>
                <input type="text" value={placement["Placement Group ID"]} onChange={(e) => updatePlacement("Placement Group ID", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
            </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{VRF}`}</span>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>VRF</span>
                    <input type="text" value={placement["VRF"]} onChange={(e) => updatePlacement("VRF", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI View</span>
                  <input type="text" value={placement["KPI View"]} onChange={(e) => updatePlacement("KPI View", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI BSafe</span>
                  <input type="text" value={placement["KPI BSafe"]} onChange={(e) => updatePlacement("KPI BSafe", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI OOG</span>
                  <input type="text" value={placement["KPI OOG"]} onChange={(e) => updatePlacement("KPI OOG", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI IVT</span>
                  <input type="text" value={placement["KPI IVT"]} onChange={(e) => updatePlacement("KPI IVT", e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
            </div>
          </div>
        </div>
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
          {saving ? "Saving…" : "Save"}
        </button>
        <Link
          href={returnPath}
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
    <PdfViewPane
      isOpen={showPdfPane}
      onClose={() => setShowPdfPane(false)}
      pdfUrl={getOrderDocumentUrl(orderDocumentPath ?? undefined)}
      title="IO PDF"
    />
    </>
  );
}

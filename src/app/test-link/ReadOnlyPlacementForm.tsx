"use client";

import { ReadOnlyAllocatorSection } from "./ReadOnlyAllocatorSection";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import { darkDaysToDarkRanges, perDayToAssignedRanges } from "@/lib/placement-allocator";
import type { DarkRange, AssignedRange } from "@/lib/placement-allocator";
import type { PlacementDetail } from "./actions";

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

function getRowValue(row: Record<string, unknown>, col: string): string {
  const dbKey = sanitizeDynamicColumnKey(col);
  const v = row[dbKey] ?? row[col];
  return String(v ?? "");
}

const NUMERIC_PLACEMENT_FIELDS = new Set(["Impressions", "CPM Client", "CPM AdOps"]);

const SHOW_HIDDEN_FIELDS_TOOLTIP = true; // Set to false to remove tooltip
const HIDDEN_PLACEMENT_FIELDS = ["CPM Celtra"];

function parseAllocatorData(row: Record<string, unknown>): { darkRanges: DarkRange[]; assignedRanges: AssignedRange[] } {
  let darkRanges: DarkRange[] = [];
  const rawDark = getRowValue(row, "dark_ranges");
  if (rawDark) {
    try {
      const parsed = JSON.parse(rawDark) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (x): x is DarkRange =>
            x && typeof x === "object" && typeof (x as DarkRange).from === "string" && typeof (x as DarkRange).to === "string"
        );
        if (valid.length > 0) darkRanges = valid;
      }
    } catch {}
  }
  if (darkRanges.length === 0) {
    const darkDaysRaw = getRowValue(row, "dark_days");
    if (darkDaysRaw) {
      try {
        const parsed = JSON.parse(darkDaysRaw) as unknown;
        const days = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
        darkRanges = darkDaysToDarkRanges(days);
      } catch {}
    }
  }

  let assignedRanges: AssignedRange[] = [];
  const rawAssigned = getRowValue(row, "assigned_ranges");
  if (rawAssigned) {
    try {
      const parsed = JSON.parse(rawAssigned) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (x): x is AssignedRange =>
            x &&
            typeof x === "object" &&
            typeof (x as AssignedRange).from === "string" &&
            typeof (x as AssignedRange).to === "string" &&
            typeof (x as AssignedRange).perDay === "object"
        );
        if (valid.length > 0) assignedRanges = valid;
      }
    } catch {}
  }
  if (assignedRanges.length === 0) {
    const perDayRaw = getRowValue(row, "per_day_impressions");
    if (perDayRaw) {
      try {
        const parsed = JSON.parse(perDayRaw) as unknown;
        const perDay: Record<string, number> = {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "number") perDay[k] = v;
          }
        }
        assignedRanges = perDayToAssignedRanges(perDay);
      } catch {}
    }
  }
  return { darkRanges, assignedRanges };
}

const readOnlyStyle = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
};

export function ReadOnlyPlacementForm({ detail }: { detail: PlacementDetail }) {
  const { orderName, campaignDisplayId, orderAgencyName, category, placementRow } = detail;
  const { darkRanges, assignedRanges } = parseAllocatorData(placementRow);
  const placement: Record<string, string> = {};
  for (const f of PLACEMENT_FIELDS) {
    const raw = getRowValue(placementRow, f);
    placement[f] = NUMERIC_PLACEMENT_FIELDS.has(f) ? formatNumberWithCommas(raw) : raw;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Order & campaign (read-only)
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Order #</span>
            <input type="text" value={orderName} readOnly style={readOnlyStyle} />
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
            <input type="text" value={category} readOnly style={readOnlyStyle} />
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
            <input type="text" value={getRowValue(placementRow, "Trafficker")} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>AM</span>
            <input type="text" value={getRowValue(placementRow, "AM")} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>QA AM</span>
            <input type="text" value={getRowValue(placementRow, "QA AM")} readOnly style={readOnlyStyle} />
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
            <input type="text" value={placement["Placement ID"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement</span>
            <input type="text" value={placement["Placement"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Format</span>
            <input type="text" value={placement["Format"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Deal</span>
            <input type="text" value={placement["Deal"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Start Date</span>
            <input type="date" value={placement["Start Date"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>End Date</span>
            <input type="date" value={placement["End Date"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Impressions</span>
            <input type="text" value={placement["Impressions"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM Client</span>
            <input type="text" value={placement["CPM Client"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget Client</span>
            <input type="text" value={placement["Budget Client"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
            Impressions and Dark Weeks allocator
          </span>
          <ReadOnlyAllocatorSection
            startDate={getRowValue(placementRow, "Start Date")}
            endDate={getRowValue(placementRow, "End Date")}
            impressions={getRowValue(placementRow, "Impressions")}
            darkRanges={darkRanges}
            assignedRanges={assignedRanges}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI VCR</span>
            <input type="text" value={placement["KPI VCR"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI CTR</span>
            <input type="text" value={placement["KPI CTR"] ?? ""} readOnly style={readOnlyStyle} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Pacing</span>
            <input type="text" value={placement["Pacing"] ?? ""} readOnly style={{ ...readOnlyStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Targeting Audience</span>
            <input type="text" value={placement["Targeting Audience"] ?? ""} readOnly style={{ ...readOnlyStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Important</span>
            <input type="text" value={placement["Important"] ?? ""} readOnly style={{ ...readOnlyStyle, minWidth: 0 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI</span>
            <input type="text" value={placement["KPI"] ?? ""} readOnly style={{ ...readOnlyStyle, minWidth: 0 }} />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Teams SharePoint</span>
            <input type="text" value={placement["Teams SharePoint"] ?? ""} readOnly style={readOnlyStyle} />
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
                <input type="text" value={placement["DSP"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order Name</span>
                <input type="text" value={placement["Insertion Order Name"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Insertion Order ID - DSP</span>
                <input type="text" value={placement["Insertion Order ID - DSP"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>CPM AdOps</span>
                  <input type="text" value={placement["CPM AdOps"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Budget AdOps</span>
                  <input type="text" value={placement["Budget AdOps"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{ADS}`}</span>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>ADS</span>
                <input type="text" value={placement["ADS"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement Group ID</span>
                <input type="text" value={placement["Placement Group ID"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
              </label>
            </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{`{VRF}`}</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>VRF</span>
                  <input type="text" value={placement["VRF"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI View</span>
                  <input type="text" value={placement["KPI View"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI BSafe</span>
                  <input type="text" value={placement["KPI BSafe"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI OOG</span>
                  <input type="text" value={placement["KPI OOG"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                  <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>KPI IVT</span>
                  <input type="text" value={placement["KPI IVT"] ?? ""} readOnly style={{ ...readOnlyStyle, width: "100%" }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

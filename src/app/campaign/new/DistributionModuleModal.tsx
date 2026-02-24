"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui";
import type { CustomRange } from "@/db/schema";
import FlightCalendar from "@/components/FlightCalendar";
import DistributionPreviewModal from "@/components/DistributionPreviewModal";

/** Stored value: same shape as campaign (distributionMode + customRanges JSON). */
export interface DistributionModuleValue {
  distributionMode: "even" | "custom";
  customRanges: CustomRange[];
}

/** Parse stored distributionModule string (new format) or legacy darkWeeks format. */
export function parseDistributionModule(raw: string | null | undefined): DistributionModuleValue {
  if (!raw?.trim()) return { distributionMode: "even", customRanges: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { distributionMode: "even", customRanges: [] };
    const p = parsed as Record<string, unknown>;
    // New format: { distributionMode, customRanges }
    if (Array.isArray(p.customRanges)) {
      const mode = p.distributionMode === "custom" ? "custom" : "even";
      return { distributionMode: mode, customRanges: p.customRanges as CustomRange[] };
    }
    // Legacy: { darkWeeks: [{ startDate, endDate }] } -> convert to CustomRange[] with isDark
    if (Array.isArray(p.darkWeeks)) {
      const customRanges: CustomRange[] = (p.darkWeeks as { startDate?: string; endDate?: string }[])
        .filter((r) => typeof r?.startDate === "string" && typeof r?.endDate === "string")
        .map((r) => ({ startDate: r.startDate!, endDate: r.endDate!, isDark: true as const }));
      return {
        distributionMode: customRanges.length > 0 ? "custom" : "even",
        customRanges,
      };
    }
    return { distributionMode: "even", customRanges: [] };
  } catch {
    return { distributionMode: "even", customRanges: [] };
  }
}

function serializeDistributionModule(value: DistributionModuleValue): string {
  return JSON.stringify({
    distributionMode: value.distributionMode,
    customRanges: value.customRanges,
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

interface DistributionModuleModalProps {
  open: boolean;
  onClose: () => void;
  lineItemLabel: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  value: string;
  onSave: (value: string) => void;
}

export default function DistributionModuleModal({
  open,
  onClose,
  lineItemLabel,
  startDate,
  endDate,
  impressionsGoal,
  value,
  onSave,
}: DistributionModuleModalProps) {
  const [distributionMode, setDistributionMode] = useState<"even" | "custom">("even");
  const [customRanges, setCustomRanges] = useState<CustomRange[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const initFromValue = useCallback(() => {
    const parsed = parseDistributionModule(value);
    setDistributionMode(parsed.distributionMode);
    setCustomRanges(parsed.customRanges);
  }, [value]);

  useEffect(() => {
    if (open) initFromValue();
  }, [open, initFromValue]);

  const addRange = useCallback((range: CustomRange) => {
    setCustomRanges((prev) => [...prev, range]);
  }, []);

  const removeRange = useCallback((index: number) => {
    setCustomRanges((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    onSave(
      serializeDistributionModule({
        distributionMode,
        customRanges,
      })
    );
    onClose();
  }, [distributionMode, customRanges, onSave, onClose]);

  const canShowPreview = Boolean(
    startDate &&
      endDate &&
      startDate <= endDate &&
      !Number.isNaN(impressionsGoal) &&
      impressionsGoal > 0
  );
  const impressionsNum = Number(impressionsGoal) || 0;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="distribution-module-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          width: "min(640px, calc(100vw - 48px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-light)",
          }}
        >
          <div>
            <h3
              id="distribution-module-modal-title"
              style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}
            >
              Distribution module
            </h3>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {lineItemLabel} · Flight {startDate || "—"} → {endDate || "—"}
              {impressionsNum > 0 && ` · ${formatNumber(impressionsNum)} imp.`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "var(--text-tertiary)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
              Distribution
            </span>
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-secondary)",
                padding: 4,
                borderRadius: "var(--radius-md)",
              }}
            >
              <button
                type="button"
                onClick={() => setDistributionMode("even")}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  background: distributionMode === "even" ? "var(--bg-primary)" : "transparent",
                  color: distributionMode === "even" ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: distributionMode === "even" ? 500 : 400,
                }}
              >
                Distribute evenly
              </button>
              <button
                type="button"
                onClick={() => setDistributionMode("custom")}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  background: distributionMode === "custom" ? "var(--bg-primary)" : "transparent",
                  color: distributionMode === "custom" ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: distributionMode === "custom" ? 500 : 400,
                }}
              >
                Custom (date ranges)
              </button>
            </div>
          </div>

          {startDate && endDate && startDate <= endDate && (
            <>
              <FlightCalendar
                flightStart={startDate}
                flightEnd={endDate}
                customRanges={customRanges}
                distributionMode={distributionMode}
                onAddRange={addRange}
              />
              {distributionMode === "custom" && customRanges.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                    Ranges
                  </span>
                  {customRanges.map((r, i) => {
                    const isDark = "isDark" in r && r.isDark;
                    const imps = "impressionsGoal" in r ? r.impressionsGoal : 0;
                    const days =
                      r.startDate && r.endDate
                        ? Math.max(
                            0,
                            Math.round(
                              (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) /
                                (24 * 60 * 60 * 1000)
                            ) + 1
                          )
                        : 0;
                    return (
                      <div
                        key={`${r.startDate}-${r.endDate}-${i}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          background: isDark ? "#f3f4f6" : "#fef9e7",
                          borderLeft: `3px solid ${isDark ? "#9ca3af" : "#f59e0b"}`,
                          borderRadius: "var(--radius-sm)",
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            background: isDark ? "#e5e7eb" : "#fde68a",
                            color: isDark ? "#6b7280" : "#92400e",
                          }}
                        >
                          {isDark ? "Dark" : "Custom"}
                        </span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                          {r.startDate} – {r.endDate}
                        </span>
                        <span style={{ color: "var(--text-tertiary)" }}>
                          ({days} {days === 1 ? "day" : "days"})
                        </span>
                        {!isDark && (
                          <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                            {formatNumber(imps)} imp.
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRange(i)}
                          style={{
                            marginLeft: "auto",
                            padding: "2px 6px",
                            fontSize: 12,
                            background: "transparent",
                            border: "1px solid var(--border-light)",
                            borderRadius: 4,
                            cursor: "pointer",
                            color: "#ef4444",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canShowPreview}
                  onClick={() => setShowPreview(true)}
                >
                  Show distribution
                </Button>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px",
            borderTop: "1px solid var(--border-light)",
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      {showPreview && (
        <DistributionPreviewModal
          open={showPreview}
          onClose={() => setShowPreview(false)}
          campaignName={lineItemLabel}
          startDate={startDate}
          endDate={endDate}
          impressionsGoal={impressionsNum}
          distributionMode={distributionMode}
          customRanges={customRanges}
        />
      )}
    </div>
  );
}

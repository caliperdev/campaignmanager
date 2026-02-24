"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { Input, Button } from "@/components/ui";
import FlightCalendar from "./FlightCalendar";
import DistributionPreviewModal from "./DistributionPreviewModal";
import type { Campaign, CustomRange } from "@/db/schema";

const REQUIRED_KEYS = ["Insertion Order Name", "Start Date", "End Date", "Impressions Goal"] as const;

import "react-day-picker/style.css";

interface CampaignFormSubmitData {
  name: string;
  startDate: string;
  endDate: string;
  impressionsGoal: number;
  distributionMode?: "even" | "custom";
  customRanges?: CustomRange[] | null;
  csvData?: Record<string, string> | null;
}

interface CampaignFormProps {
  initial?: Campaign;
  onSubmit: (data: CampaignFormSubmitData) => Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  columnIds?: string[];
}

function toIso(d: Date | undefined): string | null {
  return d ? d.toISOString().split("T")[0] : null;
}

function fromIso(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseCustomRanges(raw: string | null | undefined): CustomRange[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomRange[];
  } catch {
    return [];
  }
}

function CsvDataField({
  colId,
  value,
  onChange,
  error,
}: {
  colId: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  if (colId === "Start Date" || colId === "End Date") {
    return (
      <Input
        id={colId}
        label={colId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (colId === "Impressions Goal") {
    return (
      <Input
        id={colId}
        label={colId}
        type="number"
        min={0}
        step={1}
        value={value}
        error={error}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      id={colId}
      label={colId}
      placeholder=""
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function parseCsvData(raw: string | null | undefined): Record<string, string> {
  if (raw == null || raw === "") return {};
  try {
    return (JSON.parse(raw) as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

function daysBetween(start: string, end: string): number {
  const a = fromIso(start);
  const b = fromIso(end);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)) + 1);
}

/** Dates in [flightStart, flightEnd] not covered by any custom range (remaining = where unallocated impressions go). */
function getRemainingDays(
  flightStart: string,
  flightEnd: string,
  customRanges: CustomRange[]
): { dateStrings: string[]; minDate: string | null; maxDate: string | null; count: number } {
  const covered = new Set<string>();
  for (const r of customRanges) {
    const d = fromIso(r.startDate);
    const end = fromIso(r.endDate);
    if (!d || !end) continue;
    const endTime = end.getTime();
    for (let t = d.getTime(); t <= endTime; t += 24 * 60 * 60 * 1000) {
      covered.add(new Date(t).toISOString().split("T")[0]);
    }
  }
  const remaining: string[] = [];
  const start = fromIso(flightStart);
  const end = fromIso(flightEnd);
  if (!start || !end) return { dateStrings: [], minDate: null, maxDate: null, count: 0 };
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const iso = new Date(t).toISOString().split("T")[0];
    if (!covered.has(iso)) remaining.push(iso);
  }
  if (remaining.length === 0) return { dateStrings: [], minDate: null, maxDate: null, count: 0 };
  remaining.sort();
  return {
    dateStrings: remaining,
    minDate: remaining[0],
    maxDate: remaining[remaining.length - 1],
    count: remaining.length,
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 18,
        height: 18,
        flexShrink: 0,
        fill: "currentColor",
        opacity: 0.8,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );
}

function getInitialCsvData(initial?: Campaign | null): Record<string, string> {
  const parsed = parseCsvData(initial?.csvData ?? null);
  const merged: Record<string, string> = {};
  for (const k of REQUIRED_KEYS) merged[k] = "";
  for (const k of Object.keys(parsed)) merged[k] = String(parsed[k] ?? "").trim();
  if (initial) {
    if (initial.name) merged["Insertion Order Name"] = initial.name;
    if (initial.startDate) merged["Start Date"] = initial.startDate;
    if (initial.endDate) merged["End Date"] = initial.endDate;
    if (initial.impressionsGoal != null) merged["Impressions Goal"] = String(initial.impressionsGoal);
  }
  return merged;
}

function formSnapshot(csv: Record<string, string>, mode: "even" | "custom", ranges: CustomRange[]) {
  return JSON.stringify({ csv, mode, ranges });
}

export default function CampaignForm({ initial, onSubmit, onCancel, onDirtyChange, columnIds }: CampaignFormProps) {
  const [csvData, setCsvData] = useState<Record<string, string>>(() => getInitialCsvData(initial));
  const [distributionMode, setDistributionMode] = useState<"even" | "custom">(
    (initial?.distributionMode as "even" | "custom") ?? "even"
  );
  const [customRanges, setCustomRanges] = useState<CustomRange[]>(() =>
    parseCustomRanges(initial?.customRanges ?? null)
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(["Required", "Data columns"]));
  const [flightDatePickerOpen, setFlightDatePickerOpen] = useState<"start" | "end" | null>(null);

  const dataColumnIds = useMemo(() => {
    const requiredSet = new Set<string>(REQUIRED_KEYS);
    const keys = Object.keys(csvData).filter((k) => !requiredSet.has(k));
    if (columnIds?.length) {
      const order = new Set(columnIds);
      const inOrder = columnIds.filter((id) => keys.includes(id));
      const rest = keys.filter((k) => !order.has(k));
      return [...inOrder, ...rest];
    }
    return keys;
  }, [csvData, columnIds]);

  const initialSnapshot = useMemo(
    () => formSnapshot(getInitialCsvData(initial), (initial?.distributionMode as "even" | "custom") ?? "even", parseCustomRanges(initial?.customRanges ?? null)),
    [initial]
  );
  const currentSnapshot = formSnapshot(csvData, distributionMode, customRanges);
  const isDirty = initialSnapshot !== currentSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function toggleSection(title: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const startDate = csvData["Start Date"] ?? "";
  const endDate = csvData["End Date"] ?? "";
  const impressionsGoalStr = csvData["Impressions Goal"] ?? "";
  const impressionsGoalNum = useMemo(() => {
    const n = parseInt(impressionsGoalStr, 10);
    return !Number.isNaN(n) && n >= 0 ? n : 0;
  }, [impressionsGoalStr]);

  const minDate = useMemo(() => {
    if (!startDate) return undefined;
    const [y, m, d] = startDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [startDate]);
  const maxDate = useMemo(() => {
    if (!endDate) return undefined;
    const [y, m, d] = endDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [endDate]);

  const lengthDays = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const lengthLabel = lengthDays > 0 ? `${lengthDays} days` : "";

  const totalAllocated = useMemo(() => {
    return customRanges.reduce((sum, r) => {
      if ("isDark" in r && r.isDark) return sum;
      const goal = "impressionsGoal" in r ? r.impressionsGoal : 0;
      return sum + (typeof goal === "number" ? goal : 0);
    }, 0);
  }, [customRanges]);

  function setCsvField(colId: string, value: string) {
    setCsvData((prev) => ({ ...prev, [colId]: value }));
    if (fieldErrors[colId]) setFieldErrors((prev) => ({ ...prev, [colId]: "" }));
  }

  function addRangeFromCalendar(range: CustomRange) {
    setCustomRanges((prev) => [...prev, range]);
  }

  function removeRange(index: number) {
    setCustomRanges((prev) => prev.filter((_, i) => i !== index));
  }

  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingRangeIndex, setEditingRangeIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ startDate: string; endDate: string; impressionsGoal: number } | null>(null);

  function startEditingRange(i: number) {
    const r = customRanges[i];
    const isDark = "isDark" in r && r.isDark;
    const imps = "impressionsGoal" in r ? r.impressionsGoal : 0;
    setEditingRangeIndex(i);
    setEditDraft({ startDate: r.startDate, endDate: r.endDate, impressionsGoal: isDark ? 0 : imps });
  }

  function applyEditRange() {
    if (editingRangeIndex == null || !editDraft) return;
    const r = customRanges[editingRangeIndex];
    const isDark = "isDark" in r && r.isDark;
    if (editDraft.startDate > editDraft.endDate) return;
    setCustomRanges((prev) => {
      const next = [...prev];
      next[editingRangeIndex] = isDark
        ? { startDate: editDraft.startDate, endDate: editDraft.endDate, isDark: true as const }
        : { startDate: editDraft.startDate, endDate: editDraft.endDate, impressionsGoal: editDraft.impressionsGoal };
      return next;
    });
    setEditingRangeIndex(null);
    setEditDraft(null);
  }

  function cancelEditRange() {
    setEditingRangeIndex(null);
    setEditDraft(null);
  }

  function handleDragStart(i: number) {
    dragIdx.current = i;
  }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragOverIdx !== i) setDragOverIdx(i);
  }
  function handleDrop(i: number) {
    const from = dragIdx.current;
    if (from === null || from === i) {
      dragIdx.current = null;
      setDragOverIdx(null);
      return;
    }
    setCustomRanges((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIdx.current = null;
    setDragOverIdx(null);
  }
  function handleDragEnd() {
    dragIdx.current = null;
    setDragOverIdx(null);
  }

  const unallocated = impressionsGoalNum - totalAllocated;

  const remainingDays = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return { dateStrings: [], minDate: null, maxDate: null, count: 0 };
    return getRemainingDays(startDate, endDate, customRanges);
  }, [startDate, endDate, customRanges]);

  const overlaps = useMemo(() => {
    const result: [number, number][] = [];
    for (let i = 0; i < customRanges.length; i++) {
      for (let j = i + 1; j < customRanges.length; j++) {
        const a = customRanges[i];
        const b = customRanges[j];
        if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
          result.push([i, j]);
        }
      }
    }
    return result;
  }, [customRanges]);

  const hasOverlaps = overlaps.length > 0;
  const canShowDistribution = Boolean(startDate && endDate && startDate <= endDate && impressionsGoalNum > 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (!submitter || !(submitter as HTMLElement).hasAttribute?.("data-submit-campaign")) return;
    setError(null);
    setFieldErrors({});

    const start = csvData["Start Date"]?.trim() ?? "";
    const end = csvData["End Date"]?.trim() ?? "";
    const dateRequiredMsg = "Start date and end date are required.";
    const dateOrderMsg = "Start date must be before or equal to end date.";
    if (!start || !end) {
      setError(dateRequiredMsg);
      setFieldErrors((prev) => ({
        ...prev,
        "Start Date": dateRequiredMsg,
        "End Date": dateRequiredMsg,
      }));
      return;
    }
    if (start > end) {
      setError(dateOrderMsg);
      setFieldErrors((prev) => ({
        ...prev,
        "Start Date": dateOrderMsg,
        "End Date": dateOrderMsg,
      }));
      return;
    }

    const goalNum = parseInt(csvData["Impressions Goal"] ?? "", 10);
    const goalMsg = "Impressions goal is required and must be a non-negative whole number.";
    if (Number.isNaN(goalNum) || goalNum < 0 || !Number.isInteger(goalNum)) {
      setError(goalMsg);
      setFieldErrors((prev) => ({ ...prev, "Impressions Goal": goalMsg }));
      return;
    }

    if (distributionMode === "custom" && hasOverlaps) {
      setError("Date ranges overlap. Fix overlapping ranges before saving.");
      return;
    }

    const overAllocatedMsg = `Over-allocated by ${formatNumber(totalAllocated - goalNum)} impressions. Reduce range goals or increase the campaign goal.`;
    if (distributionMode === "custom" && customRanges.length > 0 && totalAllocated > goalNum) {
      setError(overAllocatedMsg);
      setFieldErrors((prev) => ({ ...prev, "Impressions Goal": overAllocatedMsg }));
      return;
    }

    setSubmitting(true);
    try {
      const name = (csvData["Insertion Order Name"] ?? "").trim() || "Campaign";
      await onSubmit({
        name,
        startDate: start,
        endDate: end,
        impressionsGoal: goalNum,
        distributionMode,
        customRanges: distributionMode === "custom" && customRanges.length > 0 ? customRanges : null,
        csvData: { ...csvData, "Insertion Order Name": name, "Start Date": start, "End Date": end, "Impressions Goal": String(goalNum) },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 960 };
  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "6px 10px",
    background: "transparent",
    borderRadius: "var(--radius-sm)",
    border: "none",
    borderLeft: "2px solid var(--border-light)",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    cursor: "pointer",
    textAlign: "left",
  };
  const sectionBlockStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 12,
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") e.preventDefault();
        }
      }}
    >
      <div style={sectionStyle}>
        {error && (
          <div style={{ fontSize: "13px", color: "#b22822" }}>{error}</div>
        )}

        {/* Required: Name + Flight & goal */}
        {(() => {
          const sectionTitle = "Required";
          const isExpanded = expandedSections.has(sectionTitle);
          return (
            <div key={sectionTitle} style={sectionBlockStyle}>
              <button
                type="button"
                style={sectionHeaderStyle}
                onClick={() => toggleSection(sectionTitle)}
                aria-expanded={isExpanded}
              >
                <span>{sectionTitle}</span>
                <Chevron open={isExpanded} />
              </button>
              {isExpanded && (
                <>
                <CsvDataField key="Insertion Order Name" colId="Insertion Order Name" value={csvData["Insertion Order Name"] ?? ""} onChange={(v) => setCsvField("Insertion Order Name", v)} error={fieldErrors["Insertion Order Name"]} />
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label
                        htmlFor="flight-start"
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: fieldErrors["Start Date"] ? "#b22822" : "var(--text-secondary)",
                        }}
                      >
                        Start Date
                      </label>
                      <button
                        id="flight-start"
                        type="button"
                        onClick={() => setFlightDatePickerOpen((prev) => (prev === "start" ? null : "start"))}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: 14,
                          border: fieldErrors["Start Date"]
                            ? "1.5px solid #b22822"
                            : flightDatePickerOpen === "start"
                              ? "1.5px solid var(--accent-dark)"
                              : "1px solid var(--border-light)",
                          borderRadius: "var(--radius-md)",
                          background: flightDatePickerOpen === "start" ? "var(--bg-secondary)" : "var(--bg-primary)",
                          color: startDate ? "var(--text-primary)" : "var(--text-tertiary)",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "border-color 0.15s ease, background 0.15s ease",
                        }}
                      >
                        {startDate || "Select date"}
                      </button>
                      {fieldErrors["Start Date"] && (
                        <span style={{ fontSize: 12, color: "#b22822" }}>{fieldErrors["Start Date"]}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label
                        htmlFor="flight-end"
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: fieldErrors["End Date"] ? "#b22822" : "var(--text-secondary)",
                        }}
                      >
                        End Date
                      </label>
                      <button
                        id="flight-end"
                        type="button"
                        onClick={() => setFlightDatePickerOpen((prev) => (prev === "end" ? null : "end"))}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: 14,
                          border: fieldErrors["End Date"]
                            ? "1.5px solid #b22822"
                            : flightDatePickerOpen === "end"
                              ? "1.5px solid var(--accent-dark)"
                              : "1px solid var(--border-light)",
                          borderRadius: "var(--radius-md)",
                          background: flightDatePickerOpen === "end" ? "var(--bg-secondary)" : "var(--bg-primary)",
                          color: endDate ? "var(--text-primary)" : "var(--text-tertiary)",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "border-color 0.15s ease, background 0.15s ease",
                        }}
                      >
                        {endDate || "Select date"}
                      </button>
                      {fieldErrors["End Date"] && (
                        <span style={{ fontSize: 12, color: "#b22822" }}>{fieldErrors["End Date"]}</span>
                      )}
                    </div>
                  </div>
                  {flightDatePickerOpen && (
                    <div className="rdp-flight-wrapper" style={{ maxWidth: 280 }}>
                      <DayPicker
                        mode="single"
                        selected={
                          flightDatePickerOpen === "start" && startDate
                            ? fromIso(startDate)
                            : flightDatePickerOpen === "end" && endDate
                              ? fromIso(endDate)
                              : undefined
                        }
                        onSelect={(date) => {
                          if (!date) return;
                          const iso = toIso(date) ?? "";
                          if (flightDatePickerOpen === "start") {
                            setCsvField("Start Date", iso);
                            if (endDate && iso > endDate) setCsvField("End Date", iso);
                          } else {
                            setCsvField("End Date", iso);
                            if (startDate && iso < startDate) setCsvField("Start Date", iso);
                          }
                          setFlightDatePickerOpen(null);
                        }}
                        defaultMonth={
                          flightDatePickerOpen === "start" && startDate
                            ? fromIso(startDate)
                            : flightDatePickerOpen === "end" && endDate
                              ? fromIso(endDate)
                              : new Date()
                        }
                        disabled={
                          flightDatePickerOpen === "end" && startDate
                            ? (d) => toIso(d) !== null && toIso(d)! < startDate
                            : undefined
                        }
                      />
                    </div>
                  )}
                  <CsvDataField key="Impressions Goal" colId="Impressions Goal" value={csvData["Impressions Goal"] ?? ""} onChange={(v) => setCsvField("Impressions Goal", v)} error={fieldErrors["Impressions Goal"]} />
                </div>
                {lengthLabel && (
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Length: {formatNumber(lengthDays)} days
                  </span>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Distribution
                  </span>
                  <div style={{ display: "flex", gap: 4, background: "var(--bg-secondary)", padding: 4, borderRadius: "var(--radius-md)" }}>
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
                      onAddRange={addRangeFromCalendar}
                    />
                    {distributionMode === "custom" && customRanges.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                          Ranges
                        </span>
                        {customRanges.map((r, i) => {
                          const isDark = "isDark" in r && r.isDark;
                          const imps = "impressionsGoal" in r ? r.impressionsGoal : 0;
                          const days = daysBetween(r.startDate, r.endDate);
                          const dailyImp = days > 0 ? Math.round(imps / days) : 0;
                          const isOver = dragOverIdx === i;
                          const isOverlapping = overlaps.some(([a, b]) => a === i || b === i);
                          return (
                            <div key={`range-${r.startDate}-${r.endDate}-${isDark}-${imps}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div
                              draggable
                              onDragStart={() => handleDragStart(i)}
                              onDragOver={(e) => handleDragOver(e, i)}
                              onDrop={() => handleDrop(i)}
                              onDragEnd={handleDragEnd}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                background: isOverlapping ? "#fef2f2" : isDark ? "#f3f4f6" : "#fef9e7",
                                borderLeft: `3px solid ${isOverlapping ? "#ef4444" : isDark ? "#9ca3af" : "#f59e0b"}`,
                                borderRadius: "var(--radius-sm)",
                                fontSize: 13,
                                cursor: "grab",
                                opacity: dragIdx.current === i ? 0.5 : 1,
                                boxShadow: isOver ? "0 -2px 0 0 var(--accent-dark)" : "none",
                                transition: "box-shadow 0.15s ease, opacity 0.15s ease",
                              }}
                            >
                              <span
                                style={{ color: "var(--text-tertiary)", cursor: "grab", userSelect: "none", fontSize: 14, lineHeight: 1 }}
                                title="Drag to reorder"
                              >
                                ⠿
                              </span>
                              <span style={{
                                display: "inline-block",
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                background: isDark ? "#e5e7eb" : "#fde68a",
                                color: isDark ? "#6b7280" : "#92400e",
                              }}>
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
                              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                · {formatNumber(isDark ? 0 : dailyImp)}/day
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startEditingRange(i); }}
                                style={{
                                  marginLeft: "auto",
                                  padding: "2px 6px",
                                  fontSize: 12,
                                  background: "transparent",
                                  border: "1px solid var(--border-light)",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  color: "var(--text-secondary)",
                                }}
                                title="Edit"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRange(i)}
                                style={{
                                  padding: "2px 5px",
                                  fontSize: 12,
                                  background: "transparent",
                                  border: "1px solid var(--border-light)",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  color: "#ef4444",
                                }}
                                title="Remove"
                              >
                                ×
                              </button>
                            </div>
                            {editingRangeIndex === i && editDraft && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "flex-end",
                                  gap: 10,
                                  padding: "10px 12px",
                                  marginTop: 4,
                                  background: "var(--bg-primary)",
                                  border: "1px solid var(--border-light)",
                                  borderRadius: "var(--radius-sm)",
                                  fontSize: 13,
                                }}
                              >
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <label htmlFor={`custom-range-${i}-start`} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Start</label>
                                  <input
                                    id={`custom-range-${i}-start`}
                                    type="date"
                                    value={editDraft.startDate}
                                    min={startDate}
                                    max={endDate}
                                    onChange={(e) => setEditDraft((d) => d ? { ...d, startDate: e.target.value } : null)}
                                    style={{
                                      padding: "6px 10px",
                                      fontSize: 13,
                                      border: "1px solid var(--border-light)",
                                      borderRadius: "var(--radius-sm)",
                                      color: "var(--text-primary)",
                                      background: "var(--bg-primary)",
                                    }}
                                  />
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <label htmlFor={`custom-range-${i}-end`} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>End</label>
                                  <input
                                    id={`custom-range-${i}-end`}
                                    type="date"
                                    value={editDraft.endDate}
                                    min={startDate}
                                    max={endDate}
                                    onChange={(e) => setEditDraft((d) => d ? { ...d, endDate: e.target.value } : null)}
                                    style={{
                                      padding: "6px 10px",
                                      fontSize: 13,
                                      border: "1px solid var(--border-light)",
                                      borderRadius: "var(--radius-sm)",
                                      color: "var(--text-primary)",
                                      background: "var(--bg-primary)",
                                    }}
                                  />
                                </div>
                                {!isDark && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <label htmlFor={`custom-range-${i}-impressions`} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Impressions</label>
                                    <input
                                      id={`custom-range-${i}-impressions`}
                                      type="number"
                                      min={0}
                                      value={editDraft.impressionsGoal}
                                      onChange={(e) => setEditDraft((d) => d ? { ...d, impressionsGoal: Math.max(0, parseInt(e.target.value, 10) || 0) } : null)}
                                      style={{
                                        padding: "6px 10px",
                                        width: 100,
                                        fontSize: 13,
                                        border: "1px solid var(--border-light)",
                                        borderRadius: "var(--radius-sm)",
                                        color: "var(--text-primary)",
                                        background: "var(--bg-primary)",
                                      }}
                                    />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={applyEditRange}
                                  style={{
                                    padding: "6px 14px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#78350f",
                                    background: "#fde68a",
                                    border: "1px solid #f59e0b",
                                    borderRadius: "var(--radius-sm)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditRange}
                                  style={{
                                    padding: "6px 14px",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: "var(--text-secondary)",
                                    background: "var(--bg-secondary)",
                                    border: "1px solid var(--border-light)",
                                    borderRadius: "var(--radius-sm)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            </div>
                          );
                        })}
                        {remainingDays.count > 0 && unallocated > 0 && remainingDays.minDate && remainingDays.maxDate && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                background: "#fefce8",
                                borderLeft: "3px solid #eab308",
                                borderRadius: "var(--radius-sm)",
                                fontSize: 13,
                              }}
                            >
                              <span style={{
                                display: "inline-block",
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                background: "#fef9c3",
                                color: "#854d0e",
                              }}>
                                AUTO
                              </span>
                              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                {remainingDays.minDate} – {remainingDays.maxDate}
                              </span>
                              <span style={{ color: "var(--text-tertiary)" }}>
                                ({remainingDays.count} {remainingDays.count === 1 ? "day" : "days"})
                              </span>
                              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                                {formatNumber(unallocated)} imp.
                              </span>
                              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                                · {formatNumber(Math.round(unallocated / remainingDays.count))}/day
                              </span>
                            </div>
                            <span style={{ fontSize: 12, color: "#d97706", fontWeight: 500, paddingLeft: 4 }}>
                              {formatNumber(unallocated)} impressions unallocated — will be distributed evenly across remaining days
                            </span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            Total: {formatNumber(totalAllocated)} / {formatNumber(impressionsGoalNum)}
                          </span>
                          {hasOverlaps && (
                            <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>
                              Date ranges overlap — fix before saving
                            </span>
                          )}
                          {unallocated < 0 && (
                            <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>
                              Over-allocated by {formatNumber(Math.abs(unallocated))} impressions
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={{ paddingTop: 8 }}>
                      <button
                        type="button"
                        disabled={!canShowDistribution}
                        onClick={() => setShowDistribution(true)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 16px",
                          fontSize: 13,
                          fontWeight: 500,
                          color: canShowDistribution ? "var(--accent-dark)" : "var(--text-tertiary)",
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-md)",
                          cursor: canShowDistribution ? "pointer" : "not-allowed",
                          boxShadow: "var(--shadow-subtle)",
                          transition: "background 0.2s var(--anim-ease), border-color 0.2s var(--anim-ease), color 0.2s var(--anim-ease)",
                          opacity: canShowDistribution ? 1 : 0.7,
                        }}
                        onMouseEnter={(e) => {
                          if (!e.currentTarget.disabled) {
                            e.currentTarget.style.background = "var(--bg-secondary)";
                            e.currentTarget.style.borderColor = "var(--accent-dark)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--bg-primary)";
                          e.currentTarget.style.borderColor = "var(--border-light)";
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        Show distribution
                      </button>
                    </div>
                  </>
                )}
                </>
                )}
              </div>
          );
        })()}

        {/* Data columns */}
        {(() => {
          const sectionTitle = "Data columns";
          const isExpanded = expandedSections.has(sectionTitle);
          return (
            <div key={sectionTitle} style={sectionBlockStyle}>
              <button
                type="button"
                style={sectionHeaderStyle}
                onClick={() => toggleSection(sectionTitle)}
                aria-expanded={isExpanded}
              >
                <span>{sectionTitle}</span>
                <Chevron open={isExpanded} />
              </button>
              {isExpanded && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                  {dataColumnIds.map((colId) => (
                    <CsvDataField
                      key={colId}
                      colId={colId}
                      value={csvData[colId] ?? ""}
                      onChange={(v) => setCsvField(colId, v)}
                      error={fieldErrors[colId]}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ paddingTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            data-submit-campaign
            disabled={submitting || hasOverlaps}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 600,
              color: "white",
              background: "var(--accent-dark)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: submitting || hasOverlaps ? "not-allowed" : "pointer",
              boxShadow: "var(--shadow-subtle)",
              transition: "background 0.2s var(--anim-ease), box-shadow 0.2s var(--anim-ease)",
              opacity: submitting || hasOverlaps ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled && !hasOverlaps) {
                e.currentTarget.style.background = "var(--accent-hover)";
                e.currentTarget.style.boxShadow = "var(--shadow-float)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent-dark)";
              e.currentTarget.style.boxShadow = "var(--shadow-subtle)";
            }}
          >
            {submitting ? "Saving…" : initial ? "Update Campaign" : "Create Campaign"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Discard changes?")) return;
                onCancel();
              }}
              disabled={submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "var(--shadow-subtle)",
                transition: "background 0.2s var(--anim-ease), border-color 0.2s var(--anim-ease), color 0.2s var(--anim-ease)",
                opacity: submitting ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.background = "var(--bg-secondary)";
                  e.currentTarget.style.borderColor = "var(--text-tertiary)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-primary)";
                e.currentTarget.style.borderColor = "var(--border-light)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              Cancel
            </button>
          )}
        </div>

        <DistributionPreviewModal
          open={showDistribution}
          onClose={() => setShowDistribution(false)}
          campaignName={csvData["Insertion Order Name"] ?? ""}
          startDate={startDate}
          endDate={endDate}
          impressionsGoal={impressionsGoalNum}
          distributionMode={distributionMode}
          customRanges={customRanges}
        />
      </div>
    </form>
  );
}

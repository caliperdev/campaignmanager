"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { Button } from "@/components/ui";
import { updateCampaignNotes } from "@/lib/campaign";

import "react-day-picker/style.css";

interface CampaignNotesModalProps {
  open: boolean;
  onClose: () => void;
  campaignId: number;
  campaignName: string;
  startDate: string;
  endDate: string;
  initialNotes: Record<string, string>;
  onSaved?: (notes: Record<string, string>) => void;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function NotesModalHeader({
  campaignName,
  startDate,
  endDate,
  onClose,
}: {
  campaignName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  return (
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
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          Notes
        </h3>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {campaignName || "Untitled"} · {startDate} → {endDate}
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
  );
}

function NotesModalFooter({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
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
      <Button variant="primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save notes"}
      </Button>
    </div>
  );
}

function NotesDateList({
  notes,
  selectedDate,
  onSelectDate,
}: {
  notes: Record<string, string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const datesWithNotes = Object.entries(notes)
    .filter(([, v]) => v.trim())
    .sort(([a], [b]) => a.localeCompare(b));
  if (datesWithNotes.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        All notes ({datesWithNotes.length})
      </span>
      {datesWithNotes.map(([date, text]) => (
        <div
          key={date}
          role="button"
          tabIndex={0}
          onClick={() => onSelectDate(date)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectDate(date);
            }
          }}
          style={{
            display: "flex",
            gap: 10,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            background: selectedDate === date ? "rgba(245, 158, 11, 0.12)" : "var(--bg-secondary)",
            cursor: "pointer",
            transition: "background 0.15s ease",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            {date}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </span>
        </div>
      ))}
    </div>
  );
}

function NoteEditorSection({
  selectedDate,
  value,
  onChange,
  onRemove,
}: {
  selectedDate: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
        Note for {selectedDate}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a note for this date..."
        rows={3}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 13,
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      {value.trim() ? (
        <button
          type="button"
          onClick={onRemove}
          style={{
            alignSelf: "flex-start",
            padding: "4px 10px",
            fontSize: 12,
            color: "#ef4444",
            background: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Remove note
        </button>
      ) : null}
    </div>
  );
}

export default function CampaignNotesModal({
  open,
  onClose,
  campaignId,
  campaignName,
  startDate,
  endDate,
  initialNotes,
  onSaved,
}: CampaignNotesModalProps) {
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setPendingEdits({});
  }, [open]);

  const notes = useMemo(
    () => ({ ...initialNotes, ...pendingEdits }),
    [initialNotes, pendingEdits],
  );

  const setNotes = useCallback((next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setPendingEdits((prev) => {
      const merged = { ...initialNotes, ...prev };
      const nextVal = typeof next === "function" ? next(merged) : next;
      const nextPending: Record<string, string> = {};
      const allKeys = new Set([...Object.keys(initialNotes), ...Object.keys(prev), ...Object.keys(nextVal)]);
      for (const k of allKeys) {
        const want = nextVal[k];
        const fromInitial = initialNotes[k];
        if (want !== fromInitial) nextPending[k] = want === undefined ? "" : want;
      }
      return nextPending;
    });
  }, [initialNotes]);

  const start = useMemo(() => parseIso(startDate), [startDate]);
  const end = useMemo(() => parseIso(endDate), [endDate]);

  const datesWithNotes = useMemo(() => {
    return Object.keys(notes)
      .filter((d) => notes[d]?.trim())
      .map(parseIso);
  }, [notes]);

  const disabledMatcher = useCallback(
    (date: Date) => {
      const iso = toIso(date);
      return iso < startDate || iso > endDate;
    },
    [startDate, endDate],
  );

  const months = useMemo(() => {
    const s = start;
    const e = end;
    return (
      (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
    );
  }, [start, end]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateCampaignNotes(campaignId, notes);
      onSaved?.(notes);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const currentNote = selectedDate ? notes[selectedDate] ?? "" : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Close modal"
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
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          width: "min(600px, calc(100vw - 48px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <NotesModalHeader campaignName={campaignName} startDate={startDate} endDate={endDate} onClose={onClose} />

        {/* Body */}
        <div
          style={{
            overflow: "auto",
            flex: 1,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Calendar */}
          <div className="rdp-flight-wrapper" style={{ alignSelf: "center" }}>
            <DayPicker
              mode="single"
              selected={selectedDate ? parseIso(selectedDate) : undefined}
              onSelect={(date) => {
                if (!date) {
                  setSelectedDate(null);
                  return;
                }
                setSelectedDate(toIso(date));
              }}
              defaultMonth={start}
              startMonth={start}
              endMonth={end}
              numberOfMonths={Math.min(months, 3)}
              pagedNavigation
              disabled={disabledMatcher}
              modifiers={{
                hasNote: datesWithNotes,
              }}
              modifiersClassNames={{
                hasNote: "rdp-has-note",
              }}
            />
          </div>

          {selectedDate ? (
            <NoteEditorSection
              selectedDate={selectedDate}
              value={currentNote}
              onChange={(v) => setNotes((prev) => ({ ...prev, [selectedDate]: v }))}
              onRemove={() =>
                setNotes((prev) => {
                  const next = { ...prev };
                  delete next[selectedDate];
                  return next;
                })
              }
            />
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", margin: 0 }}>
              Select a date on the calendar to add or edit a note
            </p>
          )}

          <NotesDateList notes={notes} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <NotesModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}

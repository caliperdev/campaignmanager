"use client";

import { useEffect, useState } from "react";
import { getPlacementsWithInsertionOrderIdDsp, type PlacementWithIoDsp } from "@/lib/dashboard-placements-dsp";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PlacementsModal({ open, onClose }: Props) {
  const [placements, setPlacements] = useState<PlacementWithIoDsp[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPlacementsWithInsertionOrderIdDsp()
      .then(setPlacements)
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="placements-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
          maxWidth: 720,
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-light)" }}>
          <h2
            id="placements-modal-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}
          >
            Placements with Insertion Order ID - DSP
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${placements.length} placement(s) loaded`}
          </p>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
              Loading…
            </div>
          ) : placements.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
              No placements with Insertion Order ID - DSP.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Placement ID</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Placement</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>IO ID - DSP</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Format</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Start – End</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>Impressions</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "8px 12px" }}>{p.placement_id ?? "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{p.placement ?? "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>
                      {p.insertion_order_id_dsp ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{p.format ?? "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {[p.start_date, p.end_date].filter(Boolean).join(" – ") || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {p.impressions ? Number(p.impressions.replace(/[^0-9]/g, "")).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-light)" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "var(--bg-control)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

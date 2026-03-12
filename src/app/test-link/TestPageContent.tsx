"use client";

import { useState, useCallback, useEffect } from "react";
import type { Order } from "@/db/schema";
import { getPlacementsForOrder, getPlacementDetail, getSourceByType, getJoinedPlacementSource, type JoinedRow } from "./actions";
import { updatePlacement } from "@/lib/table-actions";
import { sanitizeDynamicColumnKey } from "@/lib/dynamic-table-keys";
import type { PlacementDetail } from "./actions";
import type { PlacementRow } from "./actions";

const INSERTION_ORDER_ID_DSP = "Insertion Order ID - DSP";
const SOURCE_TYPES = ["DSP", "ADS", "VRF"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function getPlacementDisplayId(row: PlacementRow): string {
  const key = sanitizeDynamicColumnKey("Placement ID");
  const v = row[key] ?? row["Placement ID"];
  return String(v ?? row.id ?? "");
}

function getRowValue(row: Record<string, unknown>, col: string): string {
  const dbKey = sanitizeDynamicColumnKey(col);
  const v = row[dbKey] ?? row[col];
  return String(v ?? "");
}

type Props = {
  orders: Order[];
};

export function TestPageContent({ orders }: Props) {
  const [sourceType, setSourceType] = useState<SourceType>("DSP");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState<number | null>(null);
  const [placementDetail, setPlacementDetail] = useState<PlacementDetail | null>(null);
  const [joinedRows, setJoinedRows] = useState<JoinedRow[]>([]);
  const [joinLeftValue, setJoinLeftValue] = useState("");
  const [sourceRowCount, setSourceRowCount] = useState(-1);
  const [loadingJoin, setLoadingJoin] = useState(false);
  const [loadingPlacements, setLoadingPlacements] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [insertionOrderIdDsp, setInsertionOrderIdDsp] = useState("");
  const [savingInsertionOrderId, setSavingInsertionOrderId] = useState(false);

  useEffect(() => {
    if (placementDetail) {
      setInsertionOrderIdDsp(getRowValue(placementDetail.placementRow, INSERTION_ORDER_ID_DSP));
    } else {
      setInsertionOrderIdDsp("");
    }
  }, [placementDetail]);

  useEffect(() => {
    setLoadingSource(true);
    setSourceId(null);
    getSourceByType(sourceType).then((s) => {
      setSourceId(s?.id ?? null);
      setLoadingSource(false);
    });
  }, [sourceType]);

  const handleOrderChange = useCallback(async (orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedPlacementId(null);
    setPlacementDetail(null);
    setPlacements([]);
    if (!orderId) return;
    setLoadingPlacements(true);
    try {
      const { rows } = await getPlacementsForOrder(orderId);
      setPlacements(rows);
    } finally {
      setLoadingPlacements(false);
    }
  }, []);

  const handlePlacementChange = useCallback(async (placementId: number) => {
    setSelectedPlacementId(placementId);
    setPlacementDetail(null);
    setJoinedRows([]);
    if (!selectedOrderId || !placementId) return;
    setLoadingDetail(true);
    try {
      const detail = await getPlacementDetail(selectedOrderId, placementId);
      setPlacementDetail(detail ?? null);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedOrderId]);

  const fetchJoinedData = useCallback(async () => {
    if (!selectedOrderId || !selectedPlacementId || !sourceId) {
      setJoinedRows([]);
      setJoinLeftValue("");
      setSourceRowCount(-1);
      return;
    }
    setLoadingJoin(true);
    try {
      const result = await getJoinedPlacementSource(selectedOrderId, selectedPlacementId, sourceId);
      if (result) {
        setJoinedRows(result.joinedRows);
        setJoinLeftValue(result.leftValue);
        setSourceRowCount(result.sourceRowCount);
      } else {
        setJoinedRows([]);
        setJoinLeftValue("");
        setSourceRowCount(-1);
      }
    } finally {
      setLoadingJoin(false);
    }
  }, [selectedOrderId, selectedPlacementId, sourceId]);

  useEffect(() => {
    fetchJoinedData();
  }, [fetchJoinedData]);

  const handleSaveInsertionOrderIdDsp = useCallback(async () => {
    if (!placementDetail || selectedPlacementId == null) return;
    setSavingInsertionOrderId(true);
    try {
      const payload = { insertion_order_id_dsp: insertionOrderIdDsp };
      const result = await updatePlacement(selectedPlacementId, payload);
      if (result.success) {
        const detail = await getPlacementDetail(placementDetail.order.id, selectedPlacementId);
        setPlacementDetail(detail ?? null);
        fetchJoinedData();
      }
    } finally {
      setSavingInsertionOrderId(false);
    }
  }, [placementDetail, selectedPlacementId, insertionOrderIdDsp, fetchJoinedData]);

  const previewCols = joinedRows[0] ? Object.keys(joinedRows[0]) : [];

  return (
    <main className="page-responsive-padding" style={{ padding: 32, maxWidth: "none" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
        Placement × Source Join
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
        Left: Dataverse source (DSP/ADS/VRF). Right: Placement. Join: insertion_order_id_dsp = cr4fe_insertionordergid.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 1fr) minmax(320px, 1fr) 1fr",
          gap: 24,
          alignItems: "start",
          minHeight: 400,
        }}
      >
        <div
          style={{
            padding: 24,
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
            Left (source)
          </h2>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Source</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              style={{
                padding: "8px 10px",
                fontSize: 14,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          {loadingSource && <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>Loading…</p>}
          {!loadingSource && !sourceId && <p style={{ fontSize: 13, color: "var(--accent-orange)", marginTop: 8 }}>Not configured</p>}
        </div>

        <div
          style={{
            padding: 24,
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            overflowY: "auto",
            maxHeight: "calc(100vh - 220px)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
            Right (placement)
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Order</span>
              <select
                value={selectedOrderId ?? ""}
                onChange={(e) => handleOrderChange(e.target.value || "")}
                style={{
                  padding: "8px 10px",
                  fontSize: 14,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">Select order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Placement</span>
              <select
                value={selectedPlacementId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setSelectedPlacementId(null);
                    setPlacementDetail(null);
                    return;
                  }
                  handlePlacementChange(parseInt(v, 10));
                }}
                disabled={!selectedOrderId || loadingPlacements}
                style={{
                  padding: "8px 10px",
                  fontSize: 14,
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">Select placement</option>
                {placements.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getPlacementDisplayId(p) || `#${p.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {placementDetail && !loadingDetail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{INSERTION_ORDER_ID_DSP}</span>
                <input
                  type="text"
                  value={insertionOrderIdDsp}
                  onChange={(e) => setInsertionOrderIdDsp(e.target.value)}
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
              <button
                type="button"
                onClick={handleSaveInsertionOrderIdDsp}
                disabled={savingInsertionOrderId}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background: "var(--accent-mint)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: savingInsertionOrderId ? "wait" : "pointer",
                }}
              >
                {savingInsertionOrderId ? "Saving…" : "Save"}
              </button>
            </div>
          )}
          {loadingDetail && <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</p>}
        </div>

        <div
          style={{
            padding: 24,
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            overflowY: "auto",
            maxHeight: "calc(100vh - 220px)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
            Join result
          </h2>
          {loadingJoin && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              <span className="btn-loader" aria-hidden /> Joining…
            </p>
          )}
          {!loadingJoin && !joinLeftValue && placementDetail && (
            <p style={{ fontSize: 12, color: "var(--accent-orange)", fontWeight: 500 }}>
              Fill Insertion Order ID - DSP in the placement.
            </p>
          )}
          {!loadingJoin && sourceRowCount === 0 && sourceId && (
            <p style={{ fontSize: 12, color: "var(--accent-orange)", fontWeight: 500 }}>
              Source returned no rows. Check Dataverse permissions.
            </p>
          )}
          {!loadingJoin && joinLeftValue && sourceRowCount > 0 && joinedRows.length > 0 && (() => {
            const hasMatch = joinedRows.some((r) => Object.keys(r).some((k) => k.startsWith("right_") && (r[k] ?? "").trim() !== ""));
            return !hasMatch ? (
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                No source rows matched &quot;{joinLeftValue}&quot;.
              </p>
            ) : null;
          })()}
          {previewCols.length > 0 && (
            <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
              <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {previewCols.map((c) => (
                      <th key={c} style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border-light)", whiteSpace: "nowrap" }}>
                        {c.replace(/^(left_|right_)/, "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {joinedRows.map((row, i) => (
                    <tr key={i}>
                      {previewCols.map((c) => (
                        <td key={c} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-light)" }}>
                          {row[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  importCsv,
  previewCsv,
  type ImportResult,
  type CsvPreviewResult,
  type CsvColumnMapping,
} from "@/lib/csv-import";
import { setTableColumnHeaders, appendCampaignIdsToTable } from "@/lib/table-actions";

const TOAST_DURATION_MS = 10_000;

interface CsvImportButtonProps {
  tableId: string;
}

export default function CsvImportButton({ tableId }: CsvImportButtonProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<CsvColumnMapping>({});
  const [isImporting, setIsImporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!importResult) return;
    const t = setTimeout(() => setImportResult(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [importResult]);

  function handleClick() {
    fileRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    const fd = new FormData();
    fd.append("file", file);

    startTransition(async () => {
      const previewResult = await previewCsv(fd);
      setPendingFile(file);
      setPreview(previewResult);
      const headers = previewResult.headers;
      const defaultId =
        headers.find((h) => /id|insertion order id/i.test(h)) ?? headers[0] ?? "";
      setColumnMapping({
        id: defaultId,
        startDate: headers[1] ?? "",
        endDate: headers[2] ?? "",
        impressionsGoal: headers[3] ?? "",
      });
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function closePreview() {
    setPreview(null);
    setPendingFile(null);
    setColumnMapping({});
  }

  function handleConfirmImport() {
    if (!pendingFile) return;

    const fd = new FormData();
    fd.append("file", pendingFile);
    closePreview();
    setIsImporting(true);

    startTransition(async () => {
      try {
        const res = await importCsv(fd, columnMapping);
        setImportResult(res);
        if (res.insertedIds?.length) {
          await appendCampaignIdsToTable(tableId, res.insertedIds);
          if (res.headers?.length) await setTableColumnHeaders(tableId, res.headers);
        }
        router.refresh();
      } finally {
        setIsImporting(false);
      }
    });
  }

  const showPreview = preview !== null && !isPending;
  const hasDateColumns = Boolean(columnMapping.startDate && columnMapping.endDate);
  const canImport = preview != null && preview.rowCount > 0 && hasDateColumns;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleChange}
        disabled={isPending}
      />
      <Button
        variant="secondary"
        onClick={handleClick}
        disabled={isPending || isImporting}
        style={isPending || isImporting ? { cursor: "wait", opacity: 0.8 } : undefined}
      >
        {(isPending || isImporting) && <span className="btn-loader" aria-hidden />}
        {isPending ? "Loading…" : isImporting ? "Importing…" : "Import CSV"}
      </Button>

      {isImporting && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Importing"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1001,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span className="btn-loader" style={{ width: 32, height: 32 }} aria-hidden />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Importing…</span>
        </div>
      )}

      {showPreview && preview && (
        <div
          role="dialog"
          aria-labelledby="csv-preview-title"
          aria-modal="true"
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
            if (e.target === e.currentTarget) closePreview();
          }}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              width: "min(1260px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 48px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 id="csv-preview-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                Import preview
              </h2>
              <button
                type="button"
                onClick={closePreview}
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

            <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
                First row = column names. <strong>{preview.rowCount}</strong> row{preview.rowCount !== 1 ? "s" : ""} will be imported as campaigns.
              </p>

              {preview.headers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Column mapping
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <span style={{ minWidth: 90 }}>Start date</span>
                      <select
                        value={columnMapping.startDate ?? ""}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, startDate: e.target.value }))}
                        style={{
                          padding: "6px 10px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          minWidth: 160,
                        }}
                      >
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <span style={{ minWidth: 90 }}>End date</span>
                      <select
                        value={columnMapping.endDate ?? ""}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, endDate: e.target.value }))}
                        style={{
                          padding: "6px 10px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          minWidth: 160,
                        }}
                      >
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <span style={{ minWidth: 90 }}>ID</span>
                      <select
                        value={columnMapping.id ?? ""}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, id: e.target.value }))}
                        style={{
                          padding: "6px 10px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          minWidth: 160,
                        }}
                      >
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <span style={{ minWidth: 90 }}>Impressions goal</span>
                      <select
                        value={columnMapping.impressionsGoal ?? ""}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, impressionsGoal: e.target.value }))}
                        style={{
                          padding: "6px 10px",
                          fontSize: 13,
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          minWidth: 160,
                        }}
                      >
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {preview.headers.length > 0 ? (
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                    }}
                  >
                    Preview
                  </div>
                  <div
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "auto",
                      maxHeight: "min(60vh, 420px)",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                          {preview.headers.map((h) => {
                            const role =
                              columnMapping.startDate === h
                                ? "Start date"
                                : columnMapping.endDate === h
                                  ? "End date"
                                  : columnMapping.id === h
                                    ? "ID"
                                    : columnMapping.impressionsGoal === h
                                      ? "Impressions goal"
                                      : null;
                            return (
                              <th
                                key={h}
                                style={{
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  position: "sticky",
                                  top: 0,
                                  zIndex: 1,
                                  background: "var(--bg-secondary)",
                                }}
                              >
                                <div>{h}</div>
                                {role && (
                                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginTop: 2 }}>
                                    → {role}
                                  </div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.rowNum} style={{ borderTop: "1px solid var(--border-light)" }}>
                            {preview.headers.map((h) => (
                              <td key={h} style={{ padding: "6px 10px", color: "var(--text-primary)" }}>
                                {row.values[h] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {preview.rowCount === 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
                  No data rows (only headers or empty file).
                </p>
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
              <Button type="button" variant="secondary" onClick={closePreview}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmImport}
                disabled={!canImport}
              >
                Import {preview.rowCount} campaign{preview.rowCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: 16,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-secondary)",
            boxShadow: "var(--shadow-float)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: "min(360px, calc(100vw - 48px))",
            zIndex: 100,
            animation: "design-layout-toast-in 0.25s var(--anim-ease)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
            Imported {importResult.inserted} campaign{importResult.inserted !== 1 ? "s" : ""}.
          </span>
          {importResult.errors.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {importResult.errors.map((err) => (
                <span key={`${String(err).slice(0, 80)}`} style={{ fontSize: 12, color: "#b22822" }}>
                  {err}
                </span>
              ))}
            </div>
          )}
          <Button variant="tertiary" onClick={() => setImportResult(null)}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  );
}

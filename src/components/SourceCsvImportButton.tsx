"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { previewCsv, type CsvPreviewResult } from "@/lib/csv-import";
import { createSourceFromCsv, type CreateSourceFromCsvResult } from "@/lib/csv-source-table";

const TOAST_DURATION_MS = 10_000;

export default function SourceCsvImportButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<CreateSourceFromCsvResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [sourceName, setSourceName] = useState("");
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
      setSourceName(file.name.replace(/\.csv$/i, "").trim() || "import");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function closePreview() {
    setPreview(null);
    setPendingFile(null);
    setSourceName("");
  }

  function handleConfirmImport() {
    if (!pendingFile) return;

    const fd = new FormData();
    fd.append("file", pendingFile);
    closePreview();
    setIsImporting(true);

    startTransition(async () => {
      try {
        const res = await createSourceFromCsv(fd, sourceName.trim() || pendingFile.name.replace(/\.csv$/i, ""));
        setImportResult(res);
        if (res.success && res.sourceId) {
          router.refresh();
          router.push(`/sources/${res.sourceId}`);
        }
      } finally {
        setIsImporting(false);
      }
    });
  }

  const showPreview = preview !== null && !isPending;
  const canImport = preview != null && preview.headers.length > 0 && sourceName.trim().length > 0;

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
          aria-labelledby="source-csv-preview-title"
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
              <h2 id="source-csv-preview-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                Import CSV as new source
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
                A new source will be created with the same columns and rows as the CSV. The source name is taken from the file name; you can edit it below.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                  Source name
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Source name"
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    width: "100%",
                    maxWidth: 320,
                  }}
                />
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
                <strong>{preview.headers.length}</strong> column{preview.headers.length !== 1 ? "s" : ""}, <strong>{preview.rowCount}</strong> row{preview.rowCount !== 1 ? "s" : ""}.
              </p>

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
                          {preview.headers.map((h) => (
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
                              {h}
                            </th>
                          ))}
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

              {preview.rowCount === 0 && preview.headers.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
                  No data rows (only headers). Source will be created with column headers only.
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
                Create source
              </Button>
            </div>
          </div>
        </div>
      )}

      {importResult && !importResult.success && (
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
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Import failed.</span>
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

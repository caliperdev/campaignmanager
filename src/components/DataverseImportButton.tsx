"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  checkDataverseEnabled,
  listDataverseTables,
  importDataverseAsSource,
  type DataverseTableInfo,
  type DataverseImportResult,
} from "@/lib/dataverse-source";

const TOAST_DURATION_MS = 10_000;

function DbIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor", opacity: 0.8 }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

export default function DataverseImportButton() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<DataverseTableInfo[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selected, setSelected] = useState<DataverseTableInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<DataverseImportResult | null>(null);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    checkDataverseEnabled().then(setEnabled);
  }, []);

  useEffect(() => {
    if (!importResult) return;
    const t = setTimeout(() => setImportResult(null), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [importResult]);

  function openModal() {
    setOpen(true);
    setSelected(null);
    setDisplayName("");
    setSearch("");
    setLoadingTables(true);
    setTables([]);
    setTablesError(null);
    startTransition(async () => {
      try {
        const result = await listDataverseTables();
        if ("error" in result) {
          setTablesError(result.error);
          setTables([]);
        } else {
          setTables(result.tables);
          setTablesError(null);
        }
      } finally {
        setLoadingTables(false);
      }
    });
  }

  function closeModal() {
    setOpen(false);
    setSelected(null);
    setDisplayName("");
    setTables([]);
    setTablesError(null);
  }

  function selectTable(table: DataverseTableInfo) {
    setSelected(table);
    setDisplayName(table.displayName || table.logicalName);
  }

  function handleImport() {
    if (!selected) return;
    setImporting(true);
    setImportResult(null);
    startTransition(async () => {
      try {
        const res = await importDataverseAsSource(
          selected.logicalName,
          selected.entitySetName,
          displayName.trim() || selected.displayName || selected.logicalName
        );
        setImportResult(res);
        if (res.success && res.sourceId) {
          closeModal();
          router.refresh();
          router.push(`/sources/${res.sourceId}`);
        }
      } finally {
        setImporting(false);
      }
    });
  }

  const filteredTables = search.trim()
    ? tables.filter(
        (t) =>
          t.logicalName.toLowerCase().includes(search.toLowerCase()) ||
          t.displayName.toLowerCase().includes(search.toLowerCase()) ||
          t.entitySetName.toLowerCase().includes(search.toLowerCase())
      )
    : tables;
  const canImport = selected && (displayName.trim().length > 0 || selected.displayName || selected.logicalName);

  if (enabled === false) return null;

  return (
    <>
      <Button
        variant="secondary"
        onClick={openModal}
        disabled={enabled === null || isPending}
        style={enabled === null || isPending ? { cursor: "wait", opacity: 0.8 } : undefined}
      >
        {enabled === null && <span className="btn-loader" aria-hidden />}
        <DbIcon />
        Connect Dataverse
      </Button>

      {open && (
        <div
          role="dialog"
          aria-labelledby="dataverse-modal-title"
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
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              width: "min(560px, calc(100vw - 32px))",
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
              <h2 id="dataverse-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                Connect Dataverse table
              </h2>
              <button
                type="button"
                onClick={closeModal}
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

            <div style={{ padding: "16px 20px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingTables ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                  <span className="btn-loader" style={{ width: 24, height: 24 }} aria-hidden />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading tables…</span>
                </div>
              ) : tablesError ? (
                <div
                  style={{
                    padding: 16,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#b22822", fontWeight: 500 }}>Could not load Dataverse tables</p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {tablesError}
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search tables…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      width: "100%",
                    }}
                  />
                  <div
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "auto",
                      maxHeight: "min(40vh, 280px)",
                    }}
                  >
                    {filteredTables.length === 0 ? (
                      <p style={{ margin: 12, fontSize: 13, color: "var(--text-tertiary)" }}>
                        {tables.length === 0 ? "No tables found." : "No matching tables."}
                      </p>
                    ) : (
                      filteredTables.map((t) => (
                        <button
                          key={t.logicalName}
                          type="button"
                          onClick={() => selectTable(t)}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "10px 12px",
                            textAlign: "left",
                            background: selected?.logicalName === t.logicalName ? "var(--bg-secondary)" : "transparent",
                            border: "none",
                            borderBottom: "1px solid var(--border-light)",
                            fontSize: 13,
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{t.displayName || t.logicalName}</span>
                          <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>{t.entitySetName}</span>
                        </button>
                      ))
                    )}
                  </div>

                  {selected && (
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                        Source name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
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
                  )}
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
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleImport}
                disabled={!canImport || importing}
              >
                {importing ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {importing && (
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
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Importing from Dataverse…</span>
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
                <span key={String(err).slice(0, 80)} style={{ fontSize: 12, color: "#b22822" }}>
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

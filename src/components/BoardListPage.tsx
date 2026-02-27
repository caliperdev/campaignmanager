"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducer } from "react";
import { addTable, updateTable, deleteTable } from "@/lib/table-actions";
import type { Table, TableSection } from "@/lib/tables";
import CsvImportButton from "@/components/CsvImportButton";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

type CreateState = {
  open: boolean;
  name: string;
  subtitle: string;
  submitting: boolean;
};

function createReducer(
  state: CreateState,
  action:
    | { type: "open" }
    | { type: "close" }
    | { type: "setName"; value: string }
    | { type: "setSubtitle"; value: string }
    | { type: "setSubmitting"; value: boolean },
): CreateState {
  switch (action.type) {
    case "open":
      return { ...state, open: true, name: "", subtitle: "" };
    case "close":
      return { ...state, open: false, submitting: false };
    case "setName":
      return { ...state, name: action.value };
    case "setSubtitle":
      return { ...state, subtitle: action.value };
    case "setSubmitting":
      return { ...state, submitting: action.value };
    default:
      return state;
  }
}

type EditState = {
  tableId: string | null;
  name: string;
  subtitle: string;
};

function editReducer(
  state: EditState,
  action:
    | { type: "start"; table: Table }
    | { type: "setName"; value: string }
    | { type: "setSubtitle"; value: string }
    | { type: "close" },
): EditState {
  switch (action.type) {
    case "start":
      return { tableId: action.table.id, name: action.table.name, subtitle: action.table.subtitle ?? "" };
    case "setName":
      return { ...state, name: action.value };
    case "setSubtitle":
      return { ...state, subtitle: action.value };
    case "close":
      return { tableId: null, name: "", subtitle: "" };
    default:
      return state;
  }
}

export interface BoardListPageProps {
  title: string;
  section: TableSection;
  basePath: string;
  initialTables: Table[];
  userId: string | null;
}

export function BoardListPage({
  title,
  section,
  basePath,
  initialTables,
  userId,
}: BoardListPageProps) {
  const router = useRouter();

  const [create, dispatchCreate] = useReducer(createReducer, {
    open: false,
    name: "",
    subtitle: "",
    submitting: false,
  });

  const [edit, dispatchEdit] = useReducer(editReducer, {
    tableId: null,
    name: "",
    subtitle: "",
  });

  const handleCreate = async () => {
    if (create.submitting) return;
    dispatchCreate({ type: "setSubmitting", value: true });
    const name = create.name.trim() || "Table";
    const subtitle = create.subtitle.trim() || undefined;
    const t = await addTable(userId, name, { subtitle }, section);
    dispatchCreate({ type: "close" });
    if (t) {
      router.refresh();
      router.push(`${basePath}/${t.id}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!edit.tableId) return;
    const ok = await updateTable(edit.tableId, {
      name: edit.name.trim() || "Table",
      subtitle: edit.subtitle.trim() || undefined,
    });
    if (ok) {
      router.refresh();
      dispatchEdit({ type: "close" });
    }
  };

  const handleDelete = async (e: React.MouseEvent, t: Table) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    try {
      const ok = await deleteTable(t.id);
      if (ok) {
        router.refresh();
      } else {
        window.alert("Failed to delete table. Please try again.");
      }
    } catch (err) {
      console.error("Delete table error:", err);
      window.alert("Failed to delete table. Please try again.");
    }
  };

  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
      }}
    >
      <div className="page-header-responsive" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {title}
        </h1>
        {!create.open && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {section === "campaign" && <CsvImportButton />}
            <button
              type="button"
              onClick={() => dispatchCreate({ type: "open" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 500,
                color: "white",
                background: "var(--accent-dark)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              <Icon><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></Icon>
              Add table
            </button>
          </div>
        )}
      </div>

      {create.open && (
        <div
          style={{
            marginBottom: 32,
            padding: 20,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            maxWidth: 480,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            New table
          </div>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
            Tables start empty. Add campaigns manually or import a CSV from the table view.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="table-draft-name" style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
              Title
            </label>
            <input
              id="table-draft-name"
              type="text"
              value={create.name}
              onChange={(e) => dispatchCreate({ type: "setName", value: e.target.value })}
              placeholder="Table name"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="table-draft-subtitle" style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
              Subtitle
            </label>
            <input
              id="table-draft-subtitle"
              type="text"
              value={create.subtitle}
              onChange={(e) => dispatchCreate({ type: "setSubtitle", value: e.target.value })}
              placeholder="Optional"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!create.name.trim() || create.submitting}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                color: "white",
                background: "var(--accent-dark)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: create.submitting ? "wait" : "pointer",
                opacity: create.submitting ? 0.8 : 1,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {create.submitting && <span className="btn-loader" aria-hidden />}
              {create.submitting ? "Creating\u2026" : "Create table"}
            </button>
            <button
              type="button"
              onClick={() => dispatchCreate({ type: "close" })}
              disabled={create.submitting}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                cursor: create.submitting ? "wait" : "pointer",
                opacity: create.submitting ? 0.7 : 1,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {initialTables.length === 0 && !create.open && (
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
            No tables yet. Click &quot;Add table&quot; to create one.
          </p>
        )}
        {initialTables.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 0,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            {edit.tableId === t.id ? (
              <div style={{ flex: 1, padding: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor={`table-edit-name-${t.id}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
                    Title
                  </label>
                  <input
                    id={`table-edit-name-${t.id}`}
                    type="text"
                    value={edit.name}
                    onChange={(e) => dispatchEdit({ type: "setName", value: e.target.value })}
                    placeholder="Table name"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 14,
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor={`table-edit-subtitle-${t.id}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
                    Subtitle
                  </label>
                  <input
                    id={`table-edit-subtitle-${t.id}`}
                    type="text"
                    value={edit.subtitle}
                    onChange={(e) => dispatchEdit({ type: "setSubtitle", value: e.target.value })}
                    placeholder="Optional"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 14,
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!edit.name.trim()}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "white",
                      background: "var(--accent-dark)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatchEdit({ type: "close" })}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      background: "transparent",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={`${basePath}/${t.id}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 20px",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontSize: 15,
                    fontWeight: 500,
                    transition: "background 0.2s",
                  }}
                >
                  <Icon><path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2v2h2v-2H5zm4-8h10v10H9V7zm2 2v6h6V9h-6z" /></Icon>
                  <div style={{ marginLeft: 12, minWidth: 0 }}>
                    <span>{t.name}</span>
                    {t.subtitle && (
                      <div style={{ fontSize: 13, color: "var(--text-tertiary)", fontWeight: 400, marginTop: 2 }}>
                        {t.subtitle}
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => dispatchEdit({ type: "start", table: t })}
                  aria-label={`Edit ${t.name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Icon><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, t)}
                  aria-label={`Delete ${t.name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Icon><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

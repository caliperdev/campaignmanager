"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducer } from "react";
import { updateCampaign, deleteCampaign, updateSource, deleteSource } from "@/lib/table-actions";
import type { Campaign, Source } from "@/db/schema";
import CsvImportButton from "@/components/CsvImportButton";
import SourceCsvImportButton from "@/components/SourceCsvImportButton";
import DataverseImportButton from "@/components/DataverseImportButton";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: "currentColor", opacity: 0.8 }}>
      {children}
    </svg>
  );
}

type EditState = {
  itemId: string | null;
  name: string;
};

type Item = Campaign | Source;

export interface BoardListPageProps {
  title: string;
  section: "campaign" | "sources";
  basePath: string;
  initialItems: Item[];
}

export function BoardListPage({
  title,
  section,
  basePath,
  initialItems,
}: BoardListPageProps) {
  const router = useRouter();
  const [edit, setEdit] = useReducer(
    (s: EditState, a: { type: "start"; item: Item } | { type: "setName"; value: string } | { type: "close" }) =>
      a.type === "start"
        ? { itemId: a.item.id, name: a.item.name }
        : a.type === "setName"
          ? { ...s, name: a.value }
          : { itemId: null, name: "" },
    { itemId: null, name: "" },
  );

  const handleSaveEdit = async () => {
    if (!edit.itemId) return;
    const name = edit.name.trim() || (section === "campaign" ? "Untitled" : "Source");
    const ok = section === "campaign"
      ? await updateCampaign(edit.itemId, { name })
      : await updateSource(edit.itemId, { name });
    if (ok) {
      router.refresh();
      setEdit({ type: "close" });
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const ok = section === "campaign" ? await deleteCampaign(item.id) : await deleteSource(item.id);
      if (ok) router.refresh();
      else window.alert("Failed to delete. Please try again.");
    } catch (err) {
      console.error("Delete error:", err);
      window.alert("Failed to delete. Please try again.");
    }
  };

  const canEditDelete = section === "campaign";

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {section === "campaign" && <CsvImportButton />}
          {section === "sources" && <SourceCsvImportButton />}
          {section === "sources" && <DataverseImportButton />}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {initialItems.length === 0 && (
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
            {section === "campaign" ? "No campaigns yet. Import a CSV to create one." : "No sources yet. Import a CSV to create one."}
          </p>
        )}
        {initialItems.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            {edit.itemId === item.id ? (
              <div style={{ flex: 1, padding: 16 }}>
                <label htmlFor={`edit-name-${item.id}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>
                  Name
                </label>
                <input
                  id={`edit-name-${item.id}`}
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit({ type: "setName", value: e.target.value })}
                  placeholder="Name"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 14,
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    marginBottom: 12,
                  }}
                />
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
                    onClick={() => setEdit({ type: "close" })}
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
                  href={`${basePath}/${item.id}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 20px",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontSize: 15,
                    fontWeight: 500,
                  }}
                >
                  <Icon><path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2v2h2v-2H5zm4-8h10v10H9V7zm2 2v6h6V9h-6z" /></Icon>
                  <span style={{ marginLeft: 12 }}>{item.name}</span>
                </Link>
                {canEditDelete && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEdit({ type: "start", item })}
                      aria-label={`Edit ${item.name}`}
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
                      onClick={(e) => handleDelete(e, item)}
                      aria-label={`Delete ${item.name}`}
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
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

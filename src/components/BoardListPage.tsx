"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";
import { updateOrder, deleteOrder, updateSource, deleteSource } from "@/lib/table-actions";
import { DebouncedSearchInput } from "@/components/DebouncedSearchInput";
import { useConfirm } from "@/components/ConfirmModal";
import { ItemRowActions } from "@/components/ItemRowActions";
import type { Order, Source } from "@/db/schema";
import DataverseImportButton from "@/components/DataverseImportButton";

type EditState = {
  itemId: string | null;
  name: string;
};

type Item = Order | Source;

export interface BoardListPageProps {
  title: string;
  section: "orders" | "sources";
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
  const { showConfirm } = useConfirm();
  const [editError, setEditError] = useState<string | null>(null);
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
    setEditError(null);
    const name = edit.name.trim() || (section === "sources" ? "Source" : "Untitled");
    if (section === "sources") {
      const ok = await updateSource(edit.itemId, { name });
      if (ok) {
        router.refresh();
        setEdit({ type: "close" });
      } else {
        setEditError("Failed to update. Please try again.");
      }
    } else {
      const result = await updateOrder(edit.itemId, { name });
      if (result.success) {
        router.refresh();
        setEdit({ type: "close" });
      } else {
        setEditError(result.error ?? "Failed to update. Please try again.");
      }
    }
  };

  return (
    <main className="main-content">
      <header className="top-bar">
          <button className="section-tab active">All {title}</button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <DebouncedSearchInput placeholder={`Search ${title.toLowerCase()}…`} />
            {section === "orders" && (
              <Link
                href="/orders/new"
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background: "var(--accent-mint)",
                  border: "none",
                  borderRadius: "var(--radius-s)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                New order
              </Link>
            )}
            {section === "sources" && <DataverseImportButton />}
          </div>
      </header>

      <div className="campaign-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-s)" }}>
        {initialItems.length === 0 && (
          <p style={{ color: "var(--text-tertiary-new)", fontSize: 14 }}>
            {section === "sources" ? "No sources yet. Connect Dataverse or add one to get started." : "No orders yet. Create a new order to get started."}
          </p>
        )}
        {initialItems.length > 0 && (
          <p style={{ margin: "16px 0 8px", fontSize: 13, color: "var(--text-secondary)" }}>
            {title} ({initialItems.length})
          </p>
        )}
        {initialItems.map((item) => (
          edit.itemId === item.id ? (
            <div key={item.id} className="campaign-row campaign-row--orders" style={{ display: "block" }}>
              <div style={{ padding: "var(--space-m) 0" }}>
                {editError && (
                  <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(220, 53, 69, 0.1)", border: "1px solid rgba(220, 53, 69, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--text-primary-new)", fontSize: 13 }}>
                    {editError}
                  </div>
                )}
                <label htmlFor={`edit-name-${item.id}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary-new)", textTransform: "uppercase", marginBottom: 4 }}>
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
                    border: "1px solid #E5E7EB",
                    borderRadius: "var(--radius-s)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary-new)",
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
                      background: "var(--accent-mint)",
                      border: "none",
                      borderRadius: "var(--radius-s)",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEdit({ type: "close" }); setEditError(null); }}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary-new)",
                      background: "transparent",
                      border: "1px solid #E5E7EB",
                      borderRadius: "var(--radius-s)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={item.id} className="campaign-row campaign-row--orders">
              <Link
                href={`${basePath}/${item.id}`}
                className="campaign-row--orders-link"
                style={{
                  gridColumn: "1 / span 6",
                  display: "grid",
                  gridTemplateColumns: "subgrid",
                  alignItems: "center",
                  textDecoration: "none",
                  color: "inherit",
                  minWidth: 0,
                }}
              >
                <div className="status-dot" />
                <div className="row-meta">
                  <div className="row-primary-text">{item.name}</div>
                  <div className="row-sub-text">{section === "sources" ? "Source" : "Programmatic • Display"}</div>
                </div>
                <div className="row-meta" />
                <div className="row-meta" />
                <div className="row-meta" />
                <div className="row-meta" />
              </Link>
              <div style={{ gridColumn: "7", display: "flex", justifyContent: "flex-end" }}>
                <ItemRowActions
                    editHref={`${basePath}/${item.id}`}
                    onEdit={() => { setEditError(null); setEdit({ type: "start", item }); }}
                    onDelete={async () => {
                      const ok = await showConfirm({ message: `Delete "${item.name}"? This cannot be undone.`, variant: "danger", confirmLabel: "Delete" });
                      if (!ok) return;
                      const done = section === "sources" ? await deleteSource(item.id) : await deleteOrder(item.id);
                      if (done) router.refresh();
                      else window.alert("Failed to delete. Please try again.");
                    }}
                    itemName={item.name}
                    skipConfirm
                  />
                </div>
            </div>
          )
        ))}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ConfirmModal";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "currentColor" }}>
      {children}
    </svg>
  );
}

type Props = {
  editHref: string;
  onDelete: () => Promise<void>;
  /** When provided, Edit opens in-place (e.g. modal) instead of navigating to editHref */
  onEdit?: () => void;
  deleteConfirmMessage?: string;
  itemName?: string;
  /** When true, onDelete handles its own confirmation (e.g. double confirm for agencies). */
  skipConfirm?: boolean;
};

export function ItemRowActions({
  editHref,
  onDelete,
  onEdit,
  deleteConfirmMessage,
  itemName = "this item",
  skipConfirm = false,
}: Props) {
  const { showConfirm } = useConfirm();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!skipConfirm) {
      const msg = deleteConfirmMessage ?? `Delete "${itemName}"? This cannot be undone.`;
      const ok = await showConfirm({ message: msg, variant: "danger", confirmLabel: "Delete" });
      if (!ok) return;
    }
    await onDelete();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <div className="control-group" onClick={(e) => e.preventDefault()}>
      {onEdit ? (
        <button
          type="button"
          onClick={handleEditClick}
          className="icon-btn"
          aria-label={`Edit ${itemName}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--bg-control)",
            color: "var(--text-primary-new)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon>
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </Icon>
        </button>
      ) : (
        <Link
          href={editHref}
          className="icon-btn"
          aria-label={`Edit ${itemName}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--bg-control)",
            color: "var(--text-primary-new)",
            textDecoration: "none",
          }}
        >
          <Icon>
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </Icon>
        </Link>
      )}
      <button
        type="button"
        onClick={handleDelete}
        className="icon-btn"
        aria-label={`Delete ${itemName}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--bg-control)",
          color: "var(--text-primary-new)",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Icon>
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </Icon>
      </button>
    </div>
  );
}

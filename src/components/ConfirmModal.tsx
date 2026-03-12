"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<{
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
} | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const showConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        ...options,
        open: true,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  useEffect(() => {
    if (!state?.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state?.open, handleCancel]);

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      {state?.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
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
          onClick={handleCancel}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
              maxWidth: 420,
              width: "100%",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirm-title"
              style={{
                margin: "0 0 12px",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {state.title ?? "Confirm"}
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {state.message}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "var(--bg-control)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "white",
                  background: state.variant === "danger" ? "#dc2626" : "var(--accent-mint)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                {state.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

"use client";

import { createContext, useContext, type ReactNode } from "react";

interface ToolbarContextValue {
  variant?: "default";
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

function useToolbar() {
  const ctx = useContext(ToolbarContext);
  return ctx ?? { variant: "default" as const };
}

export interface ToolbarRootProps {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function ToolbarRoot({ children, style, className }: ToolbarRootProps) {
  return (
    <ToolbarContext.Provider value={{ variant: "default" }}>
      <div
        style={{
          height: "52px",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          borderBottom: "1px solid var(--border-light)",
          gap: "16px",
          ...style,
        }}
        className={className}
      >
        {children}
      </div>
    </ToolbarContext.Provider>
  );
}

export interface ToolbarButtonProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}

export function ToolbarButton({ icon, children, onClick }: ToolbarButtonProps) {
  useToolbar();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        color: "var(--text-secondary)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        transition: "color 0.2s",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  useToolbar();
  return (
    <div
      style={{
        height: "16px",
        width: "1px",
        background: "var(--border-light)",
      }}
    />
  );
}

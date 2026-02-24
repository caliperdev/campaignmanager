"use client";

import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

export function Input({ id, label, error, style, className, ...props }: InputProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }} className={className}>
      <label
        htmlFor={id}
        style={{
          fontSize: "13px",
          fontWeight: 500,
          color: error ? "#b22822" : "var(--text-secondary)",
        }}
      >
        {label}
      </label>
      <input
        id={id}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: "14px",
          border: `1px solid ${error ? "#b22822" : "var(--border-light)"}`,
          borderRadius: "var(--radius-md)",
          color: "var(--text-primary)",
          backgroundColor: "var(--bg-primary)",
          transition: "border-color 0.2s var(--anim-ease)",
          ...style,
        }}
        {...props}
      />
      {error && (
        <span style={{ fontSize: "12px", color: "#b22822" }}>{error}</span>
      )}
    </div>
  );
}

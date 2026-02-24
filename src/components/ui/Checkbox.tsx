"use client";

import type { InputHTMLAttributes } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
}

export function Checkbox({ checked, onChange, id, style, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      style={{
        width: "16px",
        height: "16px",
        border: "1px solid #ccc",
        borderRadius: "3px",
        cursor: "pointer",
        accentColor: "var(--accent-dark)",
        ...style,
      }}
      {...props}
    />
  );
}

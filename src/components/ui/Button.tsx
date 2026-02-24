"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
  prefixIcon?: React.ReactNode;
  href?: string;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--accent-dark)",
    color: "white",
    border: "none",
  },
  secondary: {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-light)",
  },
  tertiary: {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    border: "none",
  },
  danger: {
    backgroundColor: "transparent",
    color: "#b22822",
    border: "1px solid rgba(178, 40, 34, 0.5)",
  },
};

export function Button({
  variant = "primary",
  children,
  prefixIcon,
  href,
  style,
  className,
  ...props
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "10px 18px",
    borderRadius: "var(--radius-md)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s var(--anim-ease), color 0.2s var(--anim-ease)",
    ...variantStyles[variant],
    ...style,
  };

  if (href) {
    return (
      <a
        href={href}
        className={className}
        style={baseStyle}
        onClick={(e) => props.onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)}
      >
        {prefixIcon}
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={className} style={baseStyle} {...props}>
      {prefixIcon}
      {children}
    </button>
  );
}

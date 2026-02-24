"use client";

export interface ProgressBarProps {
  percentage: number;
  width?: string;
}

export function ProgressBar({ percentage, width = "80%" }: ProgressBarProps) {
  return (
    <div
      style={{
        height: "4px",
        background: "#EEE",
        borderRadius: "2px",
        width,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          background: "var(--accent-dark)",
          borderRadius: "2px",
          width: `${Math.min(100, Math.max(0, percentage))}%`,
        }}
      />
    </div>
  );
}

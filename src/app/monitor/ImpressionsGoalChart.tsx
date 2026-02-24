"use client";

import { useEffect, useState } from "react";
import { BarChart, ChartsReferenceLine } from "@mui/x-charts";

const Y_REFERENCE_VALUES = [0, 50, 100];
const Y_MAX = 100;
const dottedLineStyle = { strokeDasharray: "5 5" };

type Row = { yearMonth: string; sumImpressions: number };

export default function ImpressionsGoalChart({ rows }: { rows: Row[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rawValues = rows.map((r) => r.sumImpressions);
  const dataMax = Math.max(...rawValues, 1);
  const scaledData = rawValues.map((v) => (v / dataMax) * Y_MAX);
  const xData = rows.length > 0 ? rows.map((r) => r.yearMonth) : [""];

  if (!mounted) {
    return (
      <div
        style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}
        aria-hidden
      >
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Loading chart…</span>
      </div>
    );
  }

  return (
    <BarChart
      colors={["#E1C233"]}
      xAxis={[{ scaleType: "band", data: xData }]}
      yAxis={[
        {
          min: 0,
          max: Y_MAX,
          tickInterval: Y_REFERENCE_VALUES,
          valueFormatter: (v: number) => (v === 0 ? "0" : `${v}M`),
        },
      ]}
      series={[
        {
          data: rows.length > 0 ? scaledData : [0],
          label: "Sum of daily impressions",
          valueFormatter: (value, context) =>
            rows.length > 0
              ? rawValues[(context as { dataIndex?: number })?.dataIndex ?? 0]?.toLocaleString("en-US") ?? String(value)
              : "No data",
        },
      ]}
      height={300}
    >
      {Y_REFERENCE_VALUES.map((y) => (
        <ChartsReferenceLine key={y} y={y} lineStyle={dottedLineStyle} />
      ))}
    </BarChart>
  );
}

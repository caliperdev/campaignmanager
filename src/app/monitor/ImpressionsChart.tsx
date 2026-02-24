"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { BarChart } from "@mui/x-charts";

const margin = { right: 24 };
const GOLD = "#E1C233";
const PURPLE = "#6B007B";
const PURPLE_LIGHT = "#8B2B9B";
const PURPLE_DARK = "#4A0055";
const BLACK = "var(--text-primary)";

export type MonitorChartRow = {
  yearMonth: string;
  sumImpressions: number;
  dataImpressions: number;
  mediaCost?: number;
  mediaFees?: number;
  celtraCost?: number;
  totalCost?: number;
  bookedRevenue?: number;
};

export type ChartMeasureGroup = "impressions" | "costs" | "margin";

export default function ImpressionsChart({
  rows,
  measureGroup = "impressions",
}: {
  rows: MonitorChartRow[];
  measureGroup?: ChartMeasureGroup;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const xLabels = rows.length > 0 ? rows.map((r) => r.yearMonth) : [""];

  const marginPctData =
    rows.length > 0
      ? rows.map((r) => {
          const rev = r.bookedRevenue ?? 0;
          const cost = r.totalCost ?? 0;
          return rev > 0 ? (100 * (rev - cost)) / rev : (cost > 0 ? -100 : 0);
        })
      : [0];

  const series =
    measureGroup === "impressions"
      ? [
          {
            data: rows.length > 0 ? rows.map((r) => r.sumImpressions) : [0],
            label: "Booked Impressions",
            valueFormatter: (v: unknown) =>
              typeof v === "number" ? v.toLocaleString("en-US") : String(v),
          },
          {
            data: rows.length > 0 ? rows.map((r) => r.dataImpressions) : [0],
            label: "Delivered Impressions",
            valueFormatter: (v: unknown) =>
              typeof v === "number" ? v.toLocaleString("en-US") : String(v),
          },
        ]
      : measureGroup === "costs"
        ? [
            {
              data: rows.length > 0 ? rows.map((r) => r.mediaCost ?? 0) : [0],
              label: "Media Cost",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
            },
            {
              data: rows.length > 0 ? rows.map((r) => r.mediaFees ?? 0) : [0],
              label: "Media Fees",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
            },
            {
              data: rows.length > 0 ? rows.map((r) => r.celtraCost ?? 0) : [0],
              label: "Celtra Cost",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
            },
            {
              data: rows.length > 0 ? rows.map((r) => r.totalCost ?? 0) : [0],
              label: "Total Cost",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
            },
          ]
        : [
            {
              data: rows.length > 0 ? rows.map((r) => r.bookedRevenue ?? 0) : [0],
              label: "Booked Revenue",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
            },
            {
              data:
                rows.length > 0
                  ? rows.map((r) => (r.bookedRevenue ?? 0) - (r.totalCost ?? 0))
                  : [0],
              label: "Booked Revenue vs Total Cost",
              valueFormatter: (v: unknown) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : String(v),
              barLabel: (item: { seriesId: string | number; dataIndex: number }) =>
                marginPctData[item.dataIndex] != null
                  ? `${marginPctData[item.dataIndex].toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                  : null,
              barLabelPlacement: "outside" as const,
              colorGetter: (data: { value: number | null }) =>
                (data.value ?? 0) < 0 ? "#dc2626" : "#16a34a",
            },
          ];

  const colors =
    measureGroup === "impressions"
      ? [GOLD, PURPLE]
      : measureGroup === "costs"
        ? [PURPLE, PURPLE_LIGHT, PURPLE_DARK, "#4A0055"]
        : [GOLD, BLACK];

  if (!mounted) {
    return (
      <div
        style={{
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
        }}
        aria-hidden
      >
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Loading chart…</span>
      </div>
    );
  }

  return (
    <Box sx={{ width: "100%", height: 260 }}>
      <BarChart
        colors={colors}
        series={series}
        xAxis={[{ scaleType: "band", data: xLabels, height: 28 }]}
        margin={margin}
        height={260}
      />
    </Box>
  );
}

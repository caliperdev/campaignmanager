"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { LineChart, lineElementClasses, areaElementClasses } from "@mui/x-charts/LineChart";

const margin = { right: 24 };
const DATA_SERIES_COLOR = "#5B8DEE";

type Row = { yearMonth: string; dataImpressions: number };

export default function DataImpressionsChart({ rows }: { rows: Row[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data = rows.map((r) => r.dataImpressions);
  const xLabels = rows.length > 0 ? rows.map((r) => r.yearMonth) : [""];

  if (!mounted) {
    return (
      <div
        style={{
          height: 300,
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
    <Box sx={{ width: "100%", height: 300 }}>
      <LineChart
        colors={[DATA_SERIES_COLOR]}
        series={[
          {
            data: data.length > 0 ? data : [0],
            label: "Data impressions",
            area: true,
            showMark: false,
            valueFormatter: (value) => (typeof value === "number" ? value.toLocaleString("en-US") : String(value)),
          },
        ]}
        xAxis={[{ scaleType: "point", data: xLabels, height: 28 }]}
        sx={{
          // Hide the line so only the area is visible
          [`& .${lineElementClasses.root}`]: {
            display: "none",
          },
          // Full solid area fill: remove default brightness filter and use solid color
          [`& .${areaElementClasses.root}`]: {
            filter: "none",
            fill: DATA_SERIES_COLOR,
          },
        }}
        margin={margin}
        height={300}
      />
    </Box>
  );
}

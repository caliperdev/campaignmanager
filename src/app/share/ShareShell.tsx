"use client";

import { useEffect, useState } from "react";
import type { MonitorDataPayload } from "@/lib/monitor-data";
import MonitorContent from "@/app/monitor/MonitorContent";

const MIN_DESKTOP_WIDTH = 1024;

type Props = {
  initialData: MonitorDataPayload;
};

export default function ShareShell({ initialData }: Props) {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isDesktop) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          background: "var(--bg-primary)",
          textAlign: "center",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          style={{ width: 48, height: 48, fill: "var(--text-tertiary)", marginBottom: 20 }}
        >
          <path d="M21 2H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h7v2H7v2h10v-2h-3v-2h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm-1 13H4V4h16v11z" />
        </svg>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          View on Desktop only
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          This view is designed for desktop screens. Please open it on a device with a wider display.
        </p>
      </div>
    );
  }

  return (
    <MonitorContent
      initialData={initialData}
      ct={null}
      dt={null}
      campaignTables={[]}
      dataTables={[]}
      dimensionOptions={[]}
      readOnly
      forceGlobal
    />
  );
}

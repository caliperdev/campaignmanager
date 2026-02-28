"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui";
import { refreshMonitorData } from "@/lib/data-query";

type RefreshState =
  | { phase: "idle" }
  | { phase: "running"; message: string; percent: number }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

type Props = {
  campaignId?: string;
  sourceId?: string;
  onRefreshCached?: () => Promise<void>;
};

export default function RefreshMonitorButton({ campaignId, sourceId, onRefreshCached }: Props) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>({ phase: "idle" });

  const handleRefresh = useCallback(async () => {
    if (state.phase === "running") return;

    if (campaignId && sourceId && onRefreshCached) {
      setState({ phase: "running", message: "Re-computing from campaign + source…", percent: 0 });
      try {
        const res = await fetch(
          `/api/monitor-refresh-cache?ct=${encodeURIComponent(campaignId)}&dt=${encodeURIComponent(sourceId)}`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        setState({ phase: "done", message: "Cache refreshed." });
        await onRefreshCached();
        router.refresh();
      } catch (err) {
        setState({ phase: "error", message: err instanceof Error ? err.message : "Refresh failed." });
      }
      setTimeout(() => setState({ phase: "idle" }), 4000);
      return;
    }

    setState({ phase: "running", message: "Starting…", percent: 0 });
    const url = sourceId
      ? `/api/monitor-refresh?dt=${encodeURIComponent(sourceId)}`
      : "/api/monitor-refresh";
    const evtSource = new EventSource(url);

    evtSource.addEventListener("status", (e) => {
      const d = JSON.parse(e.data);
      setState({ phase: "running", message: d.message, percent: 0 });
    });

    evtSource.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setState({
        phase: "running",
        message: `Batch ${d.batch}/${d.batches} — ${d.processed.toLocaleString()}/${d.total.toLocaleString()} rows`,
        percent: d.percent,
      });
    });

    evtSource.addEventListener("done", async (e) => {
      evtSource.close();
      const d = JSON.parse(e.data);
      setState({ phase: "done", message: d.message });
      await refreshMonitorData();
      router.refresh();
      setTimeout(() => setState({ phase: "idle" }), 4000);
    });

    evtSource.addEventListener("error", (e) => {
      evtSource.close();
      if (e instanceof MessageEvent) {
        const d = JSON.parse(e.data);
        setState({ phase: "error", message: d.message });
      } else {
        setState({ phase: "error", message: "Connection lost." });
      }
      setTimeout(() => setState({ phase: "idle" }), 5000);
    });

    evtSource.onerror = () => {
      evtSource.close();
      setState((prev) => {
        if (prev.phase === "running") {
          setTimeout(() => setState({ phase: "idle" }), 5000);
          return { phase: "error" as const, message: "Connection lost." };
        }
        return prev;
      });
    };
  }, [router, campaignId, sourceId, onRefreshCached]);

  const isRunning = state.phase === "running";
  const showBar = state.phase === "running" || state.phase === "done" || state.phase === "error";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <Button
        variant="secondary"
        onClick={handleRefresh}
        disabled={isRunning}
        style={isRunning ? { cursor: "wait", opacity: 0.8 } : undefined}
        title="Re-aggregate source impressions from all Sources (batched, cached)"
      >
        {isRunning && <span className="btn-loader" aria-hidden />}
        {isRunning ? "Refreshing…" : "Refresh source impressions"}
      </Button>

      {showBar && (
        <div
          style={{
            width: "min(360px, 60vw)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ marginBottom: 6, lineHeight: 1.4 }}>
            {state.phase === "running" && state.message}
            {state.phase === "done" && (
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{state.message}</span>
            )}
            {state.phase === "error" && (
              <span style={{ color: "#b22822", fontWeight: 500 }}>{state.message}</span>
            )}
          </div>
          {state.phase === "running" && (
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--border-light)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${state.percent}%`,
                  background: "#E1C233",
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

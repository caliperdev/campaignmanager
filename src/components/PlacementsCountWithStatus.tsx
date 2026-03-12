"use client";

import { getStatusDotClass } from "@/lib/placement-status";

export type PlacementCountsByStatus = { liveCount: number; upcomingCount: number; endedCount: number };

export function PlacementsCountWithStatus({
  total,
  counts,
  totalClassName = "row-primary-text",
}: {
  total: number;
  counts?: PlacementCountsByStatus | null;
  totalClassName?: string;
}) {
  if (!counts || (counts.liveCount === 0 && counts.upcomingCount === 0 && counts.endedCount === 0)) {
    return <div className={totalClassName}>{total}</div>;
  }
  const { liveCount, upcomingCount, endedCount } = counts;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div className={totalClassName}>{total}</div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
        <span title="Live" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <span className={getStatusDotClass("Live")} style={{ width: 6, height: 6, flexShrink: 0 }} />
          {liveCount}
        </span>
        <span title="Upcoming" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <span className={getStatusDotClass("Upcoming")} style={{ width: 6, height: 6, flexShrink: 0 }} />
          {upcomingCount}
        </span>
        <span title="Ended" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <span className={getStatusDotClass("Ended")} style={{ width: 6, height: 6, flexShrink: 0 }} />
          {endedCount}
        </span>
      </span>
    </div>
  );
}

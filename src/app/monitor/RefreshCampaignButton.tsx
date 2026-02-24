"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

type Props = {
  /** When provided, uses cached monitor-data API instead of full RSC refresh. */
  onRefreshCached?: () => Promise<void>;
};

/** Light refresh: re-fetches campaign columns from cached server data (no heavy batches). */
export default function RefreshCampaignButton({ onRefreshCached }: Props) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [isFetchPending, setIsFetchPending] = useState(false);
  const isPending = isTransitionPending || isFetchPending;

  async function handleRefresh() {
    if (onRefreshCached) {
      setIsFetchPending(true);
      try {
        await onRefreshCached();
      } finally {
        setIsFetchPending(false);
      }
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button
      variant="secondary"
      onClick={handleRefresh}
      disabled={isPending}
      style={isPending ? { cursor: "wait", opacity: 0.8 } : undefined}
      title="Reload campaign columns from cache (Sum of daily impressions, Campaigns active)"
    >
      {isPending && <span className="btn-loader" aria-hidden />}
      {isPending ? "Refreshing…" : "Refresh campaign"}
    </Button>
  );
}

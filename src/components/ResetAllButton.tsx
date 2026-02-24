"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { resetTable } from "@/lib/table-actions";

interface ResetAllButtonProps {
  /** Delete only this table's campaigns and clear column names for this view. Does not affect other tables. */
  tableId: string;
}

export default function ResetAllButton({ tableId }: ResetAllButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Delete all rows and column names in this table? This cannot be undone.")) return;
    startTransition(async () => {
      await resetTable(tableId);
      router.refresh();
    });
  }

  return (
    <Button variant="danger" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting…" : "Delete all"}
    </Button>
  );
}

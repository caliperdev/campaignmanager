"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteTable } from "@/lib/table-actions";

interface ResetAllButtonProps {
  tableId: string;
  /** Where to redirect after the table is deleted (e.g. "/campaigns" or "/data"). */
  returnToBase?: string;
}

export default function ResetAllButton({ tableId, returnToBase = "/campaigns" }: ResetAllButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Delete this table? This cannot be undone.")) return;
    startTransition(async () => {
      const ok = await deleteTable(tableId);
      if (ok) router.push(returnToBase);
      else router.refresh();
    });
  }

  return (
    <Button variant="danger" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting…" : "Delete all"}
    </Button>
  );
}

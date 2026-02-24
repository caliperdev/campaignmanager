import { NextResponse } from "next/server";
import { isReadOnlyMonitorUser } from "@/lib/read-only-guard";
import { supabase } from "@/db";

/**
 * Monitor-only: re-aggregate data for the Monitor page. Does not affect core architecture.
 * Uses DB RPC so only aggregated numbers are returned; streams status + done for the client.
 */
export async function GET(request: Request) {
  if (await isReadOnlyMonitorUser()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dt = searchParams.get("dt") ?? undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send("status", { message: "Aggregating impressions by month…" });

        const { data, error } = await supabase.rpc("get_data_impressions_by_year_month", {
          p_table_id: dt ?? null,
        });

        if (error) {
          send("error", { message: error.message });
          controller.close();
          return;
        }

        const rows = (data ?? []).map((row: { year_month: string; sum_impressions: number }) => ({
          yearMonth: row.year_month,
          sumImpressions: Number(row.sum_impressions),
        }));

        send("progress", {
          batch: 1,
          batches: 1,
          processed: 1,
          total: 1,
          percent: 100,
        });
        send("done", {
          message: `Done. Aggregated into ${rows.length} month${rows.length !== 1 ? "s" : ""}.`,
          rows,
        });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

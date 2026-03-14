import { NextResponse } from "next/server";
import { getPlacementsWithIoDsp } from "@/lib/dashboard-placements-dsp";
import { getSourceByType, getSourceDataFilteredByIos } from "@/app/test-link/actions";

/**
 * Diagnostic endpoint: traces the exact computation flow of computePlacementsWithDspAggregated
 * Returns intermediate values at each step so we can see where DSP data is lost.
 * 
 * GET /api/dashboard-dsp-trace?io=&advertiser=&placement=
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ioFilter = searchParams.get("io") ?? undefined;
  const advertiserFilter = searchParams.get("advertiser") ?? undefined;
  const placementIdFilter = searchParams.get("placement") ?? undefined;

  const trace: Record<string, unknown> & { steps?: unknown[] } = {
    params: { ioFilter, advertiserFilter, placementIdFilter },
    steps: [] as unknown[],
  };

  try {
    // Step 1: Fetch placements
    const ioKey = ioFilter?.trim() ?? "";
    const advKey = advertiserFilter?.trim() ?? "";
    const placementKey = placementIdFilter?.trim() ?? undefined;

    let placements = await getPlacementsWithIoDsp(ioKey || undefined, advKey || undefined, placementKey);
    if (placements.length === 0) {
      // Note: we skip the fallback to getPlacementsByPlacementId since it's not exported;
      // the main dashboard also only calls this when placementIdFilter is used
    }

    trace.steps?.push({
      step: "1-fetch-placements",
      placementCount: placements.length,
      samples: placements.slice(0, 2).map((p) => ({
        placement_id: (p as Record<string, unknown>).placement_id,
        insertion_order_id_dsp: (p as Record<string, unknown>).insertion_order_id_dsp,
      })),
    });

    if (placements.length === 0) {
      trace.steps?.push({ step: "early-return", reason: "No placements found" });
      return NextResponse.json(trace);
    }

    // Step 2: Build ioIds set
    function placementGroupKey(p: Record<string, unknown>): string {
      const io = String(p.insertion_order_id_dsp ?? "").trim();
      if (io) return io;
      const pid = String(p.placement_id ?? "").trim();
      return pid ? `_p:${pid}` : "";
    }

    const ioIds = new Set<string>();
    const realIos = new Set<string>();
    for (const p of placements) {
      const key = placementGroupKey(p);
      if (key) {
        ioIds.add(key);
        if (!key.startsWith("_p:")) {
          realIos.add(key);
        }
      }
    }

    trace.steps?.push({
      step: "2-build-ioIds",
      totalIds: ioIds.size,
      realIos: realIos.size,
      placeholderIds: ioIds.size - realIos.size,
      sampleIoIds: Array.from(ioIds).slice(0, 5),
    });

    // Step 3: Get DSP source
    const dspSource = await getSourceByType("DSP");
    trace.steps?.push({
      step: "3-get-dsp-source",
      sourceFound: !!dspSource,
      sourceId: dspSource?.id ?? null,
      sourceName: dspSource?.name ?? null,
      entitySetName: dspSource?.entitySetName ?? null,
    });

    if (!dspSource?.id) {
      trace.steps?.push({ step: "early-return", reason: "DSP source not found" });
      return NextResponse.json(trace);
    }

    // Step 4: Fetch DSP data - try with real IOs only first
    let sourceData = null;
    let sourceDataError: string | null = null;

    try {
      if (realIos.size > 0) {
        sourceData = await getSourceDataFilteredByIos(dspSource.id, "cr4fe_insertionordergid", Array.from(realIos));
      }
    } catch (err) {
      sourceDataError = err instanceof Error ? err.message : String(err);
    }

    trace.steps?.push({
      step: "4-fetch-dsp-data",
      rowsReturned: sourceData?.rows.length ?? 0,
      columnsCount: sourceData?.columns.length ?? 0,
      allColumns: sourceData?.columns ?? [],
      error: sourceDataError,
    });

    if (!sourceData || sourceData.rows.length === 0) {
      trace.steps?.push({ step: "early-return", reason: "No DSP data returned" });
      return NextResponse.json(trace);
    }

    // Step 5: Find columns
    const DATE_COLUMNS = ["cr4fe_date", "cr4fe_reportdate", "report_date", "reportdate", "ReportDate", "date"];
    const IMPRESSIONS_COLUMNS = [
      "cr4fe_impressions",
      "cr4fe_impressioncount",
      "impressions",
      "impression_count",
      "impressioncount",
      "delivered_impressions",
    ];
    const MEDIA_COST_COLUMNS = ["cr4fe_totalmediacost", "total_media_cost", "totalmediacost", "media_cost", "mediacost"];
    const IO_SOURCE_COLUMNS = ["cr4fe_insertionordergid", "insertion order gid", "cr4fe_insertionorderid", "insertion_order_gid", "InsertionOrderGID"];

    function findColumn(row: Record<string, unknown>, candidates: string[]): string | null {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const cNorm = c.toLowerCase().replace(/\s/g, "_");
        const found = keys.find(
          (k) => k.toLowerCase().replace(/\s/g, "_") === cNorm || k.toLowerCase().includes(cNorm) || cNorm.includes(k.toLowerCase().replace(/\s/g, "_"))
        );
        if (found) return found;
      }
      return null;
    }

    const dateCol = findColumn(sourceData.rows[0] as Record<string, unknown>, DATE_COLUMNS);
    const imprCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IMPRESSIONS_COLUMNS);
    const mediaCostCol = findColumn(sourceData.rows[0] as Record<string, unknown>, MEDIA_COST_COLUMNS);
    const ioCol = findColumn(sourceData.rows[0] as Record<string, unknown>, IO_SOURCE_COLUMNS);

    trace.steps?.push({
      step: "5-find-columns",
      dateCol,
      imprCol,
      mediaCostCol,
      ioCol,
      allColumnsFound: !!(dateCol && imprCol && mediaCostCol && ioCol),
    });

    if (!dateCol || !imprCol || !mediaCostCol || !ioCol) {
      trace.steps?.push({ step: "early-return", reason: "Required columns not found" });
      return NextResponse.json(trace);
    }

    // Step 6: Match and aggregate rows
    function getVal(row: Record<string, unknown>, col: string): string {
      const key = Object.keys(row).find((k) => k === col) ?? Object.keys(row).find((k) => k.toLowerCase() === col.toLowerCase());
      const v = key != null ? row[key] : undefined;
      return v !== undefined && v !== null ? String(v) : "";
    }

    let matchedRows = 0;
    let unmatchedRows = 0;
    const ioMatches = new Map<string, number>();

    for (const row of sourceData.rows) {
      const r = row as Record<string, unknown>;
      const io = getVal(r, ioCol).trim();
      if (!io || !ioIds.has(io)) {
        unmatchedRows++;
        continue;
      }
      matchedRows++;
      ioMatches.set(io, (ioMatches.get(io) ?? 0) + 1);
    }

    trace.steps?.push({
      step: "6-row-matching",
      totalDspRows: sourceData.rows.length,
      matchedRows,
      unmatchedRows,
      iosWithMatches: ioMatches.size,
      sampleMatches: Array.from(ioMatches.entries())
        .slice(0, 5)
        .map(([io, count]) => ({ io, rowCount: count })),
    });

    trace.summary = {
      success: matchedRows > 0,
      placementsCount: placements.length,
      ioIdsToQuery: realIos.size,
      dspRowsReturned: sourceData.rows.length,
      dspRowsMatched: matchedRows,
      iosWithData: ioMatches.size,
    };

    return NextResponse.json(trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    trace.error = message;
    trace.stack = err instanceof Error ? err.stack : null;
    return NextResponse.json(trace, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSourceByType } from "@/app/test-link/actions";
import { getPlacementsWithIoDsp, getInsertionOrderIdsForPlacement } from "@/lib/dashboard-placements-dsp";
import { fetchDataverseTableFiltered } from "@/lib/dataverse-source";

/** GET ?placement=P3BL8RQ&advertiser=id – debug dashboard DSP flow.
 * Returns: placements, ioIds, dspSource config, sample DSP row count per IO. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  const advertiser = searchParams.get("advertiser");

  const ioFilter = undefined; // no io when placement is set (matches dashboard fix)
  const placements = await getPlacementsWithIoDsp(ioFilter, advertiser || undefined, placement || undefined);

  const ioIds = new Set<string>();
  for (const p of placements) {
    const io = String(p.insertion_order_id_dsp ?? "").trim();
    if (io) ioIds.add(io);
  }

  const dspSource = await getSourceByType("DSP");
  const ioDetails: { io: string; rowCount: number; sampleColumns?: string[] }[] = [];

  if (dspSource?.id && dspSource.entitySetName && dspSource.logicalName) {
    for (const io of Array.from(ioIds).slice(0, 5)) {
      try {
        const result = await fetchDataverseTableFiltered(
          dspSource.entitySetName,
          dspSource.logicalName,
          "cr4fe_insertionordergid",
          io
        );
        const sampleCols = result.rows[0] ? Object.keys(result.rows[0]).filter((k) => k !== "id") : undefined;
        ioDetails.push({ io, rowCount: result.total, sampleColumns: sampleCols });
      } catch (err) {
        ioDetails.push({ io, rowCount: -1, sampleColumns: [String(err)] });
      }
    }
  }

  const placementIoIds =
    placement && advertiser
      ? await getInsertionOrderIdsForPlacement(placement, advertiser)
      : placement
        ? await getInsertionOrderIdsForPlacement(placement, undefined)
        : [];

  return NextResponse.json({
    placement,
    advertiser,
    placementCount: placements.length,
    ioIdsFromPlacements: Array.from(ioIds),
    placementIoIdsFromApi: placementIoIds,
    dspSource: dspSource
      ? {
          id: dspSource.id,
          name: dspSource.name,
          entitySetName: dspSource.entitySetName,
          logicalName: dspSource.logicalName,
        }
      : null,
    ioDetails,
  });
}

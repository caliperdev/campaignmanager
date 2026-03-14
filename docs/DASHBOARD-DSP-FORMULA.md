# Dashboard "Delivered Impr." – How It Works

The dashboard does **not** use SQL for DSP data. DSP data comes from **Dataverse** via the **OData REST API**.

## 1. Placements (Supabase – SQL)

```sql
SELECT order_id, insertion_order_id_dsp, placement_id, start_date, end_date, impressions, ...
FROM placements
WHERE placement_id = 'P3BL8RQ'   -- when placement filter is set
  AND insertion_order_id_dsp IS NOT NULL
  AND insertion_order_id_dsp <> '';
```

We collect all distinct `insertion_order_id_dsp` values (e.g. `"1025245913, 1026834400"`).

## 2. DSP Data (Dataverse – OData, not SQL)

For each IO value, we call the Dataverse API:

```
GET {DATAVERSE_URL}/api/data/v9.2/{entity_set_name}?$filter=cr4fe_insertionordergid eq '1025245913, 1026834400'&$select=...&$top=5000
```

- **Filter column**: `cr4fe_insertionordergid` (logical name in Dataverse)
- **Filter**: exact match on the IO string
- **Entity set**: from `sources` table where `name ILIKE '%DSP%'` (e.g. `cr4fe_dspalls`)

## 3. Join (in memory)

```
placement.insertion_order_id_dsp  =  cr4fe_dspall.cr4fe_insertionordergid
```

## 4. Aggregation (in memory)

- Extract year-month from `cr4fe_date` (e.g. `2026-01-12` → `2026-01`)
- Sum `cr4fe_impressions` per year-month
- Sum `cr4fe_totalmediacost` per year-month

## Code locations

| Step | File | Function |
|------|------|----------|
| Placements | `src/lib/dashboard-placements-dsp.ts` | `getPlacementsWithIoDsp`, `getPlacementsByPlacementId` |
| DSP fetch | `src/app/test-link/actions.ts` | `getSourceDataFilteredByIos` |
| OData filter | `src/lib/dataverse-client.ts` | `getDataverseTableFiltered` |
| Join + aggregate | `src/lib/dashboard-placements-dsp.ts` | `computePlacementsWithDspAggregated` |

## Things that can break it

1. **Column name**: If Dataverse does not expose `cr4fe_insertionordergid`, the filtered fetch returns 0 rows (`dataverse-client.ts` line 366–368).
2. **IO mismatch**: `placement.insertion_order_id_dsp` must match `cr4fe_insertionordergid` exactly (including spaces, commas).
3. **DSP source**: The DSP source in `sources` must have correct `entity_set_name` and `logical_name` for `cr4fe_dspall`.
4. **Placement has no DSP link**: Placements without `insertion_order_id_dsp` or with an IO not present in `cr4fe_dspall` will show no delivered data.

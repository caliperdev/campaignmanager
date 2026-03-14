# Dashboard Flow — Step by Step

Concise guide to how the dashboard works and where problems can occur.

---

## 1. Page Load (Server)

**File:** `src/app/dashboard/page.tsx`

1. Fetches **advertisers** (with placements that have `insertion_order_id_dsp`)
2. Fetches **initial rows** from `dashboard_cache` (io_filter='', advertiser_filter='')
3. Passes both to `MonitorContent` as `initialData` and `advertiserOptions`

**If empty:** Cache may not be populated yet → user must click **Refresh**.

---

## 2. Data Model

**Core join:** `placement.insertion_order_id_dsp` = DSP source `cr4fe_insertionordergid`

- **Placements** (from DB): `placement_id`, `insertion_order_id_dsp`, dates, impressions, CPMs
- **DSP source** (external): delivered impressions, media cost, etc. by IO and date
- **dashboard_cache** (DB table): pre-aggregated by `(io_filter, advertiser_filter, year_month)`

---

## 3. Filter Flow (Client)

**File:** `src/app/monitor/MonitorContent.tsx`

### 3.1 Advertiser change

1. `setLoading(true)` in `onChange`
2. Fetches **placement options** → `/api/dashboard-placement-options?advertiser=X`
3. **Prefetches** all placement → IO IDs → `/api/dashboard-placement-io-ids?advertiser=X&all=1` → fills client cache
4. Fetches **IO options** (for "All placements" display) → `/api/dashboard-io-options?advertiser=X`
5. Clears placement filter
6. Data fetch runs (no placement) → `/api/monitor-data?advertiser=X`
7. `setLoading(false)` when done

### 3.2 Placement change

1. `setLoading(true)` in `onChange`
2. **Placement IO IDs:**
   - Check client cache (`advertiser|placement`)
   - If hit → use immediately
   - If miss → fetch `/api/dashboard-placement-io-ids?placement=X&advertiser=Y`, abort previous fetch
3. When `placementIoIdsSettled`:
4. **Data fetch** → `/api/monitor-data?advertiser=X&io=firstIo&placement=Y`
5. Only applies result if filters still match (avoids stale/blank data)
6. `setLoading(false)` when done

---

## 4. Data Fetch Logic (API)

**File:** `src/app/api/monitor-data/route.ts`

**Params:** `advertiser`, `io`, `placement`, `refresh`

| Scenario | Behavior |
|----------|----------|
| No placement | Read from `dashboard_cache` (io_filter, advertiser_filter). If empty → compute on demand |
| Placement set | Compute on demand (no cache). Uses placement → IO join |
| `refresh=1` + no placement | Recompute and **write** to `dashboard_cache` |

---

## 5. Backend Data Computation

**File:** `src/lib/dashboard-placements-dsp.ts`

1. **Get placements** from DB (filter by advertiser, io, placement_id)
2. **Booked impressions** per month from placements (allocator, dark days, per_day)
3. **DSP source** rows where `cr4fe_insertionordergid` ∈ placement IOs
4. **Aggregate** by month: booked + delivered + costs + revenue
5. If no placement filter → **upsert** into `dashboard_cache`

---

## 6. Refresh Buttons

| Button | Action |
|--------|--------|
| **Refresh** | POST `/api/dashboard-refresh-all` → refreshes all (io, advertiser) combos in cache. Then fetches current data. Clears placement IO cache. |
| **Refresh selection** | POST `/api/dashboard-refresh-selection` → refreshes current (io, advertiser, placement). Clears placement IO cache. |

---

## 7. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Empty on load | `dashboard_cache` empty → run **Refresh** |
| Blank when switching placement | Race: old fetch completed after filter change. Check `filtersRef` / `dataFetchIdRef` logic. |
| Double loader | Loading set in multiple places or not cleared only when matching fetch completes |
| Stale data | Result applied for wrong filters. Check `fetchId === dataFetchIdRef.current` and filter match. |
| Wrong IO shown | Placement IO cache key mismatch (`advertiser|placement`) or prefetch not finished |
| No delivered data | DSP source missing or column names don’t match (`cr4fe_insertionordergid`, etc.) |
| Placements missing | Need `insertion_order_id_dsp` on placements; advertiser filter may exclude them |

---

## 8. Key Files

| File | Role |
|------|------|
| `src/app/dashboard/page.tsx` | Server: load advertisers + cache, render MonitorContent |
| `src/app/monitor/MonitorContent.tsx` | Client: filters, loading, prefetch, data fetch |
| `src/app/api/monitor-data/route.ts` | API: read cache or compute, optional refresh |
| `src/app/api/dashboard-placement-io-ids/route.ts` | API: single placement IOs or all (`all=1`) |
| `src/lib/dashboard-placements-dsp.ts` | Logic: placements + DSP aggregation, cache read/write |
| `dashboard_cache` (DB) | Persisted aggregates by (io_filter, advertiser_filter, year_month) |

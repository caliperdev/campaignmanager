# Dashboard DSP Delivered Impressions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **REQUIRED:** Use superpowers:simplify after each implementation step. Keep code as intact as possible — preserve existing functionality, make minimal changes only where strictly necessary.

**Goal:** Ensure the dashboard "Delivered Impr." column shows data from the DSP (Dataverse cr4fe_dspall table). Join: `placement.insertion_order_id_dsp` (from placements page) = cr4fe_dspall column `insertion order gid`. Use cr4fe_dspall column `cr4fe_impressions` for delivered impressions. Aggregate by year-month.

**Architecture:** The test page already works with the exact join. The dashboard currently fetches the full DSP table and filters in memory, which can fail or timeout for large tables. We will switch to batched filtered fetches per insertion order (like the test page), merge results, and aggregate by year-month. The DSP source must be configured with `entity_set_name` = `cr4fe_dspalls` and `logical_name` = `cr4fe_dspall`.

**Tech Stack:** Next.js, Supabase, Dataverse OData API, React

**Implementation approach:** **Additive only — do not touch any existing code.** Create new files only. Existing `dashboard-placements-dsp.ts`, `monitor-data` route, `test-link/actions.ts`, and all other files remain unchanged. Use simplify skill after each task.

---

## Context

### Current Flow

| Component | Location | Behavior |
|-----------|----------|----------|
| Dashboard table | `src/app/monitor/MonitorContent.tsx` | Displays "Delivered Impr." from `dataImpressions` |
| Data source | `src/lib/dashboard-placements-dsp.ts` | `computePlacementsWithDspAggregated` fetches DSP via `getSourceDataFull` |
| Join | `placement.insertion_order_id_dsp` = cr4fe_dspall `insertion order gid` | Filter in memory: `ioIds.has(io)` |
| Impressions | cr4fe_dspall column `cr4fe_impressions` | Exact column name, no fallbacks |
| Test page | `src/app/test-link/actions.ts` | Uses `getSourceDataFiltered` with IO column — works great |

### Problem

- `getSourceDataFull` fetches the **entire** cr4fe_dspall table. For large tables this can timeout, fail, or be slow.
- The test page uses `getSourceDataFiltered` with a single IO — efficient and correct.

### Solution

- Fetch DSP data **per IO** using `getSourceDataFiltered` (or a new Dataverse batch filter), then merge and aggregate by year-month.
- Keep data pure: no trimming or normalization of IO values.
- Verify DSP source config points to cr4fe_dspall.

---

## Task 1: Create New Lib — DSP Delivered Data (Additive Only)

**Files:**
- Create: `src/lib/dashboard-dsp-delivered.ts` (new file; do not modify any existing file)

**Step 1: Create the new module**

New file `src/lib/dashboard-dsp-delivered.ts` that:
- Imports from existing modules (read-only): `supabase`, `getSourceByType`, `getSource`, `fetchDataverseTableFiltered` from dataverse-source, placement helpers from dashboard-placements-dsp (only the exported ones: `getPlacementsWithIoDsp`, `getPlacementsByPlacementId`, `getDistinctInsertionOrderIds`, `getDistinctAdvertisersForDashboard`), `allocateImpressionsByMonth`, etc. from placement-allocator
- Contains its own `getSourceDataFilteredByIos` (inline or local) — do not add to actions.ts
- Uses exact columns: `insertion order gid` for join, `cr4fe_impressions` for impressions
- Implements `computeDspDeliveredAggregated` and exports `getDashboardDspDeliveredData`, `refreshDashboardDspDeliveredCache`
- Writes to a **new** cache table `dashboard_dsp_delivered_cache` (new migration) so existing `dashboard_cache` is untouched
- Reuses `MonitorDisplayRow` type from monitor-data

**Step 2: Apply simplify skill**

Run superpowers:simplify on the new file.

**Step 3: Commit**

```bash
git add src/lib/dashboard-dsp-delivered.ts
git commit -m "feat: add dashboard-dsp-delivered lib (additive)"
```

---

## Task 2: Create New Cache Table (Additive Only)

**Files:**
- Create: `supabase/migrations/084_create_dashboard_dsp_delivered_cache.sql`

**Step 1: New migration**

Same schema as `dashboard_cache` but table name `dashboard_dsp_delivered_cache`. No changes to existing tables.

**Step 2: Commit**

```bash
git add supabase/migrations/084_create_dashboard_dsp_delivered_cache.sql
git commit -m "feat: add dashboard_dsp_delivered_cache table"
```

---

## Task 3: Create New API Routes (Additive Only)

**Files:**
- Create: `src/app/api/dashboard-dsp-delivered/route.ts` (GET, same as monitor-data)
- Create: `src/app/api/dashboard-dsp-delivered-refresh-all/route.ts` (POST)
- Create: `src/app/api/dashboard-dsp-delivered-refresh-selection/route.ts` (POST)

**Step 1: New routes**

- `GET /api/dashboard-dsp-delivered` — same interface as `/api/monitor-data` (io, advertiser, placement, refresh params). Returns `MonitorDataPayload`. Uses `getDashboardDspDeliveredData` and `refreshDashboardDspDeliveredCache`.
- `POST /api/dashboard-dsp-delivered-refresh-all` — same as dashboard-refresh-all, calls `refreshDashboardDspDeliveredCache` for all combos.
- `POST /api/dashboard-dsp-delivered-refresh-selection` — same as dashboard-refresh-selection.

Do not modify any existing API routes.

**Step 2: Apply simplify skill**

Run superpowers:simplify on the new file.

**Step 3: Commit**

```bash
git add src/app/api/dashboard-dsp-delivered/ src/app/api/dashboard-dsp-delivered-refresh-all/ src/app/api/dashboard-dsp-delivered-refresh-selection/
git commit -m "feat: add dashboard-dsp-delivered API routes"
```

---

## Task 4: Create New Dashboard Page (Additive Only)

**Files:**
- Create: `src/app/dashboard-dsp/page.tsx`
- Create: `src/app/dashboard-dsp/DashboardDspContent.tsx` (optional; or reuse MonitorContent with different fetch URL)

**Step 1: New page**

New page at `/dashboard-dsp`. Create `DashboardDspContent` — a client component that wraps or mirrors MonitorContent's UI but fetches from `/api/dashboard-dsp-delivered`, `/api/dashboard-dsp-delivered-refresh-all`, `/api/dashboard-dsp-delivered-refresh-selection`. Reuse shared pieces (ImpressionsChart, MonitorPickers, table columns) via imports; only the fetch URLs differ. Do not modify `src/app/dashboard/page.tsx` or `MonitorContent.tsx`.

**Step 2: Add nav link (optional)**

If there is a nav/sidebar, add a link to `/dashboard-dsp` in a new nav item. Only add; do not change existing nav items.

**Step 3: Apply simplify skill**

Run superpowers:simplify on the new files.

**Step 4: Commit**

```bash
git add src/app/dashboard-dsp/
git commit -m "feat: add dashboard-dsp page with DSP delivered data"
```

---

## Task 5: Verify and Test

**Files:**
- None (manual test)

**Step 1: Run migration**

Apply migration 084 to create `dashboard_dsp_delivered_cache`.

**Step 2: Open new dashboard**

Navigate to `/dashboard-dsp`. Use filters (advertiser, IO, placement) and Refresh.

**Step 3: Verify Delivered Impr.**

- "Delivered Impr." column shows data from cr4fe_dspall via `cr4fe_impressions`.
- Join: `placement.insertion_order_id_dsp` = `insertion order gid`.
- Compare with test page for a known placement.

**Step 4: Commit**

```bash
git add -A
git status
git commit -m "chore: verify dashboard-dsp delivered impressions"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create `src/lib/dashboard-dsp-delivered.ts` (new lib, no changes to existing) |
| 2 | Create migration for `dashboard_dsp_delivered_cache` table |
| 3 | Create `/api/dashboard-dsp-delivered` route |
| 4 | Create `/dashboard-dsp` page |
| 5 | Verify and test |

**Existing code:** `dashboard-placements-dsp.ts`, `monitor-data` route, `dashboard` page, `test-link/actions.ts`, and all other files remain **unchanged**.

**Column mapping (exact):**

| Source | Column | Purpose |
|--------|--------|---------|
| Placements | `insertion_order_id_dsp` | Join key (per placement) |
| cr4fe_dspall | `insertion order gid` | Join key (display name; Dataverse may use logical name `cr4fe_insertionordergid` in API — try both) |
| cr4fe_dspall | `cr4fe_impressions` | Delivered impressions value |
| cr4fe_dspall | date column | For year-month aggregation |

**Note:** Data is kept pure — no trimming or normalization of IO values for the join.

**Simplify skill:** After each implementation task, run superpowers:simplify. Preserve functionality; improve clarity only. Keep existing code as intact as possible.

---

## Key Files Reference

| File | Role |
|------|------|
| `src/lib/dashboard-dsp-delivered.ts` | **NEW** — DSP delivered aggregation, filtered fetch |
| `src/app/api/dashboard-dsp-delivered/route.ts` | **NEW** — GET API for new data |
| `src/app/api/dashboard-dsp-delivered-refresh-all/route.ts` | **NEW** — POST refresh all |
| `src/app/api/dashboard-dsp-delivered-refresh-selection/route.ts` | **NEW** — POST refresh selection |
| `src/app/dashboard-dsp/page.tsx` | **NEW** — Page at /dashboard-dsp |
| `dashboard_dsp_delivered_cache` | **NEW** — Cache table (migration 084) |
| `src/lib/dashboard-placements-dsp.ts` | **UNTOUCHED** — Existing logic |
| `src/app/api/monitor-data/route.ts` | **UNTOUCHED** — Existing API |
| `src/lib/dataverse-source.ts` | fetchDataverseTableFiltered (used by new lib) |

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-14-dashboard-dsp-delivered-impressions.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration.

2. **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints.

**Which approach?**

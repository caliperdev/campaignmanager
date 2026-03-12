-- Dashboard queries: SQL to satisfy all dashboard columns.
-- Join: placement.insertion_order_id_dsp = DSP.cr4fe_insertionordergid (or equivalent IO column)
--
-- Columns: Month | Campaigns | Deliv. Lines | Booked impressions | Delivered Impr. | Media Cost | Media Fees | Celtra Cost | Total Cost | Booked Revenue | Booked Revenue vs Total Cost | Margin

-- =============================================================================
-- QUERY 1: Placements (Supabase)
-- =============================================================================
-- Fetches placement data for booked impressions, CPMs, and IO mapping.
-- Required columns: insertion_order_id_dsp, start_date, end_date, impressions, cpm_adops, cpm_celtra, dark_days, per_day_impressions, order_id

SELECT
  order_id,
  insertion_order_id_dsp,
  start_date,
  end_date,
  impressions,
  cpm_adops,
  cpm_celtra,
  dark_days,
  per_day_impressions
FROM placements
WHERE insertion_order_id_dsp IS NOT NULL
  AND insertion_order_id_dsp != '';

-- Optional: filter by specific IO
-- AND insertion_order_id_dsp = '<io_filter>';


-- =============================================================================
-- QUERY 2: DSP source (Supabase dynamic table or Dataverse)
-- =============================================================================
-- Required columns (try in order, first match wins):
--   Date:     cr4fe_date | cr4fe_reportdate | report_date | reportdate | ReportDate | date
--   Impressions: cr4fe_impressioncount | cr4fe_impressions | impressions | impression_count | impressioncount | delivered_impressions
--   Media cost:  cr4fe_totalmediacost | total_media_cost | totalmediacost | media_cost | mediacost
--   IO:         cr4fe_insertionordergid | cr4fe_insertionorderid | insertion_order_gid | insertion order gid | InsertionOrderGID
-- Optional:
--   Media fees: cr4fe_mediafees | media_fees | mediafees | Media Fees
--   Advertiser: cr4fe_advertiser | Advertiser | advertiser (for media fees rule: ND - HA Usd - Buho → 0.28, ND - BM Usd - Buho Media → 0.08)

-- Example for a Supabase DSP table named 'data_dsp' (replace with actual dynamic_table_name from sources):
/*
SELECT
  COALESCE(cr4fe_date, cr4fe_reportdate, report_date, reportdate, "ReportDate", date) AS report_date,
  COALESCE(cr4fe_impressioncount, cr4fe_impressions, impressions, impression_count, impressioncount, delivered_impressions)::bigint AS impressions,
  COALESCE(NULLIF(trim(cr4fe_totalmediacost), ''), NULLIF(trim(total_media_cost), ''), NULLIF(trim(totalmediacost), ''), NULLIF(trim(media_cost), ''), NULLIF(trim(mediacost), ''))::numeric AS media_cost,
  COALESCE(cr4fe_insertionordergid, cr4fe_insertionorderid, insertion_order_gid, "insertion order gid", "InsertionOrderGID") AS insertion_order_id,
  NULLIF(trim(COALESCE(cr4fe_mediafees, media_fees, mediafees, "Media Fees")), '')::numeric AS media_fees,
  trim(COALESCE(cr4fe_advertiser, "Advertiser", advertiser)) AS advertiser
FROM data_dsp;
*/


-- =============================================================================
-- COMBINED QUERY: All dashboard columns by month (when DSP is in Supabase)
-- =============================================================================
-- 1. Get DSP table name: SELECT dynamic_table_name FROM sources WHERE name ILIKE '%DSP%' LIMIT 1;
-- 2. Replace 'data_dsp' below with that table name.
-- 3. Uses simplified booked impressions (equal spread across days; dark_days/per_day_impressions require app logic).

WITH
-- 1. Booked impressions by month per IO (simplified: equal spread, no dark days)
placements_io AS (
  SELECT
    p.id AS placement_id,
    p.insertion_order_id_dsp AS io,
    p.order_id,
    p.start_date::date AS sd,
    p.end_date::date AS ed,
    NULLIF(replace(replace(trim(COALESCE(p.impressions, '')), '$', ''), ',', ''), '')::bigint AS goal,
    NULLIF(replace(replace(trim(COALESCE(p.cpm_adops, '')), '$', ''), ',', ''), '')::numeric AS cpm_adops,
    NULLIF(replace(replace(trim(COALESCE(p.cpm_celtra, '')), '$', ''), ',', ''), '')::numeric AS cpm_celtra
  FROM placements p
  WHERE p.insertion_order_id_dsp IS NOT NULL
    AND trim(p.insertion_order_id_dsp) <> ''
),
campaign_days AS (
  SELECT
    placement_id, io, order_id, goal, cpm_adops, cpm_celtra,
    d::date AS day,
    count(*) OVER (PARTITION BY placement_id) AS total_days,
    row_number() OVER (PARTITION BY placement_id ORDER BY d::date) AS rn
  FROM placements_io
  CROSS JOIN LATERAL generate_series(sd, ed, '1 day'::interval) AS d
  WHERE goal > 0 AND sd IS NOT NULL AND ed IS NOT NULL
),
daily_alloc AS (
  SELECT
    io,
    to_char(day, 'YYYY-MM') AS year_month,
    floor(goal::numeric / total_days)::bigint
      + CASE WHEN rn = total_days THEN (goal - total_days * floor(goal::numeric / total_days)::bigint) ELSE 0 END AS daily_impr,
    cpm_adops,
    cpm_celtra
  FROM campaign_days
),
booked_by_io_month AS (
  SELECT io, year_month,
    sum(daily_impr)::bigint AS booked_impressions,
    max(cpm_adops) AS cpm_adops,
    max(cpm_celtra) AS cpm_celtra
  FROM daily_alloc
  GROUP BY io, year_month
),
-- 2. DSP data aggregated by year_month and IO
-- NOTE: Replace 'data_dsp' with actual DSP table. Use format() + EXECUTE in a function for dynamic table names.
dsp_agg AS (
  SELECT
    left(trim(COALESCE(d.cr4fe_date, d.cr4fe_reportdate, d.report_date, d.reportdate, d."ReportDate", d.date)), 7) AS year_month,
    trim(COALESCE(d.cr4fe_insertionordergid, d.cr4fe_insertionorderid, d.insertion_order_gid, d."insertion order gid", d."InsertionOrderGID")) AS io,
    sum(COALESCE(d.cr4fe_impressioncount, d.cr4fe_impressions, d.impressions, d.impression_count, d.impressioncount, d.delivered_impressions)::bigint) AS delivered_impressions,
    sum(NULLIF(trim(COALESCE(d.cr4fe_totalmediacost, d.total_media_cost, d.totalmediacost, d.media_cost, d.mediacost)), '')::numeric) AS media_cost,
    sum(
      CASE
        WHEN NULLIF(trim(COALESCE(d.cr4fe_mediafees, d.media_fees, d.mediafees, d."Media Fees")), '') IS NOT NULL
        THEN NULLIF(trim(COALESCE(d.cr4fe_mediafees, d.media_fees, d.mediafees, d."Media Fees")), '')::numeric
        WHEN trim(COALESCE(d.cr4fe_advertiser, d."Advertiser", d.advertiser)) = 'ND - HA Usd - Buho'
        THEN NULLIF(trim(COALESCE(d.cr4fe_totalmediacost, d.total_media_cost, d.totalmediacost, d.media_cost, d.mediacost)), '')::numeric * 0.28
        WHEN trim(COALESCE(d.cr4fe_advertiser, d."Advertiser", d.advertiser)) = 'ND - BM Usd - Buho Media'
        THEN NULLIF(trim(COALESCE(d.cr4fe_totalmediacost, d.total_media_cost, d.totalmediacost, d.media_cost, d.mediacost)), '')::numeric * 0.08
        ELSE 0
      END
    ) AS media_fees
  FROM data_dsp d  -- Replace with actual table name
  WHERE trim(COALESCE(d.cr4fe_insertionordergid, d.cr4fe_insertionorderid, d.insertion_order_gid, d."insertion order gid", d."InsertionOrderGID")) <> ''
  GROUP BY 1, 2
),
-- 3. IO to order_id for campaign count
io_to_orders AS (
  SELECT insertion_order_id_dsp AS io, order_id
  FROM placements
  WHERE insertion_order_id_dsp IS NOT NULL AND trim(insertion_order_id_dsp) <> ''
),
-- 4. Join booked + DSP by (year_month, io), then aggregate to year_month
booked_dsp_joined AS (
  SELECT
    coalesce(b.year_month, d.year_month) AS year_month,
    coalesce(b.io, d.io) AS io,
    coalesce(b.booked_impressions, 0)::bigint AS booked_impressions,
    coalesce(d.delivered_impressions, 0)::bigint AS delivered_impressions,
    coalesce(d.media_cost, 0) AS media_cost,
    coalesce(d.media_fees, 0) AS media_fees,
    coalesce(b.cpm_adops, 0) AS cpm_adops,
    coalesce(b.cpm_celtra, 0) AS cpm_celtra
  FROM booked_by_io_month b
  FULL OUTER JOIN dsp_agg d ON d.year_month = b.year_month AND d.io = b.io
),
by_month AS (
  SELECT
    j.year_month,
    count(DISTINCT o.order_id) AS campaigns,
    count(DISTINCT j.io) AS deliv_lines,
    sum(booked_impressions)::bigint AS booked_impressions,
    sum(delivered_impressions)::bigint AS delivered_impressions,
    sum(media_cost) AS media_cost,
    sum(media_fees) AS media_fees,
    sum(delivered_impressions::numeric / 1000.0 * cpm_celtra) AS celtra_cost,
    sum(media_cost) + sum(delivered_impressions::numeric / 1000.0 * cpm_celtra) AS total_cost,
    sum(booked_impressions::numeric / 1000.0 * cpm_adops) AS booked_revenue
  FROM booked_dsp_joined j
  LEFT JOIN io_to_orders o ON o.io = j.io
  GROUP BY j.year_month
)
SELECT
  year_month AS "Month",
  campaigns AS "Campaigns",
  deliv_lines AS "Deliv. Lines",
  booked_impressions AS "Booked impressions",
  delivered_impressions AS "Delivered Impr.",
  round(media_cost, 2) AS "Media Cost",
  round(media_fees, 2) AS "Media Fees",
  round(celtra_cost, 2) AS "Celtra Cost",
  round(total_cost, 2) AS "Total Cost",
  round(booked_revenue, 2) AS "Booked Revenue",
  round(booked_revenue - total_cost, 1) AS "Booked Revenue vs Total Cost",
  round(100.0 * nullif(booked_revenue - total_cost, 0) / nullif(booked_revenue, 0), 1) AS "Margin"
FROM by_month
ORDER BY year_month;

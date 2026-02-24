-- All columns for GID/Insertion Order ID 11753148, with Booked impressions (campaign daily allocation for that IO only)
-- Booked revenue = (booked impressions / 1000) * CPM. CPM from campaigns "CPM" column only (IO 11753148).
WITH 
-- Booked impressions by month: only campaign(s) with Insertion Order ID = 11753148
campaigns_io AS (
  SELECT id, start_date::date AS sd, end_date::date AS ed, impressions_goal
  FROM campaigns
  WHERE (csv_data::jsonb)->>'Insertion Order ID' = '11753148'
    AND start_date IS NOT NULL AND end_date IS NOT NULL
    AND trim(start_date) <> '' AND trim(end_date) <> ''
),
campaign_days AS (
  SELECT c.id, c.impressions_goal, d::date AS day,
         count(*) OVER (PARTITION BY c.id) AS total_days,
         row_number() OVER (PARTITION BY c.id ORDER BY d::date) AS rn
  FROM campaigns_io c
  CROSS JOIN LATERAL generate_series(c.sd, c.ed, '1 day'::interval) AS d
),
daily_alloc AS (
  SELECT day,
         floor(impressions_goal::numeric / total_days)::bigint
           + CASE WHEN rn = total_days THEN (impressions_goal - total_days * floor(impressions_goal::numeric / total_days)::bigint) ELSE 0 END AS daily_impr
  FROM campaign_days
),
sum_daily_impr_11753148 AS (
  SELECT to_char(day, 'YYYY-MM') AS year_month, sum(daily_impr)::bigint AS booked_impressions
  FROM daily_alloc
  GROUP BY to_char(day, 'YYYY-MM')
),
-- GID 11753148: delivered impr, media cost, celtra cost, total cost. CPM = campaigns "CPM" column only.
gid_costs AS (
  SELECT left(trim(e.report_date), 7) AS year_month,
         sum(e.impressions) AS delivered_impressions,
         sum(NULLIF(trim((e.csv_data::jsonb)->>'cr4fe_totalmediacost'), '')::numeric) AS total_media_cost,
         c.cpm_celtra_raw AS cpm_celtra,
         c.cpm_raw AS cpm,
         sum(e.impressions) / 1000.0 * c.cpm_celtra_raw AS celtra_cost,
         sum(NULLIF(trim((e.csv_data::jsonb)->>'cr4fe_totalmediacost'), '')::numeric) + sum(e.impressions) / 1000.0 * c.cpm_celtra_raw AS total_cost
  FROM data_entries e
  JOIN table_data_entries t ON t.data_entry_id = e.id
  LEFT JOIN LATERAL (
    SELECT replace(replace(trim(COALESCE((csv_data::jsonb)->>'CPM Celtra', '')), '$', ''), ',', '')::numeric AS cpm_celtra_raw,
           NULLIF(replace(replace(trim(COALESCE((csv_data::jsonb)->>'CPM', '')), '$', ''), ',', ''), '')::numeric AS cpm_raw
    FROM campaigns WHERE (csv_data::jsonb)->>'Insertion Order ID' = '11753148' LIMIT 1
  ) c ON true
  WHERE (e.csv_data::jsonb)->>'cr4fe_insertionordergid' = '11753148'
  GROUP BY left(trim(e.report_date), 7), c.cpm_celtra_raw, c.cpm_raw
)
SELECT g.year_month AS month,
       s.booked_impressions AS "Booked impressions",
       g.delivered_impressions AS "Delivered impressions",
       round(g.total_media_cost, 1) AS "Media cost",
       g.cpm AS "CPM",
       g.cpm_celtra AS "CPM Celtra",
       g.celtra_cost AS "Celtra cost",
       round(g.total_cost, 1) AS "Total cost",
       round((s.booked_impressions::numeric / 1000.0) * coalesce(g.cpm, 0), 1) AS "Booked revenue",
       round((s.booked_impressions::numeric / 1000.0) * coalesce(g.cpm, 0) - g.total_cost, 1) AS "Booked Revenue vs Total Cost",
       round(100.0 * ((s.booked_impressions::numeric / 1000.0) * coalesce(g.cpm, 0) - g.total_cost) / nullif((s.booked_impressions::numeric / 1000.0) * coalesce(g.cpm, 0), 0), 1) AS "Margin"
FROM gid_costs g
LEFT JOIN sum_daily_impr_11753148 s ON s.year_month = g.year_month
ORDER BY g.year_month;

-- Monitor-only: booked revenue by year-month (all campaigns, optional campaign-table filter).
-- booked_revenue = sum over campaigns of (campaign's booked impressions in that month / 1000 * campaign CPM).
-- CPM from campaigns "CPM" column. p_table_id = campaign table (table_campaigns); null = all campaigns.

CREATE OR REPLACE FUNCTION get_monitor_booked_revenue_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, booked_revenue numeric)
LANGUAGE sql
STABLE
AS $$
  WITH campaigns_io AS (
    SELECT c.id,
           c.start_date::date AS sd,
           c.end_date::date AS ed,
           c.impressions_goal,
           NULLIF(replace(replace(trim(COALESCE((c.csv_data::jsonb)->>'CPM', '')), '$', ''), ',', ''), '')::numeric AS cpm
    FROM campaigns c
    LEFT JOIN table_campaigns tc ON tc.campaign_id = c.id
    WHERE c.start_date IS NOT NULL AND c.end_date IS NOT NULL
      AND trim(c.start_date) <> '' AND trim(c.end_date) <> ''
      AND (p_table_id IS NULL OR tc.table_id = p_table_id)
  ),
  campaign_days AS (
    SELECT c.id, c.impressions_goal, c.cpm, d::date AS day,
           count(*) OVER (PARTITION BY c.id) AS total_days,
           row_number() OVER (PARTITION BY c.id ORDER BY d::date) AS rn
    FROM campaigns_io c
    CROSS JOIN LATERAL generate_series(c.sd, c.ed, '1 day'::interval) AS d
  ),
  daily_alloc AS (
    SELECT id, to_char(day, 'YYYY-MM') AS year_month,
           floor(impressions_goal::numeric / total_days)::bigint
             + CASE WHEN rn = total_days THEN (impressions_goal - total_days * floor(impressions_goal::numeric / total_days)::bigint) ELSE 0 END AS daily_impr,
           cpm
    FROM campaign_days
  ),
  by_month AS (
    SELECT year_month, sum(daily_impr::numeric / 1000.0 * coalesce(cpm, 0)) AS booked_revenue
    FROM daily_alloc
    GROUP BY year_month
  )
  SELECT by_month.year_month::text, round(by_month.booked_revenue, 1) AS booked_revenue
  FROM by_month
  ORDER BY 1;
$$;

-- Monitor-only: media cost + celtra cost by year-month.
-- media_cost = SUM(cr4fe_totalmediacost) from data_entries csv_data.
-- celtra_cost = SUM(impressions / 1000 * CPM Celtra) where CPM Celtra comes from campaigns table
--   joined by Insertion Order ID = cr4fe_insertionordergid.

CREATE OR REPLACE FUNCTION get_monitor_costs_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, media_cost numeric, celtra_cost numeric)
LANGUAGE sql
STABLE
AS $$
  WITH cpm_lookup AS (
    SELECT 
      (c.csv_data::jsonb)->>'Insertion Order ID' AS io_id,
      NULLIF(replace(replace(trim(NULLIF((c.csv_data::jsonb)->>'CPM Celtra', '')), '$', ''), ',', ''), '')::numeric AS cpm_celtra
    FROM campaigns c
    WHERE (c.csv_data::jsonb)->>'Insertion Order ID' IS NOT NULL
      AND trim((c.csv_data::jsonb)->>'Insertion Order ID') <> ''
  )
  SELECT 
    left(trim(e.report_date), 7)::text AS year_month,
    round(coalesce(sum(NULLIF(trim((e.csv_data::jsonb)->>'cr4fe_totalmediacost'), '')::numeric), 0), 2) AS media_cost,
    round(coalesce(sum(
      CASE 
        WHEN cl.cpm_celtra IS NOT NULL AND cl.cpm_celtra > 0 
        THEN e.impressions / 1000.0 * cl.cpm_celtra
        ELSE 0
      END
    ), 0), 2) AS celtra_cost
  FROM data_entries e
  JOIN table_data_entries t ON t.data_entry_id = e.id
  LEFT JOIN cpm_lookup cl ON cl.io_id = (e.csv_data::jsonb)->>'cr4fe_insertionordergid'
  WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
    AND (
      (p_table_id IS NULL)
      OR
      (t.table_id = p_table_id)
    )
  GROUP BY left(trim(e.report_date), 7)
  ORDER BY 1;
$$;

-- Add media_fees to monitor costs: from data (DSP) pipeline, based on Advertiser.
-- Media Fees = [Total Media Cost] * 0.28 when Advertiser = 'ND - HA Usd - Buho',
--              [Total Media Cost] * 0.08 when Advertiser = 'ND - BM Usd - Buho Media', else 0.

DROP FUNCTION IF EXISTS get_monitor_costs_by_year_month(uuid);

CREATE OR REPLACE FUNCTION get_monitor_costs_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, media_cost numeric, celtra_cost numeric, media_fees numeric)
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
  ),
  base AS (
    SELECT 
      left(trim(e.report_date), 7)::text AS year_month,
      coalesce(NULLIF(trim((e.csv_data::jsonb)->>'cr4fe_totalmediacost'), '')::numeric, 0) AS row_media_cost,
      trim(coalesce((e.csv_data::jsonb)->>'cr4fe_advertiser', (e.csv_data::jsonb)->>'Advertiser', '')) AS advertiser,
      CASE 
        WHEN cl.cpm_celtra IS NOT NULL AND cl.cpm_celtra > 0 
        THEN e.impressions / 1000.0 * cl.cpm_celtra
        ELSE 0
      END AS row_celtra
    FROM data_entries e
    JOIN table_data_entries t ON t.data_entry_id = e.id
    LEFT JOIN cpm_lookup cl ON cl.io_id = (e.csv_data::jsonb)->>'cr4fe_insertionordergid'
    WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
      AND (
        (p_table_id IS NULL)
        OR
        (t.table_id = p_table_id)
      )
  )
  SELECT 
    year_month,
    round(coalesce(sum(row_media_cost), 0), 2) AS media_cost,
    round(coalesce(sum(row_celtra), 0), 2) AS celtra_cost,
    round(coalesce(sum(
      CASE 
        WHEN advertiser = 'ND - HA Usd - Buho' THEN row_media_cost * 0.28
        WHEN advertiser = 'ND - BM Usd - Buho Media' THEN row_media_cost * 0.08
        ELSE 0
      END
    ), 0), 2) AS media_fees
  FROM base
  GROUP BY year_month
  ORDER BY 1;
$$;

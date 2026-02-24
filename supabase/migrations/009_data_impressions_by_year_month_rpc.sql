-- Monitor-only: aggregation for Monitor page/charts. Not used by core (campaigns, tables, import).
-- Returns only year-month + sum(impressions); avoids fetching full data_entries into the app.

CREATE OR REPLACE FUNCTION get_data_impressions_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, sum_impressions bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT left(trim(e.report_date), 7)::text AS year_month,
         coalesce(sum(e.impressions), 0)::bigint AS sum_impressions
  FROM data_entries e
  WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
    AND (
      (p_table_id IS NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id))
      OR
      (p_table_id IS NOT NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id AND t.table_id = p_table_id))
    )
  GROUP BY left(trim(e.report_date), 7)
  ORDER BY 1;
$$;

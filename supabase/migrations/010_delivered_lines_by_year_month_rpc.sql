-- Monitor-only: unique count of "insertion order gid" from DSP data (csv_data) by year-month.
-- Tries common JSON keys: cr4fe_insertionordergid, Insertion Order GID, insertion order gid.

CREATE OR REPLACE FUNCTION get_delivered_lines_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, delivered_lines bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT left(trim(e.report_date), 7)::text AS year_month,
         count(DISTINCT nullif(trim(
           coalesce(
             (e.csv_data::jsonb)->>'cr4fe_insertionordergid',
             (e.csv_data::jsonb)->>'Insertion Order GID',
             (e.csv_data::jsonb)->>'insertion order gid',
             (e.csv_data::jsonb)->>'Insertion Order Id',
             ''
           )
         ), ''))::bigint AS delivered_lines
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

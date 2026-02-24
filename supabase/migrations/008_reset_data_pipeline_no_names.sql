-- Reset Data pipeline without knowing table names.
-- Finds the root table by columns (report_date + impressions), then
-- TRUNCATE ... CASCADE clears it and every table that references it.

BEGIN;

DO $$
DECLARE
  root_table text;
BEGIN
  SELECT t.tablename INTO root_table
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name = 'report_date')
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name = 'impressions')
  LIMIT 1;

  IF root_table IS NOT NULL THEN
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', root_table);
    RAISE NOTICE 'Truncated % and all tables that reference it.', root_table;
  ELSE
    RAISE NOTICE 'No table with report_date+impressions found; nothing to truncate.';
  END IF;
END $$;

COMMIT;

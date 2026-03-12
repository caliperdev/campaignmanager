-- Add missing placement columns (trafficker, am, qa_am) to existing order tables.
-- Runs ensure_placement_columns for each order's dynamic_table_name.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT dynamic_table_name
    FROM orders
    WHERE dynamic_table_name IS NOT NULL
      AND trim(dynamic_table_name) <> ''
      AND dynamic_table_name ~ '^csv_[a-z0-9_]+$'
  ) LOOP
    PERFORM ensure_placement_columns(r.dynamic_table_name);
  END LOOP;
END;
$$;

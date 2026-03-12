-- Fix ensure_placement_columns: include dark_days, per_day_impressions, cpm_client, cpm_adops
-- (were dropped when 036-038 replaced the function)
CREATE OR REPLACE FUNCTION ensure_placement_columns(p_table_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_col_name text;
  v_cols text[] := ARRAY[
    'advertiser', 'order_number', 'order_campaign_id', 'order_campaign', 'agency', 'category', 'trafficker', 'am', 'qa_am',
    'placement_id', 'placement', 'format', 'deal', 'start_date', 'end_date', 'impressions', 'cpm', 'cpm_client', 'cpm_adops',
    'dark_days', 'per_day_impressions'
  ];
BEGIN
  IF p_table_name IS NULL OR length(trim(p_table_name)) = 0 THEN RETURN; END IF;
  IF p_table_name !~ '^csv_[a-z0-9_]+$' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = p_table_name) THEN
    RETURN;
  END IF;

  FOREACH v_col_name IN ARRAY v_cols
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = p_table_name AND column_name = v_col_name
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I text', p_table_name, v_col_name);
    END IF;
  END LOOP;
END;
$$;

-- Backfill: add missing columns to all existing order tables
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

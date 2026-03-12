-- RPC: Add placement form columns to a dynamic table if they don't exist.
-- Uses order_number (not "order") because "order" is a PostgreSQL reserved word.
CREATE OR REPLACE FUNCTION ensure_placement_columns(p_table_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_col_name text;
  v_cols text[] := ARRAY[
    'advertiser', 'order_number', 'order_campaign_id', 'order_campaign', 'agency', 'category',
    'placement_id', 'placement', 'format', 'deal', 'start_date', 'end_date', 'impressions', 'cpm'
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

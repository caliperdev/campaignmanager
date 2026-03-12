-- Remove cpm column from placement tables.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename ~ '^csv_[a-z0-9_]+$') LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'cpm'
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS cpm', r.tablename);
    END IF;
  END LOOP;
END;
$$;

-- Add cpm_client and cpm_adops to tables that don't have them yet.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename ~ '^csv_[a-z0-9_]+$') LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'cpm_client') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cpm_client text', r.tablename);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'cpm_adops') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cpm_adops text', r.tablename);
    END IF;
  END LOOP;
END;
$$;

-- Update ensure_placement_columns to exclude cpm.
CREATE OR REPLACE FUNCTION ensure_placement_columns(p_table_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_col_name text;
  v_cols text[] := ARRAY[
    'advertiser', 'order_number', 'order_campaign_id', 'order_campaign', 'agency', 'category',
    'placement_id', 'placement', 'format', 'deal', 'start_date', 'end_date', 'impressions',
    'cpm_client', 'cpm_adops'
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

-- Update create_empty_order to use cpm_client and cpm_adops instead of cpm.
DROP FUNCTION IF EXISTS create_empty_order(text);
DROP FUNCTION IF EXISTS create_empty_order(text, uuid);
DROP FUNCTION IF EXISTS create_empty_order(uuid, text);

CREATE OR REPLACE FUNCTION create_empty_order(
  p_agency_id uuid DEFAULT NULL,
  p_display_name text DEFAULT 'Untitled',
  p_advertiser text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, created_table_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_new_table_name text;
  v_i int := 0;
  v_meta_id uuid;
  v_standard_cols text := 'id serial PRIMARY KEY, advertiser text, order_number text, order_campaign_id text, order_campaign text, agency text, category text, placement_id text, placement text, format text, deal text, start_date text, end_date text, impressions text, cpm_client text, cpm_adops text';
BEGIN
  v_table_name := _csv_sanitize_ident(nullif(trim(p_display_name), ''));
  IF v_table_name = '' OR v_table_name IS NULL THEN v_table_name := 'order'; END IF;
  v_table_name := 'csv_' || v_table_name;

  v_new_table_name := v_table_name;
  WHILE EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_new_table_name) LOOP
    v_i := v_i + 1;
    v_new_table_name := v_table_name || '_' || v_i;
  END LOOP;

  EXECUTE format('CREATE TABLE %I (%s)', v_new_table_name, v_standard_cols);

  v_meta_id := gen_random_uuid();
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, agency_id, advertiser, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name,
    '["Advertiser","Order Number","Order Campaign ID","Order Campaign","Agency","Category","Placement ID","Placement","Format","Deal","Start Date","End Date","Impressions","CPM Client","CPM AdOps"]'::jsonb,
    p_agency_id, nullif(trim(p_advertiser), ''), now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  RETURN NEXT;
END;
$$;

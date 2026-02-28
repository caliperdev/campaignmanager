-- Restructure: drop all, create campaigns + sources + monitor

-- 1. Drop dependent tables first (FK order)
DROP TABLE IF EXISTS table_data_entries CASCADE;
DROP TABLE IF EXISTS table_campaigns CASCADE;
DROP TABLE IF EXISTS dsp_data CASCADE;
DROP TABLE IF EXISTS data_entries CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;

-- 2. Drop dynamic csv_* tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'csv_%') LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
  END LOOP;
END $$;

-- 3. Drop RPCs
DROP FUNCTION IF EXISTS get_data_impressions_by_year_month(uuid);
DROP FUNCTION IF EXISTS get_delivered_lines_by_year_month(uuid);
DROP FUNCTION IF EXISTS get_monitor_costs_by_year_month(uuid);
DROP FUNCTION IF EXISTS get_monitor_booked_revenue_by_year_month(uuid);
DROP FUNCTION IF EXISTS create_csv_import_table(text, text[], jsonb, text);
DROP FUNCTION IF EXISTS drop_dynamic_table(text);
DROP FUNCTION IF EXISTS _csv_sanitize_ident(text);

-- 4. Create campaigns (master registry of campaigns; each has its own dynamic table)
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dynamic_table_name text NOT NULL,
  column_headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Create sources (data pipeline registry; read-only)
CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dynamic_table_name text NOT NULL,
  column_headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create monitor (pre-computed; no RPCs on page load)
CREATE TABLE monitor (
  id serial PRIMARY KEY,
  year_month text NOT NULL UNIQUE,
  booked_impressions bigint DEFAULT 0,
  delivered_impressions bigint DEFAULT 0,
  delivered_lines bigint DEFAULT 0,
  media_cost numeric DEFAULT 0,
  media_fees numeric DEFAULT 0,
  celtra_cost numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  booked_revenue numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_monitor_year_month ON monitor(year_month);

-- 7. Sanitize helper
CREATE OR REPLACE FUNCTION _csv_sanitize_ident(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT left(trim(both '_' from regexp_replace(lower(trim(coalesce(raw, ''))), '[^a-z0-9]+', '_', 'g')), 63);
$$;

-- 8. Create dynamic table + register in campaigns
CREATE OR REPLACE FUNCTION create_csv_import_table(
  p_table_name text,
  p_columns text[],
  p_rows jsonb,
  p_display_name text
)
RETURNS TABLE(campaign_id uuid, created_table_name text, rows_inserted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_col_name text;
  v_ddl_cols text := '';
  v_insert_cols text := '';
  v_select_parts text := '';
  v_i int;
  v_sql text;
  v_new_table_name text;
  v_rows_inserted bigint;
  v_meta_id uuid;
BEGIN
  v_table_name := _csv_sanitize_ident(p_table_name);
  IF v_table_name = '' OR v_table_name IS NULL THEN v_table_name := 'csv_import'; ELSE v_table_name := 'csv_' || v_table_name; END IF;

  FOR v_i IN 1 .. array_length(p_columns, 1) LOOP
    v_col_name := _csv_sanitize_ident(p_columns[v_i]);
    IF v_col_name = '' OR v_col_name IS NULL THEN v_col_name := 'col_' || v_i; END IF;
    IF v_i > 1 THEN v_ddl_cols := v_ddl_cols || ', '; v_insert_cols := v_insert_cols || ', '; v_select_parts := v_select_parts || ', '; END IF;
    v_ddl_cols := v_ddl_cols || format('%I text', v_col_name);
    v_insert_cols := v_insert_cols || format('%I', v_col_name);
    v_select_parts := v_select_parts || '(r->>' || quote_literal(p_columns[v_i]) || ')';
  END LOOP;

  IF v_ddl_cols = '' THEN RAISE EXCEPTION 'At least one column required'; END IF;

  v_new_table_name := v_table_name;
  v_i := 0;
  WHILE EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_new_table_name) LOOP
    v_i := v_i + 1; v_new_table_name := v_table_name || '_' || v_i;
  END LOOP;

  v_sql := format('CREATE TABLE %I (id serial PRIMARY KEY, %s)', v_new_table_name, v_ddl_cols);
  EXECUTE v_sql;

  v_sql := format('INSERT INTO %I (%s) SELECT %s FROM jsonb_array_elements($1) AS r', v_new_table_name, v_insert_cols, v_select_parts);
  EXECUTE v_sql USING p_rows;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  v_meta_id := gen_random_uuid();
  INSERT INTO campaigns (id, name, dynamic_table_name, column_headers, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name, to_jsonb(p_columns), now());

  campaign_id := v_meta_id;
  created_table_name := v_new_table_name;
  rows_inserted := v_rows_inserted;
  RETURN NEXT;
END;
$$;

-- 9. Drop dynamic table
CREATE OR REPLACE FUNCTION drop_dynamic_table(p_table_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_table_name IS NULL OR length(trim(p_table_name)) = 0 THEN RETURN; END IF;
  IF p_table_name !~ '^csv_[a-z0-9_]+$' THEN RETURN; END IF;
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', p_table_name);
END;
$$;

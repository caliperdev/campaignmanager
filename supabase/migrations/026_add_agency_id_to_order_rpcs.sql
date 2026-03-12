-- Add agency_id support to create_empty_order and create_csv_import_table.

-- 1. create_empty_order: accept p_agency_id, set agency_id in INSERT
DROP FUNCTION IF EXISTS create_empty_order(text);

CREATE OR REPLACE FUNCTION create_empty_order(p_display_name text, p_agency_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid, created_table_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_new_table_name text;
  v_i int := 0;
  v_meta_id uuid;
  v_standard_cols text := 'id serial PRIMARY KEY, advertiser text, order_number text, order_campaign_id text, order_campaign text, agency text, category text, placement_id text, placement text, format text, deal text, start_date text, end_date text, impressions text, cpm text';
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
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, agency_id, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name,
    '["Advertiser","Order Number","Order Campaign ID","Order Campaign","Agency","Category","Placement ID","Placement","Format","Deal","Start Date","End Date","Impressions","CPM"]'::jsonb,
    p_agency_id, now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  RETURN NEXT;
END;
$$;

-- 2. create_csv_import_table: accept p_agency_id, set agency_id in INSERT
DROP FUNCTION IF EXISTS create_csv_import_table(text, text[], jsonb, text);

CREATE OR REPLACE FUNCTION create_csv_import_table(
  p_table_name text,
  p_columns text[],
  p_rows jsonb,
  p_display_name text,
  p_agency_id uuid DEFAULT NULL
)
RETURNS TABLE(order_id uuid, created_table_name text, rows_inserted bigint)
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
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, agency_id, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name, to_jsonb(p_columns), p_agency_id, now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  rows_inserted := v_rows_inserted;
  RETURN NEXT;
END;
$$;

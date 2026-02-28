-- Source CSV import: create dynamic table + batch insert + register in sources (isolated from campaigns).

-- 1. Create source from CSV (data_ prefix, register in sources)
CREATE OR REPLACE FUNCTION create_source_csv_import_table(
  p_table_name text,
  p_columns text[],
  p_rows jsonb,
  p_display_name text
)
RETURNS TABLE(source_id uuid, created_table_name text, rows_inserted bigint)
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
  IF v_table_name = '' OR v_table_name IS NULL THEN v_table_name := 'data_import'; ELSE v_table_name := 'data_' || v_table_name; END IF;

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
  INSERT INTO sources (id, name, dynamic_table_name, column_headers)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name, to_jsonb(p_columns));

  source_id := v_meta_id;
  created_table_name := v_new_table_name;
  rows_inserted := v_rows_inserted;
  RETURN NEXT;
END;
$$;

-- 2. Extend drop_dynamic_table to allow data_* tables (sources)
CREATE OR REPLACE FUNCTION drop_dynamic_table(p_table_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_table_name IS NULL OR length(trim(p_table_name)) = 0 THEN RETURN; END IF;
  IF p_table_name !~ '^csv_[a-z0-9_]+$' AND p_table_name !~ '^data_[a-z0-9_]+$' THEN RETURN; END IF;
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', p_table_name);
END;
$$;

-- CSV import: create dynamic table + batch insert + register in tables (single RPC, one round-trip).

ALTER TABLE tables ADD COLUMN IF NOT EXISTS dynamic_table_name text;

-- Sanitize to valid identifier: lowercase, non-alphanumeric to underscore, max 63 chars.
CREATE OR REPLACE FUNCTION _csv_sanitize_ident(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    trim(both '_' from regexp_replace(lower(trim(coalesce(raw, ''))), '[^a-z0-9]+', '_', 'g')),
    63
  );
$$;

CREATE OR REPLACE FUNCTION create_csv_import_table(
  p_table_name text,
  p_columns text[],
  p_rows jsonb,
  p_display_name text
)
RETURNS TABLE(table_id uuid, created_table_name text, rows_inserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Sanitize table name and ensure prefix
  v_table_name := _csv_sanitize_ident(p_table_name);
  IF v_table_name = '' OR v_table_name IS NULL THEN
    v_table_name := 'csv_import';
  ELSE
    v_table_name := 'csv_' || v_table_name;
  END IF;

  -- Build DDL column list and INSERT column list (sanitized) and SELECT parts (json key = original header)
  FOR v_i IN 1 .. array_length(p_columns, 1) LOOP
    v_col_name := _csv_sanitize_ident(p_columns[v_i]);
    IF v_col_name = '' OR v_col_name IS NULL THEN
      v_col_name := 'col_' || v_i;
    END IF;
    IF v_i > 1 THEN
      v_ddl_cols := v_ddl_cols || ', ';
      v_insert_cols := v_insert_cols || ', ';
      v_select_parts := v_select_parts || ', ';
    END IF;
    v_ddl_cols := v_ddl_cols || format('%I text', v_col_name);
    v_insert_cols := v_insert_cols || format('%I', v_col_name);
    -- JSON key = original header; escape single quotes for SQL string
    v_select_parts := v_select_parts || '(r->>' || quote_literal(p_columns[v_i]) || ')';
  END LOOP;

  IF v_ddl_cols = '' THEN
    RAISE EXCEPTION 'At least one column required';
  END IF;

  v_new_table_name := v_table_name;
  -- Avoid duplicate table name: append suffix if exists
  v_i := 0;
  WHILE EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_new_table_name) LOOP
    v_i := v_i + 1;
    v_new_table_name := v_table_name || '_' || v_i;
  END LOOP;

  -- CREATE TABLE
  v_sql := format('CREATE TABLE %I (id serial PRIMARY KEY, %s)', v_new_table_name, v_ddl_cols);
  EXECUTE v_sql;

  -- Batch INSERT: one statement from jsonb array
  v_sql := format(
    'INSERT INTO %I (%s) SELECT %s FROM jsonb_array_elements($1) AS r',
    v_new_table_name,
    v_insert_cols,
    v_select_parts
  );
  EXECUTE v_sql USING p_rows;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- Register in tables (same transaction)
  v_meta_id := gen_random_uuid();
  INSERT INTO tables (id, name, section, column_headers, dynamic_table_name, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), 'campaign', to_jsonb(p_columns), v_new_table_name, now());

  table_id := v_meta_id;
  created_table_name := v_new_table_name;
  rows_inserted := v_rows_inserted;
  RETURN NEXT;
END;
$$;

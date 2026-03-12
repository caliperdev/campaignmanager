-- Migrate placement data from csv_* dynamic tables into placements table, then drop dynamic tables.

DO $$
DECLARE
  r RECORD;
  v_sql text;
  v_cols text[] := ARRAY[
    'placement_id', 'placement', 'format', 'deal', 'start_date', 'end_date', 'impressions',
    'cpm_client', 'cpm_adops', 'trafficker', 'am', 'qa_am', 'order_campaign_id', 'order_campaign',
    'insertion_order_id_dsp', 'insertion_order_name', 'dark_days', 'per_day_impressions',
    'dark_ranges', 'assigned_ranges', 'cpm_celtra', 'budget_adops', 'budget_client', 'pacing',
    'targeting_audience', 'important', 'kpi', 'kpi_vcr', 'kpi_ctr', 'kpi_view', 'kpi_bsafe',
    'kpi_oog', 'kpi_ivt', 'teams_sharepoint', 'dsp', 'ads', 'vrf', 'placement_group_id'
  ];
  v_dst_cols text;
  v_src_cols text;
  v_col text;
  v_exists boolean;
BEGIN
  FOR r IN (
    SELECT id, dynamic_table_name
    FROM orders
    WHERE dynamic_table_name IS NOT NULL
      AND trim(dynamic_table_name) <> ''
      AND dynamic_table_name ~ '^csv_[a-z0-9_]+$'
  ) LOOP
    -- Delete existing placements for this order (from insertPlacementsBatch double-insert)
    DELETE FROM placements WHERE order_id = r.id;

    -- Build column lists: only include columns that exist in the dynamic table
    v_dst_cols := 'order_id';
    v_src_cols := format('%L::uuid', r.id);
    FOREACH v_col IN ARRAY v_cols LOOP
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = r.dynamic_table_name AND column_name = v_col
      ) INTO v_exists;
      IF v_exists THEN
        v_dst_cols := v_dst_cols || ', ' || quote_ident(v_col);
        v_src_cols := v_src_cols || ', d.' || quote_ident(v_col);
      END IF;
    END LOOP;

    v_sql := format(
      'INSERT INTO placements (%s) SELECT %s FROM %I d',
      v_dst_cols,
      v_src_cols,
      r.dynamic_table_name
    );
    EXECUTE v_sql;

    -- Clear dynamic_table_name on the order
    UPDATE orders SET dynamic_table_name = NULL, column_headers = NULL WHERE id = r.id;

    -- Drop the dynamic table
    PERFORM drop_dynamic_table(r.dynamic_table_name);
  END LOOP;
END;
$$;

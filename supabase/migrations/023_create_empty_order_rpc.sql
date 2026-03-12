-- RPC: Create an empty order with a new dynamic table (no CSV data).
CREATE OR REPLACE FUNCTION create_empty_order(p_display_name text)
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
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name,
    '["Advertiser","Order Number","Order Campaign ID","Order Campaign","Agency","Category","Placement ID","Placement","Format","Deal","Start Date","End Date","Impressions","CPM"]'::jsonb,
    now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  RETURN NEXT;
END;
$$;

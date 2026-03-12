-- Swap hierarchy: Campaign > Order (was Order > Campaign).
-- Campaigns get agency_id and advertiser; orders get campaign_id.

-- 1. Add new columns (nullable for migration)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS advertiser text;

-- 2. Backfill campaigns: copy agency_id and advertiser from their current order
UPDATE campaigns c
SET
  agency_id = o.agency_id,
  advertiser = o.advertiser
FROM orders o
WHERE c.order_id = o.id;

-- 3. Backfill orders: set campaign_id to the campaign that currently points to this order
UPDATE orders o
SET campaign_id = c.id
FROM campaigns c
WHERE c.order_id = o.id;

-- 4. Make campaign_id required on orders (all rows now have it)
ALTER TABLE orders ALTER COLUMN campaign_id SET NOT NULL;

-- 5. Drop old FK and columns
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_order_id_fkey;
ALTER TABLE campaigns DROP COLUMN IF EXISTS order_id;
DROP INDEX IF EXISTS idx_campaigns_order_id;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_agency_id_fkey;
ALTER TABLE orders DROP COLUMN IF EXISTS agency_id;
DROP INDEX IF EXISTS idx_orders_agency_id;

ALTER TABLE orders DROP COLUMN IF EXISTS advertiser;

-- 6. Index for orders by campaign
CREATE INDEX IF NOT EXISTS idx_orders_campaign_id ON orders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_agency_id ON campaigns(agency_id);

-- 7. Recreate create_empty_order: order belongs to campaign (p_campaign_id, p_display_name)
DROP FUNCTION IF EXISTS create_empty_order(uuid, text);
DROP FUNCTION IF EXISTS create_empty_order(uuid, text, text);
DROP FUNCTION IF EXISTS create_empty_order(text);
DROP FUNCTION IF EXISTS create_empty_order(text, uuid);

CREATE OR REPLACE FUNCTION create_empty_order(
  p_campaign_id uuid,
  p_display_name text DEFAULT 'Untitled'
)
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
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, campaign_id, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name,
    '["Advertiser","Order Number","Order Campaign ID","Order Campaign","Agency","Category","Placement ID","Placement","Format","Deal","Start Date","End Date","Impressions","CPM"]'::jsonb,
    p_campaign_id, now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  RETURN NEXT;
END;
$$;

-- 8. create_csv_import_table: accept p_campaign_id instead of p_agency_id (if exists)
DROP FUNCTION IF EXISTS create_csv_import_table(text, text[], jsonb, text);
DROP FUNCTION IF EXISTS create_csv_import_table(text, text[], jsonb, text, uuid);

CREATE OR REPLACE FUNCTION create_csv_import_table(
  p_table_name text,
  p_columns text[],
  p_rows jsonb,
  p_display_name text,
  p_campaign_id uuid
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
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, campaign_id, updated_at)
  VALUES (v_meta_id, coalesce(nullif(trim(p_display_name), ''), v_new_table_name), v_new_table_name, to_jsonb(p_columns), p_campaign_id, now());

  order_id := v_meta_id;
  created_table_name := v_new_table_name;
  rows_inserted := v_rows_inserted;
  RETURN NEXT;
END;
$$;

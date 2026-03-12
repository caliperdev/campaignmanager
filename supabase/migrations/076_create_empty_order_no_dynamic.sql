-- Update create_empty_order to not create dynamic tables. Orders use placements table only.
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
  v_meta_id uuid;
BEGIN
  v_meta_id := gen_random_uuid();
  INSERT INTO orders (id, name, dynamic_table_name, column_headers, campaign_id, updated_at)
  VALUES (
    v_meta_id,
    coalesce(nullif(trim(p_display_name), ''), 'Untitled'),
    NULL,
    NULL,
    p_campaign_id,
    now()
  );

  order_id := v_meta_id;
  created_table_name := NULL;
  RETURN NEXT;
END;
$$;

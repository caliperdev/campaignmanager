-- RPC: count placements for an order where today overlaps with start_date..end_date.
-- Active = (start_date::date) <= (current_date + 1) AND (end_date::date) >= (current_date - 1).
-- Handles both placements table and dynamic tables.
CREATE OR REPLACE FUNCTION get_order_active_placement_count(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint := 0;
  v_dynamic_table text;
BEGIN
  -- Check if order uses dynamic table or placements table
  SELECT o.dynamic_table_name INTO v_dynamic_table
  FROM orders o
  WHERE o.id = p_order_id;

  IF v_dynamic_table IS NOT NULL AND trim(v_dynamic_table) <> '' THEN
    -- Count from dynamic table
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND (start_date::date) <= (current_date + 1) AND (end_date::date) >= (current_date - 1)',
        v_dynamic_table
      ) INTO v_count;
    EXCEPTION WHEN OTHERS THEN
      v_count := 0;
    END;
  ELSE
    -- Count from placements table
    SELECT count(*)::bigint INTO v_count
    FROM placements p
    WHERE p.order_id = p_order_id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
      AND (p.start_date::date) <= (current_date + 1)
      AND (p.end_date::date) >= (current_date - 1);
  END IF;

  IF v_count IS NULL THEN v_count := 0; END IF;
  RETURN (v_count)::int;
END;
$$;

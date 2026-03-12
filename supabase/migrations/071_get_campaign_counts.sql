-- Add get_all_campaign_counts RPC. Active = placement where current_date is between start_date and end_date (inclusive).
CREATE OR REPLACE FUNCTION get_all_campaign_counts()
RETURNS TABLE(
  campaign_id uuid,
  active_placement_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_active_placement_count bigint;
  v_tbl_active bigint;
  v_tbl text;
BEGIN
  FOR r IN SELECT id FROM campaigns LOOP
    v_active_placement_count := 0;

    -- Placements from placements table
    SELECT count(*)::bigint INTO v_active_placement_count
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    WHERE o.campaign_id = r.id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
      AND current_date >= (p.start_date::date)
      AND current_date <= (p.end_date::date);
    IF v_active_placement_count IS NULL THEN v_active_placement_count := 0; END IF;

    -- Placements from dynamic tables
    FOR v_tbl IN
      SELECT o.dynamic_table_name
      FROM orders o
      WHERE o.campaign_id = r.id
        AND o.dynamic_table_name IS NOT NULL
        AND o.dynamic_table_name <> ''
    LOOP
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND current_date >= (start_date::date) AND current_date <= (end_date::date)',
          v_tbl
        ) INTO v_tbl_active;
        v_active_placement_count := v_active_placement_count + v_tbl_active;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    campaign_id := r.id;
    active_placement_count := v_active_placement_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- RPC: get placement counts by status (live, upcoming, ended) per campaign.
-- Handles both placements table and dynamic tables.
CREATE OR REPLACE FUNCTION get_campaign_placement_counts_by_status()
RETURNS TABLE(campaign_id uuid, live_count bigint, upcoming_count bigint, ended_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_live bigint := 0;
  v_upcoming bigint := 0;
  v_ended bigint := 0;
  v_tbl text;
  v_tbl_live bigint;
  v_tbl_upcoming bigint;
  v_tbl_ended bigint;
BEGIN
  FOR r IN SELECT id FROM campaigns LOOP
    v_live := 0;
    v_upcoming := 0;
    v_ended := 0;

    -- Placements table
    SELECT
      count(*) FILTER (WHERE current_date >= (p.start_date::date) AND current_date <= (p.end_date::date)),
      count(*) FILTER (WHERE (p.start_date::date) > current_date),
      count(*) FILTER (WHERE (p.end_date::date) < current_date)
    INTO v_live, v_upcoming, v_ended
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    WHERE o.campaign_id = r.id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> '';

    IF v_live IS NULL THEN v_live := 0; END IF;
    IF v_upcoming IS NULL THEN v_upcoming := 0; END IF;
    IF v_ended IS NULL THEN v_ended := 0; END IF;

    -- Dynamic tables
    FOR v_tbl IN
      SELECT o.dynamic_table_name
      FROM orders o
      WHERE o.campaign_id = r.id
        AND o.dynamic_table_name IS NOT NULL
        AND o.dynamic_table_name <> ''
    LOOP
      BEGIN
        EXECUTE format(
          'SELECT count(*) FILTER (WHERE current_date >= (start_date::date) AND current_date <= (end_date::date)), count(*) FILTER (WHERE (start_date::date) > current_date), count(*) FILTER (WHERE (end_date::date) < current_date) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> ''''',
          v_tbl
        ) INTO v_tbl_live, v_tbl_upcoming, v_tbl_ended;
        v_live := v_live + COALESCE(v_tbl_live, 0);
        v_upcoming := v_upcoming + COALESCE(v_tbl_upcoming, 0);
        v_ended := v_ended + COALESCE(v_tbl_ended, 0);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    campaign_id := r.id;
    live_count := v_live;
    upcoming_count := v_upcoming;
    ended_count := v_ended;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- RPC: get placement counts by status for all orders (batch).
CREATE OR REPLACE FUNCTION get_all_order_placement_counts_by_status()
RETURNS TABLE(order_id uuid, live_count bigint, upcoming_count bigint, ended_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_dynamic_table text;
  v_live bigint := 0;
  v_upcoming bigint := 0;
  v_ended bigint := 0;
BEGIN
  FOR r IN SELECT id FROM orders LOOP
    v_live := 0;
    v_upcoming := 0;
    v_ended := 0;

    SELECT o.dynamic_table_name INTO v_dynamic_table
    FROM orders o WHERE o.id = r.id;

    IF v_dynamic_table IS NOT NULL AND trim(v_dynamic_table) <> '' THEN
      BEGIN
        EXECUTE format(
          'SELECT count(*) FILTER (WHERE current_date >= (start_date::date) AND current_date <= (end_date::date)), count(*) FILTER (WHERE (start_date::date) > current_date), count(*) FILTER (WHERE (end_date::date) < current_date) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> ''''',
          v_dynamic_table
        ) INTO v_live, v_upcoming, v_ended;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    ELSE
      SELECT
        count(*) FILTER (WHERE current_date >= (p.start_date::date) AND current_date <= (p.end_date::date)),
        count(*) FILTER (WHERE (p.start_date::date) > current_date),
        count(*) FILTER (WHERE (p.end_date::date) < current_date)
      INTO v_live, v_upcoming, v_ended
      FROM placements p
      WHERE p.order_id = r.id
        AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
        AND p.end_date IS NOT NULL AND trim(p.end_date) <> '';
    END IF;

    order_id := r.id;
    live_count := COALESCE(v_live, 0);
    upcoming_count := COALESCE(v_upcoming, 0);
    ended_count := COALESCE(v_ended, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

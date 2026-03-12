-- RPC: get campaign status (upcoming, live, ended) from placement dates.
-- Live: any placement has current_date between start_date and end_date.
-- Upcoming: no live AND any placement has start_date > current_date.
-- Ended: otherwise.
-- Handles both placements table and dynamic tables.
CREATE OR REPLACE FUNCTION get_campaign_statuses()
RETURNS TABLE(campaign_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_has_live boolean := false;
  v_has_upcoming boolean := false;
  v_tbl_live bigint;
  v_tbl_upcoming bigint;
  v_tbl text;
  v_status text;
BEGIN
  FOR r IN SELECT id FROM campaigns LOOP
    v_has_live := false;
    v_has_upcoming := false;

    -- Placements table: check for live
    SELECT EXISTS(
      SELECT 1 FROM placements p
      JOIN orders o ON p.order_id = o.id
      WHERE o.campaign_id = r.id
        AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
        AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
        AND current_date >= (p.start_date::date)
        AND current_date <= (p.end_date::date)
    ) INTO v_has_live;

    -- Placements table: check for upcoming (only if not live)
    IF NOT v_has_live THEN
      SELECT EXISTS(
        SELECT 1 FROM placements p
        JOIN orders o ON p.order_id = o.id
        WHERE o.campaign_id = r.id
          AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
          AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
          AND (p.start_date::date) > current_date
      ) INTO v_has_upcoming;
    END IF;

    -- Dynamic tables
    IF NOT v_has_live OR NOT v_has_upcoming THEN
      FOR v_tbl IN
        SELECT o.dynamic_table_name
        FROM orders o
        WHERE o.campaign_id = r.id
          AND o.dynamic_table_name IS NOT NULL
          AND o.dynamic_table_name <> ''
      LOOP
        BEGIN
          IF NOT v_has_live THEN
            EXECUTE format(
              'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND current_date >= (start_date::date) AND current_date <= (end_date::date)',
              v_tbl
            ) INTO v_tbl_live;
            IF v_tbl_live > 0 THEN v_has_live := true; END IF;
          END IF;
          IF NOT v_has_live AND NOT v_has_upcoming THEN
            EXECUTE format(
              'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND (start_date::date) > current_date',
              v_tbl
            ) INTO v_tbl_upcoming;
            IF v_tbl_upcoming > 0 THEN v_has_upcoming := true; END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END LOOP;
    END IF;

    IF v_has_live THEN
      v_status := 'live';
    ELSIF v_has_upcoming THEN
      v_status := 'upcoming';
    ELSE
      v_status := 'ended';
    END IF;

    campaign_id := r.id;
    status := v_status;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- RPC: get order status for all orders (upcoming, live, ended).
-- Same logic as campaigns but per order.
CREATE OR REPLACE FUNCTION get_all_order_statuses()
RETURNS TABLE(order_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_has_live boolean := false;
  v_has_upcoming boolean := false;
  v_dynamic_table text;
  v_count bigint;
BEGIN
  FOR r IN SELECT id FROM orders LOOP
    v_has_live := false;
    v_has_upcoming := false;

    SELECT o.dynamic_table_name INTO v_dynamic_table
    FROM orders o WHERE o.id = r.id;

    IF v_dynamic_table IS NOT NULL AND trim(v_dynamic_table) <> '' THEN
      -- Dynamic table
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND current_date >= (start_date::date) AND current_date <= (end_date::date)',
          v_dynamic_table
        ) INTO v_count;
        IF v_count > 0 THEN v_has_live := true; END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      IF NOT v_has_live THEN
        BEGIN
          EXECUTE format(
            'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND (start_date::date) > current_date',
            v_dynamic_table
          ) INTO v_count;
          IF v_count > 0 THEN v_has_upcoming := true; END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    ELSE
      -- Placements table
      SELECT EXISTS(
        SELECT 1 FROM placements p
        WHERE p.order_id = r.id
          AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
          AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
          AND current_date >= (p.start_date::date)
          AND current_date <= (p.end_date::date)
      ) INTO v_has_live;
      IF NOT v_has_live THEN
        SELECT EXISTS(
          SELECT 1 FROM placements p
          WHERE p.order_id = r.id
            AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
            AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
            AND (p.start_date::date) > current_date
        ) INTO v_has_upcoming;
      END IF;
    END IF;

    order_id := r.id;
    IF v_has_live THEN
      status := 'live';
    ELSIF v_has_upcoming THEN
      status := 'upcoming';
    ELSE
      status := 'ended';
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

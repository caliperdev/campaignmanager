-- Widen active placement date check to account for timezone differences.
-- Count placement as "active" if it overlaps with (current_date - 1, current_date + 1).
-- This ensures placements show green when the user's local date is in range.
DROP FUNCTION IF EXISTS get_all_client_counts();
CREATE FUNCTION get_all_client_counts()
RETURNS TABLE(
  client_id uuid,
  agency_count int,
  advertiser_count int,
  campaign_count int,
  order_count int,
  placement_count bigint,
  active_placement_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_agency_count int;
  v_advertiser_count int;
  v_campaign_count int;
  v_order_count int;
  v_placement_count bigint;
  v_active_placement_count bigint;
  v_tbl_count bigint;
  v_tbl_active bigint;
  v_tbl text;
BEGIN
  FOR r IN SELECT id FROM clients LOOP
    SELECT count(*)::int INTO v_agency_count
    FROM agencies ag WHERE ag.client_id = r.id;

    SELECT count(DISTINCT c.advertiser_id)::int INTO v_advertiser_count
    FROM campaigns c
    JOIN agencies ag ON c.agency_id = ag.id
    WHERE ag.client_id = r.id;

    SELECT count(*)::int INTO v_campaign_count
    FROM campaigns c
    JOIN agencies ag ON c.agency_id = ag.id
    WHERE ag.client_id = r.id;

    SELECT count(*)::int INTO v_order_count
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    JOIN agencies ag ON c.agency_id = ag.id
    WHERE ag.client_id = r.id;

    v_placement_count := 0;
    v_active_placement_count := 0;

    SELECT count(*)::bigint INTO v_placement_count
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    JOIN agencies ag ON c.agency_id = ag.id
    WHERE ag.client_id = r.id;
    IF v_placement_count IS NULL THEN v_placement_count := 0; END IF;

    SELECT count(*)::bigint INTO v_active_placement_count
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    JOIN agencies ag ON c.agency_id = ag.id
    WHERE ag.client_id = r.id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
      AND (p.start_date::date) <= (current_date + 1)
      AND (p.end_date::date) >= (current_date - 1);
    IF v_active_placement_count IS NULL THEN v_active_placement_count := 0; END IF;

    FOR v_tbl IN
      SELECT o.dynamic_table_name
      FROM orders o
      JOIN campaigns c ON o.campaign_id = c.id
      JOIN agencies ag ON c.agency_id = ag.id
      WHERE ag.client_id = r.id
        AND o.dynamic_table_name IS NOT NULL
        AND o.dynamic_table_name <> ''
    LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I', v_tbl) INTO v_tbl_count;
        v_placement_count := v_placement_count + v_tbl_count;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND (start_date::date) <= (current_date + 1) AND (end_date::date) >= (current_date - 1)',
          v_tbl
        ) INTO v_tbl_active;
        v_active_placement_count := v_active_placement_count + v_tbl_active;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    client_id := r.id;
    agency_count := v_agency_count;
    advertiser_count := v_advertiser_count;
    campaign_count := v_campaign_count;
    order_count := v_order_count;
    placement_count := v_placement_count;
    active_placement_count := v_active_placement_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS get_all_agency_counts();
CREATE FUNCTION get_all_agency_counts()
RETURNS TABLE(
  agency_id uuid,
  advertiser_count int,
  order_count int,
  campaign_count int,
  placement_count bigint,
  active_placement_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_advertiser_count int;
  v_order_count int;
  v_campaign_count int;
  v_placement_count bigint;
  v_active_placement_count bigint;
  v_tbl_count bigint;
  v_tbl_active bigint;
  v_tbl text;
BEGIN
  FOR r IN SELECT id FROM agencies LOOP
    SELECT count(DISTINCT c.advertiser_id)::int INTO v_advertiser_count
    FROM campaigns c WHERE c.agency_id = r.id;

    SELECT count(*)::int INTO v_campaign_count
    FROM campaigns WHERE campaigns.agency_id = r.id;

    SELECT count(*)::int INTO v_order_count
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.agency_id = r.id;

    v_placement_count := 0;
    v_active_placement_count := 0;

    SELECT count(*)::bigint INTO v_placement_count
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.agency_id = r.id;
    IF v_placement_count IS NULL THEN v_placement_count := 0; END IF;

    SELECT count(*)::bigint INTO v_active_placement_count
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.agency_id = r.id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
      AND (p.start_date::date) <= (current_date + 1)
      AND (p.end_date::date) >= (current_date - 1);
    IF v_active_placement_count IS NULL THEN v_active_placement_count := 0; END IF;

    FOR v_tbl IN
      SELECT o.dynamic_table_name
      FROM orders o
      JOIN campaigns c ON o.campaign_id = c.id
      WHERE c.agency_id = r.id
        AND o.dynamic_table_name IS NOT NULL
        AND o.dynamic_table_name <> ''
    LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I', v_tbl) INTO v_tbl_count;
        v_placement_count := v_placement_count + v_tbl_count;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND (start_date::date) <= (current_date + 1) AND (end_date::date) >= (current_date - 1)',
          v_tbl
        ) INTO v_tbl_active;
        v_active_placement_count := v_active_placement_count + v_tbl_active;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    agency_id := r.id;
    advertiser_count := v_advertiser_count;
    order_count := v_order_count;
    campaign_count := v_campaign_count;
    placement_count := v_placement_count;
    active_placement_count := v_active_placement_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

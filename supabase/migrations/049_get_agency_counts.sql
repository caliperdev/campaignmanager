-- RPC: Get counts for all agencies in one call.
CREATE OR REPLACE FUNCTION get_all_agency_counts()
RETURNS TABLE(agency_id uuid, advertiser_count int, order_count int, campaign_count int, placement_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r record;
  v_advertiser_count int;
  v_order_count int;
  v_campaign_count int;
  v_placement_count bigint;
  v_tbl_count bigint;
  v_tbl text;
BEGIN
  FOR r IN SELECT id FROM agencies LOOP
    SELECT count(DISTINCT c.advertiser_id)::int INTO v_advertiser_count
    FROM campaigns c WHERE c.agency_id = r.id;

    SELECT count(*)::int INTO v_campaign_count
    FROM campaigns WHERE agency_id = r.id;

    SELECT count(*)::int INTO v_order_count
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.agency_id = r.id;

    v_placement_count := 0;
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
    END LOOP;

    agency_id := r.id;
    advertiser_count := v_advertiser_count;
    order_count := v_order_count;
    campaign_count := v_campaign_count;
    placement_count := v_placement_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

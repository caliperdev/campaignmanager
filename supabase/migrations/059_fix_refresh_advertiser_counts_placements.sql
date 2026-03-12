-- Fix refresh_advertiser_counts: include placements from placements table (not just dynamic tables).
CREATE OR REPLACE FUNCTION refresh_advertiser_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  ord_cnt int;
  camp_cnt int;
  plac_cnt bigint := 0;
  tbl_cnt bigint;
  tbl text;
BEGIN
  FOR r IN SELECT id FROM advertisers LOOP
    SELECT count(*)::int INTO camp_cnt FROM campaigns WHERE advertiser_id = r.id;

    SELECT count(*)::int INTO ord_cnt
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id;

    plac_cnt := 0;
    -- Placements from placements table
    SELECT count(*)::bigint INTO plac_cnt
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id;
    IF plac_cnt IS NULL THEN plac_cnt := 0; END IF;

    -- Placements from dynamic tables
    FOR tbl IN
      SELECT o.dynamic_table_name
      FROM orders o
      JOIN campaigns c ON o.campaign_id = c.id
      WHERE c.advertiser_id = r.id
        AND o.dynamic_table_name IS NOT NULL
        AND o.dynamic_table_name <> ''
    LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I', tbl) INTO tbl_cnt;
        plac_cnt := plac_cnt + tbl_cnt;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    UPDATE advertisers
    SET campaign_count = camp_cnt, order_count = ord_cnt, placement_count = plac_cnt::int
    WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT refresh_advertiser_counts();

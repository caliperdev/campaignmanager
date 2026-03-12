-- Add active_placement_count to advertisers. Active = placement where current_date is between start_date and end_date (inclusive).
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS active_placement_count int NOT NULL DEFAULT 0;

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
  active_plac_cnt bigint := 0;
  tbl_cnt bigint;
  tbl_active bigint;
  tbl text;
BEGIN
  FOR r IN SELECT id FROM advertisers LOOP
    SELECT count(*)::int INTO camp_cnt FROM campaigns WHERE advertiser_id = r.id;

    SELECT count(*)::int INTO ord_cnt
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id;

    plac_cnt := 0;
    active_plac_cnt := 0;

    -- Placements from placements table (total + active)
    SELECT count(*)::bigint INTO plac_cnt
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id;
    IF plac_cnt IS NULL THEN plac_cnt := 0; END IF;

    SELECT count(*)::bigint INTO active_plac_cnt
    FROM placements p
    JOIN orders o ON p.order_id = o.id
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id
      AND p.start_date IS NOT NULL AND trim(p.start_date) <> ''
      AND p.end_date IS NOT NULL AND trim(p.end_date) <> ''
      AND current_date >= (p.start_date::date)
      AND current_date <= (p.end_date::date);
    IF active_plac_cnt IS NULL THEN active_plac_cnt := 0; END IF;

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
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE start_date IS NOT NULL AND trim(start_date) <> '''' AND end_date IS NOT NULL AND trim(end_date) <> '''' AND current_date >= (start_date::date) AND current_date <= (end_date::date)',
          tbl
        ) INTO tbl_active;
        active_plac_cnt := active_plac_cnt + tbl_active;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    UPDATE advertisers
    SET campaign_count = camp_cnt, order_count = ord_cnt, placement_count = plac_cnt::int, active_placement_count = active_plac_cnt::int
    WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT refresh_advertiser_counts();

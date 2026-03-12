-- Simplify advertisers: name + counts only. Remove client_id, agency_id.

-- 1. Drop client/agency columns and indexes
DROP INDEX IF EXISTS idx_advertisers_client_id;
DROP INDEX IF EXISTS idx_advertisers_agency_id;
ALTER TABLE advertisers DROP COLUMN IF EXISTS client_id;
ALTER TABLE advertisers DROP COLUMN IF EXISTS agency_id;

-- 2. Rename name to advertiser, add count columns
ALTER TABLE advertisers RENAME COLUMN name TO advertiser;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS order_count int NOT NULL DEFAULT 0;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS campaign_count int NOT NULL DEFAULT 0;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS placement_count int NOT NULL DEFAULT 0;

-- 3. Function to refresh advertiser counts
CREATE OR REPLACE FUNCTION refresh_advertiser_counts()
RETURNS void AS $$
DECLARE
  r record;
  ord_cnt int;
  camp_cnt int;
  plac_cnt bigint := 0;
  tbl_cnt bigint;
  tbl text;
BEGIN
  FOR r IN SELECT id FROM advertisers LOOP
    -- campaign count
    SELECT count(*)::int INTO camp_cnt FROM campaigns WHERE advertiser_id = r.id;
    
    -- order count
    SELECT count(*)::int INTO ord_cnt
    FROM orders o
    JOIN campaigns c ON o.campaign_id = c.id
    WHERE c.advertiser_id = r.id;
    
    -- placement count (sum of rows in each order's dynamic table)
    plac_cnt := 0;
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
        NULL; -- skip invalid tables
      END;
    END LOOP;
    
    UPDATE advertisers
    SET campaign_count = camp_cnt, order_count = ord_cnt, placement_count = plac_cnt::int
    WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Backfill counts
SELECT refresh_advertiser_counts();

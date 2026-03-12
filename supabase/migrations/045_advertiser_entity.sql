-- Advertiser as entity: campaigns belong to advertisers; agency becomes optional on campaigns.

-- 1. Create advertisers table
CREATE TABLE IF NOT EXISTS advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advertisers_client_id ON advertisers(client_id);

-- 2. Seed from static list (matches ADVERTISER_OPTIONS in src/lib/advertisers.ts)
INSERT INTO advertisers (name)
SELECT n FROM unnest(ARRAY[
  'AbbVie', 'AT&T', 'CMS', 'Coca Cola', 'Disney', 'Eli Lilly', 'Hulu', 'Kaiser',
  'Kia', 'Lexus', 'McDonald''s', 'Northgate', 'Paramount', 'Sephora', 'Toyota',
  'Universal', 'Verizon', 'Walgreens'
]) AS n
WHERE NOT EXISTS (SELECT 1 FROM advertisers a WHERE a.name = n);

-- 3. Insert distinct campaign.advertiser values that don't exist yet (by name)
INSERT INTO advertisers (name)
SELECT DISTINCT trim(c.advertiser)
FROM campaigns c
WHERE c.advertiser IS NOT NULL AND trim(c.advertiser) <> ''
  AND NOT EXISTS (SELECT 1 FROM advertisers a WHERE a.name = trim(c.advertiser));

-- 4. Ensure one fallback for campaigns with null/empty advertiser
INSERT INTO advertisers (name)
SELECT 'No advertiser'
WHERE NOT EXISTS (SELECT 1 FROM advertisers WHERE name = 'No advertiser');

-- 5. Add advertiser_id to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS advertiser_id uuid REFERENCES advertisers(id) ON DELETE CASCADE;

-- 6. Backfill: set advertiser_id from matching advertiser name
UPDATE campaigns c
SET advertiser_id = a.id
FROM advertisers a
WHERE a.name = trim(c.advertiser) AND c.advertiser IS NOT NULL AND trim(c.advertiser) <> '';

-- 7. Backfill: campaigns with null/empty advertiser get "No advertiser"
UPDATE campaigns c
SET advertiser_id = (SELECT id FROM advertisers WHERE name = 'No advertiser' LIMIT 1)
WHERE c.advertiser_id IS NULL;

-- 8. Make advertiser_id required
ALTER TABLE campaigns ALTER COLUMN advertiser_id SET NOT NULL;

-- 9. Drop old advertiser text column
ALTER TABLE campaigns DROP COLUMN IF EXISTS advertiser;

-- 10. Index for campaigns by advertiser
CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser_id ON campaigns(advertiser_id);

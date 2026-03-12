-- Campaign requires advertiser_id, agency_id, and client_id (all three required).

-- 1. Ensure "No agency" exists
INSERT INTO agencies (name)
SELECT 'No agency'
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE name = 'No agency');

-- 2. Ensure "No client" exists
INSERT INTO clients (name)
SELECT 'No client'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE name = 'No client');

-- 3. Backfill null agency_id
UPDATE campaigns
SET agency_id = (SELECT id FROM agencies WHERE name = 'No agency' LIMIT 1)
WHERE agency_id IS NULL;

-- 4. Backfill null client_id
UPDATE campaigns
SET client_id = (SELECT id FROM clients WHERE name = 'No client' LIMIT 1)
WHERE client_id IS NULL;

-- 5. Make agency_id and client_id required
ALTER TABLE campaigns ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN client_id SET NOT NULL;

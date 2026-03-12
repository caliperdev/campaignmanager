-- Restore campaigns that belonged to client "Relevant" (or "Relevant+") from "No client".
-- Migration 068 backfilled all null campaign.client_id to "No client", but those campaigns
-- previously belonged to Relevant via agency.client_id (removed in 066). This restores that link.
-- Skip or modify this migration if your data differs.

UPDATE campaigns c
SET client_id = COALESCE(
  (SELECT id FROM clients WHERE name = 'Relevant' LIMIT 1),
  (SELECT id FROM clients WHERE name = 'Relevant+' LIMIT 1)
)
WHERE c.client_id = (SELECT id FROM clients WHERE name = 'No client' LIMIT 1)
  AND COALESCE(
    (SELECT id FROM clients WHERE name = 'Relevant' LIMIT 1),
    (SELECT id FROM clients WHERE name = 'Relevant+' LIMIT 1)
  ) IS NOT NULL;

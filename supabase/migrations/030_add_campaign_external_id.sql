-- Optional external Campaign ID for campaigns (e.g. from another system).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS external_id text;

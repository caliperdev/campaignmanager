-- Optional agency reference on advertisers
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_advertisers_agency_id ON advertisers(agency_id);

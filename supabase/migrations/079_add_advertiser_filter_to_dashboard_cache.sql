-- Add advertiser_filter to dashboard_cache for independent filtering.
-- Filters work individually: io_filter, advertiser_filter, or both.

-- Add advertiser_filter column (default '' = all advertisers)
ALTER TABLE dashboard_cache ADD COLUMN IF NOT EXISTS advertiser_filter text NOT NULL DEFAULT '';

-- Drop old PK and indexes
ALTER TABLE dashboard_cache DROP CONSTRAINT IF EXISTS dashboard_cache_pkey;
DROP INDEX IF EXISTS idx_dashboard_cache_lookup;
DROP INDEX IF EXISTS idx_dashboard_cache_updated;

-- New composite primary key
ALTER TABLE dashboard_cache ADD PRIMARY KEY (io_filter, advertiser_filter, year_month);

-- Indexes for lookups
CREATE INDEX idx_dashboard_cache_lookup ON dashboard_cache(io_filter, advertiser_filter);
CREATE INDEX idx_dashboard_cache_updated ON dashboard_cache(io_filter, advertiser_filter, updated_at);

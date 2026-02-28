-- Monitor cache: pre-computed results per (campaign_id, source_id) for the impressions table.
-- Stores raw values; formulas (Booked Revenue vs Total Cost, Margin) computed in UI.

CREATE TABLE IF NOT EXISTS monitor_cache (
  campaign_id uuid NOT NULL,
  source_id uuid NOT NULL,
  year_month text NOT NULL,
  active_campaign_count integer DEFAULT 0,
  booked_impressions bigint DEFAULT 0,
  delivered_impressions bigint DEFAULT 0,
  delivered_lines bigint DEFAULT 0,
  media_cost numeric DEFAULT 0,
  media_fees numeric DEFAULT 0,
  celtra_cost numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  booked_revenue numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, source_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monitor_cache_lookup ON monitor_cache(campaign_id, source_id);
CREATE INDEX IF NOT EXISTS idx_monitor_cache_updated ON monitor_cache(campaign_id, source_id, updated_at);

-- Rename monitor_cache to dashboard_cache for dashboard persistence.
-- Dashboard: placements + DSP source aggregated by month. io_filter = '' for all, or IO value when filtered.

DROP TABLE IF EXISTS monitor_cache CASCADE;

CREATE TABLE dashboard_cache (
  io_filter text NOT NULL DEFAULT '',
  year_month text NOT NULL,
  active_order_count integer DEFAULT 0,
  booked_impressions bigint DEFAULT 0,
  delivered_impressions bigint DEFAULT 0,
  delivered_lines integer DEFAULT 0,
  media_cost numeric DEFAULT 0,
  media_fees numeric DEFAULT 0,
  celtra_cost numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  booked_revenue numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (io_filter, year_month)
);

CREATE INDEX idx_dashboard_cache_lookup ON dashboard_cache(io_filter);
CREATE INDEX idx_dashboard_cache_updated ON dashboard_cache(io_filter, updated_at);

-- Add placement_count to dashboard_cache for the Placements column.
-- Backfill from active_order_count until next Refresh overwrites with correct values.

ALTER TABLE dashboard_cache ADD COLUMN IF NOT EXISTS placement_count integer DEFAULT 0;

UPDATE dashboard_cache SET placement_count = active_order_count;

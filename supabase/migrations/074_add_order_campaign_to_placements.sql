-- Add order_campaign_id and order_campaign for sub-grouping within an order (used by campaign filter).
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS order_campaign_id text,
  ADD COLUMN IF NOT EXISTS order_campaign text;

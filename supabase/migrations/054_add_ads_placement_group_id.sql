-- Add ADS and Placement Group ID columns to placements table
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS ads text,
  ADD COLUMN IF NOT EXISTS placement_group_id text;

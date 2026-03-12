-- Add insertion_order_name to placements table (DSP section).
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS insertion_order_name text;

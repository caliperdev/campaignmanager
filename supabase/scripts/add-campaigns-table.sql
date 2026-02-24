-- Run this in Supabase SQL Editor to (re)create the campaigns table.
-- Use after a reset or when the table is missing.

-- 1. Campaigns table (001_campaigns)
CREATE TABLE IF NOT EXISTS campaigns (
  id serial PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  start_date text NOT NULL,
  end_date text NOT NULL,
  impressions_goal integer NOT NULL DEFAULT 0,
  distribution_mode text NOT NULL DEFAULT 'even',
  custom_ranges text,
  csv_data text DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Notes column (002_campaign_notes)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS notes text DEFAULT '{}';

-- Run this in Supabase SQL Editor to create the campaigns table.
-- Required for the app; all data is accessed via Supabase API only.

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

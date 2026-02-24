-- Run this in Supabase Dashboard → SQL Editor if you get:
-- "Could not find the table 'public.data_entries' in the schema cache"
--
-- Requires: campaigns (001), workspaces + tables (003) must already exist.

CREATE TABLE IF NOT EXISTS data_entries (
  id serial PRIMARY KEY,
  report_date text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  csv_data text DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_data_entries (
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  data_entry_id integer NOT NULL REFERENCES data_entries(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, data_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_table_data_entries_table_id ON table_data_entries(table_id);
CREATE INDEX IF NOT EXISTS idx_table_data_entries_data_entry_id ON table_data_entries(data_entry_id);
CREATE INDEX IF NOT EXISTS idx_data_entries_report_date ON data_entries(report_date);

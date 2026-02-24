-- Atomic reset of the Data pipeline: drop and recreate data_entries + table_data_entries.
-- Run in Supabase SQL Editor. All-or-nothing in one transaction.

BEGIN;

DROP TABLE IF EXISTS table_data_entries;
DROP TABLE IF EXISTS data_entries;

CREATE TABLE data_entries (
  id serial PRIMARY KEY,
  report_date text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  csv_data text DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE table_data_entries (
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  data_entry_id integer NOT NULL REFERENCES data_entries(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, data_entry_id)
);

CREATE INDEX idx_table_data_entries_table_id ON table_data_entries(table_id);
CREATE INDEX idx_table_data_entries_data_entry_id ON table_data_entries(data_entry_id);
CREATE INDEX idx_data_entries_report_date ON data_entries(report_date);

COMMIT;

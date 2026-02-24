-- DSP-reported impressions: one row per date for year-month aggregation on Monitor.

CREATE TABLE IF NOT EXISTS dsp_data (
  id serial PRIMARY KEY,
  report_date text NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsp_data_report_date ON dsp_data(report_date);

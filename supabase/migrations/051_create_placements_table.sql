-- Create placements table (normalized, replaces CSV-based dynamic tables).
CREATE TABLE IF NOT EXISTS placements (
  id serial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  placement_id text,
  placement text,
  trafficker text,
  am text,
  qa_am text,
  format text,
  deal text,
  start_date text,
  end_date text,
  impressions text,
  cpm_client text,
  cpm_adops text,
  insertion_order_id_dsp text,
  dark_days text,
  per_day_impressions text,
  dark_ranges text,
  assigned_ranges text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_placements_order_id ON placements(order_id);
CREATE INDEX idx_placements_insertion_order_id_dsp ON placements(insertion_order_id_dsp) WHERE insertion_order_id_dsp IS NOT NULL AND insertion_order_id_dsp <> '';

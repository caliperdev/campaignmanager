-- ERD column mapping: which campaign/source columns map to each monitor table column.
-- One row per (campaign_id, source_id). mapping is JSON: { "month": { "campaign": "Period", "source": "cr4fe_date" }, ... }

CREATE TABLE IF NOT EXISTS monitor_column_mapping (
  campaign_id uuid NOT NULL,
  source_id uuid NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, source_id)
);

-- Add new columns to placements table
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS cpm_celtra text,
  ADD COLUMN IF NOT EXISTS budget_adops text,
  ADD COLUMN IF NOT EXISTS budget_client text,
  ADD COLUMN IF NOT EXISTS pacing text,
  ADD COLUMN IF NOT EXISTS targeting_audience text,
  ADD COLUMN IF NOT EXISTS important text,
  ADD COLUMN IF NOT EXISTS kpi text,
  ADD COLUMN IF NOT EXISTS kpi_vcr text,
  ADD COLUMN IF NOT EXISTS kpi_ctr text,
  ADD COLUMN IF NOT EXISTS kpi_view text,
  ADD COLUMN IF NOT EXISTS kpi_bsafe text,
  ADD COLUMN IF NOT EXISTS kpi_oog text,
  ADD COLUMN IF NOT EXISTS kpi_ivt text,
  ADD COLUMN IF NOT EXISTS teams_sharepoint text,
  ADD COLUMN IF NOT EXISTS dsp text;

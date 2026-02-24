-- Copy-paste this entire file into Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to run multiple times (IF NOT EXISTS used throughout).
--
-- If you already have campaigns and tables and only need data_entries,
-- run only the block from "-- 006 data_entries" to the end of the file.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 001 campaigns
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

-- 002 campaign notes
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS notes text DEFAULT '{}';

-- 003+004 tables (final shape: user_id + section, no workspaces)
CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL DEFAULT 'Table',
  subtitle text,
  column_headers jsonb,
  section text NOT NULL DEFAULT 'campaign' CHECK (section IN ('campaign', 'data')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_campaigns (
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_tables_user_id ON tables(user_id);
CREATE INDEX IF NOT EXISTS idx_tables_section ON tables(section);
CREATE INDEX IF NOT EXISTS idx_table_campaigns_table_id ON table_campaigns(table_id);
CREATE INDEX IF NOT EXISTS idx_table_campaigns_campaign_id ON table_campaigns(campaign_id);

-- 005 dsp_data
CREATE TABLE IF NOT EXISTS dsp_data (
  id serial PRIMARY KEY,
  report_date text NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsp_data_report_date ON dsp_data(report_date);

-- 006 data_entries (Data pipeline – fixes "Could not find table public.data_entries")
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

-- 009 RPC: aggregation in DB for monitor/charts (no full-table fetch)
CREATE OR REPLACE FUNCTION get_data_impressions_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, sum_impressions bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT left(trim(e.report_date), 7)::text AS year_month,
         coalesce(sum(e.impressions), 0)::bigint AS sum_impressions
  FROM data_entries e
  WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
    AND (
      (p_table_id IS NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id))
      OR
      (p_table_id IS NOT NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id AND t.table_id = p_table_id))
    )
  GROUP BY left(trim(e.report_date), 7)
  ORDER BY 1;
$$;

-- 010 RPC: delivered lines (count distinct insertion order gid) by year-month for Monitor
CREATE OR REPLACE FUNCTION get_delivered_lines_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, delivered_lines bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT left(trim(e.report_date), 7)::text AS year_month,
         count(DISTINCT nullif(trim(
           coalesce(
             (e.csv_data::jsonb)->>'cr4fe_insertionordergid',
             (e.csv_data::jsonb)->>'Insertion Order GID',
             (e.csv_data::jsonb)->>'insertion order gid',
             (e.csv_data::jsonb)->>'Insertion Order Id',
             ''
           )
         ), ''))::bigint AS delivered_lines
  FROM data_entries e
  WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
    AND (
      (p_table_id IS NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id))
      OR
      (p_table_id IS NOT NULL AND EXISTS (SELECT 1 FROM table_data_entries t WHERE t.data_entry_id = e.id AND t.table_id = p_table_id))
    )
  GROUP BY left(trim(e.report_date), 7)
  ORDER BY 1;
$$;

-- 011 RPC: media cost + celtra cost by year-month for Monitor
CREATE OR REPLACE FUNCTION get_monitor_costs_by_year_month(p_table_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, media_cost numeric, celtra_cost numeric)
LANGUAGE sql
STABLE
AS $$
  WITH cpm_lookup AS (
    SELECT 
      (c.csv_data::jsonb)->>'Insertion Order ID' AS io_id,
      NULLIF(replace(replace(trim(NULLIF((c.csv_data::jsonb)->>'CPM Celtra', '')), '$', ''), ',', ''), '')::numeric AS cpm_celtra
    FROM campaigns c
    WHERE (c.csv_data::jsonb)->>'Insertion Order ID' IS NOT NULL
      AND trim((c.csv_data::jsonb)->>'Insertion Order ID') <> ''
  )
  SELECT 
    left(trim(e.report_date), 7)::text AS year_month,
    round(coalesce(sum(NULLIF(trim((e.csv_data::jsonb)->>'cr4fe_totalmediacost'), '')::numeric), 0), 2) AS media_cost,
    round(coalesce(sum(
      CASE 
        WHEN cl.cpm_celtra IS NOT NULL AND cl.cpm_celtra > 0 
        THEN e.impressions / 1000.0 * cl.cpm_celtra
        ELSE 0
      END
    ), 0), 2) AS celtra_cost
  FROM data_entries e
  JOIN table_data_entries t ON t.data_entry_id = e.id
  LEFT JOIN cpm_lookup cl ON cl.io_id = (e.csv_data::jsonb)->>'cr4fe_insertionordergid'
  WHERE e.report_date IS NOT NULL AND length(trim(e.report_date)) >= 7
    AND (
      (p_table_id IS NULL)
      OR
      (t.table_id = p_table_id)
    )
  GROUP BY left(trim(e.report_date), 7)
  ORDER BY 1;
$$;

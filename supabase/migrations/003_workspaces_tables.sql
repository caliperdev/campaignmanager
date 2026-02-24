-- Workspaces and tables (replacing localStorage). All data in Supabase.

-- Enable uuid-ossp for gen_random_uuid if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL DEFAULT 'Workspace',
  subtitle text,
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Table',
  subtitle text,
  column_headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_campaigns (
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_tables_workspace_id ON tables(workspace_id);
CREATE INDEX IF NOT EXISTS idx_table_campaigns_table_id ON table_campaigns(table_id);
CREATE INDEX IF NOT EXISTS idx_table_campaigns_campaign_id ON table_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);

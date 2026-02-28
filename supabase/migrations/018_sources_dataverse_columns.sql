-- Sources: support Dataverse view-only sources (no Supabase table).
-- Dataverse source: entity_set_name + logical_name set, dynamic_table_name null.
-- CSV source: dynamic_table_name set (existing behavior).

ALTER TABLE sources ADD COLUMN IF NOT EXISTS entity_set_name text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS logical_name text;
ALTER TABLE sources ALTER COLUMN dynamic_table_name DROP NOT NULL;

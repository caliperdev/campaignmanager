-- Flatten tables: remove workspaces, add user_id + section to tables.

ALTER TABLE tables ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'campaign';

UPDATE tables SET user_id = (SELECT user_id FROM workspaces WHERE workspaces.id = tables.workspace_id);

ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_workspace_id_fkey;
ALTER TABLE tables DROP COLUMN IF EXISTS workspace_id;

DROP INDEX IF EXISTS idx_tables_workspace_id;

ALTER TABLE tables ADD CONSTRAINT tables_section_check CHECK (section IN ('campaign', 'data'));

CREATE INDEX IF NOT EXISTS idx_tables_user_id ON tables(user_id);
CREATE INDEX IF NOT EXISTS idx_tables_section ON tables(section);

DROP TABLE IF EXISTS workspaces CASCADE;

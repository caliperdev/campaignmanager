-- Add a notes column to campaigns.
-- Stores a JSON object mapping date ISO strings to note text, e.g. {"2026-02-01": "Holiday pause"}
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS notes text DEFAULT '{}';

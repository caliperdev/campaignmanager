-- Add category column to placements table.
-- Stores the step_type category (NARRATIVE, PLAYER, TECHNICAL, GAMEOVER) or campaign category for display/filtering.
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS category text;

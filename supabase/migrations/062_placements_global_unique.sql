-- Drop per-order indexes and enforce Placement ID and Placement name globally unique.
DROP INDEX IF EXISTS idx_placements_order_placement_id_unique;
DROP INDEX IF EXISTS idx_placements_order_placement_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_placement_id_unique
  ON placements (placement_id)
  WHERE placement_id IS NOT NULL AND trim(placement_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_placement_name_unique
  ON placements (placement)
  WHERE placement IS NOT NULL AND trim(placement) <> '';

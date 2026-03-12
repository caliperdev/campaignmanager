-- Ensure Placement ID and Placement name are unique per order.
-- Only enforce for non-empty values (allow multiple null/empty).
CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_order_placement_id_unique
  ON placements (order_id, placement_id)
  WHERE placement_id IS NOT NULL AND trim(placement_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_order_placement_name_unique
  ON placements (order_id, placement)
  WHERE placement IS NOT NULL AND trim(placement) <> '';

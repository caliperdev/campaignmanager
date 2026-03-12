-- Add VRF (Verifier) column to placements table.
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS vrf text;

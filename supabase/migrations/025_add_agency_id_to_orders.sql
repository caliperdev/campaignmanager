-- Add agency_id to orders; orders belong to an agency.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id);
CREATE INDEX IF NOT EXISTS idx_orders_agency_id ON orders(agency_id);

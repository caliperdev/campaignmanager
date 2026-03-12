-- Add document_path to orders for IO PDF storage path.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS document_path text;

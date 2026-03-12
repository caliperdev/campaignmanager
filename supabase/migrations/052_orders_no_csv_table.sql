-- Allow orders without a dynamic csv table. Placements go to placements table.
ALTER TABLE orders ALTER COLUMN dynamic_table_name DROP NOT NULL;

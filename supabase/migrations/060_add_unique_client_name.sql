-- Enforce unique client names. Resolve any existing duplicates before running.
ALTER TABLE clients ADD CONSTRAINT clients_name_unique UNIQUE (name);

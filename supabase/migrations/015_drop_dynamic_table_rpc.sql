-- Drop a dynamic (CSV-import) table by name. Only allows names that match our csv_* pattern.

CREATE OR REPLACE FUNCTION drop_dynamic_table(p_table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow dropping tables created by our CSV import (csv_ prefix, valid identifier)
  IF p_table_name IS NULL OR length(trim(p_table_name)) = 0 THEN
    RETURN;
  END IF;
  IF p_table_name !~ '^csv_[a-z0-9_]+$' THEN
    RETURN;
  END IF;
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', p_table_name);
END;
$$;

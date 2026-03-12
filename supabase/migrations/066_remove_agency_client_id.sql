-- Agencies are no longer tied to clients. Remove client_id and update client counts.
ALTER TABLE agencies DROP COLUMN IF EXISTS client_id;

-- get_all_client_counts: clients have no agency link, return 0 for all counts.
DROP FUNCTION IF EXISTS get_all_client_counts();
CREATE FUNCTION get_all_client_counts()
RETURNS TABLE(
  client_id uuid,
  agency_count int,
  advertiser_count int,
  campaign_count int,
  order_count int,
  placement_count bigint,
  active_placement_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM clients LOOP
    client_id := r.id;
    agency_count := 0;
    advertiser_count := 0;
    campaign_count := 0;
    order_count := 0;
    placement_count := 0;
    active_placement_count := 0;
    RETURN NEXT;
  END LOOP;
END;
$$;

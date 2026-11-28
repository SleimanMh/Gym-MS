-- How many OTHER gyms a user belongs to, in any status (invited, active, disabled).
-- Lets an owner set a password only for accounts used at their gym alone (ADR 0007) without
-- widening RLS: the function returns a number, never another gym's rows.
CREATE OR REPLACE FUNCTION app_user_other_gyms(p_user_id uuid, p_tenant_id uuid)
  RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::integer FROM tenant_memberships WHERE user_id = p_user_id AND tenant_id <> p_tenant_id
$$;

REVOKE ALL ON FUNCTION app_user_other_gyms(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_other_gyms(uuid, uuid) TO gym_app;

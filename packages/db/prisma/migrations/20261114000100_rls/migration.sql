-- Tenant isolation (PLAN.md section 4, CLAUDE.md "Tenancy rules").
--
-- * The API connects as gym_app: not the table owner, NOBYPASSRLS. RLS always applies to it.
-- * Migrations and seed run as the owner role. RLS is ENABLED (not FORCED), so the owner
--   (and SECURITY DEFINER functions owned by it) can do platform-level work.
-- * Every tenant-owned table gets the same policy via app_enable_tenant_rls(); new tables in
--   later migrations must call it too:   SELECT app_enable_tenant_rls('sessions');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_app') THEN
    RAISE EXCEPTION 'Role gym_app does not exist. Create it first (see infra/docker/postgres/init.sql).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_app' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'Role gym_app must not be superuser or BYPASSRLS.';
  END IF;
END $$;

-- Current tenant from the transaction-local setting; NULL when unset, so policies match nothing.
CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_enable_tenant_rls(p_table text) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())',
    p_table);
END $$;

SELECT app_enable_tenant_rls(t) FROM unnest(ARRAY[
  'tenant_settings',
  'locations',
  'rooms',
  'api_keys',
  'allowed_origins',
  'tenant_memberships',
  'user_roles',
  'audit_logs'
]) AS t;

-- Child rows must point at parents of the SAME tenant. A plain FK on id would let a tenant
-- reference another tenant's row (FK checks bypass RLS), so use composite FKs.
ALTER TABLE locations ADD CONSTRAINT locations_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE rooms
  ADD CONSTRAINT rooms_location_same_tenant_fkey
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_location_same_tenant_fkey
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) ON DELETE CASCADE;

-- One role assignment per (user, role, location) where NULL location means "all locations".
DROP INDEX IF EXISTS "user_roles_tenant_id_user_id_role_key_location_id_key";
CREATE UNIQUE INDEX "user_roles_tenant_id_user_id_role_key_location_id_key"
  ON user_roles (tenant_id, user_id, role_key, location_id) NULLS NOT DISTINCT;

-- Only one current subscription per tenant.
CREATE UNIQUE INDEX tenant_subscriptions_one_current
  ON tenant_subscriptions (tenant_id) WHERE is_current;

-- Resolve an API key to its tenant before any tenant context exists (widget / public API).
CREATE OR REPLACE FUNCTION app_resolve_api_key(p_key_hash text)
  RETURNS TABLE (tenant_id uuid, key_type text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT k.tenant_id, k.type::text
  FROM api_keys k
  JOIN tenants t ON t.id = k.tenant_id
  WHERE k.key_hash = p_key_hash
    AND k.revoked_at IS NULL
    AND t.status NOT IN ('suspended', 'cancelled')
$$;

-- The gyms a user belongs to, for the "pick your gym" step after login.
CREATE OR REPLACE FUNCTION app_user_tenants(p_user_id uuid)
  RETURNS TABLE (tenant_id uuid, slug text, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.slug, t.name
  FROM tenant_memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = p_user_id AND m.status = 'active'
  ORDER BY t.name
$$;

REVOKE ALL ON FUNCTION app_resolve_api_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_user_tenants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_enable_tenant_rls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_api_key(text) TO gym_app;
GRANT EXECUTE ON FUNCTION app_user_tenants(uuid) TO gym_app;
GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO gym_app;

-- Table privileges for the app role (current and future tables created by the owner).
GRANT USAGE ON SCHEMA public TO gym_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gym_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gym_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gym_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gym_app;
REVOKE ALL ON TABLE _prisma_migrations FROM gym_app;

-- Audit log is append-only for the app.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM gym_app;

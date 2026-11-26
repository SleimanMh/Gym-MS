# ADR 0002 — Tenant isolation with PostgreSQL Row-Level Security

- Status: accepted
- Date: 2026-11-14

## Context
The biggest risk in the product is one gym seeing another gym's data (PLAN.md section 14).

## Decision
- One shared database, `tenant_id UUID NOT NULL` on every tenant-owned table, indexed, FK to `tenants`.
- RLS policy on every tenant-owned table: `tenant_id = app_current_tenant_id()` for USING and WITH CHECK, where
  `app_current_tenant_id()` reads the transaction-local setting `app.tenant_id` (NULL when unset → no rows).
  New tables call `SELECT app_enable_tenant_rls('<table>')` in their migration.
- Two database roles:
  - `gym_owner` owns the schema and runs migrations (nothing else: it bypasses RLS).
  - `gym_app` is what the API and worker use: not the owner, `NOBYPASSRLS`, no UPDATE/DELETE on `audit_logs`.
  RLS is ENABLED but not FORCED, so the owner and SECURITY DEFINER functions it owns can do platform work.
- Every request/job runs tenant queries inside `withTenant()` — a transaction that calls
  `set_config('app.tenant_id', $1, true)`. The setting dies with the transaction, so pooled connections can't leak it.
- Child rows use composite FKs `(tenant_id, parent_id) → parent(tenant_id, id)` because FK checks bypass RLS.
- Two SECURITY DEFINER functions cover lookups that happen before a tenant is known:
  `app_resolve_api_key(hash)` and `app_user_tenants(user_id)`.
- Platform tables (`tenants`, `plans`, `features`, `plan_features`, `tenant_subscriptions`,
  `tenant_feature_overrides`, `platform_users`) and the global `users` table have no RLS.
- Tenant resolution order: token claim → API key → domain; if two sources disagree the request is rejected.

## Consequences
- Forgetting a `WHERE tenant_id = …` can't leak data; the isolation suite checks this on every build,
  including a test that fails if any table with `tenant_id` lacks RLS.
- Every tenant query costs one extra `set_config` round trip per transaction — acceptable.
- Enterprise "dedicated database" uses the same code with a tenant → connection map (Phase 5).

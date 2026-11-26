---
name: gym-tenant-table
description: Step-by-step workflow for adding or changing database tables in the gym-saas repo (Prisma + PostgreSQL row-level security). Use it whenever a task needs a new model, a new column, a relation, an index, or any change to packages/db/prisma/schema.prisma — e.g. "add a waivers table", "store trainer availability", "add a phone column to leads", "we need a products table for the shop" — even if the user doesn't mention migrations or RLS. Covers the schema-to-schema migration command, the hand-written _rls migration, same-tenant foreign keys, seed updates and the cross-tenant tests that must pass.
---

# Adding or changing a tenant-owned table

Every gym's data lives in one shared Postgres database. What keeps one gym from ever seeing another's
rows is Row-Level Security plus a few database rules that Prisma cannot express. A table added
without them is a data leak waiting to happen, so this workflow is not optional for tenant data.

Read `CLAUDE.md` (Tenancy rules, Migrations) first if you haven't this session.

## 1. Decide what kind of table it is

- **Tenant-owned** (almost everything: members, bookings, products, waivers…): has `tenantId`, gets RLS.
- **Platform** (rare: plans, features, tenants, global users): no RLS, written only by the platform
  console. If unsure, it is tenant-owned.

## 2. Edit `packages/db/prisma/schema.prisma`

Follow the existing Phase 1 models (e.g. `Booking`, `Payment`) as the pattern:

```prisma
model Waiver {
  id        String   @id @default(uuid(7)) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  memberId  String   @map("member_id") @db.Uuid
  version   Int
  signedAt  DateTime @map("signed_at") @db.Timestamptz(3)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@unique([tenantId, memberId, version])
  @@index([tenantId])
  @@map("waivers")
}
```

Rules and why:
- `tenantId` NOT NULL and in every unique constraint — uniqueness is per gym, not global.
- snake_case table/column names via `@map`/`@@map` — the SQL migrations and RLS helpers use them.
- Money = `BigInt` minor units + `currency Char(3)`; timestamps `Timestamptz(3)` in UTC; calendar
  days `@db.Date`.
- Don't add a Prisma `tenant Tenant @relation` to new models — the FK to `tenants` is added in SQL
  (step 4), which keeps the `Tenant` model from growing a back-relation per table.
- Soft delete (`deletedAt`) only where history must survive (members, class types).

## 3. Generate the migration — never `prisma migrate dev`

```bash
pnpm db:new-migration add_waivers        # or: cd packages/db && node scripts/new-migration.mjs add_waivers
```

This diffs `prisma/.schema-snapshot.prisma` → `schema.prisma` and writes
`prisma/migrations/<timestamp>_add_waivers/migration.sql`, then updates the snapshot.
`prisma migrate dev` would diff against a shadow database, see our hand-written constraints as drift
and generate DROPs for them.

Never edit a migration that has already been applied anywhere (including your local DB): add a new one.

## 4. Write the sibling `_rls` migration by hand

Create `prisma/migrations/<timestamp+1>_add_waivers_rls/migration.sql` (timestamp one higher so it runs
after the generated one):

```sql
-- FK to tenants + RLS policy (helpers defined in 20261114161641_phase1_rls).
SELECT app_tenant_table('waivers');

-- Child rows must point at parents of the SAME tenant (FK checks bypass RLS).
SELECT app_same_tenant_fk('waivers', 'member_id', 'members');

-- Optional: partial unique indexes, CHECK constraints, append-only grants.
ALTER TABLE waivers ADD CONSTRAINT waivers_version_positive CHECK (version > 0);
```

- Call `app_same_tenant_fk` for **every** column that references another tenant-owned table.
- Append-only data (ledgers, logs): `REVOKE UPDATE, DELETE ON TABLE <t> FROM gym_app;`
- Need to read across tenants before a tenant is known (rare)? Write a narrow `SECURITY DEFINER`
  function like `app_resolve_api_key` and `GRANT EXECUTE` it to `gym_app` — never widen RLS.

## 5. Apply and regenerate

```bash
pnpm db:deploy                                   # runs as gym_owner
cd packages/db && npx prisma generate && npx tsc -p .   # API/admin import the built package
```

On Windows, `prisma generate` fails with EPERM while the API process is running (it locks the query
engine DLL) — stop the API first.

## 6. Use it only through the tenant client

- API: `this.db.run((tx) => tx.waiver.findMany(...))` via `TenantDb` (`apps/api/src/infra/tenant-db.service.ts`).
- Worker/scripts/seed: `withTenant(prisma, tenantId, (tx) => …)` from `@gym/db`.
- Never `PrismaService` directly for tenant tables. Never run app logic as `gym_owner` (it bypasses RLS).

## 7. Seed and test

- Add demo rows in `packages/db/prisma/seed-phase1.ts` (fixed fixtures) or `seed-demo.ts` (generated
  volume). Keep it idempotent; it runs as the app role, so RLS protects it.
- `apps/api/test/isolation/rls.spec.ts` already fails if any table with `tenant_id` lacks RLS —
  run it. Add a cross-tenant assertion for the new endpoint in `test/isolation/phase1.spec.ts`
  (another gym's id must return 404).

```bash
cd apps/api && npx jest --selectProjects unit
cd apps/api && REDIS_URL= npx jest --selectProjects isolation --runInBand
```

## Done when

Migration + `_rls` migration committed, `pnpm db:deploy` clean, client regenerated, seed updated,
isolation suite green, `docs/adr/` updated if the table embodies a new decision.

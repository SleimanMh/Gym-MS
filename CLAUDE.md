# Gym SaaS — rules for Claude Code

Read docs/PLAN.md before any task. Work only on the current phase (see "Progress" at the end of docs/PLAN.md).

Project skills in `.claude/skills/` hold the step-by-step workflows — use them:
`gym-tenant-table` (schema + RLS migrations), `gym-api-module` (endpoints), `gym-admin-page` (UI, EN/AR),
`gym-run-local` (start/stop/seed on this machine), `gym-phase-gate` (exit-gate checks).

## Stack
pnpm + Turborepo, NestJS API, Next.js admin, Prisma + PostgreSQL 16, Redis + BullMQ,
email + password sign-in issued by the API (ADR 0007; Keycloak tokens still accepted for SSO),
Tailwind + shadcn/ui, Web Components for the widget. Each gym has its own address: `{slug}.localhost:3000`.

## Tenancy rules (never break these)
- Every tenant-owned table has tenant_id UUID NOT NULL + RLS policy + FK to tenants + index.
  In a hand-written `<timestamp>_<name>_rls` migration next to the generated one:
  `SELECT app_tenant_table('<table>');`
- Child rows reference parents of the same tenant: `SELECT app_same_tenant_fk('<child>', '<col>', '<parent>');`
  (FK checks bypass RLS, so a plain FK on id would let a row point at another tenant's parent).
- Never query outside the request-scoped DB client that sets app.tenant_id:
  `TenantDb.run(tx => ...)` in the API, `withTenant(prisma, tenantId, tx => ...)` in jobs and scripts.
  `PrismaService` directly is only for platform tables (tenants, plans, features, users, ...).
- The API, worker AND seed connect as `gym_app` (no RLS bypass). Only migrations use `gym_owner`
  (`scripts/as-owner.mjs`). The owner role bypasses RLS: never run application logic as it.
- Jobs always carry tenantId and set it before touching the DB.
- Unique constraints include tenant_id.
- Add a cross-tenant test for every new tenant-owned table and endpoint (`apps/api/test/isolation`).
- Another tenant's id returns 404 (RLS hides it), never 403.

## Migrations
- Change `packages/db/prisma/schema.prisma`, then `pnpm db:new-migration <name>` (schema-to-schema diff).
  Never `prisma migrate dev`: it diffs against a shadow DB and generates DROPs for our hand-written
  constraints. Never edit a migration that was applied anywhere; add a new one.
- Then add the `_rls` sibling migration for new tenant tables, `pnpm db:deploy`, update the seed.

## Access rules
- Deny by default: every route declares `@Public()`, `@AuthenticatedOnly()`, `@PlatformOnly(...)` or `@RequiresPermission(...)`.
  The global `AccessGuard` rejects routes that declare nothing.
- Gate plan features with `@RequiresFeature('<key>')`; check limits with `EntitlementsService.assertWithinLimit`.
- Feature, limit, permission and role keys live in `packages/shared` — never inline strings.
- Members act only on their own data through `/v1/me/...` with `@MemberOnly()`; the member id always
  comes from the session (`requireMember()`), never from the request. Member tokens get 403 on staff routes.
- Public widget routes are `@Public({ tenant: true })` + `@RequiresFeature("widget.embed")`; browser calls
  must come from the gym's allowed origins (enforced in RequestContextMiddleware).

## Side effects
- Emails, webhooks, analytics: write an outbox event in the SAME transaction (`OutboxService.enqueue`);
  the worker delivers it (`src/modules/notifications/jobs.ts`). Never send from a request handler.

## Conventions
- One NestJS module per domain in apps/api/src/modules.
- Money = amount_minor BIGINT + currency. Timestamps in UTC (timestamptz).
- Validate every input with zod schemas from packages/shared (`new ZodPipe(schema)`).
- Every UI string goes through i18n (`apps/admin/src/lib/i18n.ts`, en + ar together); layouts must work RTL —
  use logical classes (`ms-`, `pe-`, `start-`, `border-e`), never `ml-`/`right-`.
- UI: shadcn/ui-style components, light theme, one accent colour (the gym's), no custom flourishes.
- Sensitive actions (price changes, refunds, deletions, exports, role changes, impersonation) write `audit_logs`.

## Commands
- pnpm dev / pnpm test / pnpm test:isolation / pnpm lint / pnpm typecheck
- pnpm db:new-migration <name> / pnpm db:deploy / pnpm db:seed
- docker compose -f infra/docker/docker-compose.yml up -d   (Postgres on host port 5433)

## Definition of done
Tests pass (unit + integration + isolation), lint and typecheck clean,
migration included, seed updated, docs/adr updated for new decisions,
progress checkboxes in docs/PLAN.md updated.

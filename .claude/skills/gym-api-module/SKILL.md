---
name: gym-api-module
description: How to add or change endpoints in the gym-saas NestJS API (apps/api) the way this codebase does it — access decorators, plan-feature gating, zod validation, the tenant-scoped DB client, audit log, outbox events for emails, error codes, module wiring and tests. Use it for any backend work in this repo, e.g. "add an endpoint to refund a payment", "let members update their profile", "add PT appointments", "expose trainer availability", "send an email when…", even when the user only describes the feature and not the API.
---

# Adding API endpoints

The API is a modular monolith: one folder per domain in `apps/api/src/modules/<domain>`.
The global `AccessGuard` denies any route that doesn't declare who may call it, and tenant data is
only reachable through a transaction that sets `app.tenant_id` — so following the pattern is what
makes a new endpoint safe, not just consistent.

If the feature needs a new table, do that first with the `gym-tenant-table` skill.

## 1. Request schema in `packages/shared`

Put zod schemas in `packages/shared/src/phase1.ts` (or a new file exported from `src/index.ts`) so
the admin app and widget can reuse the types. Then rebuild: `cd packages/shared && npx tsc -p .`
(the API consumes the built `dist`).

## 2. Controller

```ts
@Controller("v1/refunds")
@RequiresFeature("payments.manual")              // plan gate (keys: packages/shared/src/entitlements.ts)
export class RefundsController {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  @Post()
  @RequiresPermission("payment.take")             // role gate (keys: packages/shared/src/permissions.ts)
  create(@Body(new ZodPipe(refundSchema)) body: RefundInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: body.paymentId } });
      if (!payment) throw new NotFoundException();          // another gym's id → 404 (RLS hid it)
      if (payment.status === "refunded") throw new ConflictException({ code: "ALREADY_REFUNDED" });
      // …change data…
      await this.audit.record(tx, { tenantId: tenant.id, action: "payment.refunded", entityType: "payment", entityId: payment.id });
      await this.outbox.enqueue(tx, tenant.id, "payment.refunded", { paymentId: payment.id }, `payment.refunded:${payment.id}`);
      return result;
    });
  }
}
```

Access decorators (`apps/api/src/common/decorators.ts`) — pick exactly one style per route:
| Caller | Decorators |
|---|---|
| Staff | `@RequiresPermission(...)` (+ `@RequiresFeature(...)`) |
| Member (widget/portal), own data only | `@MemberOnly()`; get the id from `requireMember()`, never from the body |
| Website/widget, no login | `@Public({ tenant: true })` + `@RequiresFeature("widget.embed")` |
| Platform console | `@PlatformOnly("super_admin")` |
| Any signed-in user, tenant optional | `@AuthenticatedOnly()` |

New permission? Add it to `PERMISSIONS` and the right roles in `DEFAULT_ROLES`. New plan feature?
Add it to `FEATURES`, `FEATURE_LABELS` and `PLAN_CATALOGUE`, then re-seed.

## 3. Conventions that bite if skipped

- **Errors**: throw Nest exceptions with a machine code: `new ConflictException({ code: "SESSION_FULL" })`.
  The admin translates codes via `errorsEn`/`errorsAr` in `apps/admin/src/lib/messages-phase1.ts` —
  add the code there in both languages.
- **Unique violations**: catch `Prisma.PrismaClientKnownRequestError` with `code === "P2002"` → 409.
- **Concurrency on shared counters** (capacity, stock): lock the row first,
  ``tx.$queryRaw`SELECT … FROM sessions WHERE id = ${id}::uuid FOR UPDATE` `` — see `booking.service.ts`.
- **Raw SQL**: only tagged templates (`$queryRaw`/`$executeRaw`); lint blocks the Unsafe variants.
- **Money/BigInt** serialises as a string (`src/common/bigint-json.ts`); clients use `formatMoney`.
- **Dates**: store UTC; compute "today"/day boundaries in the gym's time zone with `localDate`,
  `zonedToUtc`, `addDays` from `@gym/shared`.
- **Route order**: declare static paths (`members/counts`) before param paths (`members/:id`).
- **Side effects** (email, webhooks): only via `OutboxService.enqueue` inside the same transaction.
  New email kind → add to `OutboxEventType`, render it in `modules/notifications/templates.ts`
  (EN + AR) and build it in `jobs.ts` `buildEmail`.
- **Sensitive actions** (prices, refunds, deletions, exports, role changes): `AuditService.record`.

## 4. Wire it

Add the controller/providers to the domain's module — Phase 1 domains are wired in
`apps/api/src/modules/gym/gym.module.ts`. Services shared inside one transaction (booking,
memberships, payments) are providers there.

## 5. Test

- Pure rules (eligibility, pricing, date math) → a function with unit tests in `apps/api/test/unit/`.
- Flows → `apps/api/test/isolation/phase1.spec.ts` style: boot `AppModule`, get dev tokens from
  `POST /v1/dev/token`, call the endpoint, and assert another gym gets 404 and a member token gets 403.

```bash
cd apps/api && npx tsc --noEmit -p . && npx jest --selectProjects unit
cd apps/api && REDIS_URL= npx jest --selectProjects isolation --runInBand   # needs Postgres up
../../node_modules/.bin/eslint src test
```

`REDIS_URL=` (empty) makes tests use the in-memory cache, so they don't need Redis.

## Done when

Typecheck, lint, unit and isolation tests pass; error codes translated; `docs/PLAN.md` progress
updated; ADR added if you made a design decision.

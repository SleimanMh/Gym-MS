# Gym SaaS

Multi-tenant gym management platform: each gym is a tenant with its own login, branding, data and plan,
and its booking widget plugs into any website. The full plan is in [docs/PLAN.md](docs/PLAN.md); rules for
working in this repo are in [CLAUDE.md](CLAUDE.md).

**Status: Phase 1 (MVP) built.** Still open from Phase 0: Keycloak login in the admin app, staging deploy. See the progress list at the end of docs/PLAN.md.

## Layout

```
apps/
  api/        NestJS API (/v1) + BullMQ worker entrypoint
  admin/      Next.js staff app + platform console (EN/AR, RTL)
  portal/     member PWA            (Phase 2)
  widget/     booking widget (Lit web components) + an example gym website for development
packages/
  db/         Prisma schema, migrations (incl. RLS), tenant-scoped client, seed
  shared/     feature/limit/permission keys, plan catalogue, zod schemas
  ui/         shared components     (later)
  sdk-react/  React wrapper for the widget (later)
infra/
  docker/     docker-compose.yml, Dockerfiles, Postgres role setup
  keycloak/   realm export
  terraform/  AWS "Scale" stage (Phase 5)
docs/         PLAN.md, adr/, metrics.md
```

## Run it locally

Requirements: Node 22+, Docker Desktop, pnpm 9 (`corepack enable`, or `npx pnpm@9`).

```bash
cp .env.example .env
pnpm install
pnpm infra:up            # Postgres (host port 5433), Redis, Keycloak, MinIO, Mailpit
pnpm db:deploy           # apply migrations as gym_owner
pnpm db:seed             # demo gyms "ironfit" (Pro) and "pulse" (Starter, Arabic) with classes, plans,
                         # members in every membership state and a year of payments
pnpm dev                 # API :4000, admin :3000, widget demo website :5173
pnpm --filter @gym/api dev:worker   # emails, reminders, session generation (needs Redis)
```

Open http://localhost:3000 and sign in as one of the seeded users (development sign-in; Keycloak replaces it).

| URL | What |
|---|---|
| http://localhost:3000 | Admin app (staff) and `/platform` console |
| http://localhost:3000/book/ironfit | Hosted booking page (public) |
| http://localhost:5173 | Example gym website with the widget: sign in as `member@ironfit.test`, the code arrives in Mailpit |
| http://localhost:4000/health/ready | API health |
| http://localhost:8080 | Keycloak (admin / admin) |
| http://localhost:8025 | Mailpit (captured emails) |
| http://localhost:9001 | MinIO console (minio / minio_dev_secret) |

## Tests

```bash
pnpm test             # unit tests (no database needed)
pnpm test:isolation   # cross-tenant tests against the migrated + seeded database
```

The isolation suite connects as the same `gym_app` role as the API and proves that a tenant can't read,
write, update, move or reference another tenant's rows, and that member tokens get 403 on staff endpoints.

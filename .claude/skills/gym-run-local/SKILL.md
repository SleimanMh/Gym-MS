---
name: gym-run-local
description: Start, stop, reseed and troubleshoot the gym-saas system on this Windows machine — Docker services (Postgres, Redis, Mailpit), API, worker, admin app and widget demo site — plus the demo logins and where emails land. Use it whenever the user says "run the system", "start the app", "stop it", "I want to see it", "reset the demo data", "it won't start", or before any browser check of the app, even if they don't mention Docker or ports.
---

# Running gym-saas locally

All paths are relative to the repo root (`C:\Users\sleim\Desktop\gym-saas`).

## Machine-specific facts (learned the hard way)

- A local PostgreSQL 18 already owns port **5432** → the Docker Postgres is published on **5433**.
- The local `.env` points at database **`gym_demo2`** (demo data, regenerated 2026-11-26; `gym_demo` is the older copy); `.env.example` says `gym`. Integration tests use **`gym_test`** (`TEST_DATABASE_URL`).
  Integration tests use **`gym_test`** via `TEST_DATABASE_URL`, so they never add "Test…" rows to the demo.
- `pnpm` is not installed globally → use `corepack pnpm@9.15.0 …`; `turbo`/`pnpm dev` fail with
  "Unable to find package manager binary" until `npm i -g pnpm@9` (ask before installing globally).
- Docker Desktop is often not running → start it and wait for `docker info`.
- Windows can't create symlinks for Next's `standalone` output → only build standalone in Docker
  (`NEXT_OUTPUT=standalone`).
- `prisma generate` fails with EPERM while the API runs (locked engine DLL) → stop the API first.

## Start

```bash
# 1. Docker services
docker info >/dev/null 2>&1 || ("/c/Program Files/Docker/Docker/Docker Desktop.exe" &)   # then wait for docker info
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailpit
# wait until: docker inspect -f '{{.State.Health.Status}}' gym-saas-postgres-1  → healthy

# 2. Build what the API runs from (packages are consumed as built dist)
(cd packages/shared && ../../node_modules/.bin/tsc -p .) && (cd packages/db && ../../node_modules/.bin/tsc -p .) && (cd apps/api && npx nest build)
```

3. Start the four processes with the preview tool using `.claude/launch.json` (names `api`, `worker`,
   `admin`, `widget`) — not with Bash background jobs. The `worker` entry's port is a placeholder;
   check its logs instead (it prints a `maintenance.scan` line on start).

| What | URL |
|---|---|
| Admin (staff) + platform console | http://localhost:3000 (sign in at `/login`) |
| Example gym website with the widget | http://localhost:5173 |
| Hosted booking page | http://localhost:3000/book/ironfit |
| Emails (Mailpit) | http://localhost:8025 |
| API health | http://localhost:4000/health/ready |

## Demo logins (dev sign-in, `/login`)

`owner@ironfit.test` (Pro, English) · `frontdesk@ironfit.test` · `coach@ironfit.test` · `accounts@ironfit.test` (accountant: staff + finance) ·
`member@ironfit.test` (no staff access) · `owner@pulse.test` (Starter, Arabic) · `platform@gym.local`.
Members sign in on the widget with their email; the 6-digit code arrives in Mailpit.
Widget publishable key: `pk_dev_ironfit_publishable_key_0001`.

When driving the admin with browser tools and clicks fail because the window isn't drawing, submit
forms through the DOM (`form.requestSubmit()`) and read pages with `get_page_text`.

## Stop

Stop the four preview servers (preview_stop), then:

```bash
docker compose -f infra/docker/docker-compose.yml stop     # keeps the data
```

Never `down -v` — it deletes the database volume.

## Demo data

- `pnpm db:seed` (or `cd packages/db && node scripts/with-env.mjs npx tsx prisma/seed.ts`) is
  idempotent and runs as the app role. `seed-demo.ts` only generates members once per gym.
- Demo data is anchored to the day it was generated; after a few days "today" looks quiet and the
  worker expires memberships that ran out. To refresh it, create a fresh database next to the old one
  rather than wiping: create the next `gym_demoN` (owner `gym_owner`, schema owner + `GRANT USAGE … TO gym_app`
  as in `infra/docker/postgres/init.sql`), point `.env` at it, `pnpm db:deploy`, `pnpm db:seed`.
- `prisma migrate reset` and dropping databases the user didn't just create require the user's
  explicit consent — ask; don't work around Prisma's consent check.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `container … is not running` | Docker Desktop was closed → start it, `compose up -d` again |
| API exits: invalid env | compare `.env` with `.env.example` (e.g. `MEMBER_JWT_SECRET` missing) |
| Admin page "Application error" | `preview_logs` for the admin server, level error |
| Widget "This website isn't allowed" | its origin isn't in the gym's allowed websites (Settings → Website); `localhost:5173` is seeded |
| Styles missing | Tailwind scans `src/` via `@import "tailwindcss" source("../")` — keep that line |

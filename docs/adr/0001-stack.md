# ADR 0001 — Stack: TypeScript monorepo

- Status: accepted
- Date: 2026-11-14

## Context
One product with an API, a worker, a staff app, a member portal and an embeddable widget. Built mostly with
Claude Code, so one language and shared types across every part matter more than per-part best-of-breed.

## Decision
- pnpm workspaces + Turborepo.
- API: NestJS 11 (modules, guards and DI fit tenancy and feature gating). Worker: same codebase, `src/worker.ts`.
- ORM: Prisma 6 with versioned SQL migrations; RLS and other things Prisma can't model go in hand-written
  migrations next to the generated ones.
- Admin: Next.js 15 (App Router, server components) + Tailwind 4, shadcn/ui-style components.
- Shared: `packages/shared` holds feature/limit/permission keys, the plan catalogue and zod schemas.
- Node 22 LTS.

## Consequences
- Spring Boot stays a documented alternative (PLAN.md section 2) but is not planned.
- Versions are pinned by the lockfile; Renovate/Dependabot to be added with the repo on GitHub.

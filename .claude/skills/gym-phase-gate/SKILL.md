---
name: gym-phase-gate
description: Check a gym-saas roadmap phase against its exit gate in docs/PLAN.md and report honestly what is done, what is missing and what can't be verified in code — then update the progress checklist. Use it when the user asks "are we done with phase 1?", "what's left?", "can we start phase 2?", "check the exit gate", "update the plan progress", or before starting a new phase.
---

# Phase gate check

`docs/PLAN.md` section 15 defines six phases, each ending with an **exit gate**; the "Progress"
list at the end of the file tracks items. The plan's rule: a phase finishes only when its exit gate
passes. This skill keeps that rule honest — the checklist must reflect evidence, not intentions.

## 1. Read the source of truth

- `docs/PLAN.md`: the phase's bullet list in section 15 and its "Exit gate" line, plus the matching
  "Progress" checklist at the end.
- `CLAUDE.md` "Definition of done".
- Relevant ADRs in `docs/adr/` (decisions can change what "done" means — e.g. ADR 0004 replaces
  Keycloak member login with emailed codes for now).

## 2. Verify each item against the code, not the checklist

For every bullet, find concrete evidence and note the file or test:
- an endpoint/controller (`apps/api/src/modules/...`), a migration, a UI route (`apps/admin/src/app/...`),
- a test that exercises it (`apps/api/test/...`, `packages/shared/test/...`),
- and for UI items, a look in the running app (start it with the `gym-run-local` skill).

Then run the whole quality bar:

```bash
(cd packages/shared && node --test --require ./test/register.cjs test/*.test.ts)
(cd apps/api && npx jest --selectProjects unit)
(cd apps/api && REDIS_URL= npx jest --selectProjects isolation --runInBand)   # needs Postgres up
# lint + typecheck each package: packages/shared, packages/db, apps/api, apps/admin, apps/widget
```

## 3. Classify honestly

- **Done** — implemented and covered by a test or seen working.
- **Partial** — exists but with a named gap (say which).
- **Missing** — not built.
- **Can't be verified in code** — gates like "a real gym runs a week of classes without your help"
  or "deployed to staging" need real-world evidence. Never tick these from code alone; say what
  evidence would close them.

## 4. Report

Use this structure:

```
## Phase N — <name>: <ready | not ready> for the exit gate
Exit gate: "<quote>"
Status: <one sentence on whether it passes and why>

Done (n): item — evidence (file/test)
Partial (n): item — what's missing
Missing (n): item
Needs real-world evidence: item — what would prove it

Checks run: tests x/y passed, lint/typecheck clean (or what failed)
Next steps: the smallest set of work that would pass the gate, in order
```

## 5. Update the checklist

Edit the "Progress" list in `docs/PLAN.md` only for items you verified: tick done items, leave
partial ones unticked with a short note, add newly discovered items. Don't tick the exit gate
itself unless its real-world evidence exists. Mention in the report what you changed.

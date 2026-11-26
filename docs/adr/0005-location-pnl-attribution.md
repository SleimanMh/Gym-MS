# ADR 0005 — Assigning revenue and costs to locations; staff rankings

- Status: accepted
- Date: 2026-11-26

## Context
Phase 3's exit gate: "an owner sees monthly profit per location and staff rankings that match their own
records". Payments carry no location (a member can train at any branch), staff work across branches,
and some costs (accountant, software) belong to the whole gym.

## Decision
**Attribution** (`GET /v1/finance/locations`, rules in `packages/shared` `allocatePay` / `splitMinor`):
- Revenue → the paying member's home location.
- Expenses → the location chosen when recording them; none chosen = gym-wide.
- Staff pay → hourly pay where the hours were clocked (no location on the entry = home location),
  per-class pay where the classes ran, salary and commission to the person's home location.
- Anything without a location is "gym-wide". Each location shows its direct net, and a net after its
  share of the gym-wide result, spread by share of revenue. Splits are in whole minor units with the
  remainder on the largest share, so locations + gym-wide always equal the overview and payroll totals
  (an integration test checks this).

**Rankings** (`GET /v1/staff/performance`, needs `report.view`): raw counts per person and month —
classes taught, spots booked ÷ offered, check-ins, no-shows, memberships sold (paid in the month) and
sales; pay and pay per check-in only with `finance.view`. No composite score: owners rank by one metric
at a time and can check each number against their own records.

Gated by `finance.pnl` / `staff.management` (Pro). Cross-gym consolidated reporting stays
`reports.multi_location` (Enterprise).

## Consequences
- A member's home location decides where their revenue lands; gyms must keep it current. Splitting
  by check-ins would be fairer for members who train everywhere — revisit if owners ask.
- Memberships sold by a person count when paid, so seeded or imported memberships without a seller don't
  show up in rankings.

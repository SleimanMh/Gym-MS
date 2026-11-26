# ADR 0006 — Per-person access on top of roles; team calendar

- Status: accepted
- Date: 2026-11-27

## Context
Owners want to decide what each staff member sees ("my front desk can see the dashboard, but not
sales"), and to plan everyone's week in one calendar where two people can work the same hours on
different activities. Roles alone (ADR 0003) are too coarse; full custom-role builders are heavy for a
small gym.

## Decision
**Access = one staff role + per-person tweaks.** The owner picks a role (owner, manager, front desk,
coach, accountant) and can set each area of the app (`ACCESS_AREAS` in `packages/shared`: dashboard,
schedule, bookings, members, check-in, sales, staff, finance, settings) to Hidden / View / Manage.
Only the differences from the role are stored, in `user_permission_overrides` (granted = add, false =
remove), so later changes to a role's defaults still reach everyone not customised.
`effectivePermissions(roles, overrides)` is applied when the principal is loaded, so the sidebar, pages
and API all follow it on the next request.
- Only `tenant.security.manage` (owners) can change access; nobody can change their own; the last owner
  can't be demoted; owners are never reduced; security, billing and audit permissions can't be granted
  by a tweak. Every change is audited (`staff.access_changed`).
- The role is available on every plan; per-area tweaks need `identity.custom_roles` (Pro).

**Team calendar.** Shifts get an `activity` (suggested keys such as `front_desk`, `personal_training`,
or free text). `GET /v1/team-calendar` returns shifts and the classes each person teaches;
`GET /v1/my-schedule` returns the signed-in person's own. One person can't hold two overlapping
slots (`SHIFT_OVERLAP`); different people can share a time slot. The admin calendar is a week grid:
click an empty spot to add a slot there, click a slot to edit or delete it.

## Consequences
- Access is per gym membership: someone working at two gyms can have different access in each.
- A person without a linked sign-in has no access to set; inviting staff by email arrives with
  Keycloak sign-in (Phase 0 item still open).

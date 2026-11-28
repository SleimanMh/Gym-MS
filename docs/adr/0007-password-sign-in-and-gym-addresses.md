# ADR 0007 — Email + password sign-in, one address per gym, owner-run user management

- Status: accepted (replaces the staff-login part of ADR 0003; Keycloak stays for SSO)
- Date: 2026-11-28

## Context
Gym owners need to add staff themselves, decide exactly what each person can open, and give every
gym its own sign-in address. Running Keycloak for every small gym is heavy, and the Keycloak login in
the admin app was never finished. Members also need a simple way to sign in to see their membership
and book.

## Decision
**Staff sign in with email + password, issued by our API.**
- The owner adds a user (Settings → Users & access, or "give them a sign-in" when adding a team
  member). The API creates the account with a generated password (scrypt hash only), and an outbox
  email sends it with the gym's sign-in address. The outbox payload is scrubbed once sent.
- A generated password works for 7 days and only lets the person choose their own (10+ characters,
  a letter and a digit). Changing or resetting a password bumps `users.session_version`, which ends
  every earlier session.
- `POST /v1/auth/login` / `change-password` (public): errors never reveal whether an email exists;
  5 wrong passwords lock the account for 15 minutes; rate limits per email and IP. Tokens are HS256,
  issuer `gym-api`, 12 h, scoped to one gym (`tenant_id`) and carrying the session version.
- The owner can reset someone's password (new emailed password) and disable their sign-in.
- Keycloak tokens are still accepted, so SSO (Pro/Enterprise) can come back without changing the API.

**One address per gym.** `http://{slug}.localhost:3000` locally, `https://{slug}.<domain>` in
production (`GYM_URL_TEMPLATE` / `NEXT_PUBLIC_GYM_URL_TEMPLATE`). The admin app takes the gym from the
host (and `x-forwarded-host` after server-action redirects) and sends it to the API as
`x-tenant-slug`. Cookies are host-only, so each gym keeps its own sessions. Staff can only sign in at
the address of a gym they belong to; the bare address is for platform staff and "go to your gym".

**Access = role + access tree.** Unchanged from ADR 0006 in storage (`user_permission_overrides`,
differences from the role only), but the editor is now a tree: each area (dashboard, schedule,
bookings, members, check-in, sales, staff, finance, settings) with its permissions as leaves; the first
leaf opens the area and the others need it. Owners only, audited, never on yourself, the last owner
can't be demoted or disabled, and security/billing/audit permissions are never in the tree.

**Members sign in at the same address** with an emailed 6-digit code (ADR 0004) and get `/me`: their
check-in QR code, membership, bookings (cancel) and classes to book. Same API endpoints as the widget.

## Consequences
- We own password security: hashing, lockout, rate limits, reset. No self-service "forgot password"
  yet — the owner sends a new one. Add an emailed reset link before launch.
- A person who works at two gyms has one account and one password, and signs in at each gym's address.
  An owner resetting a password resets it for that person everywhere (the new one goes to them, not
  the owner).
- Production needs wildcard DNS and a wildcard TLS certificate for `*.<domain>`; custom domains per
  gym (Pro) map onto the same lookup.

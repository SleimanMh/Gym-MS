# ADR 0004 — Member sign-in by emailed code; notifications through an outbox

- Status: accepted
- Date: 2026-11-14

## Context
Phase 1's exit gate needs members to book from the gym's website without staff help. Keycloak member
login (magic link, Google/Apple) isn't wired yet, and booking confirmations, reminders and expiry
notices must never be lost or sent for changes that rolled back.

## Decision
**Member sign-in (widget):** `POST /v1/public/member-auth/start {email}` creates a 6-digit code
(HMAC with `CODE_PEPPER`, 10-minute expiry, 5 attempts, rate-limited per email and IP) and emails it.
`…/verify` returns a member session token (HS256, issuer/audience `gym-member`, 30 days, claims
`sub` = member id, `tenant_id`). The API never reveals whether an email belongs to a member.
Member tokens reach only `/v1/me/...` (`@MemberOnly`) and get 403 on staff routes. When Keycloak member
login lands, the widget keeps calling the same `/v1/me` endpoints with a Keycloak token instead.

**Outbox:** domain events (`booking.created`, `waitlist.promoted`, `membership.expiring`, …) are rows in
`outbox_events`, written in the same transaction as the change, de-duplicated by `dedupe_key`. The
worker claims them across tenants with the SECURITY DEFINER function `app_claim_outbox()` and handles
each inside `withTenant(event.tenant_id)`. Delivered login codes are scrubbed from the payload.
A maintenance job (every 5 minutes) extends sessions, queues reminders and expiry notices, and expires
memberships.

**Widget access:** the publishable key, the domain or `x-tenant-slug` identifies the gym; browser calls
from any origin other than our own apps must be in the gym's `allowed_origins`.

## Consequences
- Members need an email on file to book online (phone OTP via SMS/WhatsApp comes with Phase 4 messaging).
- Email is at-least-once: a crash between sending and marking processed can send twice.
- Bot protection on public forms is a honeypot until Cloudflare Turnstile is added before launch.

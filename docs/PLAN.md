# Gym Booking SaaS — Build Plan

Nov 14, 2026 · @Sleiman

## 1. Overview

Build one multi-tenant gym management platform: each gym is a tenant with its own login, branding, data and feature plan, and its booking widget plugs into any website.

### What it is

- A standalone SaaS service with its own API, database and deployment — not part of any website
- Sold per gym on subscription plans; features switch on or off per tenant
- Embeddable into gym websites through a script widget, hosted booking pages and a public API
- Covers the whole gym business: bookings, memberships, members, staff, sales, revenue and costs

### Who uses it

- You (platform owner): onboard gyms, assign plans, monitor usage and platform revenue
- Gym owners and managers: run the business, read dashboards, set prices
- Front desk and trainers: check members in, manage classes and sessions
- Members: book classes, buy memberships, pay, see history

### Guiding principles

- Tenant isolation is non-negotiable: no query ever runs without a tenant context
- Simple first: every screen does one job, with the fewest clicks
- Configurable, not custom: new gyms differ by settings and plans, never by code forks
- Bilingual English/Arabic (with right-to-left layout) from day one
- Build in phases (section 15): a sellable MVP first, then sales, staff and finance depth

## 2. Tech stack

Use one TypeScript monorepo for the API, admin app and widget, on PostgreSQL — one language keeps Claude Code fast and consistent across every part.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared types between API, admin and widget |
| API | NestJS (Node.js, TypeScript) | Modules, guards and DI fit tenancy and feature gating |
| ORM / migrations | Prisma (or Drizzle) | Typed queries, versioned migrations |
| Database | PostgreSQL 16+ with Row-Level Security | Tenant isolation enforced in the database itself |
| Cache / jobs | Redis + BullMQ | Reminders, renewals, reports, analytics rollups |
| Admin web app | Next.js + React + Tailwind + shadcn/ui | Clean, simple components; easy theming and RTL |
| Charts | Recharts or Apache ECharts | Simple KPI charts, heatmaps |
| Booking widget | Web Component (Lit or Preact), one small JS bundle | Drops into any website without conflicts |
| Auth / SSO | Keycloak (self-hosted, Organizations per tenant) or a managed option (WorkOS, Auth0, Clerk) | Per-tenant SSO via OIDC/SAML, social login, MFA |
| Payments | Gateway abstraction: Stripe where available, a regional gateway elsewhere, plus cash/bank transfer | Stripe is not available in every country |
| Email / SMS / WhatsApp | Resend or Amazon SES; Twilio or WhatsApp Cloud API | Reminders and marketing |
| File storage | S3-compatible (AWS S3, Cloudflare R2) | Logos, waivers, receipts |
| Infra | Docker, Terraform, GitHub Actions | Reproducible environments and deployments |
| Observability | OpenTelemetry, Sentry, Grafana or Better Stack | Errors, traces, uptime, alerts |

- Alternative backend: Spring Boot 3 + Spring Security is equally valid if you prefer Java; keep everything else the same
- Auth recommendation: start with Keycloak to avoid per-user auth fees as tenants grow; move to a managed provider only if running Keycloak becomes a burden
- Payments: candidate regional gateways include Tap Payments, PayTabs and Checkout.com — confirm coverage for each country you sell in

## 3. System architecture

Start as a modular monolith — one API service split into clear modules — plus a worker, a database and three front ends; split into microservices only when a module needs to scale on its own.

### Deployable parts

- api — NestJS REST API (/v1/...), all business logic, tenant-aware
- worker — same codebase, runs BullMQ jobs: reminders, renewals, billing, analytics rollups, report emails
- admin — Next.js app for gym staff (owner, manager, front desk, trainer)
- platform-console — your own super-admin area (can be a protected section of admin)
- member portal — mobile-first PWA for members: book, pay, history
- widget — JS bundle served from a CDN, embedded in gym websites
- auth — Keycloak (or managed provider) issuing tokens with a tenant claim
- data — PostgreSQL (primary), Redis (cache + queues), S3 (files)

### API modules (one folder each)

- tenancy — tenants, locations, settings, branding, domains
- identity — users, roles, permissions, SSO config
- catalog — class types, rooms, resources, membership plans, products
- scheduling — schedules, sessions, trainer availability
- booking — bookings, waitlists, check-ins, policies
- membership — subscriptions, freezes, credits, contracts
- crm — members, leads, notes, tags
- billing — invoices, payments, refunds, payment gateways
- staff — employees, shifts, attendance, commissions
- finance — expenses, categories, P&L
- marketing — campaigns, automations, promo codes, referrals
- analytics — rollups and dashboard queries
- notifications — email, SMS, WhatsApp, in-app
- entitlements — plans, feature flags, usage limits
- integrations — API keys, webhooks
- audit — audit log of sensitive actions

### How a request flows

- Request arrives with a token (staff/member) or a publishable API key (widget)
- Middleware resolves the tenant from the token claim, API key, subdomain or custom domain
- The tenant id is set on the database session (SET app.tenant_id), so Row-Level Security filters every query
- Guards check the user's permission and the tenant's plan entitlement for the feature
- The module handles the request; domain events (e.g. booking.created) go to the queue for notifications, webhooks and analytics

## 4. Multi-tenancy

Use one shared database with a tenant_id on every business table, enforced by PostgreSQL Row-Level Security, and keep a path open to a dedicated database for large Enterprise clients.

### Hierarchy

- Platform (you) → Tenant (a gym business) → Locations (branches) → Rooms / resources
- A tenant can have one or many locations, so gym chains work without extra tenants
- Members belong to the tenant and can be limited to some locations by their plan

### Isolation rules (put these in CLAUDE.md)

- Every tenant-owned table has tenant_id UUID NOT NULL, indexed, and a foreign key to tenants
- RLS policy on every tenant table: tenant_id = current_setting('app.tenant_id')::uuid
- The app connects with a role that cannot bypass RLS; migrations use a separate owner role
- A request-scoped Prisma/DB client sets app.tenant_id inside a transaction for every request and job
- Background jobs always carry tenantId in their payload and set it the same way
- Unique constraints include tenant_id (e.g. UNIQUE (tenant_id, email))
- Automated tests try to read and write across tenants and must fail

### Tenant resolution (in order)

- tenant_id claim in the access token (staff and members)
- Publishable API key (widget and public API)
- Custom domain (book.ironfitgym.com) or subdomain (ironfit.yourapp.com)

### Per-tenant settings

- Name, logo, primary colour, default language (en/ar), time zone, currency, tax rate
- Opening hours, holidays, booking and cancellation policies
- Allowed website origins for the widget (CORS)
- Plan, add-ons and feature overrides (section 7)

### Isolation tiers you can sell

- Pooled (default): shared database with RLS — all plans
- Dedicated (Enterprise): own database or schema, routed by a tenant → connection map; same code

## 5. Authentication, SSO and roles

Each gym gets its own branded login with its own SSO options; one central identity provider issues tokens that always carry the tenant and the user's roles.

### Login options per tenant

- Staff: email + password with MFA, or SSO through the gym's Google Workspace or Microsoft Entra ID (OIDC/SAML), configured by the tenant owner
- Members: email + password, magic link, or social login (Google, Apple); phone OTP as an option
- Branded login page per tenant: logo, colours, language, at the tenant's subdomain or custom domain
- One person can belong to several tenants (e.g. a trainer at two gyms); after login they pick the gym

### Keycloak setup (recommended)

- One realm for the platform; one Organization per tenant holding its members and its identity providers
- Token claims: sub, tenant_id, roles, location_ids
- Admin-app and member-portal clients use Authorization Code + PKCE; the widget uses a publishable key for public data and member login for bookings
- Tenant owners manage their SSO settings from Settings → Security in the admin app (calls the Keycloak Admin API)

### Roles (defaults per tenant)

| Role | Can do |
|---|---|
| Owner | Everything in the tenant, including billing, plan and SSO settings |
| Manager | Run assigned locations: schedules, staff, members, reports |
| Front desk | Check-ins, bookings, sell memberships and products, take payments |
| Trainer | Own schedule, own classes and clients, attendance |
| Accountant | Finance, expenses, invoices, financial reports (read-only elsewhere) |
| Member | Book, pay, manage own profile and membership |

### Platform roles (your side)

- Super admin: create tenants, assign plans, manage features, see platform metrics
- Support: read-only tenant access; impersonation only with a reason, time-limited and written to the audit log

### Permissions model

- Fine-grained permissions (e.g. booking.create, finance.view, member.export); roles are bundles of permissions
- Permissions can be scoped to locations
- Custom roles are a Pro/Enterprise feature

## 6. Feature modules

Twelve modules cover the gym end to end; the first four make a sellable MVP, the rest are what you upsell.

### 1. Scheduling and booking (MVP)

- Class types, rooms, recurring weekly schedules, one-off sessions, holidays
- Capacity, waitlist with automatic promotion, booking windows (e.g. opens 7 days before)
- Cancellation policy: cut-off time, late-cancel and no-show fees or credit loss
- Personal training appointments from trainer availability
- Resource booking: courts, pools, equipment slots
- Calendar views: day, week, by trainer, by room

### 2. Check-in (MVP)

- Member QR code (portal/app) scanned at the front desk, or search by name/phone
- Validates active membership, credits and booking; shows alerts (unpaid, expiring, waiver missing)
- Attendance history per member and per class

### 3. Memberships (MVP)

- Plan types: recurring (monthly/annual), fixed-term, class packs/credits, drop-in, free trial
- Freeze/pause, upgrade/downgrade with proration, auto-renew, expiry reminders
- Family and corporate memberships, location-limited plans, off-peak plans
- Digital waivers and contracts with e-signature

### 4. Members and CRM (MVP)

- Member profiles, photos, emergency contact, notes, tags, documents
- Leads pipeline: new lead → contacted → trial → member, with source and assigned staff
- Lead capture from the website widget form
- "At-risk" flag: no visit in N days, expiring soon, failed payment

### 5. Payments and billing

- Online card payments through the gateway abstraction; saved payment methods
- Cash, card terminal and bank transfer recorded at the front desk
- Invoices, receipts (PDF), refunds, credit notes, taxes/VAT, multi-currency
- Failed-payment retries and reminders (dunning)
- Point of sale for products (drinks, supplements, merchandise) and promo codes

### 6. Staff and employees

- Employee profiles, roles, locations, contracts, pay type (salary, hourly, per class)
- Shift schedules and clock-in/clock-out
- Commissions on PT sessions and membership sales
- Payroll export (hours, classes taught, commissions) — not a full payroll engine

### 7. Finance

- Expenses with categories (rent, utilities, salaries, equipment, marketing, maintenance), recurring expenses, receipts upload
- Revenue pulled automatically from billing; costs from expenses and staff pay
- Monthly P&L, cash flow, budgets vs actuals, per location

### 8. Marketing and sales

- Email, SMS and WhatsApp campaigns to segments (e.g. expired in last 90 days)
- Automations: welcome, first-visit follow-up, birthday, membership expiring, win-back, failed payment
- Promo codes, referral rewards, trial offers

### 9. Member portal (PWA)

- Browse schedule, book, cancel, join waitlist
- Buy and renew memberships, manage payment methods, download receipts
- QR code for check-in, visit history, profile

### 10. Inventory (add-on)

- Products, stock per location, low-stock alerts, supplier costs

### 11. Reports and exports

- Every list exports to CSV/Excel; scheduled email reports (daily summary to owner)

### 12. Settings, integrations and audit

- Branding, locations, hours, policies, taxes, notification templates (en/ar)
- API keys, webhooks, allowed website origins, custom domain
- Audit log: who changed prices, refunded, deleted, exported or impersonated

## 7. Plans and feature flags

Sell four plans plus add-ons; every feature and limit is data in the database, so you change what a gym gets without deploying code.

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Classes, bookings, waitlist, check-in | Yes | Yes | Yes | Yes |
| Memberships and member CRM | Yes | Yes | Yes | Yes |
| Website widget and hosted booking page | Yes | Yes | Yes | Yes |
| Cash and manual payments | Yes | Yes | Yes | Yes |
| Online payments and member portal | — | Yes | Yes | Yes |
| Leads pipeline, promo codes | — | Yes | Yes | Yes |
| Sales and retention dashboards | — | Yes | Yes | Yes |
| Staff, shifts, commissions | — | — | Yes | Yes |
| Finance: expenses, P&L, costs dashboard | — | — | Yes | Yes |
| Marketing automations, SMS/WhatsApp | — | Add-on | Yes | Yes |
| Pricing insights and staff performance | — | — | Yes | Yes |
| Staff SSO (Google/Microsoft), custom roles | — | — | Yes | Yes |
| Public API, webhooks, custom domain | — | — | Yes | Yes |
| Multi-location consolidated reports | — | — | — | Yes |
| Dedicated database, white label, SLA | — | — | — | Yes |
| Locations included | 1 | 1 | 3 | Unlimited |
| Active members included | 300 | 1,000 | 3,000 | Custom |

The limits above are starting points — set real numbers once you price the plans.

### How entitlements work

- features table: every feature key (e.g. finance.pnl, marketing.automations) and limit key (e.g. limit.locations)
- plans and plan_features: which features and limit values each plan includes
- tenant_subscriptions: the tenant's current plan and billing status
- tenant_feature_overrides: turn a feature on/off or change a limit for one tenant (trials, deals, add-ons)
- Effective entitlements = plan + add-ons + overrides, cached in Redis per tenant

### Enforcement

- API: a @RequiresFeature('finance.pnl') guard on controllers, and limit checks before creating locations, members or staff
- UI: the admin app reads the entitlement list; locked features show a short "Available on Pro" upgrade card instead of disappearing
- Usage metering: members, locations, staff, SMS/WhatsApp messages sent — visible to the tenant and to you

### Billing the gyms (your revenue)

- Monthly or annual subscription per tenant, with add-ons and message credits
- Trial period, grace period on failed payment, then read-only mode (never delete data)

## 8. Dashboards and analytics

Seven gym dashboards (plus one platform dashboard for you) answer the owner's questions — how much we make, what it costs, who is leaving, what sells and who performs — and an Insights panel turns the numbers into suggested actions.

### Layout of every dashboard

- Top row: 4–6 KPI cards (number, change vs previous period, small trend line)
- Below: 2–4 charts, then one table with drill-down to the underlying records
- Filters: date range, location, and where relevant trainer, plan or class type
- Every number clickable to the list behind it; every view exportable

| Dashboard | Key numbers (KPI cards) | Charts and tables |
|---|---|---|
| Owner overview | Revenue this month, MRR, active members, new vs cancelled, check-ins today, overdue payments | Revenue trend 12 months, member growth, today's classes, alerts |
| Sales | New leads, trial-to-member conversion %, sales value, average sale, renewals due 30 days | Lead funnel by stage, conversion by source, sales by staff member, promo code usage |
| Revenue and finance | Revenue, costs, net profit, profit margin %, average revenue per member | Revenue by stream (memberships, PT, classes, retail), costs by category, monthly P&L table, cash flow, budget vs actual |
| Memberships and retention | Churn rate %, retention %, average membership length, frozen, expiring 30 days | Retention cohorts by join month, churn reasons, at-risk members list, plan mix |
| Classes and utilisation | Average fill rate %, no-show rate %, waitlist demand, check-ins | Fill rate heatmap (day × hour), fill rate by class type and trainer, most/least popular classes |
| Staff performance | Classes taught, average attendance per class, PT sessions, sales closed, revenue attributed | Ranking table per staff member, revenue per hour worked, member feedback score, commissions due |
| Pricing | Revenue per plan, discount cost, average price paid vs list price | Plan mix over time, conversion before/after a price change, peak vs off-peak demand |
| Platform (yours) | Tenants, platform MRR, trials, churned tenants, active members across tenants | Tenants by plan, usage vs limits, signups over time, tenant health list |

### Insights panel (rule-based first)

- "Tuesday 6 pm HIIT was 100% full with a waitlist for 4 weeks — add a session or raise its drop-in price"
- "Weekday 11 am–3 pm classes average 25% fill — consider an off-peak membership"
- "18 members haven't visited in 14 days — send a win-back message"
- "Trial conversion fell from 40% to 28% this month — review follow-up by front desk"
- "Equipment maintenance costs are up 35% vs your 3-month average"
- Each insight links to the data and, where possible, a one-click action (create class, start campaign)
- Later: forecasting (revenue next 3 months, churn prediction) once there is enough history

### How analytics is computed

- Never query raw tables for heavy dashboards; the worker builds nightly and hourly rollup tables: daily_revenue, daily_attendance, class_utilisation, membership_snapshots, staff_daily_stats, lead_funnel_daily
- Rollups are per tenant and per location, so filters stay fast
- Today's numbers come from live queries on small, indexed ranges
- Move to a columnar store (ClickHouse) only if rollups become slow

### Key metric definitions (agree on these once)

- MRR = sum of active recurring memberships normalised to one month
- Churn rate = members who ended in the period ÷ active members at period start
- Fill rate = booked (or attended) ÷ capacity
- Trial conversion = trials that became paid members within 30 days ÷ trials started
- Net profit = revenue − (expenses + staff costs) for the period

## 9. Core data model

About 75 tables in 11 groups; every table below except the platform group carries tenant_id, created_at, updated_at, and soft-delete where records must stay for history.

| Group | Tables | Key columns and notes |
|---|---|---|
| Platform | tenants, plans, features, plan_features, tenant_subscriptions, tenant_feature_overrides, platform_users | tenants: slug, name, status, default_language, timezone, currency, custom_domain |
| Tenant setup | locations, rooms, resources, tenant_settings, opening_hours, holidays, api_keys, allowed_origins | api_keys: type (publishable/secret), hashed key, last_used_at |
| Identity | users, tenant_memberships, roles, permissions, role_permissions, user_roles, sso_connections | users global; tenant_memberships links a user to a tenant; user_roles can be scoped to a location |
| Members and CRM | members, member_contacts, leads, lead_activities, tags, member_tags, notes, documents, waivers | leads: source, stage, assigned_staff_id, converted_member_id |
| Catalogue | class_types, membership_plans, plan_prices, products, promo_codes | membership_plans: type, duration, credits, allowed_locations, off_peak rules; prices versioned |
| Scheduling and booking | schedules, sessions, trainer_availability, bookings, waitlist_entries, check_ins, booking_policies | sessions: starts_at (UTC), capacity, trainer_id, room_id; bookings: status (booked, cancelled, late_cancel, no_show, attended) |
| Memberships | member_subscriptions, subscription_freezes, credit_ledger | credit_ledger is append-only: +credits on purchase, −credits on booking |
| Billing | invoices, invoice_lines, payments, refunds, payment_methods, payment_gateway_accounts, sales (POS) | Money as integer minor units + currency code; never store card numbers |
| Staff and finance | employees, shifts, time_entries, commission_rules, commissions, expense_categories, expenses, budgets | employees links to users; expenses: amount, category, location, recurring rule, receipt file |
| Marketing and system | campaigns, automations, messages, notification_templates, webhooks, webhook_deliveries, audit_logs, outbox_events | outbox_events guarantees domain events reach the queue |
| Analytics rollups | daily_revenue, daily_attendance, class_utilisation, membership_snapshots, staff_daily_stats, lead_funnel_daily | Rebuilt by the worker; safe to drop and recompute |

### Rules

- UUID primary keys (UUIDv7 for sortable ids)
- All timestamps in UTC; convert with the tenant/location time zone in the UI
- Money: amount_minor BIGINT + currency CHAR(3); no floats
- Booking capacity enforced with a transaction + row lock on the session to prevent overbooking
- Prices are versioned so past invoices keep the price at the time of sale

## 10. Website integration

Offer three ways in, from easiest to most flexible: a copy-paste widget, hosted booking pages, and a public API with webhooks.

### 1. Embeddable widget (main path)

```
<script src="https://cdn.yourapp.com/widget/v1.js" defer></script>
<gym-schedule tenant="ironfit" location="downtown" lang="ar"></gym-schedule>
<gym-plans tenant="ironfit"></gym-plans>
<gym-lead-form tenant="ironfit"></gym-lead-form>
```

- Web Components with Shadow DOM, so the website's CSS never breaks the widget (and the reverse)
- Components: schedule/booking, membership plans + checkout, lead/trial form, member login, "my bookings"
- Styled by the tenant's branding; overridable with CSS variables (--gym-primary, --gym-radius, --gym-font)
- English/Arabic with automatic right-to-left layout
- Uses the publishable API key; only works on the tenant's allowed origins
- Bundle under ~60 KB gzipped; loads lazily
- iframe fallback for site builders that block custom scripts

### 2. Hosted pages

- ironfit.yourapp.com (or book.ironfitgym.com): schedule, plans, checkout, member portal
- A gym's website can simply link to it — zero integration work

### 3. Public API and webhooks (Pro+)

- REST, versioned (/v1), documented with OpenAPI at docs.yourapp.com
- Publishable key for public reads (schedule, plans); secret key for server-to-server
- Rate limits per key; idempotency keys on POST requests
- Webhooks signed with HMAC-SHA256, retried with backoff: booking.created, booking.cancelled, member.created, membership.renewed, membership.expired, payment.succeeded, payment.failed, lead.created, checkin.created

### For your own website projects

- Publish a small npm package (@yourapp/react) with React components wrapping the widget, so sites you build integrate in minutes

## 11. Member experience

Members never see the staff dashboard: they sign up on the gym's website and manage everything in a separate, gym-branded member portal that only shows their own data.

### Where members interact

| Entry point | Purpose | Where it lives |
|---|---|---|
| Website widget | Discover and join: schedule, plans, sign-up, trial form, quick login to "My bookings" | Inside the gym's own website |
| Member portal (PWA) | Their account: book, membership, payments, profile, check-in code | ironfit.yourapp.com or app.ironfitgym.com; installable on the phone home screen |
| Front desk | Walk-ins and members who don't want to sign up online | Admin app, staff creates the member and sends an invite link |

### Sign-up flow (from the website)

- Member picks a plan or "Free trial" in the widget
- Fills in the sign-up form (fields below), on one short page on mobile
- Verifies phone (OTP by SMS/WhatsApp) or email (link)
- Reads and signs the gym's waiver (typed name + checkbox, or drawn signature)
- Pays online, or chooses "Pay at the front desk" if the gym allows it (membership stays "pending" until paid)
- Account is created; welcome message by email/WhatsApp with the portal link and their check-in QR code
- Lands on "Book your first class"
- Existing member added by front desk: matched by phone or email; they get an invite link to set a password or connect Google/Apple — no duplicate profiles
- Trial sign-up creates a lead (section 6, CRM) and a trial pass, not a paid membership
- Target: sign-up done in under 2 minutes on a phone

### Sign-up fields (each gym chooses required / optional / hidden)

| Field | Default | Notes |
|---|---|---|
| First and last name | Required |  |
| Mobile phone | Required | Used for login OTP and WhatsApp |
| Email | Required | Can be optional if phone login is used |
| Date of birth | Required | Under-18s need a guardian (see below) |
| Emergency contact (name + phone) | Required |  |
| Waiver signature | Required | Versioned: re-sign when the gym updates the waiver |
| Gender | Optional | Some gyms run women-only classes or hours |
| Photo | Optional | Shown at check-in; front desk can take it later |
| Health questionnaire | Hidden | Short readiness questions; stored encrypted, visible to managers and trainers only |
| ID number | Hidden | Only if the gym needs it; stored encrypted |
| Address | Hidden |  |
| How did you hear about us | Optional | Feeds lead source in the Sales dashboard |
| Referral code | Optional | Triggers referral reward |
| Marketing consent | Optional, unticked | Separate for email and WhatsApp/SMS |

- Stored per tenant in signup_field_settings; Pro+ gyms can add custom fields (custom_fields, custom_field_values)

### Portal screens

| Screen | Member sees | Member can |
|---|---|---|
| Home | Next booking, check-in QR code, membership status and expiry, credits left, alerts (renewal due, payment failed) | Cancel next booking, renew, add to calendar |
| Book | Schedule by day, filter by class type, trainer, location; spots left; waitlist position | Book, cancel within policy, join waitlist, book PT with a trainer |
| Membership | Current plan, start/end dates, credits history, freezes | Renew, upgrade (pays the difference), request freeze or cancellation |
| Payments | Invoices, receipts, saved cards, upcoming charge | Pay outstanding balance, download receipts, change card |
| Profile | Personal details, emergency contact, family members, notification and language settings | Edit details, change login method, manage consents, download or delete their data |

### What members can change

- Edit themselves: contact details, photo, emergency contact, login method, language, notification preferences, marketing consent
- Request, staff approve: freeze, cancellation, refund (each gym can set freeze or cancel to automatic)
- Locked (staff only): membership dates, prices, discounts, payments, attendance, staff notes and tags

### Family and minors

- One guardian account can hold several family member profiles and book or pay for them
- Members under 18 need a guardian's waiver signature; the gym sets the minimum age

### Notifications to members

- Booking confirmed, reminder before class (default 2 hours), waitlist promoted, class cancelled by the gym
- Membership expiring (7 days and 1 day before), payment receipt, payment failed
- Channels: email, WhatsApp/SMS, push (from the installed portal); the member chooses, the gym sets the defaults

### Branding

- Gym logo, colours, language and domain everywhere; your product name stays in the background
- Small "Powered by …" footer on lower plans, removed with white label (Enterprise)

### Security rules

- Member role reads and writes only their own records (and their family profiles) through /v1/me/... endpoints
- Any member token on a staff endpoint returns 403; tests cover this for every staff endpoint
- Data model additions: members.user_id (link to login), member_guardians, waiver_signatures (with waiver version), consents

### Done when

- A new member signs up from the widget on a phone, pays and books a first class without staff help
- An existing front-desk member claims their account by invite with no duplicate created
- Every portal screen works in Arabic (RTL) and on a 360 px wide screen
- Isolation tests prove a member can't see other members' data or any staff page

## 12. UI and UX guidelines

Calm, plain and readable: light background, one accent colour, large clear numbers, and no screen that needs explaining.

### Layout

- Left sidebar with at most 8 items: Dashboard, Schedule, Bookings, Members, Sales, Staff, Finance, Settings (hidden items follow role and plan)
- Top bar: location switcher, search (members by name/phone), notifications, user menu, language toggle (EN/عربي)
- Pages follow one pattern: title + main action button on the right, filters row, then content
- Front-desk mode: a simplified full-screen check-in and sell screen for tablets

### Visual style

- Light theme by default, optional dark theme
- Neutral greys plus one accent colour (the tenant's brand colour); green/amber/red only for status
- Base font size 16 px, generous spacing, rounded corners (8 px), soft borders instead of heavy shadows
- Font: Inter for Latin, IBM Plex Sans Arabic (or Cairo) for Arabic
- Icons from one set only (Lucide)
- No decorative animations; subtle transitions only

### Components

- KPI cards: label, big number, % change with arrow, tiny trend line
- Tables: search, filters, sort, pagination, row click opens a side panel instead of a new page
- Forms: single column, labels above fields, sensible defaults, inline validation
- Calendar: week view with colour per class type; drag to reschedule
- Empty states: one sentence + one button ("No classes yet — Create your first class")
- Confirmation dialogs only for destructive actions

### Usability rules

- Book a member into a class in 3 clicks or fewer; check in a member in 2
- Every page works on a tablet; member portal and widget are mobile-first
- Full RTL support: layouts mirror, numbers and charts stay readable
- Accessibility: WCAG 2.1 AA contrast, keyboard navigation, visible focus
- Use shadcn/ui components unchanged as much as possible — consistency over custom design

Before building: make a simple design system page (colours, type, buttons, cards, table, form) and 5 key screens — owner dashboard, schedule, member profile, check-in, widget — and approve them first

## 13. DevOps and deployment

Ship everything as Docker images through GitHub Actions to three environments; start on a simple single-region setup and move to AWS managed services when paying tenants justify it.

### Environments

- Local: docker compose up runs Postgres, Redis, Keycloak, MinIO (S3), Mailpit, API, worker, admin, widget
- Staging: same images as production, seeded demo tenants, auto-deployed from main
- Production: deployed by tagging a release, with manual approval

### Hosting in two stages

| Stage | When | Setup |
|---|---|---|
| Launch | First ~20 gyms | One or two VPS (e.g. Hetzner or DigitalOcean) with Docker Compose or Coolify, managed PostgreSQL, Cloudflare in front (DNS, TLS, CDN for the widget) |
| Scale | Growth and Enterprise clients | Terraform on AWS: ECS Fargate (api, worker, admin), RDS PostgreSQL Multi-AZ, ElastiCache Redis, S3 + CloudFront, Secrets Manager, ALB + WAF |

### CI/CD pipeline (GitHub Actions)

- On every pull request: install, lint, type-check, unit tests, integration tests against real Postgres (Testcontainers), tenant-isolation tests, build
- Security checks: dependency audit, secret scanning, container image scan (Trivy)
- On merge to main: build and push images, run DB migrations on staging, deploy staging, smoke tests
- On release tag: migrations on production (expand-then-contract, never breaking), rolling deploy, smoke tests, automatic rollback on failure
- Widget bundle published to the CDN with a versioned path (/widget/v1.x.y.js) and a stable /widget/v1.js alias

### Monitoring and operations

- Structured JSON logs with tenant_id, user_id, request_id on every line
- OpenTelemetry traces; Sentry for errors in API, admin and widget
- Dashboards and alerts: error rate, API latency (p95), queue backlog, DB connections, failed payments, failed webhooks
- Uptime checks on API, admin, widget CDN; public status page
- Health endpoints: /health/live, /health/ready

### Backups and recovery

- Point-in-time recovery on PostgreSQL (at least 7 days); nightly encrypted dump to separate storage, kept 30 days
- Monthly restore test into a scratch environment, written down
- Per-tenant export (all their data as CSV/JSON) for offboarding and data requests
- Targets to start: recover within 4 hours, lose at most 15 minutes of data

### Configuration and secrets

- All config via environment variables, validated at startup
- Secrets in a secret manager, never in the repo; separate keys per environment
- Payment gateway credentials per tenant stored encrypted (envelope encryption)

## 14. Security and compliance

The biggest risk in this product is one gym seeing another gym's data, so tenant isolation is tested on every build; the rest follows OWASP ASVS Level 2 as the baseline.

- Tenant isolation: RLS on every tenant table, app DB role without bypass, automated cross-tenant tests in CI
- Authentication: MFA required for owners and managers, optional for others; short-lived access tokens (~15 min) with rotating refresh tokens; session revocation
- Authorisation: permission checks on every endpoint (deny by default); object-level checks so ids from another tenant or location return 404
- Payments: card data never touches your servers — hosted fields / checkout from the gateway; you store only tokens and last 4 digits
- Widget: publishable keys are read-only for public data; allowed origins per tenant; strict CORS; CSP-friendly bundle; bot protection (Cloudflare Turnstile) on lead and signup forms
- API: rate limiting per key, IP and tenant; input validation (Zod or class-validator) on every request; idempotency keys for payments and bookings
- Webhooks: HMAC signatures with timestamp to block replays; secrets rotatable per endpoint
- Data protection: TLS everywhere; encryption at rest; sensitive fields (phone, emergency contact, health notes) encrypted at column level where practical
- Privacy: member data export and deletion on request; consent flags for marketing messages; data retention settings per tenant; privacy policy and data processing agreement for gyms
- Audit log: price changes, refunds, deletions, exports, role changes, impersonation — who, what, when, from where
- Supply chain: pinned dependencies, Dependabot/Renovate, image scanning, signed releases
- Operations: least-privilege cloud IAM, separate production access, yearly external penetration test once you have paying Enterprise clients

Check the data-protection law in each country you sell in (for example GDPR for EU members) before launch there.

## 15. Phased roadmap

Six phases; Phase 1 ends with a product you can sell to your first gym, and each later phase unlocks a higher plan. Each phase finishes only when its exit gate passes.

### Phase 0 — Foundations

- Monorepo, Docker Compose, CI pipeline, staging deploy
- Tenancy core: tenants, locations, RLS, tenant resolution middleware, isolation tests
- Keycloak with Organizations, login for staff, token claims, roles and permissions
- Entitlements skeleton: features, plans, guard, UI gating
- Admin app shell: sidebar, top bar, theme, EN/AR with RTL, design system page
- Platform console: create tenant, assign plan
- Exit gate: two demo tenants on staging; cross-tenant tests pass; a staff user logs in and sees only their gym

### Phase 1 — MVP (first sellable version)

- Class types, rooms, schedules, sessions, bookings, waitlist, cancellation rules
- Members, membership plans, subscriptions, credits, freezes
- Front-desk check-in with QR; cash/manual payments and receipts
- Embeddable widget (schedule + booking + lead form) and hosted booking page
- Email notifications: booking confirmation, reminder, membership expiring
- Owner overview dashboard
- Exit gate: a real gym runs a week of classes on it from its website without your help

### Phase 2 — Payments and sales

- Payment gateway abstraction + first gateway; online checkout; invoices; dunning
- Member portal (PWA)
- Leads pipeline, trials, promo codes, referrals
- Sales and Memberships/retention dashboards
- Your own SaaS billing for tenants (plans, trials, grace period)
- Exit gate: a member buys a membership online and books a class end to end; a tenant is billed automatically

### Phase 3 — Staff and finance

- Employees, shifts, clock-in, commission rules, payroll export
- Expenses, categories, budgets, P&L, cash flow
- Revenue and finance dashboard, Staff performance dashboard, Classes/utilisation dashboard
- Analytics rollup jobs
- Exit gate: an owner sees monthly profit per location and staff rankings that match their own records

### Phase 4 — Growth features

- Marketing automations; SMS and WhatsApp
- Insights panel and Pricing dashboard
- Staff SSO per tenant (Google/Microsoft), custom roles
- Public API, webhooks, API docs, custom domains
- POS and inventory add-on
- Exit gate: Pro plan fully usable; a tenant connects their Google Workspace SSO themselves

### Phase 5 — Enterprise and scale

- Multi-location consolidated reporting for chains
- Dedicated database option, white label
- Move to the AWS "Scale" setup; load tests; penetration test
- Forecasting (revenue, churn)
- Exit gate: a multi-branch chain onboarded with its own database and SLA

## 16. Handing this to Claude Code

Export this doc as Markdown into the repo as docs/PLAN.md, add the CLAUDE.md below at the root, then build one phase at a time with the prompts at the end.

### Repository structure

```
gym-saas/
  CLAUDE.md
  docs/
    PLAN.md              # this document
    adr/                 # architecture decision records
    metrics.md           # KPI definitions (section 8)
  apps/
    api/                 # NestJS API + worker entrypoint
      src/modules/       # tenancy, identity, booking, membership, ...
    admin/               # Next.js admin + platform console
    portal/              # member PWA
    widget/              # web components bundle
  packages/
    db/                  # Prisma schema, migrations, RLS SQL, seed
    shared/              # types, zod schemas, constants
    ui/                  # shared components (shadcn-based), theme, RTL
    sdk-react/           # @yourapp/react wrapper for websites
  infra/
    docker/              # Dockerfiles, docker-compose.yml
    terraform/           # AWS (scale stage)
    keycloak/            # realm export, themes
  .github/workflows/     # CI/CD
```

### CLAUDE.md (starter)

```
# Gym SaaS — rules for Claude Code

Read docs/PLAN.md before any task. Work only on the current phase.

## Stack
pnpm + Turborepo, NestJS API, Next.js admin, Prisma + PostgreSQL 16, Redis + BullMQ,
Keycloak (Organizations), Tailwind + shadcn/ui, Web Components for the widget.

## Tenancy rules (never break these)
- Every tenant-owned table has tenant_id UUID NOT NULL + RLS policy + index.
- Never query outside the request-scoped DB client that sets app.tenant_id.
- Jobs always carry tenantId and set it before touching the DB.
- Unique constraints include tenant_id.
- Add a cross-tenant test for every new tenant-owned table and endpoint.

## Conventions
- One NestJS module per domain in apps/api/src/modules.
- Money = amount_minor BIGINT + currency. Timestamps in UTC.
- Validate every input with zod schemas from packages/shared.
- Gate features with @RequiresFeature('<key>') and check plan limits.
- Every UI string goes through i18n (en, ar); layouts must work RTL.
- UI: shadcn/ui components, light theme, one accent colour, no custom flourishes.

## Commands
- pnpm dev / pnpm test / pnpm lint / pnpm typecheck
- pnpm db:migrate / pnpm db:seed
- docker compose -f infra/docker/docker-compose.yml up

## Definition of done
Tests pass (unit + integration + isolation), lint and typecheck clean,
migration included, seed updated, docs/adr updated for new decisions.
```

### Prompt sequence

- "Read docs/PLAN.md and CLAUDE.md. In plan mode, propose the Phase 0 task breakdown and the first ADRs (stack, tenancy, auth). Don't write code yet."
- "Scaffold the monorepo, Docker Compose (Postgres, Redis, Keycloak, MinIO, Mailpit) and the CI workflow from section 13."
- "Implement the tenancy core: Prisma schema for platform + tenant setup tables, RLS policies, request-scoped client, tenant resolution middleware, and cross-tenant isolation tests."
- "Integrate Keycloak: realm export, Organizations per tenant, token claims, NestJS auth guard, roles and permissions from section 5."
- "Build the entitlements module and guard from section 7, seeded with the four plans."
- "Build the admin app shell and design system page from section 12, with EN/AR and RTL."
- Continue Phase 1 module by module: one prompt per module, each ending with tests and a demo seed

### Tips

- Keep each prompt to one module or one vertical slice (API + UI + tests)
- Ask Claude Code to update docs/PLAN.md checkboxes and write an ADR whenever it makes a decision
- Review each phase against its exit gate before starting the next

### Open questions to settle before Phase 2

- Which countries you'll sell in first — decides payment gateways, currencies, tax and privacy rules
- Plan prices and limits (section 7)
- TypeScript (recommended) or Spring Boot for the API
- Keycloak self-hosted or a managed auth provider

## Progress

Updated by Claude Code as work lands. Exit gates must pass before the next phase starts.

### Phase 0 — Foundations

- [x] Monorepo (pnpm + Turborepo), shared types package, lint/typecheck/test scripts
- [x] Docker Compose: Postgres 16, Redis, Keycloak, MinIO, Mailpit (+ api/worker/admin images, profile `app`)
- [x] CI workflow: lint, typecheck, unit tests, migrations + isolation tests on Postgres, build, security scans
- [ ] Staging deploy
- [x] Tenancy core: platform + tenant-setup + identity tables, RLS policies, two DB roles, `withTenant()` client
- [x] Tenant resolution middleware (token → API key → domain, mismatch rejected)
- [x] Cross-tenant isolation tests (database and HTTP level)
- [x] Keycloak realm export (Organizations, audience + organization mappers); API verifies Keycloak JWTs
- [ ] Admin app login through Keycloak (Authorization Code + PKCE) — dev sign-in in place meanwhile
- [ ] Keycloak Organization created automatically with each tenant (Admin API)
- [x] Roles and permissions (defaults per section 5), deny-by-default access guard
- [x] Entitlements: features, plans, overrides, `@RequiresFeature` guard, limit checks, UI upgrade cards
- [x] Admin shell: sidebar, top bar, theme tokens, EN/AR with RTL, design-system page
- [x] Platform console: list tenants, create tenant, assign plan
- [ ] Exit gate: two demo tenants on staging; cross-tenant tests pass; a staff user logs in and sees only their gym

### Phase 1 — MVP

- [x] Class types, weekly schedules → sessions generated 5 weeks ahead (location time zone, holidays skipped)
- [x] Bookings with capacity enforced under a row lock; waitlist with automatic promotion; late-cancel policy
- [x] Members, membership plans (recurring, fixed term, class pack, drop-in, trial), memberships with credits (append-only ledger) and freezes
- [x] Front-desk check-in by QR code or search, with alerts; links today's booking as attended
- [x] Cash / card terminal / bank transfer payments with sequential receipt numbers and a printable receipt
- [x] Embeddable widget (`<gym-schedule>`, `<gym-lead-form>`, Web Components, ~14 KB gzipped) and hosted booking page `/book/<slug>`
- [x] Member sign-in for the widget by emailed 6-digit code (ADR 0004), "My bookings" with cancel
- [x] Widget allowed only on the gym's allowed websites (per-tenant origin check)
- [x] Email notifications through the outbox + worker: booking confirmation, cancellation, waitlist promotion, class cancelled, reminder, membership expiring (EN/AR)
- [x] Owner overview dashboard (live KPIs, 12-month revenue, today's classes, alerts)
- [x] Integration tests for every flow above, including cross-tenant checks
- [ ] Rooms: table exists and classes can carry a room, but there is no screen or API to create rooms or pick one
- [x] Auto-renew members get the "ending soon" emails too (actual automatic renewal comes with online payments in Phase 2)
- [x] Members see their own check-in QR code and current membership in the widget's "My bookings"
- [ ] Late-cancel and no-show fees (credit loss works; charging a fee needs Phase 2 payments)
- [ ] Calendar views by trainer and by room; drag-to-reschedule; trainer availability / PT appointments; resource booking
- [ ] Digital waivers and e-signature; family memberships; at-risk member flag
- [ ] Gate blockers outside Phase 1: staff sign-in that works in production (Keycloak, Phase 0), a deployed environment, a real email provider (Resend/SES), widget bundle on a CDN
- [ ] Exit gate: a real gym runs a week of classes on it from its website without your help

Phase 1 gate check, 2026-11-24: 65/65 automated tests pass, lint and typecheck clean. Not ready for the exit gate — see the open items above.

### Phase 3 — Staff and finance (started ahead of Phase 2)

- [x] Employees (salary / hourly / per-class pay, commission on memberships sold, linked sign-in), pay changes audited
- [x] Shifts and a week rota; clock-in / clock-out (one open entry per person, enforced in the database), top-bar time clock for anyone on the team
- [x] Payroll per month (hours, classes taught, sales, base + commission) and CSV export for the accountant
- [x] Expense categories (defaults created with every gym, EN/AR), expenses with monthly repeating templates (worker adds each month's copy), budgets per category and month
- [x] Finance overview: revenue, costs (expenses + staff pay), net and margin; 12-month revenue vs costs; costs vs budget; revenue by stream
- [x] Staff and Finance screens in the admin app (EN/AR), demo data, integration tests (roles, plan gating, time clock rules, expenses, budgets, cross-tenant RLS)
- [x] P&L per location: revenue by member home location, expenses by location, staff pay by where hours and classes happened (ADR 0005); gym-wide costs spread by revenue share; adds up to the overview and payroll
- [x] Staff performance rankings (classes, class fill, check-ins, no-shows, memberships sold, sales; pay per check-in for finance roles)
- [x] Per-person access: the owner sets each staff member's role and, per area, Hidden / View / Manage (ADR 0006); audited; Pro for per-area tweaks
- [x] Team calendar (week grid): everyone's shifts, activities and classes; overlapping slots side by side; click an empty spot to add; one person can't double-book; "My schedule" for every staff member
- [ ] Cash-flow view; classes/utilisation dashboard; analytics rollup jobs (figures are computed live today)
- [ ] Payroll is not a payroll engine (no tax, deductions or payslips) — export only, by design
- [ ] Exit gate: an owner sees monthly profit per location and staff rankings that match their own records

Phase 3 progress check, 2026-11-27: 104 automated tests pass (26 API unit, 58 integration, 20 shared), lint and typecheck clean. Profit per location and staff rankings are built and reconcile with the overview and payroll in tests; the exit gate still needs a real owner to compare them with their own records.

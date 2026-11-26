---
name: gym-admin-page
description: How to build or change screens in the gym-saas staff app (apps/admin, Next.js + Tailwind) so they match the design system and work in English and Arabic (RTL). Use it for any admin UI work in this repo — new pages, forms, tables, lists, settings tabs, dashboard cards, "make the members page better", "add a screen for refunds", "the schedule looks wrong in Arabic" — even when the user only describes what staff should see or do.
---

# Building admin screens

Staff use this app all day on desktops and front-desk tablets, in English or Arabic. The rules from
`docs/PLAN.md` section 12 apply: light theme, neutral greys, ONE accent (the gym's brand colour),
green/amber/red only for status, every screen does one job with the fewest clicks.

## Where things live (`apps/admin/src`)

| Need | Use |
|---|---|
| Page | `app/(app)/<route>/page.tsx` — async server component inside the staff shell |
| Data | `api<T>(path)` from `lib/api.ts` (server-side, sends the staff token) |
| Mutations | a `"use server"` actions file calling `act(path, { method, body }, back, then?)` from `lib/act.ts`; read form fields with `field`/`intField` |
| API errors | `act` redirects to `back?error=CODE`; render `<Notice>{err(sp.error)}</Notice>` |
| Strings | `getT()` → `{ t, lang, dir, err }` from `lib/i18n.ts`; keys in `lib/messages-phase1.ts` |
| Dates/money | `lib/format.ts`: `fmtTime`, `fmtDay`, `fmtDateTime`, `fmtDateOnly` (for @db.Date), `money`, `relativeDays`, `localDateIn` |
| Branch filter | `getLocationId(locations)` from `lib/location.ts` (top-bar choice, cookie) |
| Navigation | `lib/nav.ts` — max 8 items, grouped; hidden by permission, locked by plan |

Components (`components/ui.tsx`): `PageHeader` (title, subtitle, action), `SectionTitle`, `Card`,
`Button`, `Input`, `Select`, `Label`, `Badge` (status chip with dot), `Avatar`, `Tabs` (URL-based),
`FillMeter` (booked/capacity), `Notice`. In `components/blocks.tsx`: `KpiStrip`, `EmptyState`,
`LockedFeature` (upgrade card), `ComingSoon`.

## Page pattern

```tsx
export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("payment.take")) notFound();
  if (!me.entitlements?.features.includes("payments.manual")) return <LockedFeature feature="payments.manual" t={t} />;
  const rows = await api<Row[]>("/v1/refunds");
  return (
    <>
      <PageHeader title={t("refunds.title")} subtitle={…} action={<Button>…</Button>} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}
      {rows.length ? <Card className="overflow-x-auto p-0"><table>…</table></Card> : <EmptyState text={…} action={…} />}
    </>
  );
}
```

Check permission (hide) and plan feature (show `LockedFeature`, don't hide) separately — that's
the product rule: locked features stay visible as upgrade prompts.

## English + Arabic, every time

- Add every new key to **both** `en1` and `ar1` in `lib/messages-phase1.ts`. `ar1` is typed
  `Record<Phase1Key, string>`, so a missing Arabic string is a type error — good, keep it that way.
- Write real Arabic, not transliteration. Sentence case in English, no ALL CAPS labels.
- Layout uses logical classes only: `ms-/me-/ps-/pe-/start-/end-/border-s/border-e`, never
  `ml-/mr-/left-/right-`. Directional icons (chevrons, logout) get `className="rtl:-scale-x-100"`.
- Phone numbers, emails, codes, slugs, URLs: wrap in `dir="ltr"` so they don't scramble in RTL.
- Charts keep time flowing left → right (`dir="ltr"` on the chart wrapper); long Arabic month names
  need thinning (see `components/revenue-chart.tsx`). For any chart, load the `dataviz` skill first.

## Visual rules that keep it coherent

- The "studio" look: soft grey canvas, borderless white `Card`s (`--radius-card`, 22px), pill-shaped
  buttons/inputs/tabs, a dark icon rail (`bg-ink`), Plus Jakarta Sans (+ IBM Plex Sans Arabic).
  Dashboard pieces live in `components/studio.tsx` (`NextClassHero`, `FillGauge`, `StatCard`),
  `attendance-chart.tsx` and `mix-donut.tsx`. Dark feature cards use `bg-ink` / `ink-soft`.
- One accent: `bg-accent`, `text-accent`, `bg-accent-soft`, `accent-line`, `accent-deep` (follow the
  gym's colour automatically; violet by default).
  Neutral tokens: `bg`, `surface`, `sunken`, `border`, `muted`, `faint`, `fg` (see `app/globals.css`).
- Status colours (`success`, `warning`, `danger` + `-soft`) only for state, always with a label.
- Numbers: `tabular-nums`. Capacity anywhere: `FillMeter`.
- Avoid piles of identical cards: group related numbers in one `KpiStrip`, use tables for lists,
  `Tabs` for sub-sections. Empty states: one sentence + one button. Confirm only destructive actions.
- Server components by default. Client components (`"use client"`) only for interaction state;
  never import a helper from a client file into a server component — put shared helpers in `lib/`
  (a past bug: `niceTicks` exported from a client chart file crashed the dashboard).

## Verify before calling it done

```bash
cd apps/admin && npx tsc --noEmit && ../../node_modules/.bin/eslint src
```

Then look at it (see the `gym-run-local` skill to start the stack): sign in as the right role on
`/login`, check the page in English **and** Arabic (عربي button), at desktop width and phone width,
and as a role without the permission. Screenshots beat assumptions — this UI has had RTL label
collisions and stray scrollbars that only showed on screen.

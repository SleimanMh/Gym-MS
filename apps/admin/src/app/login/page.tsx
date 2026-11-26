import { CalendarCheck, QrCode, Wallet } from "lucide-react";
import { devLogin, setLanguage } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { devLoginEnabled } from "@/lib/auth";
import { getT, type MessageKey } from "@/lib/i18n";

/** Seeded demo users (packages/db/src/demo.ts). */
const DEMO_USERS = [
  { value: "owner@ironfit.test|ironfit", label: "Owner", gym: "IronFit · Pro", initials: "RH" },
  { value: "frontdesk@ironfit.test|ironfit", label: "Front desk", gym: "IronFit · Pro", initials: "LK" },
  { value: "coach@ironfit.test|ironfit", label: "Coach", gym: "IronFit · Pro", initials: "NA" },
  { value: "accounts@ironfit.test|ironfit", label: "Accountant", gym: "IronFit · Pro", initials: "JA" },
  { value: "member@ironfit.test|ironfit", label: "Member (no staff access)", gym: "IronFit", initials: "OS" },
  { value: "owner@pulse.test|pulse", label: "Owner", gym: "نادي بالس · Starter", initials: "MN" },
  { value: "platform@gym.local|", label: "Platform super admin", gym: "—", initials: "PA" },
];

const ERRORS: Record<string, MessageKey> = { sso: "auth.err.sso", expired: "auth.err.expired", state: "auth.err.state" };

/** Staff sign in through Keycloak; the seeded-user picker stays available in development. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const [{ t, lang }, { error, next }] = await Promise.all([getT(), searchParams]);
  const errorKey = error ? (ERRORS[error] ?? "auth.err.dev") : null;
  const ssoHref = `/auth/login${next && next.startsWith("/") && !next.startsWith("//") ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="grid min-h-screen bg-bg p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-3">
      {/* Brand panel (desktop): the studio look in one glance */}
      <section className="relative hidden flex-col justify-between overflow-hidden rounded-[28px] bg-ink p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[#6D5DF6] font-bold" aria-hidden>
            G
          </span>
          <span className="text-lg font-semibold">{t("app.name")}</span>
        </div>

        <div className="max-w-lg">
          <h2 className="text-[44px] font-semibold leading-[1.1] tracking-tight">{t("auth.hero.title")}</h2>
          <p className="mt-4 text-white/65">{t("auth.hero.body")}</p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm">
            {[
              [CalendarCheck, t("auth.hero.f1")],
              [QrCode, t("auth.hero.f2")],
              [Wallet, t("auth.hero.f3")],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof Wallet;
              return (
                <li key={i} className="flex items-center gap-2 rounded-full bg-white/8 px-3.5 py-1.5">
                  <I size={15} aria-hidden className="text-[#a99ffb]" />
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>

        {/* A sample "up next" card, as on the dashboard */}
        <div className="flex max-w-md items-center gap-4 rounded-[22px] bg-[#6D5DF6] p-5" aria-hidden>
          <div className="flex-1">
            <span className="rounded-full bg-white/18 px-2.5 py-0.5 text-xs">{t("auth.hero.next")}</span>
            <p className="mt-3 text-2xl font-semibold">HIIT</p>
            <div className="mt-3 flex -space-x-2 rtl:space-x-reverse">
              {["MK", "JT", "DS", "FD"].map((x) => (
                <span key={x} className="flex size-7 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#4b3fc4] ring-2 ring-[#6D5DF6]">
                  {x}
                </span>
              ))}
              <span className="flex size-7 items-center justify-center rounded-full bg-[#4b3fc4] text-[10px] font-bold ring-2 ring-[#6D5DF6]">+8</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 text-center">
            <p className="text-3xl font-semibold tabular-nums" dir="ltr">
              07:00
            </p>
            <p className="text-xs text-white/75">12/16</p>
          </div>
        </div>
      </section>

      {/* Sign-in */}
      <section className="flex flex-col items-center justify-center px-2 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:invisible">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-fg" aria-hidden>
                G
              </span>
              <span className="font-semibold">{t("app.name")}</span>
            </div>
            <form action={setLanguage}>
              <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
              <Button variant="secondary" className="h-9 px-4" lang={lang === "ar" ? "en" : "ar"}>
                {t("lang.switch")}
              </Button>
            </form>
          </div>

          <h1 className="text-[32px] font-semibold leading-tight">{t("auth.welcome")}</h1>
          <p className="mt-1 text-muted">{t("auth.welcomeHelp")}</p>

          <div className="mt-6">
            {errorKey && <Notice>{t(errorKey)}</Notice>}
            <a href={ssoHref} className="block">
              <Button className="h-12 w-full text-base">{t("auth.sso")}</Button>
            </a>
            <p className="mt-3 text-center text-sm text-muted">{t("auth.ssoHelp")}</p>
          </div>

          {devLoginEnabled && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-border" />
                {t("auth.or")}
                <span className="h-px flex-1 bg-border" />
              </div>
              <form action={devLogin} className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[0_1px_2px_rgba(18,18,24,0.04)]">
                <h2 className="text-sm font-semibold">{t("auth.devTitle")}</h2>
                <p className="mb-3 text-xs text-muted">{t("auth.devHelp")}</p>
                <fieldset>
                  <legend className="sr-only">{t("auth.devAs")}</legend>
                  <div className="grid gap-1">
                    {DEMO_USERS.map((u, i) => (
                      <label
                        key={u.value}
                        className="transition-subtle flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ring-1 ring-transparent hover:bg-sunken has-[:checked]:bg-accent-soft has-[:checked]:ring-accent/40"
                      >
                        <input type="radio" name="who" value={u.value} defaultChecked={i === 0} className="sr-only" />
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-deep" aria-hidden>
                          {u.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{u.label}</span>
                          <span className="block truncate text-xs text-faint">{u.gym}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" variant="secondary" className="mt-3 w-full">
                  {t("login.title")}
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

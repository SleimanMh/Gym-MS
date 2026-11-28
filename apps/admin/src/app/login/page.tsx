import { cookies } from "next/headers";
import { findGym, memberStart, memberVerify, signIn } from "@/app/actions";
import { Shell } from "@/components/auth-shell";
import { Button, Input, Label, Notice } from "@/components/ui";
import { currentGym, getGym } from "@/lib/api";
import { cn } from "@/lib/cn";
import { getT } from "@/lib/i18n";
import { COOKIE } from "@/lib/session";

/**
 * Sign-in (ADR 0007). At a gym's own address: staff email + password, or member email code.
 * At the bare address: "go to your gym", and sign-in for the platform team.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; as?: string; step?: string }> }) {
  const [{ t, lang, err }, sp, slug, gym, jar] = await Promise.all([getT(), searchParams, currentGym(), getGym(), cookies()]);
  const error = sp.error ? <Notice>{err(sp.error)}</Notice> : null;

  if (slug && !gym) {
    return (
      <Shell lang={lang} t={t}>
        <h1 className="text-2xl font-semibold">{t("auth.unknownGym")}</h1>
      </Shell>
    );
  }

  if (!gym) {
    return (
      <Shell lang={lang} t={t}>
        <h1 className="mb-1 text-2xl font-semibold">{t("auth.findGym")}</h1>
        <p className="mb-5 text-sm text-muted">{t("auth.findGymHelp")}</p>
        {error}
        <form action={findGym} className="flex gap-2">
          <Input name="slug" required aria-label={t("auth.gymAddress")} placeholder="ironfit" dir="ltr" autoCapitalize="none" />
          <Button type="submit">{t("auth.go")}</Button>
        </form>
        <div className="my-8 h-px bg-border" />
        <h2 className="font-semibold">{t("auth.platformTitle")}</h2>
        <p className="mb-4 text-xs text-muted">{t("auth.platformHelp")}</p>
        <StaffForm t={t} />
      </Shell>
    );
  }

  const member = sp.as === "member";
  const pendingEmail = jar.get(COOKIE.pendingEmail)?.value;
  return (
    <Shell lang={lang} t={t} color={gym.branding.primaryColor} gymName={gym.name}>
      <h1 className="mb-5 text-2xl font-semibold">{t("auth.welcomeTo", { gym: gym.name })}</h1>
      <nav className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-sunken p-1 text-sm font-medium">
        <a href="/login" aria-current={!member ? "page" : undefined} className={cn("rounded-full py-2 text-center", !member ? "bg-surface shadow-sm" : "text-muted")}>
          {t("auth.staff")}
        </a>
        <a href="/login?as=member" aria-current={member ? "page" : undefined} className={cn("rounded-full py-2 text-center", member ? "bg-surface shadow-sm" : "text-muted")}>
          {t("auth.member")}
        </a>
      </nav>
      {error}
      {!member ? (
        <>
          <p className="mb-4 text-sm text-muted">{t("auth.staffHelp")}</p>
          <StaffForm t={t} />
        </>
      ) : sp.step === "code" && pendingEmail ? (
        <form action={memberVerify} className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("auth.codeSent", { email: pendingEmail })}</p>
          <div>
            <Label htmlFor="code">{t("auth.code")}</Label>
            <Input id="code" name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" dir="ltr" className="text-center text-xl tracking-[0.4em]" />
          </div>
          <Button type="submit" className="h-11">
            {t("auth.signIn")}
          </Button>
          <a href="/login?as=member" className="text-center text-sm text-accent hover:underline">
            {t("auth.useAnother")}
          </a>
        </form>
      ) : (
        <form action={memberStart} className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("auth.memberHelp")}</p>
          <div>
            <Label htmlFor="memail">{t("auth.email")}</Label>
            <Input id="memail" name="email" type="email" required autoComplete="email" dir="ltr" />
          </div>
          <Button type="submit" className="h-11">
            {t("auth.sendCode")}
          </Button>
        </form>
      )}
    </Shell>
  );
}

function StaffForm({ t }: { t: Awaited<ReturnType<typeof getT>>["t"] }) {
  return (
    <form action={signIn} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" dir="ltr" />
      </div>
      <div>
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" />
      </div>
      <Button type="submit" className="h-11">
        {t("auth.signIn")}
      </Button>
    </form>
  );
}

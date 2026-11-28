import { changePassword } from "@/app/actions";
import { Button, Input, Label, Notice } from "@/components/ui";
import { getGym } from "@/lib/api";
import { getT } from "@/lib/i18n";
import { Shell } from "@/components/auth-shell";

/** First sign-in: the emailed temporary password, then the person's own (ADR 0007). */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, sp, gym] = await Promise.all([getT(), searchParams, getGym()]);
  // The API's password rules come back as a validation error: show them in words.
  const error = sp.error === "VALIDATION_FAILED" ? t("auth.newHelp") : sp.error ? err(sp.error) : null;
  return (
    <Shell lang={lang} t={t} color={gym?.branding.primaryColor} gymName={gym?.name}>
      <h1 className="mb-1 text-2xl font-semibold">{t("auth.newTitle")}</h1>
      <p className="mb-5 text-sm text-muted">{t("auth.newHelp")}</p>
      {error && <Notice>{error}</Notice>}
      <form action={changePassword} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="currentPassword">{t("auth.current")}</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" dir="ltr" />
        </div>
        <div>
          <Label htmlFor="newPassword">{t("auth.new")}</Label>
          <Input id="newPassword" name="newPassword" type="password" required minLength={10} autoComplete="new-password" dir="ltr" />
        </div>
        <div>
          <Label htmlFor="confirm">{t("auth.confirm")}</Label>
          <Input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" dir="ltr" />
        </div>
        <Button type="submit" className="h-11">
          {t("auth.saveSignIn")}
        </Button>
      </form>
    </Shell>
  );
}

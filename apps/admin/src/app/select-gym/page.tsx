import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";

/**
 * After signing in, staff who work at several gyms choose one; with exactly one gym this page
 * is skipped. Memberships come from our database (ADR 0003), not from Keycloak.
 */
export default async function SelectGymPage() {
  const [{ t }, me] = await Promise.all([getT(), getMe()]);
  if (!me) redirect("/login");
  const gyms = await api<{ tenantId: string; slug: string; name: string }[]>("/v1/me/tenants");
  if (gyms.length === 1 && !me.platformRole) redirect(`/auth/select?slug=${gyms[0]!.slug}`);
  if (gyms.length === 0 && me.platformRole) redirect("/platform");

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-ink font-bold text-white" aria-hidden>
            G
          </span>
          <span className="font-semibold">{t("app.name")}</span>
        </div>
        <h1 className="text-[30px] font-semibold leading-tight">{gyms.length ? t("gym.pick") : t("app.name")}</h1>
        <p className="mt-1 mb-6 text-muted">{gyms.length ? t("gym.pickHelp") : t("gym.none")}</p>
        {gyms.length > 0 && (
          <ul className="mb-6 flex flex-col gap-2">
            {gyms.map((g) => (
              <li key={g.tenantId}>
                <a
                  href={`/auth/select?slug=${g.slug}`}
                  className="transition-subtle flex items-center gap-4 rounded-[var(--radius-card)] bg-surface p-4 shadow-[0_1px_2px_rgba(18,18,24,0.04)] hover:ring-2 hover:ring-accent/30"
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-fg" aria-hidden>
                    {[...g.name][0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-xs text-faint" dir="ltr">
                      {g.slug}
                    </span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="text-faint rtl:-scale-x-100" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between">
          {me.platformRole ? (
            <a href="/platform" className="text-sm font-medium text-accent hover:underline">
              {t("nav.platform")}
            </a>
          ) : (
            <span />
          )}
          <form action={logout}>
            <Button variant="secondary">{t("top.logout")}</Button>
          </form>
        </div>
      </div>
    </main>
  );
}

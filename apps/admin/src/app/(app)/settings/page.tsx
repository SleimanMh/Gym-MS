import { Check, Lock, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { createLocation } from "@/app/actions";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";
import { settingsTabs } from "@/lib/access";
import { GymSettings } from "./gym-settings";

interface EntitlementsView {
  planCode: string | null;
  features: { key: string; label: string; enabled: boolean; availableOn: string | null }[];
  limits: { key: string; label: string; value: number | null }[];
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; newKey?: string; tab?: string }>;
}) {
  const [{ t, lang, err }, me, { error, newKey, tab: rawTab }] = await Promise.all([getT(), getMe(), searchParams]);
  const TABS = ["general", "plans", "booking", "website", "holidays"] as const;
  const tab = TABS.find((x) => x === rawTab) ?? "general";
  if (!me?.permissions.includes("tenant.settings.manage")) notFound();

  const [ent, locations] = await Promise.all([
    api<EntitlementsView>("/v1/entitlements"),
    api<{ id: string; name: string; slug: string }[]>("/v1/locations"),
  ]);

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <Tabs items={settingsTabs(t, tab, me.permissions.includes("tenant.security.manage"))} />
      {error && <Notice>{err(error)}</Notice>}
      {tab !== "general" ? (
        <GymSettings t={t} lang={lang} currency={me.tenant?.currency ?? "USD"} newKey={newKey} tab={tab} />
      ) : (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {/* Plan hero: what you're on and what it includes */}
          <section className="rounded-[var(--radius-card)] bg-ink p-6 text-white">
            <p className="text-sm text-white/60">{t("settings.currentPlan")}</p>
            <p className="mt-1 text-[38px] font-semibold capitalize leading-none">{ent.planCode ?? "—"}</p>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              {ent.limits.map((l) => (
                <div key={l.key} className="rounded-2xl bg-white/6 px-4 py-3">
                  <dd className="text-xl font-semibold tabular-nums">{l.value ?? t("settings.unlimited")}</dd>
                  <dt className="text-xs text-white/55">{l.label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <Card>
            <h2 className="mb-4 font-semibold">{t("settings.plan")}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ent.features.map((f) => (
                <li key={f.key} className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm ${f.enabled ? "bg-sunken" : "border border-dashed border-border"}`}>
                  {f.enabled ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                      <Check size={14} aria-label={t("common.included")} />
                    </span>
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-faint">
                      <Lock size={13} aria-label={t("common.notIncluded")} />
                    </span>
                  )}
                  <span className={`min-w-0 flex-1 ${f.enabled ? "" : "text-muted"}`}>{f.label}</span>
                  {!f.enabled && f.availableOn && <Badge tone="accent">{f.availableOn}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">{t("settings.locations")}</h2>
          <ul className="mb-6 flex flex-col gap-2">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5 text-sm">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <MapPin size={16} aria-hidden />
                </span>
                <span className="flex-1 font-semibold">{l.name}</span>
                <span className="text-xs text-faint" dir="ltr">
                  {l.slug}
                </span>
              </li>
            ))}
          </ul>
          <form action={createLocation} className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="loc-name">{t("settings.locationName")}</Label>
              <Input id="loc-name" name="name" required minLength={2} maxLength={120} />
            </div>
            <Button type="submit">{t("settings.addLocation")}</Button>
          </form>
        </Card>
      </div>
      )}
    </>
  );
}

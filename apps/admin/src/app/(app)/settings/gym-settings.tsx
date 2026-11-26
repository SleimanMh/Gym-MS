import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateOnly, money } from "@/lib/format";
import type { Lang, T } from "@/lib/i18n";
import {
  addHoliday,
  addOrigin,
  createKey,
  createPlan,
  removeHoliday,
  removeOrigin,
  saveBookingPolicy,
  togglePlan,
} from "./actions";

interface Plan {
  id: string;
  name: string;
  type: "recurring" | "fixed_term" | "class_pack" | "drop_in" | "trial";
  priceMinor: string;
  currency: string;
  billingPeriod: "month" | "year" | null;
  durationDays: number | null;
  credits: number | null;
  isActive: boolean;
}
interface GymSettingsData {
  slug: string;
  bookingPolicy: {
    bookingWindowDays: number;
    cancellationCutoffMin: number;
    lateCancelPolicy: "none" | "lose_credit";
    waitlistAutoPromote: boolean;
    waitlistPromoteCutoffMin: number;
    reminderLeadMin: number;
  } | null;
  allowedOrigins: { id: string; origin: string }[];
  apiKeys: { id: string; prefix: string; createdAt: string }[];
  holidays: { id: string; date: string; name: string }[];
}

const PLAN_TYPES = ["recurring", "fixed_term", "class_pack", "drop_in", "trial"] as const;

/** Phase 1 settings: price list, booking rules, website widget, holidays. */
export async function GymSettings({
  t,
  lang,
  currency,
  newKey,
  tab,
}: {
  t: T;
  lang: Lang;
  currency: string;
  newKey?: string;
  tab: "plans" | "booking" | "website" | "holidays";
}) {
  const [plans, s] = await Promise.all([
    api<Plan[]>("/v1/membership-plans"),
    api<GymSettingsData>("/v1/settings"),
  ]);
  const p = s.bookingPolicy;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const widgetUrl = process.env.NEXT_PUBLIC_WIDGET_URL ?? "https://cdn.yourapp.com/widget/v1.js";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const snippet = `<script src="${widgetUrl}" defer></script>
<gym-schedule tenant="${s.slug}" api="${apiUrl}"></gym-schedule>
<gym-lead-form tenant="${s.slug}" api="${apiUrl}"></gym-lead-form>`;

  const describe = (pl: Plan) =>
    [
      t(`set.type.${pl.type}`),
      pl.billingPeriod ? t(pl.billingPeriod === "month" ? "set.month" : "set.year") : null,
      pl.credits ? `${pl.credits} ×` : null,
      pl.durationDays ? `${pl.durationDays}d` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {tab === "plans" && (
      <Card id="plans">
        <h2 className="mb-4 text-lg font-semibold">{t("set.plans")}</h2>
        <ul className="mb-6 divide-y divide-border text-sm">
          {plans.map((pl) => (
            <li key={pl.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className={`flex-1 font-medium ${pl.isActive ? "" : "text-muted"}`}>{pl.name}</span>
              <span className="text-muted">{describe(pl)}</span>
              <span className="w-24 text-end tabular-nums">{money(pl.priceMinor, pl.currency, lang)}</span>
              {!pl.isActive && <Badge>{t("set.inactive")}</Badge>}
              <form action={togglePlan}>
                <input type="hidden" name="id" value={pl.id} />
                <input type="hidden" name="isActive" value={pl.isActive ? "0" : "1"} />
                <Button variant="ghost" className="h-8 px-2.5 text-xs">
                  {pl.isActive ? t("set.deactivate") : t("set.activate")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createPlan} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="currency" value={currency} />
          <div className="sm:col-span-3">
            <Label htmlFor="pl-name">{t("common.name")}</Label>
            <Input id="pl-name" name="name" required minLength={2} maxLength={80} />
          </div>
          <div>
            <Label htmlFor="pl-type">{t("set.planType")}</Label>
            <Select id="pl-type" name="type" defaultValue="recurring">
              {PLAN_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`set.type.${ty}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pl-price">{t("set.priceLabel", { c: currency })}</Label>
            <Input id="pl-price" name="price" inputMode="decimal" required pattern="\d+([.,]\d{1,3})?" dir="ltr" />
          </div>
          <div>
            <Label htmlFor="pl-billing">{t("set.billing")}</Label>
            <Select id="pl-billing" name="billingPeriod" defaultValue="month">
              <option value="month">{t("set.month")}</option>
              <option value="year">{t("set.year")}</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pl-days">{t("set.durationDays")}</Label>
              <Input id="pl-days" name="durationDays" type="number" min={1} max={3650} />
            </div>
            <div>
              <Label htmlFor="pl-credits">{t("set.credits")}</Label>
              <Input id="pl-credits" name="credits" type="number" min={1} max={1000} />
            </div>
          </div>
          <p className="text-xs text-muted sm:col-span-2">{t("set.planHelp")}</p>
          <Button type="submit">{t("set.addPlan")}</Button>
        </form>
      </Card>
      )}

      {tab === "booking" && (
      <Card className="max-w-xl">
        <h2 className="mb-4 text-lg font-semibold">{t("set.policy")}</h2>
        {p && (
          <form action={saveBookingPolicy} className="flex flex-col gap-3">
            {(
              [
                ["bookingWindowDays", "set.windowDays", 1, 90],
                ["cancellationCutoffMin", "set.cutoff", 0, 10080],
                ["waitlistPromoteCutoffMin", "set.promoteCutoff", 0, 1440],
                ["reminderLeadMin", "set.reminder", 15, 2880],
              ] as const
            ).map(([name, label, min, max]) => (
              <div key={name}>
                <Label htmlFor={`bp-${name}`}>{t(label)}</Label>
                <Input id={`bp-${name}`} name={name} type="number" min={min} max={max} defaultValue={p[name]} required />
              </div>
            ))}
            <div>
              <Label htmlFor="bp-late">{t("set.latePolicy")}</Label>
              <Select id="bp-late" name="lateCancelPolicy" defaultValue={p.lateCancelPolicy}>
                <option value="lose_credit">{t("set.lose_credit")}</option>
                <option value="none">{t("set.none")}</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="waitlistAutoPromote" defaultChecked={p.waitlistAutoPromote} />
              {t("set.autoPromote")}
            </label>
            <div>
              <Button type="submit">{t("common.save")}</Button>
            </div>
          </form>
        )}
      </Card>
      )}

      {tab === "website" && (
        <Card id="website">
          <h2 className="mb-2 text-lg font-semibold">{t("set.website")}</h2>
          <p className="mb-3 text-sm text-muted">{t("set.websiteHelp")}</p>
          <pre className="mb-4 overflow-x-auto rounded-lg bg-bg p-3 text-xs" dir="ltr">
            <code>{snippet}</code>
          </pre>
          <p className="mb-1 text-sm font-medium">{t("set.hosted")}</p>
          <a href={`${appUrl}/book/${s.slug}`} target="_blank" rel="noreferrer" className="mb-4 block text-sm text-accent hover:underline" dir="ltr">
            {appUrl}/book/{s.slug}
          </a>

          <p className="mb-2 text-sm font-medium">{t("set.origins")}</p>
          <ul className="mb-3 divide-y divide-border text-sm">
            {s.allowedOrigins.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-1.5">
                <span dir="ltr">{o.origin}</span>
                <form action={removeOrigin}>
                  <input type="hidden" name="id" value={o.id} />
                  <Button variant="ghost" className="h-7 px-2 text-xs text-danger">
                    {t("common.remove")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addOrigin} className="mb-4 flex gap-2">
            <Input name="origin" type="url" placeholder="https://www.yourgym.com" required dir="ltr" aria-label={t("set.addOrigin")} />
            <Button variant="secondary">{t("set.addOrigin")}</Button>
          </form>

          {newKey ? (
            <div className="rounded-lg bg-amber-50 p-3 text-sm">
              <p className="mb-1 text-warning">{t("set.keyOnce")}</p>
              <code className="break-all" dir="ltr">
                {newKey}
              </code>
            </div>
          ) : (
            <form action={createKey} className="flex items-center gap-3">
              <Button variant="secondary">{t("set.newKey")}</Button>
              <span className="text-xs text-muted" dir="ltr">
                {s.apiKeys.map((k) => `${k.prefix}…`).join(", ")}
              </span>
            </form>
          )}
        </Card>
      )}

      {tab === "holidays" && (
        <Card className="max-w-xl">
          <h2 className="mb-3 text-lg font-semibold">{t("set.holidays")}</h2>
          <ul className="mb-3 divide-y divide-border text-sm">
            {s.holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5">
                <span>
                  {fmtDateOnly(h.date, lang)} · {h.name}
                </span>
                <form action={removeHoliday}>
                  <input type="hidden" name="id" value={h.id} />
                  <Button variant="ghost" className="h-7 px-2 text-xs text-danger">
                    {t("common.remove")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addHoliday} className="flex flex-wrap gap-2">
            <Input name="date" type="date" required className="w-40" aria-label={t("common.date")} />
            <Input name="name" required maxLength={80} placeholder={t("set.holidayName")} className="w-48 flex-1" />
            <Button variant="secondary">{t("set.addHoliday")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

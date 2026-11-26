import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Percent, Receipt, TrendingUp } from "lucide-react";
import { minorDigits } from "@gym/shared";
import { LockedFeature } from "@/components/blocks";
import { PnlChart } from "@/components/pnl-chart";
import { StatCard } from "@/components/studio";
import { Card, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtPct, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { categoryName, financeTabs, monthName } from "@/lib/staff";
import { niceTicks } from "@/lib/ticks";
import type { LocationsPnl } from "./locations/page";

export interface FinanceOverview {
  currency: string;
  month: string;
  kpis: {
    revenue: { valueMinor: string; changePct: number | null };
    costs: { valueMinor: string; changePct: number | null };
    net: { valueMinor: string; changePct: number | null };
    margin: { valuePct: number | null };
  };
  series: { month: string; revenueMinor: string; expensesMinor: string; staffMinor: string; netMinor: string; marginPct: number | null }[];
  costsByCategory: { key: string; id?: string; name: string | null; amountMinor: string; budgetMinor: string | null }[];
  revenueByStream: { memberships: string; packs: string; other: string };
}

/** Profit and loss: is the gym making money, where it goes, and where it comes from. */
export default async function FinancePage() {
  const [{ t, lang }, me] = await Promise.all([getT(), getMe()]);
  if (!me?.permissions.includes("finance.view")) notFound();
  if (!me.entitlements?.features.includes("finance.pnl")) return <LockedFeature feature="finance.pnl" t={t} />;

  const [o, byLoc] = await Promise.all([api<FinanceOverview>("/v1/finance/overview"), api<LocationsPnl>("/v1/finance/locations")]);
  const k = o.kpis;
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const m = (v: string | number) => money(v, o.currency, lang);
  const unit = 10 ** minorDigits(o.currency);
  const pct = (v: number | null) => fmtPct(v, lang);

  const monthFmt = new Intl.DateTimeFormat(loc, { month: "short", timeZone: "UTC" });
  const points = o.series.map((s) => {
    const costs = Number(s.expensesMinor) + Number(s.staffMinor);
    return {
      key: s.month,
      label: monthFmt.format(new Date(`${s.month}-15T00:00:00Z`)),
      revenue: Number(s.revenueMinor) / unit,
      costs: costs / unit,
      netPositive: Number(s.netMinor) >= 0,
      display: { revenue: m(s.revenueMinor), costs: m(costs), net: m(s.netMinor), expenses: m(s.expensesMinor), staff: m(s.staffMinor), margin: pct(s.marginPct) },
    };
  });
  const compact = new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 });
  const ticks = niceTicks(Math.max(1, ...points.flatMap((p) => [p.revenue, p.costs])));

  const cats = o.costsByCategory.map((c) => ({
    ...c,
    label: c.key === "staff" ? t("fin.staffCosts") : categoryName(c, lang),
    amount: Number(c.amountMinor),
    budget: c.budgetMinor === null ? null : Number(c.budgetMinor),
  }));
  const catMax = Math.max(1, ...cats.flatMap((c) => [c.amount, c.budget ?? 0]));

  const streams = [
    { key: "memberships", label: t("fin.stream.memberships"), v: Number(o.revenueByStream.memberships) },
    { key: "packs", label: t("fin.stream.packs"), v: Number(o.revenueByStream.packs) },
    { key: "other", label: t("fin.stream.other"), v: Number(o.revenueByStream.other) },
  ];
  const streamTotal = streams.reduce((s, x) => s + x.v, 0);
  const net = Number(k.net.valueMinor);

  return (
    <>
      <PageHeader title={t("fin.title")} subtitle={t("fin.subtitle", { month: monthName(o.month, lang) })} />
      <Tabs items={financeTabs(t, "overview")} />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <StatCard icon={Banknote} label={t("fin.revenue")} value={m(k.revenue.valueMinor)} change={k.revenue.changePct === null ? undefined : { pct: k.revenue.changePct }} />
          <StatCard
            icon={Receipt}
            label={t("fin.costs")}
            value={m(k.costs.valueMinor)}
            change={k.costs.changePct === null ? undefined : { pct: k.costs.changePct, invert: true }}
            note={t("fin.costsNote")}
          />
          <StatCard icon={TrendingUp} label={t("fin.net")} value={m(k.net.valueMinor)} change={k.net.changePct === null ? undefined : { pct: k.net.changePct }} />
          <StatCard icon={Percent} label={t("fin.margin")} value={pct(k.margin.valuePct)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card>
            <SectionTitle>{t("fin.pnl")}</SectionTitle>
            <p className="-mt-2 mb-4 text-xs text-faint">{t("fin.pnlHelp")}</p>
            <PnlChart
              points={points}
              formatTick={Object.fromEntries(ticks.map((v) => [String(v), compact.format(v)]))}
              labels={{
                revenue: t("fin.revenue"),
                costs: t("fin.costs"),
                net: t("fin.net"),
                month: t("fin.month"),
                expenses: t("fin.expensesCol"),
                staff: t("fin.staffCol"),
                margin: t("fin.margin"),
                table: t("fin.showTable"),
              }}
            />
          </Card>

          <div className="flex flex-col gap-5">
            {/* Dark summary card: this month's result in one line */}
            <section className="rounded-[var(--radius-card)] bg-ink p-6 text-white">
              <p className="text-sm text-white/60">{t("fin.net")}</p>
              <p className={cn("mt-1 text-[38px] font-semibold leading-none tabular-nums", net < 0 && "text-[#ff9b9b]")}>{m(k.net.valueMinor)}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/6 px-3 py-2.5">
                  <dd className="font-semibold tabular-nums">{m(k.revenue.valueMinor)}</dd>
                  <dt className="text-xs text-white/55">{t("fin.revenue")}</dt>
                </div>
                <div className="rounded-2xl bg-white/6 px-3 py-2.5">
                  <dd className="font-semibold tabular-nums">{m(k.costs.valueMinor)}</dd>
                  <dt className="text-xs text-white/55">{t("fin.costs")}</dt>
                </div>
              </dl>
            </section>

            <Card className="flex-1">
              <SectionTitle>{t("fin.streams")}</SectionTitle>
              {streamTotal > 0 ? (
                <ul className="flex flex-col gap-4">
                  {streams.map((s) => {
                    const share = Math.round((s.v / streamTotal) * 100);
                    return (
                      <li key={s.key}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">{s.label}</span>
                          <span className="tabular-nums">
                            <span className="font-semibold">{m(s.v)}</span> <span className="text-faint">· {share}%</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("fin.noRevenue")}</p>
              )}
            </Card>
          </div>
        </div>

        {byLoc.locations.length > 1 && (
          <Card>
            <SectionTitle
              action={
                <Link href="/finance/locations" className="text-sm font-medium text-accent hover:underline">
                  {t("loc.seeAll")}
                </Link>
              }
            >
              {t("loc.card")}
            </SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {byLoc.locations.map((l) => {
                const n = Number(l.netMinor);
                return (
                  <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{l.name}</span>
                      <span className="block text-xs text-faint">
                        {m(l.revenueMinor)} − {m(Number(l.expensesMinor) + Number(l.staffMinor))}
                      </span>
                    </span>
                    <span className="text-end">
                      <span className={cn("block font-semibold tabular-nums", n < 0 && "text-danger")}>{m(l.netMinor)}</span>
                      <span className={cn("block text-xs", n < 0 ? "text-danger" : "text-success")}>
                        {n >= 0 ? t("loc.profit") : t("loc.loss")} · {pct(l.marginPct)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card>
          <SectionTitle>{t("fin.byCategory")}</SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-faint">{t("fin.byCategoryHelp")}</p>
          <ul className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
            {cats.map((c) => {
              const over = c.budget !== null && c.amount > c.budget;
              return (
                <li key={c.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="font-semibold tabular-nums">{m(c.amount)}</span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-sunken">
                    <div className={cn("h-full rounded-full", over ? "bg-danger" : c.key === "staff" ? "bg-ink" : "bg-accent")} style={{ width: `${(c.amount / catMax) * 100}%` }} />
                    {c.budget !== null && (
                      <span className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-fg" style={{ insetInlineStart: `calc(${(c.budget / catMax) * 100}% - 1px)` }} aria-hidden />
                    )}
                  </div>
                  <p className={cn("mt-1 text-xs", over ? "text-danger" : "text-faint")}>
                    {c.budget === null
                      ? c.key === "staff"
                        ? " "
                        : t("fin.noBudget")
                      : over
                        ? t("fin.overBy", { v: m(c.amount - c.budget) })
                        : t("fin.left", { v: m(c.budget - c.amount) })}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Info, MapPin } from "lucide-react";
import { LockedFeature } from "@/components/blocks";
import { Card, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtPct, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { financeTabs, monthName, shiftMonth } from "@/lib/staff";

interface Line {
  revenueMinor: string;
  expensesMinor: string;
  staffMinor: string;
}
export interface LocationsPnl {
  currency: string;
  month: string;
  locations: (Line & {
    id: string;
    name: string;
    netMinor: string;
    marginPct: number | null;
    sharedCostMinor: string;
    netAllocatedMinor: string;
    trend: { month: string; netMinor: string }[];
  })[];
  shared: Line & { unallocatedMinor: string };
  total: Line & { netMinor: string; marginPct: number | null };
}

/** Six bars of monthly net around a zero line: profit up in the accent, loss down in red (with labels). */
function NetTrend({ points, fmt, label, loc, profitLabel, lossLabel }: { points: { month: string; netMinor: string }[]; fmt: (v: string) => string; label: string; loc: string; profitLabel: string; lossLabel: string }) {
  const W = 520;
  const H = 96;
  const vals = points.map((p) => Number(p.netMinor));
  const max = Math.max(1, ...vals.map(Math.abs));
  const zero = H / 2;
  const slot = W / points.length;
  const bw = Math.min(28, slot * 0.5);
  const monthFmt = new Intl.DateTimeFormat(loc, { month: "short", timeZone: "UTC" });
  return (
    <figure dir="ltr">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="h-auto w-full" role="img" aria-label={label}>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="#d6d6df" />
        {points.map((p, i) => {
          const v = vals[i]!;
          const h = (Math.abs(v) / max) * (H / 2 - 2);
          const x = i * slot + (slot - bw) / 2;
          const y = v >= 0 ? zero - h : zero;
          return (
            <g key={p.month}>
              <title>{`${monthFmt.format(new Date(`${p.month}-15T00:00:00Z`))}: ${fmt(p.netMinor)} (${v >= 0 ? profitLabel : lossLabel})`}</title>
              <rect x={x} y={y} width={bw} height={Math.max(1, h)} rx={4} fill={v >= 0 ? "var(--accent, #6d5df6)" : "var(--color-danger, #d64545)"} opacity={i === points.length - 1 ? 1 : 0.55} />
              <text x={i * slot + slot / 2} y={H + 16} textAnchor="middle" fontSize="12" fill="#8a8a99">
                {monthFmt.format(new Date(`${p.month}-15T00:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Profit per location for a month: one card per branch, then the full breakdown (exit gate, Phase 3). */
export default async function LocationsPnlPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("finance.view")) notFound();
  if (!me.entitlements?.features.includes("finance.pnl")) return <LockedFeature feature="finance.pnl" t={t} />;

  const q = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? `?month=${sp.month}` : "";
  const p = await api<LocationsPnl>(`/v1/finance/locations${q}`);
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const m = (v: string | number) => money(v, p.currency, lang);
  const pct = (v: number | null) => fmtPct(v, lang);
  const costs = (l: Line) => Number(l.expensesMinor) + Number(l.staffMinor);
  const sharedNet = Number(p.shared.revenueMinor) - costs(p.shared);

  return (
    <>
      <PageHeader
        title={t("loc.title")}
        subtitle={t("loc.subtitle", { month: monthName(p.month, lang) })}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/finance/locations?month=${shiftMonth(p.month, -1)}`} aria-label={t("pay.prevMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <span className="px-2 text-sm font-medium">{monthName(p.month, lang)}</span>
            <Link href={`/finance/locations?month=${shiftMonth(p.month, 1)}`} aria-label={t("pay.nextMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <Tabs items={financeTabs(t, "locations")} />

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {p.locations.map((l) => {
          const net = Number(l.netMinor);
          return (
            <Card key={l.id} className="flex flex-col p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <MapPin size={18} aria-hidden />
                </span>
                <h2 className="flex-1 text-lg font-semibold">{l.name}</h2>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", net >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                  {net >= 0 ? t("loc.profit") : t("loc.loss")} · {pct(l.marginPct)}
                </span>
              </div>
              <p className="text-sm text-muted">{t("loc.net")}</p>
              <p className={cn("text-[34px] font-semibold leading-tight tabular-nums", net < 0 && "text-danger")}>{m(l.netMinor)}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  [t("fin.revenue"), m(l.revenueMinor)],
                  [t("fin.expensesCol"), m(l.expensesMinor)],
                  [t("fin.staffCol"), m(l.staffMinor)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-sunken px-2 py-2.5">
                    <dd className="truncate text-sm font-semibold tabular-nums">{v}</dd>
                    <dt className="text-xs text-faint">{k}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
                <span className="text-muted">{t("loc.netAfter")}</span>
                <span className={cn("font-semibold tabular-nums", Number(l.netAllocatedMinor) < 0 && "text-danger")}>{m(l.netAllocatedMinor)}</span>
              </div>
              <p className="mt-0.5 text-xs text-faint">
                {t("loc.sharedCost")}: {m(l.sharedCostMinor)}
              </p>
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-muted">{t("loc.trend")}</p>
                <NetTrend points={l.trend} fmt={m} label={`${t("loc.trend")} — ${l.name}`} loc={loc} profitLabel={t("loc.profit")} lossLabel={t("loc.loss")} />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <div className="px-5 pt-5">
          <SectionTitle>{t("loc.table")}</SectionTitle>
        </div>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-3 text-start font-medium">{t("exp.location")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("fin.revenue")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("fin.expensesCol")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("fin.staffCol")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("loc.net")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("fin.margin")}</th>
              <th scope="col" className="px-5 py-3 text-end font-medium">{t("loc.netAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {p.locations.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <th scope="row" className="px-5 py-3 text-start font-semibold">{l.name}</th>
                <td className="px-3 py-3 text-end tabular-nums">{m(l.revenueMinor)}</td>
                <td className="px-3 py-3 text-end tabular-nums">{m(l.expensesMinor)}</td>
                <td className="px-3 py-3 text-end tabular-nums">{m(l.staffMinor)}</td>
                <td className={cn("px-3 py-3 text-end font-semibold tabular-nums", Number(l.netMinor) < 0 && "text-danger")}>{m(l.netMinor)}</td>
                <td className="px-3 py-3 text-end tabular-nums text-muted">{pct(l.marginPct)}</td>
                <td className={cn("px-5 py-3 text-end font-semibold tabular-nums", Number(l.netAllocatedMinor) < 0 && "text-danger")}>{m(l.netAllocatedMinor)}</td>
              </tr>
            ))}
            <tr className="border-b border-border text-muted">
              <th scope="row" className="px-5 py-3 text-start font-medium">{t("loc.shared")}</th>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.shared.revenueMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.shared.expensesMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.shared.staffMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{m(sharedNet)}</td>
              <td className="px-3 py-3 text-end">—</td>
              <td className="px-5 py-3 text-end tabular-nums">{m(p.shared.unallocatedMinor === "0" ? 0 : -Number(p.shared.unallocatedMinor))}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-sunken font-semibold">
              <th scope="row" className="px-5 py-3 text-start">{t("loc.total")}</th>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.total.revenueMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.total.expensesMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{m(p.total.staffMinor)}</td>
              <td className={cn("px-3 py-3 text-end tabular-nums", Number(p.total.netMinor) < 0 && "text-danger")}>{m(p.total.netMinor)}</td>
              <td className="px-3 py-3 text-end tabular-nums">{pct(p.total.marginPct)}</td>
              <td className={cn("px-5 py-3 text-end tabular-nums", Number(p.total.netMinor) < 0 && "text-danger")}>{m(p.total.netMinor)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <p className="mt-4 flex max-w-3xl gap-2 text-xs text-muted">
        <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
        {t("loc.how")}
      </p>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { LockedFeature } from "@/components/blocks";
import { Avatar, Card, FillMeter, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtPct, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { monthName, shiftMonth, staffTabs, type PayType } from "@/lib/staff";

interface Row {
  employee: { id: string; firstName: string; lastName: string; title: string; payType: PayType; status: string };
  classesTaught: number;
  spotsBooked: number;
  spotsOffered: number;
  fillPct: number | null;
  avgAttendance: number | null;
  attended: number;
  noShows: number;
  noShowPct: number | null;
  membershipsSold: number;
  salesMinor: string;
  hoursWorked: number;
  payMinor: string | null;
  costPerCheckinMinor: string | null;
}

const SORTS = ["classes", "fill", "checkins", "sales"] as const;
type Sort = (typeof SORTS)[number];
const metric: Record<Sort, (r: Row) => number> = {
  classes: (r) => r.classesTaught,
  fill: (r) => r.fillPct ?? 0,
  checkins: (r) => r.attended,
  sales: (r) => Number(r.salesMinor),
};

/** Staff rankings for a month — the numbers behind them are shown in full so owners can check them. */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string; sort?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("report.view")) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : undefined;
  const sort: Sort = SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : "classes";
  const data = await api<{ month: string; currency: string; rows: Row[] }>(`/v1/staff/performance${month ? `?month=${month}` : ""}`);
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const m = (v: string | number) => money(v, data.currency, lang);
  const pct = (v: number | null) => fmtPct(v, lang);
  const seesPay = data.rows.some((r) => r.payMinor !== null);
  const href = (s: Sort, mo = data.month) => `/staff/performance?month=${mo}&sort=${s}`;

  const value = metric[sort];
  const ranked = [...data.rows].filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a) || a.employee.firstName.localeCompare(b.employee.firstName));
  const rest = data.rows.filter((r) => value(r) <= 0);

  return (
    <>
      <PageHeader
        title={t("perf.title")}
        subtitle={t("perf.subtitle", { month: monthName(data.month, lang) })}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={href(sort, shiftMonth(data.month, -1))} aria-label={t("pay.prevMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <span className="px-2 text-sm font-medium">{monthName(data.month, lang)}</span>
            <Link href={href(sort, shiftMonth(data.month, 1))} aria-label={t("pay.nextMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <Tabs items={staffTabs(t, me, "performance")} />

      <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label={t("perf.sort")}>
        <span className="text-sm text-muted">{t("perf.sort")}</span>
        {SORTS.map((s) => (
          <Link
            key={s}
            href={href(s)}
            aria-current={s === sort ? "page" : undefined}
            className={cn("transition-subtle rounded-full px-3.5 py-1.5 text-sm font-medium", s === sort ? "bg-ink text-white" : "bg-surface text-muted hover:text-fg")}
          >
            {t(`perf.by.${s}`)}
          </Link>
        ))}
      </nav>

      {ranked.length === 0 ? (
        <Card>
          <p className="text-muted">{t("perf.empty")}</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="w-14 px-5 py-3 text-start font-medium">{t("perf.rank")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("pay.employee")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.classes")}</th>
                  <th scope="col" className="w-44 px-3 py-3 text-start font-medium">{t("perf.fill")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.checkins")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.noShows")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.sold")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.sales")}</th>
                  {seesPay && <th scope="col" className="px-3 py-3 text-end font-medium">{t("perf.pay")}</th>}
                  {seesPay && <th scope="col" className="px-5 py-3 text-end font-medium">{t("perf.costPerCheckin")}</th>}
                </tr>
              </thead>
              <tbody>
                {[...ranked, ...rest].map((r, i) => (
                  <tr key={r.employee.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-semibold tabular-nums text-muted">{i < ranked.length ? i + 1 : "—"}</td>
                    <td className="px-3 py-3">
                      <Link href={`/staff/${r.employee.id}`} className="flex items-center gap-2.5 hover:text-accent">
                        <Avatar first={r.employee.firstName} last={r.employee.lastName} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {r.employee.firstName} {r.employee.lastName}
                          </span>
                          <span className="block text-xs text-faint">{r.employee.title}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">{nf.format(r.classesTaught)}</td>
                    <td className="px-3 py-3">
                      {r.spotsOffered ? <FillMeter booked={r.spotsBooked} capacity={r.spotsOffered} label={pct(r.fillPct)} /> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">{nf.format(r.attended)}</td>
                    <td className="px-3 py-3 text-end tabular-nums text-muted">{pct(r.noShowPct)}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{nf.format(r.membershipsSold)}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{m(r.salesMinor)}</td>
                    {seesPay && <td className="px-3 py-3 text-end tabular-nums">{r.payMinor === null ? "—" : m(r.payMinor)}</td>}
                    {seesPay && <td className="px-5 py-3 text-end tabular-nums text-muted">{r.costPerCheckinMinor === null ? "—" : m(r.costPerCheckinMinor)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-4 flex max-w-3xl gap-2 text-xs text-muted">
            <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
            {t("perf.help")}
          </p>
        </>
      )}
    </>
  );
}

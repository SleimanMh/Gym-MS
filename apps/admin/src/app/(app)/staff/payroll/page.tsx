import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { LockedFeature } from "@/components/blocks";
import { Avatar, Button, Card, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { monthName, shiftMonth, staffTabs, type Pay, type PayType } from "@/lib/staff";

interface Payroll {
  month: string;
  currency: string;
  totalMinor: string;
  rows: {
    employee: { id: string; firstName: string; lastName: string; title: string; payType: PayType; payRateMinor: string; commissionBp: number; currency: string };
    hoursWorked: number;
    classesTaught: number;
    salesMinor: string;
    pay: Pay;
  }[];
}

/** Monthly payroll summary — hours, classes, commission — and the CSV for the accountant. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("finance.view")) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  const q = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? `?month=${sp.month}` : "";
  const p = await api<Payroll>(`/v1/payroll${q}`);
  const m = (v: string) => money(v, p.currency, lang);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB", { maximumFractionDigits: 1 });
  const work = (r: Payroll["rows"][number]) =>
    r.employee.payType === "hourly"
      ? t("pay.workHours", { n: nf.format(r.hoursWorked) })
      : r.employee.payType === "per_class"
        ? t("pay.workClasses", { n: nf.format(r.classesTaught) })
        : t("pay.workMonth");

  return (
    <>
      <PageHeader
        title={t("pay.title")}
        subtitle={t("pay.subtitle", { month: monthName(p.month, lang) })}
        action={
          <>
            <div className="flex items-center gap-1 rounded-full bg-surface p-1">
              <Link href={`/staff/payroll?month=${shiftMonth(p.month, -1)}`} aria-label={t("pay.prevMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
                <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
              </Link>
              <span className="px-2 text-sm font-medium">{monthName(p.month, lang)}</span>
              <Link href={`/staff/payroll?month=${shiftMonth(p.month, 1)}`} aria-label={t("pay.nextMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
                <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
              </Link>
            </div>
            <a href={`/staff/payroll/export?month=${p.month}`} download={`payroll-${p.month}.csv`}>
              <Button>
                <Download size={16} aria-hidden />
                {t("pay.export")}
              </Button>
            </a>
          </>
        }
      />
      <Tabs items={staffTabs(t, me, "payroll")} />

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] bg-ink p-6 text-white">
        <div>
          <p className="text-sm text-white/60">{t("pay.totalRow")}</p>
          <p className="text-[34px] font-semibold leading-tight tabular-nums">{m(p.totalMinor)}</p>
        </div>
        <dl className="ms-auto flex gap-6 text-sm">
          <div>
            <dd className="text-lg font-semibold tabular-nums">{nf.format(p.rows.length)}</dd>
            <dt className="text-white/60">{t("st.headcount")}</dt>
          </div>
          <div>
            <dd className="text-lg font-semibold tabular-nums">{m(String(p.rows.reduce((s, r) => s + Number(r.pay.commissionMinor), 0)))}</dd>
            <dt className="text-white/60">{t("pay.commission")}</dt>
          </div>
        </dl>
      </div>

      {p.rows.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-3 text-start font-medium">{t("pay.employee")}</th>
                <th scope="col" className="px-3 py-3 text-start font-medium">{t("pay.type")}</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">{t("pay.work")}</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">{t("st.sales")}</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">{t("pay.base")}</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">{t("pay.commission")}</th>
                <th scope="col" className="px-5 py-3 text-end font-medium">{t("pay.total")}</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.employee.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">
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
                  <td className="px-3 py-3 text-muted">{t(`st.pay.${r.employee.payType}`)}</td>
                  <td className="px-3 py-3 text-end tabular-nums">{work(r)}</td>
                  <td className="px-3 py-3 text-end tabular-nums text-muted">{m(r.salesMinor)}</td>
                  <td className="px-3 py-3 text-end tabular-nums">{m(r.pay.baseMinor)}</td>
                  <td className="px-3 py-3 text-end tabular-nums">{m(r.pay.commissionMinor)}</td>
                  <td className="px-5 py-3 text-end font-semibold tabular-nums">{m(r.pay.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-sunken">
                <th scope="row" colSpan={6} className="px-5 py-3 text-start font-semibold">
                  {t("pay.totalRow")}
                </th>
                <td className="px-5 py-3 text-end font-semibold tabular-nums">{m(p.totalMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-muted">{t("pay.empty")}</p>
        </Card>
      )}
    </>
  );
}

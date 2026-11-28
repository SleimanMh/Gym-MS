import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Clock3, Dumbbell, Plus, Users } from "lucide-react";
import { EmptyState, LockedFeature } from "@/components/blocks";
import { StatCard } from "@/components/studio";
import { Avatar, Badge, Button, Notice, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTime, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { monthName, rateText, staffTabs, type Employee } from "@/lib/staff";
import { clockOut } from "./actions";

/** The team: who's on shift now and what everyone did this month (hours, classes, sales, pay). */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("staff.view")) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  const data = await api<{ month: string; employees: Employee[] }>("/v1/staff");
  const tz = me.tenant?.timezone ?? "UTC";
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB", { maximumFractionDigits: 1 });
  const active = data.employees.filter((e) => e.status === "active");
  const onShift = active.filter((e) => e.clockedInSince);
  const seesPay = active.some((e) => e.stats.pay !== null);
  const currency = data.employees[0]?.currency ?? "USD";
  const canManage = me.permissions.includes("staff.manage");

  const sum = (f: (e: Employee) => number) => active.reduce((s, e) => s + f(e), 0);
  const hours = sum((e) => e.stats.hoursWorked);
  const classes = sum((e) => e.stats.classesTaught);
  const payroll = sum((e) => Number(e.stats.pay?.totalMinor ?? 0));

  return (
    <>
      <PageHeader
        title={t("st.title")}
        subtitle={t("st.subtitle", { n: nf.format(active.length), month: monthName(data.month, lang) })}
        action={
          canManage && (
            <Link href="/staff/new">
              <Button>
                <Plus size={16} aria-hidden />
                {t("st.add")}
              </Button>
            </Link>
          )
        }
      />
      <Tabs items={staffTabs(t, me, "team")} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      {data.employees.length === 0 ? (
        <EmptyState text={t("st.empty")} action={canManage ? { label: t("st.add"), href: "/staff/new" } : undefined} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <StatCard icon={Users} label={t("st.headcount")} value={nf.format(active.length)} note={`${t("st.onShift")}: ${nf.format(onShift.length)}`} />
              <StatCard icon={Clock3} label={t("st.hoursMonth")} value={nf.format(Math.round(hours))} />
              <StatCard icon={Dumbbell} label={t("st.classesMonth")} value={nf.format(classes)} />
              {seesPay ? (
                <StatCard icon={Banknote} label={t("st.payrollMonth")} value={money(payroll, currency, lang)} />
              ) : (
                <StatCard icon={Banknote} label={t("st.sales")} value={money(sum((e) => Number(e.stats.salesMinor)), currency, lang)} />
              )}
            </div>

            <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {data.employees.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/staff/${e.id}`}
                    className={cn(
                      "transition-subtle flex h-full flex-col rounded-[var(--radius-card)] bg-surface p-5 shadow-[0_1px_2px_rgba(18,18,24,0.04)] hover:ring-2 hover:ring-accent/30",
                      e.status === "inactive" && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar first={e.firstName} last={e.lastName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {e.firstName} {e.lastName}
                        </p>
                        <p className="truncate text-sm text-muted">{e.title}</p>
                      </div>
                      {e.status === "inactive" ? (
                        <Badge>{t("st.inactive")}</Badge>
                      ) : e.clockedInSince ? (
                        <Badge tone="success">{fmtTime(e.clockedInSince, tz, lang)}</Badge>
                      ) : null}
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: t("st.hours"), value: nf.format(e.stats.hoursWorked) },
                        { label: t("st.classes"), value: nf.format(e.stats.classesTaught) },
                        { label: t("st.sales"), value: money(e.stats.salesMinor, e.currency, lang) },
                      ].map((s) => (
                        <div key={s.label} className="rounded-2xl bg-sunken px-2 py-2.5">
                          <dd className="truncate text-sm font-semibold tabular-nums">{s.value}</dd>
                          <dt className="text-xs text-faint">{s.label}</dt>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-4 flex items-end justify-between gap-2 border-t border-border pt-3 text-sm">
                      <span className="text-muted">
                        {t(`st.pay.${e.payType}`)}
                        {e.commissionBp > 0 && <> · {t("st.commission", { n: nf.format(e.commissionBp / 100) })}</>}
                      </span>
                      {e.stats.pay && (
                        <span className="text-end">
                          <span className="block font-semibold tabular-nums">{money(e.stats.pay.totalMinor, e.currency, lang)}</span>
                          <span className="block text-xs text-faint">{t("st.payMonth")}</span>
                        </span>
                      )}
                    </div>
                    {rateText(e, t, lang) && <span className="mt-1 text-xs text-faint">{rateText(e, t, lang)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Side: who is on shift right now (dark card, like the gauge on the dashboard) */}
          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-[var(--radius-card)] bg-ink p-6 text-white">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">{t("st.onShift")}</h2>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{nf.format(onShift.length)}</span>
              </div>
              {onShift.length ? (
                <ul className="flex flex-col gap-2">
                  {onShift.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg" aria-hidden>
                        {e.firstName[0]}
                        {e.lastName[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.firstName} {e.lastName}</span>
                        <span className="block text-xs text-white/60">{t("clock.since", { t: fmtTime(e.clockedInSince!, tz, lang) })}</span>
                      </span>
                      {canManage && (
                        <form action={clockOut}>
                          <input type="hidden" name="employeeId" value={e.id} />
                          <input type="hidden" name="back" value="/staff" />
                          <button className="transition-subtle rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">{t("clock.out")}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/60">{t("st.onShiftNone")}</p>
              )}
            </section>

          </div>
        </div>
      )}
    </>
  );
}

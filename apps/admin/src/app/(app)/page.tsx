import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, ChevronRight, ScanLine, Users, Wallet } from "lucide-react";
import { minorDigits } from "@gym/shared";
import { AttendanceChart } from "@/components/attendance-chart";
import { MixDonut } from "@/components/mix-donut";
import { RevenueChart } from "@/components/revenue-chart";
import { FillGauge, NextClassHero, StatCard } from "@/components/studio";
import { Avatar, Card, SectionTitle } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateOnly, fmtDay, fmtTime, minutesInDay, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { niceTicks } from "@/lib/ticks";

interface Overview {
  currency: string;
  timezone: string;
  kpis: {
    revenueThisMonth: { valueMinor: string; changePct: number | null };
    mrr: { valueMinor: string };
    activeMembers: { value: number };
    newMembers: { value: number; changePct: number | null };
    checkinsToday: { value: number };
    overduePayments: { value: number; amountMinor: string };
  };
  revenueTrend: { month: string; revenueMinor: string }[];
  todaysClasses: {
    id: string;
    startsAt: string;
    endsAt: string;
    className: string;
    color: string;
    location: string;
    booked: number;
    capacity: number;
    status: string;
  }[];
  alerts: { kind: "PENDING_PAYMENTS" | "EXPIRING_7_DAYS"; count: number }[];
  endingSoon: { subscriptionId: string; endsOn: string; plan: string; member: { id: string; firstName: string; lastName: string } }[];
  nextClass: {
    id: string;
    className: string;
    color: string;
    startsAt: string;
    endsAt: string;
    location: string;
    trainer: string | null;
    booked: number;
    capacity: number;
    attendees: { firstName: string; lastName: string }[];
  } | null;
  weekAttendance: { day: string; checkins: number; isToday: boolean; isFuture: boolean }[];
  monthFill: { pct: number | null; classes: number; checkins: number; noShows: number };
  membershipMix: { name: string; count: number }[];
  topMembers: { id: string; firstName: string; lastName: string; visits: number }[];
}

/** Owner overview in the "studio" layout: what's next, how full we are, who's coming, what we earn. */
export default async function DashboardPage() {
  const [{ t, lang }, me] = await Promise.all([getT(), getMe()]);
  if (!me?.permissions.includes("report.view")) {
    // Front desk and trainers land on the screen they use all day.
    redirect(me?.permissions.includes("checkin.create") ? "/checkin" : "/schedule");
  }
  const o = await api<Overview>("/v1/dashboard/overview");
  const k = o.kpis;
  const tz = o.timezone;
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const nf = new Intl.NumberFormat(loc);
  const m = (v: string | number) => money(v, o.currency, lang);
  const now = Date.now();

  const hour = Math.floor(minutesInDay(new Date(), tz) / 60);
  const greet = hour < 12 ? "hi.morning" : hour < 18 ? "hi.afternoon" : "hi.evening";
  const todayLong = new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // Revenue chart data
  const unit = 10 ** minorDigits(o.currency);
  const monthFmt = new Intl.DateTimeFormat(loc, { month: "short", timeZone: "UTC" });
  const points = o.revenueTrend.map((p) => ({
    key: p.month,
    label: monthFmt.format(new Date(`${p.month}-15T00:00:00Z`)),
    value: Number(p.revenueMinor) / unit,
    display: m(p.revenueMinor),
  }));
  const compact = new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 });
  const ticks = niceTicks(Math.max(1, ...points.map((p) => p.value)));

  // Next class
  const nc = o.nextClass;
  let startsLabel = "";
  if (nc) {
    const mins = Math.round((new Date(nc.startsAt).getTime() - now) / 60_000);
    startsLabel = mins <= 0 ? t("dash.inProgress") : mins <= 120 ? t("dash.startsIn", { n: String(mins) }) : t("dash.startsAt", { t: fmtTime(nc.startsAt, tz, lang) });
  }

  const weekDays = o.weekAttendance.map((d) => ({
    key: d.day,
    label: new Intl.DateTimeFormat(loc, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d.day}T12:00:00Z`)),
    value: d.checkins,
    display: t("dash.visitsN", { n: nf.format(d.checkins) }),
    isToday: d.isToday,
    isFuture: d.isFuture,
  }));
  const weekTotal = o.weekAttendance.reduce((s, d) => s + d.checkins, 0);
  const pending = o.alerts.find((a) => a.kind === "PENDING_PAYMENTS");

  const classStatus = (c: Overview["todaysClasses"][number]) => {
    const s = new Date(c.startsAt).getTime();
    const e = new Date(c.endsAt).getTime();
    if (c.status === "cancelled") return { text: t("sched.cancelled"), cls: "bg-danger-soft text-danger" };
    if (now >= e) return { text: t("dash.done"), cls: "bg-sunken text-faint" };
    if (now >= s) return { text: t("dash.live"), cls: "bg-accent text-accent-fg" };
    if (c.booked >= c.capacity) return { text: t("dash.full"), cls: "bg-sunken text-muted" };
    return { text: t("dash.left", { n: String(c.capacity - c.booked) }), cls: "bg-accent-soft text-accent" };
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[30px] font-semibold leading-tight">{t(greet, { name: me.user.firstName })}</h1>
        <p className="mt-1 text-sm text-muted">
          {todayLong} · {t("dash.onBoard", { n: String(o.todaysClasses.length) })}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-5">
          {nc ? (
            <NextClassHero
              label={t("dash.upNext", { t: fmtTime(nc.startsAt, tz, lang) })}
              title={nc.className}
              meta={[
                t("dash.minutes", { n: String(Math.round((new Date(nc.endsAt).getTime() - new Date(nc.startsAt).getTime()) / 60_000)) }),
                nc.location,
                nc.trainer ? t("dash.with", { name: nc.trainer }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              attendees={nc.attendees}
              booked={nc.booked}
              capacity={nc.capacity}
              bookedLabel={t("dash.spotsBooked", { b: String(nc.booked), c: String(nc.capacity) })}
              href={`/schedule/${nc.id}`}
              openLabel={t("dash.openClass")}
              startsLabel={startsLabel}
              timeBlock={{ time: fmtTime(nc.startsAt, tz, lang), day: fmtDay(nc.startsAt, tz, lang), color: nc.color }}
            />
          ) : (
            <Card>
              <p className="text-muted">{t("dash.noUpcoming")}</p>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label={t("dash.activeMembers")}
              value={nf.format(k.activeMembers.value)}
              change={{ text: t("dash.newThisMonth", { n: String(k.newMembers.value) }) }}
            />
            <StatCard icon={ScanLine} label={t("dash.checkinsToday")} value={nf.format(k.checkinsToday.value)} />
            <StatCard
              icon={Banknote}
              label={t("dash.revenueMonth")}
              value={m(k.revenueThisMonth.valueMinor)}
              change={k.revenueThisMonth.changePct === null ? undefined : { pct: k.revenueThisMonth.changePct }}
              note={`${t("dash.mrr")}: ${m(k.mrr.valueMinor)}`}
            />
            <StatCard
              icon={Wallet}
              label={t("dash.overdue")}
              value={nf.format(k.overduePayments.value)}
              note={k.overduePayments.value ? m(k.overduePayments.amountMinor) : undefined}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <SectionTitle action={<span className="text-sm text-muted">{t("dash.weekTotal", { n: nf.format(weekTotal) })}</span>}>
                {t("dash.weekly")}
              </SectionTitle>
              <p className="-mt-2 mb-6 text-xs text-faint">{t("dash.weeklyHelp")}</p>
              <AttendanceChart days={weekDays} caption={t("dash.weeklyHelp")} />
            </Card>
            <Card>
              <SectionTitle>{t("dash.mix")}</SectionTitle>
              <MixDonut items={o.membershipMix} totalLabel={t("dash.activeShort")} otherLabel={t("dash.other")} lang={lang} />
            </Card>
          </div>

          <Card>
            <SectionTitle>{t("dash.revenueTrend")}</SectionTitle>
            <RevenueChart
              points={points}
              tableLabel={t("dash.showTable")}
              monthLabel={t("dash.month")}
              valueLabel={t("dash.revenue")}
              formatTick={Object.fromEntries(ticks.map((v) => [String(v), compact.format(v)]))}
            />
          </Card>
        </div>

        {/* Side column */}
        <div className="flex min-w-0 flex-col gap-5">
          <FillGauge
            title={t("dash.monthFill")}
            pct={o.monthFill.pct}
            caption={t("dash.spotsTaken")}
            stats={[
              { label: t("dash.classes"), value: nf.format(o.monthFill.classes) },
              { label: t("dash.checkins"), value: nf.format(o.monthFill.checkins) },
              { label: t("dash.noShows"), value: nf.format(o.monthFill.noShows) },
            ]}
          />

          <Card>
            <SectionTitle
              action={
                <Link href="/schedule" className="text-sm font-medium text-accent hover:underline">
                  {t("dash.seeAll")}
                </Link>
              }
            >
              {t("dash.todaysClasses")}
            </SectionTitle>
            {o.todaysClasses.length ? (
              <ul className="flex flex-col gap-2">
                {o.todaysClasses.map((c) => {
                  const st = classStatus(c);
                  return (
                    <li key={c.id}>
                      <Link href={`/schedule/${c.id}`} className="transition-subtle flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5 hover:bg-accent-soft">
                        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{fmtTime(c.startsAt, tz, lang)}</span>
                        <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{c.className}</span>
                          <span className="block truncate text-xs text-faint">
                            {c.location} · {c.booked}/{c.capacity}
                          </span>
                        </span>
                        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", st.cls)}>{st.text}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("dash.noClassesToday")}</p>
            )}
          </Card>

          <Card>
            <SectionTitle action={<span className="text-xs text-faint">{t("dash.last30")}</span>}>{t("dash.top")}</SectionTitle>
            <ol className="flex flex-col gap-1">
              {o.topMembers.map((tm, i) => (
                <li key={tm.id}>
                  <Link href={`/members/${tm.id}`} className="transition-subtle flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-sunken">
                    <span className="w-5 text-xs font-semibold text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <Avatar first={tm.firstName} last={tm.lastName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {tm.firstName} {tm.lastName}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{nf.format(tm.visits)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <SectionTitle>{t("dash.endingSoon")}</SectionTitle>
            {pending && (
              <Link
                href="/members?status=pending"
                className="transition-subtle mb-3 flex items-center gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm text-warning hover:brightness-95"
              >
                <AlertTriangle size={16} aria-hidden className="shrink-0" />
                <span className="flex-1">{t("dash.alert.PENDING_PAYMENTS", { n: String(pending.count) })}</span>
                <ChevronRight size={16} aria-hidden className="rtl:-scale-x-100" />
              </Link>
            )}
            {o.endingSoon.length ? (
              <ul className="flex flex-col gap-1">
                {o.endingSoon.map((s) => (
                  <li key={s.subscriptionId}>
                    <Link href={`/members/${s.member.id}`} className="transition-subtle flex items-center gap-3 rounded-xl px-1 py-1.5 text-sm hover:bg-sunken">
                      <Avatar first={s.member.firstName} last={s.member.lastName} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.member.firstName} {s.member.lastName}
                      </span>
                      <span className="shrink-0 text-xs text-warning">{fmtDateOnly(s.endsOn, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("dash.noneEnding")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

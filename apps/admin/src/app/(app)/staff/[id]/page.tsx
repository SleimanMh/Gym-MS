import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ACCESS_AREAS, addDays, STAFF_ROLE_KEYS, lowestPlanWith, type AccessLevel } from "@gym/shared";
import { AccessEditor } from "@/components/access-editor";
import { TeamCalendar } from "@/components/team-calendar";
import { Button, Card, Input, Label, Notice, PageHeader, SectionTitle, Select } from "@/components/ui";
import { ApiError, api, getMe } from "@/lib/api";
import { fmtDateOnly, fmtDay, fmtTime, fmtTimeRange, money } from "@/lib/format";
import { activityOptions, calLabels, loadWeek } from "@/lib/calendar";
import type { MessageKey } from "@/lib/i18n";
import { getT } from "@/lib/i18n";
import { rateText, type Employee } from "@/lib/staff";
import { clockIn, clockOut, deleteSlot, saveAccess, saveSlot, updateEmployee } from "../actions";
import { PayFields } from "../pay-fields";

interface Detail extends Employee {
  shifts: { id: string; startsAt: string; endsAt: string; note: string | null }[];
  timeEntries: { id: string; clockIn: string; clockOut: string | null }[];
  upcomingClasses: { id: string; startsAt: string; className: string; color: string; location: string; booked: number; capacity: number }[];
  timezone: string;
}

/** One team member: this month at a glance, their rota, clock-ins, classes and pay settings. */
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; week?: string; saved?: string }> }) {
  const [{ id }, sp, { t, lang, err }, me] = await Promise.all([params, searchParams, getT(), getMe()]);
  if (!me?.permissions.includes("staff.view") || !me.tenant) notFound();
  let e: Detail;
  try {
    e = await api<Detail>(`/v1/staff/${id}`);
  } catch (x) {
    if (x instanceof ApiError && (x.status === 404 || x.status === 400)) notFound();
    throw x;
  }
  const canManage = me.permissions.includes("staff.manage");
  const canAccess = me.permissions.includes("tenant.security.manage");
  const [locations, week, access] = await Promise.all([
    api<{ id: string; name: string }[]>("/v1/locations"),
    loadWeek("/v1/team-calendar", { week: sp.week, employeeId: e.id, tz: e.timezone, lang, t }),
    canAccess
      ? api<{
          userId: string | null;
          role: string | null;
          areas: Record<string, AccessLevel> | null;
          isSelf: boolean;
          roleDefaults: Record<string, Record<string, AccessLevel>>;
          customAllowed: boolean;
        }>(`/v1/staff/${e.id}/access`)
      : null,
  ]);
  const tz = e.timezone;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB", { maximumFractionDigits: 1 });
  const hoursOf = (a: string, b: string | null) => (b ? (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000 : null);
  const back = `/staff/${e.id}`;
  const weekBack = `/staff/${e.id}?week=${week.week}`;
  const onShiftSince = e.timeEntries.find((x) => !x.clockOut)?.clockIn ?? null;

  const stats = [
    { label: t("st.hoursMonth"), value: nf.format(e.stats.hoursWorked) },
    { label: t("st.classesMonth"), value: nf.format(e.stats.classesTaught) },
    { label: t("st.sales"), value: money(e.stats.salesMinor, e.currency, lang) },
    ...(e.stats.pay ? [{ label: t("st.payMonth"), value: money(e.stats.pay.totalMinor, e.currency, lang) }] : []),
  ];

  return (
    <>
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        subtitle={e.title}
        action={
          <Link href="/staff">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      {/* Hero in the gym's colour: who they are, this month in numbers, and the clock */}
      <section className="mb-5 flex flex-col gap-6 rounded-[var(--radius-card)] bg-accent p-6 text-accent-fg lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-accent-deep" aria-hidden>
            {e.firstName[0]}
            {e.lastName[0]}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-white/80">
              {t(`st.pay.${e.payType}`)}
              {rateText(e, t, lang) && <> · {rateText(e, t, lang)}</>}
            </p>
            <p className="text-sm text-white/80">{t("st.since", { d: fmtDateOnly(e.startedOn, lang) })}</p>
            {e.phone && (
              <p className="text-sm text-white/80" dir="ltr">
                {e.phone}
              </p>
            )}
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/14 px-4 py-3">
              <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
              <dt className="text-xs text-white/75">{s.label}</dt>
            </div>
          ))}
        </dl>
        {canManage && e.status === "active" && (
          <form action={onShiftSince ? clockOut : clockIn} className="flex flex-col items-center gap-1">
            <input type="hidden" name="employeeId" value={e.id} />
            <input type="hidden" name="back" value={back} />
            <Button className="bg-white text-fg hover:opacity-95">{onShiftSince ? t("clock.out") : t("clock.in")}</Button>
            {onShiftSince && <span className="text-xs text-white/80">{t("clock.since", { t: fmtTime(onShiftSince, tz, lang) })}</span>}
          </form>
        )}
      </section>

      {/* This person's week: shifts, activities and classes — click to add a slot for them */}
      <section className="mb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t("st.tab.schedule")} · <span className="text-muted">{t("cal.hours", { n: nf.format(Math.round(week.hoursFor(e.id) * 10) / 10) })}</span>
          </h2>
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/staff/${e.id}?week=${addDays(week.week, -7)}`} aria-label={t("cal.prev")} className="transition-subtle flex size-8 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={16} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <span className="px-2 text-sm font-medium">
              {week.dayLabels[0]!.dm} – {week.dayLabels[6]!.dm}
            </span>
            <Link href={`/staff/${e.id}?week=${addDays(week.week, 7)}`} aria-label={t("cal.next")} className="transition-subtle flex size-8 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={16} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
        <TeamCalendar
          days={week.days}
          dayLabels={week.dayLabels}
          today={week.today}
          nowMin={week.nowMin}
          employees={week.employees}
          events={week.events}
          locations={locations}
          activities={activityOptions(t)}
          canEdit={canManage && e.status === "active"}
          showFilter={false}
          labels={calLabels(t)}
          saveAction={saveSlot}
          deleteAction={deleteSlot}
          back={weekBack}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {canAccess && access && (
          <Card id="access" className="p-6">
            <SectionTitle>{t("acc.title")}</SectionTitle>
            <p className="-mt-1 mb-4 text-sm text-muted">{t("acc.subtitle", { name: e.firstName })}</p>
            {sp.saved === "access" && <Notice tone="success">{t("acc.saved")}</Notice>}
            {!access.userId ? (
              <p className="rounded-2xl bg-sunken px-4 py-3 text-sm text-muted">{t("acc.noLogin")}</p>
            ) : access.isSelf ? (
              <p className="rounded-2xl bg-sunken px-4 py-3 text-sm text-muted">{t("acc.self")}</p>
            ) : (
              <AccessEditor
                employeeId={e.id}
                roles={STAFF_ROLE_KEYS.map((r) => ({ key: r, label: t(`acc.role.${r}` as MessageKey), help: t(`acc.roleHelp.${r}` as MessageKey) }))}
                areas={ACCESS_AREAS.map((a) => ({
                  key: a.key,
                  label: t(`acc.area.${a.key}` as MessageKey),
                  levels: a.manage.length ? ["none", "view", "manage"] : ["none", "view"],
                }))}
                roleDefaults={access.roleDefaults}
                initialRole={access.role ?? "front_desk"}
                initialAreas={access.areas ?? access.roleDefaults[access.role ?? "front_desk"] ?? {}}
                customAllowed={access.customAllowed}
                labels={{
                  role: t("acc.role"),
                  areas: t("acc.areas"),
                  none: t("acc.level.none"),
                  view: t("acc.level.view"),
                  manage: t("acc.level.manage"),
                  on: t("acc.level.on"),
                  save: t("acc.save"),
                  reset: t("acc.reset"),
                  custom: t("acc.custom"),
                  ownerAll: t("acc.ownerAll"),
                  locked: t("acc.locked", { plan: (lowestPlanWith("identity.custom_roles") ?? "pro").replace(/^./, (c) => c.toUpperCase()) }),
                }}
                action={saveAccess}
              />
            )}
          </Card>
        )}

        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <SectionTitle>{t("st.detail.pay")}</SectionTitle>
            {e.stats.pay && (
              <p className="-mt-1 mb-4 text-sm text-muted">
                {t("st.detail.breakdown", { base: money(e.stats.pay.baseMinor, e.currency, lang), comm: money(e.stats.pay.commissionMinor, e.currency, lang) })}
              </p>
            )}
            {canManage ? (
              <form action={updateEmployee} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={e.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="title">{t("st.f.title")}</Label>
                    <Input id="title" name="title" defaultValue={e.title} required minLength={2} />
                  </div>
                  <div>
                    <Label htmlFor="status">{t("st.f.status")}</Label>
                    <Select id="status" name="status" defaultValue={e.status}>
                      <option value="active">{t("st.active")}</option>
                      <option value="inactive">{t("st.inactive")}</option>
                    </Select>
                  </div>
                </div>
                <PayFields t={t} currency={e.currency} locations={locations} value={e} />
                <div className="flex justify-end">
                  <Button type="submit">{t("st.save")}</Button>
                </div>
              </form>
            ) : (
              !e.stats.pay && <p className="text-sm text-muted">{t("st.detail.payHidden")}</p>
            )}
          </Card>

          <Card>
            <SectionTitle>{t("st.detail.timesheet")}</SectionTitle>
            {e.timeEntries.length ? (
              <ul className="flex flex-col gap-1.5">
                {e.timeEntries.slice(0, 8).map((te) => {
                  const h = hoursOf(te.clockIn, te.clockOut);
                  return (
                    <li key={te.id} className="flex items-center justify-between gap-3 rounded-xl px-1 py-1 text-sm">
                      <span className="font-medium">{fmtDay(te.clockIn, tz, lang)}</span>
                      <span className="tabular-nums text-muted">{fmtTimeRange(te.clockIn, te.clockOut, tz, lang)}</span>
                      <span className="w-14 text-end font-semibold tabular-nums">{h === null ? "" : t("pay.workHours", { n: nf.format(Math.round(h * 10) / 10) })}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("st.detail.noTime")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

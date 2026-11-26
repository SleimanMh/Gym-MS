import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { addDays } from "@gym/shared";
import { LockedFeature } from "@/components/blocks";
import { Avatar, Button, Card, Input, Label, Notice, PageHeader, SectionTitle, Select, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTimeRange, localDateIn } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { staffTabs, type Employee } from "@/lib/staff";
import { addShift, removeShift } from "../actions";

interface Shift {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  locationId: string;
  employee: { id: string; firstName: string; lastName: string; title: string };
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Monday of the week containing `d` (YYYY-MM-DD). */
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Week rota: people down the side, days across, shifts as pills. Front desk and floor cover. */
export default async function RotaPage({ searchParams }: { searchParams: Promise<{ week?: string; error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("staff.view") || !me.tenant) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  const tz = me.tenant.timezone;
  const today = localDateIn(new Date(), tz);
  const week = mondayOf(isDate(sp.week) ? sp.week! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const canManage = me.permissions.includes("staff.manage");
  const self = `/staff/rota?week=${week}`;

  const [shifts, staff, locations] = await Promise.all([
    api<Shift[]>(`/v1/shifts?from=${days[0]}&to=${days[6]}`),
    api<{ employees: Employee[] }>("/v1/staff"),
    api<{ id: string; name: string }[]>("/v1/locations"),
  ]);
  const people = staff.employees.filter((e) => e.status === "active");
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const dayHead = (d: string) => ({
    wd: new Intl.DateTimeFormat(loc, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
    dm: new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
  });
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const byCell = new Map<string, Shift[]>();
  for (const s of shifts) {
    const k = `${s.employee.id}|${localDateIn(new Date(s.startsAt), tz)}`;
    byCell.set(k, [...(byCell.get(k) ?? []), s]);
  }
  const planned = (empId: string) =>
    shifts.filter((s) => s.employee.id === empId).reduce((h, s) => h + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3_600_000, 0);
  // Rows: people with shifts this week first, then everyone else.
  const rows = [...people].sort((a, b) => Number(planned(b.id) > 0) - Number(planned(a.id) > 0));

  return (
    <>
      <PageHeader
        title={t("rota.title")}
        subtitle={t("rota.week", { d: `${dayHead(days[0]!).dm} – ${dayHead(days[6]!).dm}` })}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/staff/rota?week=${addDays(week, -7)}`} aria-label={t("rota.prev")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <Link href="/staff/rota" className="transition-subtle rounded-full px-3 py-1.5 text-sm font-medium hover:bg-sunken">
              {t("rota.today")}
            </Link>
            <Link href={`/staff/rota?week=${addDays(week, 7)}`} aria-label={t("rota.next")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <Tabs items={staffTabs(t, me, "rota")} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 w-52 bg-surface px-4 py-3 text-start font-medium text-muted">
                  {t("pay.employee")}
                </th>
                {days.map((d) => {
                  const h = dayHead(d);
                  return (
                    <th key={d} scope="col" className="px-1.5 py-3 text-center font-medium">
                      <span className={cn("inline-flex flex-col rounded-2xl px-3 py-1", d === today && "bg-ink text-white")}>
                        <span className="text-xs opacity-70">{h.wd}</span>
                        <span className="tabular-nums">{h.dm}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="sticky start-0 border-t border-border bg-surface px-4 py-3 text-start font-normal">
                    <Link href={`/staff/${e.id}`} className="flex items-center gap-2.5 hover:text-accent">
                      <Avatar first={e.firstName} last={e.lastName} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {e.firstName} {e.lastName}
                        </span>
                        <span className="block truncate text-xs text-faint">{t("rota.hoursPlanned", { n: nf.format(planned(e.id)) })}</span>
                      </span>
                    </Link>
                  </th>
                  {days.map((d) => {
                    const cell = byCell.get(`${e.id}|${d}`) ?? [];
                    return (
                      <td key={d} className={cn("border-t border-border px-1.5 py-2 align-top", d === today && "bg-accent-soft/40")}>
                        <div className="flex flex-col gap-1">
                          {cell.map((s) => (
                            <div key={s.id} className="group relative rounded-xl bg-accent-soft px-2 py-1.5 text-accent-deep">
                              <span className="block text-xs font-semibold tabular-nums">{fmtTimeRange(s.startsAt, s.endsAt, tz, lang)}</span>
                              <span className="block truncate text-[11px] opacity-75">{locName.get(s.locationId) ?? ""}</span>
                              {canManage && (
                                <form action={removeShift} className="absolute end-1 top-1">
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="back" value={self} />
                                  <button
                                    aria-label={t("rota.remove")}
                                    title={t("rota.remove")}
                                    className="transition-subtle flex size-5 items-center justify-center rounded-full opacity-0 hover:bg-white focus:opacity-100 group-hover:opacity-100"
                                  >
                                    <X size={12} aria-hidden />
                                  </button>
                                </form>
                              )}
                            </div>
                          ))}
                          {!cell.length && <span className="block py-1.5 text-center text-faint">{t("rota.none")}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {canManage && (
          <Card className="h-fit p-6">
            <SectionTitle>{t("rota.add")}</SectionTitle>
            <form action={addShift} className="flex flex-col gap-3">
              <input type="hidden" name="back" value={self} />
              <div>
                <Label htmlFor="employeeId">{t("pay.employee")}</Label>
                <Select id="employeeId" name="employeeId" required>
                  {people.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="locationId">{t("exp.location")}</Label>
                <Select id="locationId" name="locationId" required>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="date">{t("rota.date")}</Label>
                <Input id="date" name="date" type="date" required defaultValue={today >= days[0]! && today <= days[6]! ? today : days[0]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="start">{t("rota.start")}</Label>
                  <Input id="start" name="start" type="time" required defaultValue="09:00" dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="end">{t("rota.end")}</Label>
                  <Input id="end" name="end" type="time" required defaultValue="15:00" dir="ltr" />
                </div>
              </div>
              <div>
                <Label htmlFor="note">
                  {t("rota.note")} {t("common.optional")}
                </Label>
                <Input id="note" name="note" maxLength={200} />
              </div>
              <Button type="submit" className="mt-1">
                {t("rota.add")}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}

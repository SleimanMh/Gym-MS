import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { addDays, weekdayOf } from "@gym/shared";
import { Button, FillMeter, PageHeader } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { fmtDay, fmtTime, localDateIn, minutesInDay } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getLocationId } from "@/lib/location";

interface SessionRow {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: "scheduled" | "cancelled";
  classType: { name: string; color: string };
  location: { name: string };
  _count: { waitlist: number };
}

interface Placed extends SessionRow {
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

const HOUR = 58; // px per hour in the grid

/** Side-by-side lanes for classes that overlap in time (two rooms at 18:30). */
function placeDay(rows: SessionRow[], tz: string): Placed[] {
  const items = rows
    .map((s) => ({ ...s, start: minutesInDay(s.startsAt, tz), end: minutesInDay(s.endsAt, tz) || 24 * 60, lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    cluster = [];
  };
  for (const it of items) {
    if (it.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return items;
}

/** Week calendar: real times and lengths, a colour per class type, booked/capacity on every class. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  const tz = me!.tenant!.timezone;
  const today = localDateIn(new Date(), tz);
  const monday = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));
  const start = monday(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today);
  const end = addDays(start, 6);
  const locations = await api<{ id: string; name: string }[]>("/v1/locations");
  const locationId = await getLocationId(locations);

  const sessions = await api<SessionRow[]>(`/v1/sessions?from=${start}&to=${end}${locationId ? `&locationId=${locationId}` : ""}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map(days.map((d) => [d, [] as SessionRow[]]));
  for (const s of sessions) byDay.get(localDateIn(new Date(s.startsAt), tz))?.push(s);
  const placed = new Map(days.map((d) => [d, placeDay(byDay.get(d)!, tz)]));

  const all = [...placed.values()].flat();
  const firstHour = Math.min(7, ...all.map((p) => Math.floor(p.start / 60)));
  const lastHour = Math.max(21, ...all.map((p) => Math.ceil(p.end / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const gridH = hours.length * HOUR;
  const y = (min: number) => ((min - firstHour * 60) / 60) * HOUR;
  const nowMin = minutesInDay(new Date(), tz);
  const canManage = me!.permissions.includes("schedule.manage");
  const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${d}T12:00:00Z`));
  const locName = locations.find((l) => l.id === locationId)?.name;

  return (
    <>
      <PageHeader
        title={t("nav.schedule")}
        subtitle={`${fmtDay(`${start}T12:00:00Z`, "UTC", lang)} – ${fmtDay(`${end}T12:00:00Z`, "UTC", lang)}${locName ? ` · ${locName}` : ""}`}
        action={
          <>
            <div className="flex items-center rounded-lg border border-border bg-surface">
              <Link href={`/schedule?week=${addDays(start, -7)}`} aria-label={t("sched.prevWeek")} className="flex size-9 items-center justify-center text-muted hover:text-fg">
                <ChevronLeft size={16} className="rtl:-scale-x-100" aria-hidden />
              </Link>
              <Link href="/schedule" className="border-x border-border px-3 py-2 text-sm font-medium hover:bg-sunken">
                {t("sched.thisWeek")}
              </Link>
              <Link href={`/schedule?week=${addDays(start, 7)}`} aria-label={t("sched.nextWeek")} className="flex size-9 items-center justify-center text-muted hover:text-fg">
                <ChevronRight size={16} className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </div>
            {canManage && (
              <Link href="/schedule/setup">
                <Button variant="secondary">
                  <Settings2 size={16} aria-hidden />
                  {t("sched.setup")}
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* Desktop: time grid. Time runs top → bottom; days follow the reading direction. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border">
          <div />
          {days.map((d) => (
            <div key={d} className="border-s border-border px-2 py-2.5 text-center">
              <div className={`text-xs ${d === today ? "font-semibold text-accent" : "text-muted"}`}>{dayLabel(d, { weekday: "short" })}</div>
              <div
                className={`mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${d === today ? "bg-accent text-accent-fg" : ""}`}
              >
                {dayLabel(d, { day: "numeric" })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid max-h-[70vh] grid-cols-[56px_repeat(7,minmax(0,1fr))] overflow-y-auto">
          <div className="relative" style={{ height: gridH }}>
            {hours.map((h) => (
              <div key={h} className="absolute end-2 -translate-y-1/2 text-[11px] tabular-nums text-faint" style={{ top: y(h * 60) }} dir="ltr">
                {h > firstHour ? `${String(h).padStart(2, "0")}:00` : ""}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className={`relative border-s border-border ${d === today ? "bg-accent-soft/40" : ""}`} style={{ height: gridH }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: y(h * 60) }} aria-hidden />
              ))}
              {d === today && nowMin > firstHour * 60 && nowMin < lastHour * 60 && (
                <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: y(nowMin) }} aria-label={t("sched.now")}>
                  <span className="-ms-1 size-2 rounded-full bg-danger" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              )}
              {placed.get(d)!.map((s) => {
                const top = y(s.start);
                const height = Math.max(y(s.end) - top - 2, 30);
                const cancelled = s.status === "cancelled";
                const past = new Date(s.endsAt) < new Date();
                return (
                  <Link
                    key={s.id}
                    href={`/schedule/${s.id}`}
                    className={`transition-subtle absolute overflow-hidden rounded-md border-s-[3px] px-1.5 py-1 text-xs hover:z-20 hover:shadow-md ${cancelled ? "line-through opacity-50" : past ? "opacity-70" : ""}`}
                    style={{
                      top: top + 1,
                      height,
                      insetInlineStart: `calc(${(s.lane / s.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / s.lanes}% - 4px)`,
                      borderInlineStartColor: s.classType.color,
                      background: `color-mix(in srgb, ${s.classType.color} 11%, white)`,
                    }}
                    title={`${s.classType.name} · ${fmtTime(s.startsAt, tz, lang)} · ${s.location.name} · ${s.bookedCount}/${s.capacity}`}
                  >
                    <div className="truncate font-semibold text-fg">{s.classType.name}</div>
                    <div className="truncate tabular-nums text-muted">
                      {fmtTime(s.startsAt, tz, lang)}
                      {!locationId && <span className="text-faint"> · {s.location.name}</span>}
                      {height < 48 && !cancelled && (
                        <span className={s.bookedCount >= s.capacity ? "text-warning" : "text-faint"}>
                          {" "}· {s.bookedCount}/{s.capacity}
                        </span>
                      )}
                    </div>
                    {height >= 48 && !cancelled && (
                      <FillMeter
                        booked={s.bookedCount}
                        capacity={s.capacity}
                        label={`${s.bookedCount}/${s.capacity}${s._count.waitlist ? ` +${s._count.waitlist}` : ""}`}
                        className="mt-1"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Phones and narrow tablets: one list per day. */}
      <div className="flex flex-col gap-4 md:hidden">
        {days.map((d) => (
          <section key={d}>
            <h2 className={`mb-2 text-sm font-semibold ${d === today ? "text-accent" : ""}`}>{fmtDay(`${d}T12:00:00Z`, "UTC", lang)}</h2>
            {byDay.get(d)!.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {byDay.get(d)!.map((s) => (
                  <li key={s.id}>
                    <Link href={`/schedule/${s.id}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-11 text-sm font-medium tabular-nums">{fmtTime(s.startsAt, tz, lang)}</span>
                      <span className="h-8 w-1 rounded-full" style={{ background: s.classType.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-medium ${s.status === "cancelled" ? "line-through" : ""}`}>{s.classType.name}</span>
                        <span className="block truncate text-xs text-faint">{s.location.name}</span>
                      </span>
                      <FillMeter booked={s.bookedCount} capacity={s.capacity} label={`${s.bookedCount}/${s.capacity}`} className="w-24" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">—</p>
            )}
          </section>
        ))}
      </div>
      {!sessions.length && <p className="mt-4 text-sm text-muted">{t("sched.empty")}</p>}
    </>
  );
}

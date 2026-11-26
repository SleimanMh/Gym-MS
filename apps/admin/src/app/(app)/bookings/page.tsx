import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { addDays } from "@gym/shared";
import { Badge, Card, FillMeter, PageHeader } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTime, localDateIn } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getLocationId } from "@/lib/location";

interface BookingRow {
  id: string;
  status: string;
  source: string;
  member: { id: string; firstName: string; lastName: string };
  session: { id: string; startsAt: string; capacity?: number; classType: { name: string; color: string }; location: { name: string } };
}

/** Upcoming bookings for the next 7 days: pick a day, see each class and who's coming. */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  const tz = me!.tenant!.timezone;
  const from = localDateIn(new Date(), tz);
  const [rows, locations] = await Promise.all([
    api<BookingRow[]>(`/v1/bookings?from=${from}&to=${addDays(from, 7)}`),
    api<{ id: string; name: string }[]>("/v1/locations"),
  ]);
  const locId = await getLocationId(locations);
  const locName = locations.find((l) => l.id === locId)?.name;
  const live = rows.filter(
    (b) => b.status !== "cancelled" && new Date(b.session.startsAt) > new Date() && (!locName || b.session.location.name === locName),
  );

  // day → session → bookings
  const days = new Map<string, Map<string, BookingRow[]>>();
  for (const b of live) {
    const d = localDateIn(new Date(b.session.startsAt), tz);
    const sessions = days.get(d) ?? new Map<string, BookingRow[]>();
    sessions.set(b.session.id, [...(sessions.get(b.session.id) ?? []), b]);
    days.set(d, sessions);
  }
  const dayKeys = Array.from({ length: 8 }, (_, i) => addDays(from, i));
  const active = sp.day && dayKeys.includes(sp.day) ? sp.day : (dayKeys.find((d) => days.has(d)) ?? from);
  const sessions = [...(days.get(active)?.values() ?? [])].sort((a, b) => a[0]!.session.startsAt.localeCompare(b[0]!.session.startsAt));
  const loc = lang === "ar" ? "ar-LB" : "en-GB";
  const head = (d: string) => ({
    wd: new Intl.DateTimeFormat(loc, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
    n: new Intl.DateTimeFormat(loc, { day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
  });
  const count = (d: string) => [...(days.get(d)?.values() ?? [])].reduce((s, l) => s + l.length, 0);

  return (
    <>
      <PageHeader title={t("nav.bookings")} subtitle={`${t("book.upcoming")} · ${live.length}`} />

      {/* Day chips: the week ahead with how many bookings each day has */}
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t("book.upcoming")}>
        {dayKeys.map((d) => {
          const h = head(d);
          const on = d === active;
          return (
            <Link
              key={d}
              href={`/bookings?day=${d}`}
              aria-current={on ? "date" : undefined}
              className={cn(
                "transition-subtle flex min-w-[68px] flex-col items-center rounded-[18px] px-3 py-2.5",
                on ? "bg-ink text-white" : "bg-surface text-fg hover:bg-sunken",
              )}
            >
              <span className={cn("text-xs", on ? "text-white/60" : "text-faint")}>{h.wd}</span>
              <span className="text-xl font-semibold tabular-nums">{h.n}</span>
              <span className={cn("mt-1 rounded-full px-2 text-[11px] font-semibold tabular-nums", on ? "bg-accent text-accent-fg" : "bg-sunken text-muted")}>
                {count(d)}
              </span>
            </Link>
          );
        })}
      </nav>

      {sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t("book.empty")}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {sessions.map((list) => {
            const s = list[0]!.session;
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col">
                  <Link href={`/schedule/${s.id}`} className="group mb-4 flex items-center gap-3">
                    <span className="flex w-16 shrink-0 flex-col items-center rounded-2xl py-2 text-white" style={{ background: s.classType.color }}>
                      <span className="text-lg font-semibold leading-tight tabular-nums">{fmtTime(s.startsAt, tz, lang)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold group-hover:text-accent">{s.classType.name}</span>
                      <span className="block truncate text-sm text-muted">{s.location.name}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="text-faint rtl:-scale-x-100" />
                  </Link>
                  {s.capacity ? <FillMeter booked={list.length} capacity={s.capacity} label={`${list.length}/${s.capacity}`} className="mb-3" /> : null}
                  <ul className="flex flex-col gap-1">
                    {list.map((b) => (
                      <li key={b.id}>
                        <Link href={`/members/${b.member.id}`} className="transition-subtle flex items-center gap-2.5 rounded-xl px-1.5 py-1 text-sm hover:bg-sunken">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-deep" aria-hidden>
                            {b.member.firstName[0]}
                            {b.member.lastName[0]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {b.member.firstName} {b.member.lastName}
                          </span>
                          {b.source !== "staff" && (
                            <Badge tone={b.source === "widget" ? "accent" : b.source === "waitlist" ? "warning" : "neutral"}>
                              {t(`source.${b.source}` as "source.staff")}
                            </Badge>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

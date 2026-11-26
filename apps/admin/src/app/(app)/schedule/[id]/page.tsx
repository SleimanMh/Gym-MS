import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Badge, Button, Card, Input, Notice } from "@/components/ui";
import { ApiError, api, getMe } from "@/lib/api";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { bookMember, cancelBooking, cancelSession, markAttendance } from "../actions";

interface SessionDetail {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: "scheduled" | "cancelled";
  cancelReason: string | null;
  classType: { name: string; color: string };
  location: { name: string; timezone: string | null };
  bookings: { id: string; status: string; source: string; member: { id: string; firstName: string; lastName: string; phone: string | null } }[];
  waitlist: { id: string; member: { id: string; firstName: string; lastName: string } }[];
}

const tone = (s: string) =>
  s === "attended" ? "success" : s === "no_show" ? "danger" : s === "late_cancel" ? "warning" : s === "booked" ? "accent" : "neutral";

/** One class: roster, attendance, waitlist, book a member in (≤ 3 clicks), cancel the class. */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const [{ id }, sp, { t, lang, err }, me] = await Promise.all([params, searchParams, getT(), getMe()]);
  let s: SessionDetail;
  try {
    s = await api<SessionDetail>(`/v1/sessions/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const tz = s.location.timezone ?? me!.tenant!.timezone;
  const can = (p: string) => me!.permissions.includes(p);
  const live = s.status === "scheduled" && new Date(s.endsAt) > new Date();
  const full = s.bookedCount >= s.capacity;
  const matches =
    sp.q && can("booking.create")
      ? await api<{ id: string; firstName: string; lastName: string; phone: string | null; subscriptions: { status: string }[] }[]>(
          `/v1/members?q=${encodeURIComponent(sp.q)}&take=8`,
        )
      : [];
  const active = s.bookings.filter((b) => b.status !== "cancelled");

  return (
    <>
      <Link href="/schedule" className="mb-3 inline-block text-sm text-muted hover:text-fg">
        {t("nav.schedule")}
      </Link>
      {/* Hero like the dashboard's "up next": class, who's coming, how full, and the time block */}
      <section className="relative mb-5 flex flex-col gap-6 overflow-hidden rounded-[var(--radius-card)] bg-accent p-6 text-accent-fg sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col">
          {s.status === "cancelled" ? (
            <span className="mb-3 w-fit rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white">
              {t("sched.cancelled")}
              {s.cancelReason ? ` · ${s.cancelReason}` : ""}
            </span>
          ) : null}
          <h1 className="text-[34px] font-semibold leading-tight">{s.classType.name}</h1>
          <p className="mt-1 text-sm text-white/80">
            {fmtDateTime(s.startsAt, tz, lang)}–{fmtTime(s.endsAt, tz, lang)} · {s.location.name}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex -space-x-2 rtl:space-x-reverse">
              {active.slice(0, 6).map((b) => (
                <span key={b.id} className="flex size-8 items-center justify-center rounded-full bg-white text-[11px] font-bold text-accent-deep ring-2 ring-accent" aria-hidden>
                  {b.member.firstName[0]}
                  {b.member.lastName[0]}
                </span>
              ))}
              {active.length > 6 && (
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-deep text-[11px] font-bold ring-2 ring-accent" aria-hidden>
                  +{active.length - 6}
                </span>
              )}
            </div>
            <span className="text-sm text-white/90">
              {t("dash.spotsBooked", { b: String(s.bookedCount), c: String(s.capacity) })}
              {s.waitlist.length > 0 && <> · {t("sched.waitlistShort", { n: String(s.waitlist.length) })}</>}
            </span>
          </div>
          <div
            className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-white/25"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={s.capacity}
            aria-valuenow={s.bookedCount}
            aria-label={t("dash.spotsBooked", { b: String(s.bookedCount), c: String(s.capacity) })}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.round((s.bookedCount / Math.max(1, s.capacity)) * 100))}%` }} />
          </div>
        </div>
        <div
          className="flex min-h-[140px] w-full flex-col justify-between rounded-[18px] p-5 sm:w-60"
          style={{ background: `color-mix(in srgb, ${s.classType.color} 35%, rgba(255,255,255,0.14))` }}
        >
          <span className="text-sm text-white/85">{fmtDay(s.startsAt, tz, lang)}</span>
          <span className="text-5xl font-semibold tabular-nums tracking-tight" dir="ltr">
            {fmtTime(s.startsAt, tz, lang)}
          </span>
          {full && <span className="w-fit rounded-full bg-ink/70 px-3 py-1 text-xs font-medium">{t("dash.full")}</span>}
        </div>
      </section>
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">{t("sched.roster")}</h2>
          {active.length ? (
            <ul className="divide-y divide-border">
              {active.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/members/${b.member.id}`} className="flex flex-1 items-center gap-3 font-medium hover:underline">
                    <Avatar first={b.member.firstName} last={b.member.lastName} size="sm" />
                    {b.member.firstName} {b.member.lastName}
                  </Link>
                  <Badge tone={tone(b.status)}>{t(`status.${b.status}` as "status.booked")}</Badge>
                  {s.status === "scheduled" && can("checkin.create") && ["booked", "attended", "no_show"].includes(b.status) && (
                    <div className="flex gap-1">
                      {(["attended", "no_show"] as const).map((st) => (
                        <form key={st} action={markAttendance}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="sessionId" value={s.id} />
                          <input type="hidden" name="status" value={st} />
                          <Button variant={b.status === st ? "primary" : "secondary"} className="h-8 px-2.5 text-xs">
                            {t(st === "attended" ? "sched.attended" : "sched.noShow")}
                          </Button>
                        </form>
                      ))}
                    </div>
                  )}
                  {b.status === "booked" && live && can("booking.cancel") && new Date(s.startsAt) > new Date() && (
                    <form action={cancelBooking} className="flex items-center gap-2">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="sessionId" value={s.id} />
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input type="checkbox" name="waive" /> {t("sched.waive")}
                      </label>
                      <Button variant="ghost" className="h-8 px-2.5 text-xs text-danger">
                        {t("sched.cancelBooking")}
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted">{t("sched.emptyRoster")}</p>
          )}

          {s.waitlist.length > 0 && (
            <>
              <h3 className="border-t border-border px-5 pt-4 pb-2 text-sm font-semibold">{t("sched.waitlist")}</h3>
              <ol className="px-5 pb-4 text-sm">
                {s.waitlist.map((w, i) => (
                  <li key={w.id} className="py-1">
                    {i + 1}. {w.member.firstName} {w.member.lastName}
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {live && can("booking.create") && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("sched.bookMember")}</h2>
              <form className="mb-3 flex gap-2" role="search">
                <Input name="q" defaultValue={sp.q ?? ""} placeholder={t("sched.searchMember")} aria-label={t("sched.searchMember")} />
                <Button variant="secondary">{t("common.search")}</Button>
              </form>
              <ul className="divide-y divide-border">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1">
                      {m.firstName} {m.lastName}
                      <span className="ms-2 text-muted" dir="ltr">
                        {m.phone}
                      </span>
                    </span>
                    <form action={bookMember}>
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <input type="hidden" name="joinWaitlist" value={full ? "1" : "0"} />
                      <Button className="h-8 px-3 text-xs" variant={full ? "secondary" : "primary"}>
                        {full ? t("sched.addToWaitlist") : t("sched.book")}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {s.status === "scheduled" && new Date(s.startsAt) > new Date() && can("schedule.manage") && (
            <Card>
              <form action={cancelSession} className="flex flex-col gap-3">
                <input type="hidden" name="sessionId" value={s.id} />
                <label htmlFor="reason" className="text-sm font-medium">
                  {t("sched.cancelReason")}
                </label>
                <Input id="reason" name="reason" maxLength={200} />
                <div>
                  <Button variant="danger">{t("sched.cancelClass")}</Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

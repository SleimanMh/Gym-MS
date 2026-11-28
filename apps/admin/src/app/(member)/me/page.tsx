import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { memberLogout, setLanguage } from "@/app/actions";
import { Badge, Button, Card, Notice, SectionTitle } from "@/components/ui";
import { ApiError, api, getGym } from "@/lib/api";
import { fmtDateOnly, fmtDay, fmtTime } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { bookClass, cancelBooking, leaveWaitlist } from "./actions";

interface Profile {
  firstName: string;
  lastName: string;
  checkinCode: string;
  memberships: { id: string; name: string; status: "active" | "pending"; endsOn: string | null; creditsLeft: number | null }[];
}
interface MyBookings {
  bookings: { id: string; session: { id: string; startsAt: string; classType: { name: string; color: string }; location: { name: string } } }[];
  waitlist: { id: string; session: { id: string; startsAt: string; classType: { name: string }; location: { name: string } } }[];
}
interface OpenClass {
  id: string;
  startsAt: string;
  className: string;
  color: string;
  location: { name: string };
  trainer: string | null;
  spotsLeft: number;
}

/** The member's own page at their gym's address: check-in QR, membership, bookings, and booking a class. */
export default async function MemberHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, sp, gym] = await Promise.all([getT(), searchParams, getGym()]);
  if (!gym) redirect("/login");
  let me: Profile;
  let mine: MyBookings;
  try {
    [me, mine] = await Promise.all([api<Profile>("/v1/me/member", { as: "member" }), api<MyBookings>("/v1/me/bookings", { as: "member" })]);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) redirect("/login?as=member");
    throw e;
  }
  const classes = await api<OpenClass[]>("/v1/public/sessions?days=7", { as: "anonymous" });
  const tz = (await api<{ timezone: string }>("/v1/public/tenant", { as: "anonymous" })).timezone;
  const qr = await QRCode.toString(me.checkinCode, { type: "svg", margin: 1, width: 168 });
  const bookedIds = new Set(mine.bookings.map((b) => b.session.id));
  const waitingIds = new Set(mine.waitlist.map((w) => w.session.id));
  const current = me.memberships[0];

  return (
    <main className="min-h-screen bg-bg" style={{ "--accent": gym.branding.primaryColor } as CSSProperties}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-fg" aria-hidden>
            {[...gym.name][0]}
          </span>
          <span className="font-semibold">{gym.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <form action={setLanguage}>
            <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
            <Button variant="secondary" className="h-9 px-4" lang={lang === "ar" ? "en" : "ar"}>
              {t("lang.switch")}
            </Button>
          </form>
          <form action={memberLogout}>
            <Button variant="ghost" className="h-9 px-3">
              {t("me.signOut")}
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-10">
        <h1 className="text-[28px] font-semibold">{t("me.hi", { name: me.firstName })}</h1>
        {sp.error && <Notice>{err(sp.error)}</Notice>}

        <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
          <section className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-ink p-5 text-center text-white">
            <div className="rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label={t("mem.checkinCode")} />
            <p className="text-xs text-white/70">{t("me.qr")}</p>
          </section>
          <Card>
            <SectionTitle>{t("me.membership")}</SectionTitle>
            {current ? (
              <div className="flex flex-col gap-2">
                <p className="text-xl font-semibold">{current.name}</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {current.status === "pending" ? <Badge tone="warning">{t("me.pending")}</Badge> : <Badge tone="success">{t("sub.active")}</Badge>}
                  <span className="text-muted">{current.creditsLeft === null ? t("me.unlimited") : t("me.credits", { n: String(current.creditsLeft) })}</span>
                  {current.endsOn && <span className="text-muted">· {t("me.until", { d: fmtDateOnly(current.endsOn, lang) })}</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("me.none")}</p>
            )}
          </Card>
        </div>

        <Card>
          <SectionTitle>{t("me.upcoming")}</SectionTitle>
          {mine.bookings.length || mine.waitlist.length ? (
            <ul className="flex flex-col gap-2">
              {mine.bookings.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5">
                  <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: b.session.classType.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.session.classType.name}</span>
                    <span className="block truncate text-xs text-faint">
                      {fmtDay(b.session.startsAt, tz, lang)} · {fmtTime(b.session.startsAt, tz, lang)} · {b.session.location.name}
                    </span>
                  </span>
                  <form action={cancelBooking}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button variant="ghost" className="h-8 px-3 text-xs text-danger hover:bg-danger-soft">
                      {t("me.cancel")}
                    </Button>
                  </form>
                </li>
              ))}
              {mine.waitlist.map((w) => (
                <li key={w.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{w.session.classType.name}</span>
                    <span className="block truncate text-xs text-faint">
                      {fmtDay(w.session.startsAt, tz, lang)} · {fmtTime(w.session.startsAt, tz, lang)} · {t("me.waitlist")}
                    </span>
                  </span>
                  <form action={leaveWaitlist}>
                    <input type="hidden" name="id" value={w.id} />
                    <Button variant="ghost" className="h-8 px-3 text-xs">
                      {t("me.leave")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("me.noBookings")}</p>
          )}
        </Card>

        <Card>
          <SectionTitle>{t("me.classes")}</SectionTitle>
          {classes.length ? (
            <ul className="flex flex-col gap-2">
              {classes.map((c) => {
                const booked = bookedIds.has(c.id);
                const waiting = waitingIds.has(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-2xl px-1 py-1.5">
                    <span className="w-24 shrink-0 text-xs text-muted">
                      <span className="block font-semibold text-fg">{fmtTime(c.startsAt, tz, lang)}</span>
                      {fmtDay(c.startsAt, tz, lang)}
                    </span>
                    <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.className}</span>
                      <span className="block truncate text-xs text-faint">
                        {c.location.name}
                        {c.trainer ? ` · ${c.trainer}` : ""} · {t("me.spots", { n: String(c.spotsLeft) })}
                      </span>
                    </span>
                    {booked ? (
                      <Badge tone="success">{t("me.booked")}</Badge>
                    ) : waiting ? (
                      <Badge tone="warning">{t("me.waitlist")}</Badge>
                    ) : (
                      <form action={bookClass}>
                        <input type="hidden" name="sessionId" value={c.id} />
                        {c.spotsLeft === 0 && <input type="hidden" name="waitlist" value="1" />}
                        <Button variant={c.spotsLeft ? "primary" : "secondary"} className="h-8 px-3 text-xs">
                          {c.spotsLeft ? t("me.book") : t("me.full")}
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("me.noClasses")}</p>
          )}
        </Card>
      </div>
    </main>
  );
}

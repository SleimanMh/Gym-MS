import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Badge, Button, Card, Input, Label, Notice, Select } from "@/components/ui";
import { ApiError, api, getMe } from "@/lib/api";
import { fmtDateOnly, fmtDateTime, localDateIn, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { cancelMembership, freezeMembership, recordPayment, rotateCode, sellMembership } from "../actions";

interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  checkinCode: string;
  createdAt: string;
  stats: { visits30d: number; upcomingBookings: number };
  subscriptions: {
    id: string;
    status: "pending" | "active" | "expired" | "cancelled";
    startsOn: string;
    endsOn: string | null;
    priceMinor: string;
    currency: string;
    creditsLeft: number | null;
    plan: { name: string; type: string };
    freezes: { id: string; startsOn: string; endsOn: string }[];
  }[];
  bookings: { id: string; status: string; session: { id: string; startsAt: string; classType: { name: string; color: string } } }[];
  checkIns: { id: string; checkedInAt: string; method: string }[];
  payments: { id: string; receiptNumber: number; amountMinor: string; currency: string; method: string; paidAt: string; status: string }[];
}
interface Plan {
  id: string;
  name: string;
  priceMinor: string;
  currency: string;
  isActive: boolean;
}

const subTone = { active: "success", pending: "warning", expired: "neutral", cancelled: "neutral" } as const;

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, sp, { t, lang, err }, me] = await Promise.all([params, searchParams, getT(), getMe()]);
  let m: Profile;
  try {
    m = await api<Profile>(`/v1/members/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const tz = me!.tenant!.timezone;
  const can = (p: string) => me!.permissions.includes(p);
  const plans = can("sale.create") ? (await api<Plan[]>("/v1/membership-plans")).filter((p) => p.isActive) : [];
  const qr = await QRCode.toString(m.checkinCode, { type: "svg", margin: 1, width: 160 });
  const today = localDateIn(new Date(), tz);
  const liveSubs = m.subscriptions.filter((s) => s.status === "active" || s.status === "pending");
  const pastSubs = m.subscriptions.filter((s) => s.status === "expired" || s.status === "cancelled");
  const current = liveSubs[0];

  return (
    <>
      <Link href="/members" className="mb-3 inline-block text-sm text-muted hover:text-fg">
        {t("nav.members")}
      </Link>
      {/* Hero in the gym's colour: who this is, their membership, and how active they are */}
      <section className="mb-5 flex flex-col gap-6 rounded-[var(--radius-card)] bg-accent p-6 text-accent-fg lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-accent-deep" aria-hidden>
            {m.firstName[0]}
            {m.lastName[0]}
          </span>
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight">
              {m.firstName} {m.lastName}
            </h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
              {m.phone && <span dir="ltr">{m.phone}</span>}
              {m.email && <span>{m.email}</span>}
              <span>{t("mem.since", { d: fmtDateOnly(m.createdAt, lang) })}</span>
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold">
              <span className={current?.status === "active" ? "size-1.5 rounded-full bg-[#7dffb3]" : "size-1.5 rounded-full bg-[#ffd479]"} aria-hidden />
              {current ? `${current.plan.name} · ${t(`sub.${current.status}`)}` : t("mem.noMembership")}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:w-80">
          <div className="rounded-2xl bg-white/14 px-4 py-3">
            <dd className="text-2xl font-semibold tabular-nums">{m.stats.visits30d}</dd>
            <dt className="text-xs text-white/75">{t("mem.visits30")}</dt>
          </div>
          <div className="rounded-2xl bg-white/14 px-4 py-3">
            <dd className="text-2xl font-semibold tabular-nums">{m.stats.upcomingBookings}</dd>
            <dt className="text-xs text-white/75">{t("mem.upcoming")}</dt>
          </div>
        </dl>
      </section>
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{t("mem.memberships")}</h2>
            {liveSubs.length ? (
              <ul className="divide-y divide-border">
                {liveSubs.map((s) => {
                  const live = s.status === "active" || s.status === "pending";
                  return (
                    <li key={s.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.plan.name}</span>
                        <Badge tone={subTone[s.status]}>{t(`sub.${s.status}`)}</Badge>
                        <span className="text-muted">
                          {fmtDateOnly(s.startsOn, lang)}
                          {s.endsOn ? ` – ${fmtDateOnly(s.endsOn, lang)}` : ""}
                        </span>
                        <span className="ms-auto font-medium">
                          {s.creditsLeft === null ? t("mem.unlimited") : t("mem.creditsLeft", { n: String(s.creditsLeft) })}
                        </span>
                      </div>
                      {s.freezes.map((f) => (
                        <div key={f.id} className="mt-1 text-xs text-muted">
                          {t("mem.frozen", { from: fmtDateOnly(f.startsOn, lang), to: fmtDateOnly(f.endsOn, lang) })}
                        </div>
                      ))}
                      {live && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          {s.status === "pending" && can("payment.take") && (
                            <form action={recordPayment} className="flex items-end gap-2">
                              <input type="hidden" name="memberId" value={m.id} />
                              <input type="hidden" name="subscriptionId" value={s.id} />
                              <input type="hidden" name="amountMinor" value={s.priceMinor} />
                              <Select name="method" aria-label={t("mem.payment")} className="h-8 w-40 text-sm">
                                {(["cash", "card_terminal", "bank_transfer"] as const).map((pm) => (
                                  <option key={pm} value={pm}>
                                    {t(`pay.${pm}`)}
                                  </option>
                                ))}
                              </Select>
                              <Button className="h-8 px-3 text-xs">
                                {t("mem.recordPayment")} · {money(s.priceMinor, s.currency, lang)}
                              </Button>
                            </form>
                          )}
                          {s.status === "active" && can("member.manage") && (
                            <form action={freezeMembership} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="memberId" value={m.id} />
                              <input type="hidden" name="subscriptionId" value={s.id} />
                              <label className="text-xs text-muted">
                                {t("mem.freezeFrom")}
                                <Input name="startsOn" type="date" defaultValue={today} className="h-8 w-36 text-sm" required />
                              </label>
                              <label className="text-xs text-muted">
                                {t("mem.freezeTo")}
                                <Input name="endsOn" type="date" className="h-8 w-36 text-sm" required />
                              </label>
                              <Button variant="secondary" className="h-8 px-3 text-xs">
                                {t("mem.freeze")}
                              </Button>
                            </form>
                          )}
                          {can("member.manage") && (
                            <form action={cancelMembership}>
                              <input type="hidden" name="memberId" value={m.id} />
                              <input type="hidden" name="subscriptionId" value={s.id} />
                              <Button variant="ghost" className="h-8 px-3 text-xs text-danger">
                                {t("mem.cancelMembership")}
                              </Button>
                            </form>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{t("mem.noMembership")}</p>
            )}
            {pastSubs.length > 0 && (
              <details className="border-t border-border px-5 py-3 text-sm">
                <summary className="cursor-pointer text-muted">
                  {t("mem.previous")} ({pastSubs.length})
                </summary>
                <ul className="mt-2 divide-y divide-border">
                  {pastSubs.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-muted">
                      <span className="text-fg">{s.plan.name}</span>
                      <Badge tone={subTone[s.status]}>{t(`sub.${s.status}`)}</Badge>
                      <span>
                        {fmtDateOnly(s.startsOn, lang)}
                        {s.endsOn ? ` – ${fmtDateOnly(s.endsOn, lang)}` : ""}
                      </span>
                      <span className="ms-auto tabular-nums">{money(s.priceMinor, s.currency, lang)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {plans.length > 0 && (
            <Card>
              <h2 className="mb-4 font-semibold">{t("mem.sell")}</h2>
              <form action={sellMembership} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_1fr_1fr_auto] lg:items-end">
                <input type="hidden" name="memberId" value={m.id} />
                <div>
                  <Label htmlFor="planId">{t("common.plan")}</Label>
                  <Select id="planId" name="planId" required>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {money(p.priceMinor, p.currency, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="startsOn">{t("mem.startsOn")}</Label>
                  <Input id="startsOn" name="startsOn" type="date" defaultValue={today} />
                </div>
                <div>
                  <Label htmlFor="method">{t("mem.payment")}</Label>
                  <Select id="method" name="method" defaultValue="cash">
                    {(["cash", "card_terminal", "bank_transfer"] as const).map((pm) => (
                      <option key={pm} value={pm}>
                        {t(`pay.${pm}`)}
                      </option>
                    ))}
                    <option value="later">{t("mem.payLater")}</option>
                  </Select>
                </div>
                <Button type="submit">{t("mem.sell")}</Button>
              </form>
            </Card>
          )}

          <Card className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{t("mem.bookings")}</h2>
            {m.bookings.length ? (
              <ul className="divide-y divide-border text-sm">
                {m.bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/schedule/${b.session.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-bg">
                      <span className="size-2 rounded-full" style={{ background: b.session.classType.color }} aria-hidden />
                      <span className="flex-1">{b.session.classType.name}</span>
                      <span className="text-muted">{fmtDateTime(b.session.startsAt, tz, lang)}</span>
                      <Badge>{t(`status.${b.status}` as "status.booked")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{t("mem.noBookings")}</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-ink p-6 text-center text-white">
            <h2 className="font-semibold">{t("mem.checkinCode")}</h2>
            <div className="rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} aria-label={t("mem.checkinCode")} />
            <code className="text-xs text-white/60" dir="ltr">
              {m.checkinCode}
            </code>
            {can("member.manage") && (
              <form action={rotateCode}>
                <input type="hidden" name="memberId" value={m.id} />
                <button className="transition-subtle h-8 rounded-full bg-white/10 px-4 text-xs font-semibold hover:bg-white/20">{t("mem.newCode")}</button>
              </form>
            )}
          </section>

          <Card>
            <dl className="flex flex-col gap-2 text-sm">
              {[
                [t("common.phone"), m.phone],
                [t("common.email"), m.email],
                [t("mem.dob"), m.dateOfBirth && fmtDateOnly(m.dateOfBirth, lang)],
                [t("mem.emergencyName"), [m.emergencyContactName, m.emergencyContactPhone].filter(Boolean).join(" · ")],
                [t("mem.notes"), m.notes],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          <Card className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{t("mem.payments")}</h2>
            {m.payments.length ? (
              <ul className="divide-y divide-border text-sm">
                {m.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-5 py-2.5">
                    <span className="flex-1 tabular-nums">{money(p.amountMinor, p.currency, lang)}</span>
                    <span className="text-xs text-muted">{fmtDateTime(p.paidAt, tz, lang)}</span>
                    {can("payment.take") && (
                      <Link href={`/receipts/${p.id}`} className="text-xs text-accent hover:underline">
                        #{p.receiptNumber}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{t("mem.noPayments")}</p>
            )}
          </Card>

          <Card className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{t("mem.checkIns")}</h2>
            {m.checkIns.length ? (
              <ul className="divide-y divide-border text-sm">
                {m.checkIns.map((c) => (
                  <li key={c.id} className="px-5 py-2.5 text-muted">
                    {fmtDateTime(c.checkedInAt, tz, lang)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{t("mem.noCheckIns")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

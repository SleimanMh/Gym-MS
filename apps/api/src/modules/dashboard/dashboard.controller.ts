import { Controller, Get } from "@nestjs/common";
import { addDays, addMonths, localDate, toDateColumn, weekdayOf, zonedToUtc } from "@gym/shared";
import { RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { TenantDb } from "../../infra/tenant-db.service";

/**
 * Owner overview (PLAN.md section 8). Phase 1 computes it live on small, indexed ranges; the
 * nightly rollup tables take over in Phase 3. Metric definitions: docs/metrics.md.
 */
@Controller("v1/dashboard")
export class DashboardController {
  constructor(private readonly db: TenantDb) {}

  @Get("overview")
  @RequiresPermission("report.view")
  overview() {
    const t = requireTenant();
    const tz = t.timezone;
    const now = new Date();
    const today = localDate(now, tz);
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevMonthStart = addMonths(monthStart, -1);
    const at = (d: string) => zonedToUtc(d, 0, tz);
    const todayCol = toDateColumn(today);

    return this.db.run(async (tx) => {
      const revenue = (from: string, to: string) =>
        tx.payment.aggregate({
          where: { status: "succeeded", currency: t.currency, paidAt: { gte: at(from), lt: at(to) } },
          _sum: { amountMinor: true },
        });

      const [
        thisMonth,
        lastMonth,
        activeSubs,
        newMembers,
        newMembersPrev,
        checkinsToday,
        pending,
        expiringSoon,
        todaysClasses,
        endingSoon,
      ] = await Promise.all([
        revenue(monthStart, addMonths(monthStart, 1)),
        revenue(prevMonthStart, monthStart),
        tx.memberSubscription.findMany({
          where: { status: "active", startsOn: { lte: todayCol }, OR: [{ endsOn: null }, { endsOn: { gte: todayCol } }] },
          select: { memberId: true, priceMinor: true, currency: true, plan: { select: { name: true, type: true, billingPeriod: true } } },
        }),
        tx.member.count({ where: { deletedAt: null, createdAt: { gte: at(monthStart) } } }),
        tx.member.count({ where: { deletedAt: null, createdAt: { gte: at(prevMonthStart), lt: at(monthStart) } } }),
        tx.checkIn.count({ where: { checkedInAt: { gte: at(today) } } }),
        tx.memberSubscription.aggregate({ where: { status: "pending" }, _count: true, _sum: { priceMinor: true } }),
        tx.memberSubscription.count({
          where: { status: "active", endsOn: { gte: todayCol, lte: toDateColumn(addDays(today, 7)) } },
        }),
        tx.session.findMany({
          where: { startsAt: { gte: at(today), lt: at(addDays(today, 1)) } },
          include: { classType: { select: { name: true, color: true } }, location: { select: { name: true } } },
          orderBy: { startsAt: "asc" },
        }),
        tx.memberSubscription.findMany({
          where: { status: "active", endsOn: { gte: todayCol, lte: toDateColumn(addDays(today, 7)) } },
          include: { member: { select: { id: true, firstName: true, lastName: true } }, plan: { select: { name: true } } },
          orderBy: { endsOn: "asc" },
          take: 6,
        }),
      ]);
      // ── Studio view: next class and this week's attendance ──
      const weekStart = addDays(today, -((weekdayOf(today) + 6) % 7)); // Monday
      const [nextSession, weekRows] = await Promise.all([
        tx.session.findFirst({
          where: { status: "scheduled", endsAt: { gt: now } },
          orderBy: { startsAt: "asc" },
          include: {
            classType: { select: { name: true, color: true } },
            location: { select: { name: true } },
            bookings: {
              where: { status: { in: ["booked", "attended"] } },
              select: { member: { select: { firstName: true, lastName: true } } },
              orderBy: { createdAt: "asc" },
              take: 4,
            },
          },
        }),
        tx.$queryRaw<{ day: string; n: bigint }[]>`
          SELECT to_char((checked_in_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, count(*)::bigint AS n
          FROM check_ins
          WHERE checked_in_at >= ${at(weekStart)} AND checked_in_at < ${at(addDays(weekStart, 7))}
          GROUP BY 1`,
      ]);
      const trainer = nextSession?.trainerUserId
        ? await tx.user.findUnique({ where: { id: nextSession.trainerUserId }, select: { firstName: true } })
        : null;
      const weekMap = new Map(weekRows.map((r) => [r.day, Number(r.n)]));
      const studio = {
        nextClass: nextSession && {
          id: nextSession.id,
          className: nextSession.classType.name,
          color: nextSession.classType.color,
          startsAt: nextSession.startsAt,
          endsAt: nextSession.endsAt,
          location: nextSession.location.name,
          trainer: trainer?.firstName ?? null,
          booked: nextSession.bookedCount,
          capacity: nextSession.capacity,
          attendees: nextSession.bookings.map((b) => b.member),
        },
        weekAttendance: Array.from({ length: 7 }, (_, i) => {
          const day = addDays(weekStart, i);
          return { day, checkins: weekMap.get(day) ?? 0, isToday: day === today, isFuture: day > today };
        }),
      };

      // MRR = active recurring memberships normalised to one month (docs/metrics.md).
      const mrr = activeSubs
        .filter((s) => s.plan.type === "recurring" && s.currency === t.currency)
        .reduce((sum, s) => sum + (s.plan.billingPeriod === "year" ? s.priceMinor / 12n : s.priceMinor), 0n);
      const activeMembers = new Set(activeSubs.map((s) => s.memberId)).size;

      const pct = (a: bigint | number, b: bigint | number) =>
        Number(b) === 0 ? null : Math.round(((Number(a) - Number(b)) / Number(b)) * 1000) / 10;
      const rev = thisMonth._sum.amountMinor ?? 0n;
      const revPrev = lastMonth._sum.amountMinor ?? 0n;

      return {
        currency: t.currency,
        timezone: tz,
        kpis: {
          revenueThisMonth: { valueMinor: rev, changePct: pct(rev, revPrev) },
          mrr: { valueMinor: mrr },
          activeMembers: { value: activeMembers },
          newMembers: { value: newMembers, changePct: pct(newMembers, newMembersPrev) },
          checkinsToday: { value: checkinsToday },
          overduePayments: { value: pending._count, amountMinor: pending._sum.priceMinor ?? 0n },
        },
        ...studio,
        endingSoon: endingSoon.map((s) => ({
          subscriptionId: s.id,
          endsOn: s.endsOn,
          plan: s.plan.name,
          member: s.member,
        })),
        todaysClasses: todaysClasses.map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          className: s.classType.name,
          color: s.classType.color,
          location: s.location.name,
          booked: s.bookedCount,
          capacity: s.capacity,
          status: s.status,
        })),
        alerts: [
          ...(pending._count ? [{ kind: "PENDING_PAYMENTS", count: pending._count }] : []),
          ...(expiringSoon ? [{ kind: "EXPIRING_7_DAYS", count: expiringSoon }] : []),
        ],
      };
    });
  }
}

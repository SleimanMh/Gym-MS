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
    const trendStart = addMonths(monthStart, -11);
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
        ended,
        checkinsToday,
        pending,
        expiringSoon,
        todaysClasses,
        trendRows,
        lastWeek,
        recentMembers,
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
        tx.memberSubscription.count({
          where: {
            OR: [
              { status: "cancelled", cancelledAt: { gte: at(monthStart) } },
              { status: "expired", endsOn: { gte: toDateColumn(monthStart), lt: todayCol } },
            ],
          },
        }),
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
        tx.$queryRaw<{ month: string; total: bigint }[]>`
          SELECT to_char(date_trunc('month', paid_at AT TIME ZONE ${tz}), 'YYYY-MM') AS month,
                 COALESCE(SUM(amount_minor), 0)::bigint AS total
          FROM payments
          WHERE status = 'succeeded' AND currency = ${t.currency} AND paid_at >= ${at(trendStart)}
          GROUP BY 1 ORDER BY 1`,
        // Class fill and no-shows over the last 7 days (docs/metrics.md).
        tx.$queryRaw<{ capacity: bigint; taken: bigint; no_show: bigint; sessions: bigint }[]>`
          SELECT COALESCE(SUM(s.capacity), 0)::bigint AS capacity,
                 COALESCE(SUM(s.booked_count), 0)::bigint AS taken,
                 (SELECT count(*) FROM bookings b JOIN sessions s2 ON s2.id = b.session_id
                   WHERE b.status = 'no_show' AND s2.starts_at >= ${at(addDays(today, -7))} AND s2.starts_at < ${now})::bigint AS no_show,
                 count(*)::bigint AS sessions
          FROM sessions s
          WHERE s.status = 'scheduled' AND s.starts_at >= ${at(addDays(today, -7))} AND s.starts_at < ${now}`,
        tx.member.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, firstName: true, lastName: true, createdAt: true },
        }),
        tx.memberSubscription.findMany({
          where: { status: "active", endsOn: { gte: todayCol, lte: toDateColumn(addDays(today, 7)) } },
          include: { member: { select: { id: true, firstName: true, lastName: true } }, plan: { select: { name: true } } },
          orderBy: { endsOn: "asc" },
          take: 6,
        }),
      ]);
      const lw = lastWeek[0];
      const fillRatePct = lw && Number(lw.capacity) ? Math.round((Number(lw.taken) / Number(lw.capacity)) * 100) : null;
      const noShowPct = lw && Number(lw.taken) ? Math.round((Number(lw.no_show) / Number(lw.taken)) * 1000) / 10 : null;

      // ── Studio view: next class, this week's attendance, this month's fill, mix, regulars ──
      const weekStart = addDays(today, -((weekdayOf(today) + 6) % 7)); // Monday
      const [nextSession, weekRows, monthRows, topRows] = await Promise.all([
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
        tx.$queryRaw<{ capacity: bigint; taken: bigint; sessions: bigint; no_show: bigint; checkins: bigint }[]>`
          SELECT COALESCE(SUM(s.capacity), 0)::bigint AS capacity,
                 COALESCE(SUM(s.booked_count), 0)::bigint AS taken,
                 count(*)::bigint AS sessions,
                 (SELECT count(*) FROM bookings b JOIN sessions s2 ON s2.id = b.session_id
                   WHERE b.status = 'no_show' AND s2.starts_at >= ${at(monthStart)} AND s2.starts_at < ${now})::bigint AS no_show,
                 (SELECT count(*) FROM check_ins c WHERE c.checked_in_at >= ${at(monthStart)})::bigint AS checkins
          FROM sessions s
          WHERE s.status = 'scheduled' AND s.starts_at >= ${at(monthStart)} AND s.starts_at < ${now}`,
        tx.$queryRaw<{ member_id: string; first_name: string; last_name: string; visits: bigint }[]>`
          SELECT m.id AS member_id, m.first_name, m.last_name, count(*)::bigint AS visits
          FROM check_ins c JOIN members m ON m.id = c.member_id
          WHERE c.checked_in_at >= ${new Date(now.getTime() - 30 * 86_400_000)} AND m.deleted_at IS NULL
          GROUP BY m.id, m.first_name, m.last_name
          ORDER BY visits DESC, m.last_name
          LIMIT 5`,
      ]);
      const trainer = nextSession?.trainerUserId
        ? await tx.user.findUnique({ where: { id: nextSession.trainerUserId }, select: { firstName: true } })
        : null;
      const weekMap = new Map(weekRows.map((r) => [r.day, Number(r.n)]));
      const mf = monthRows[0];
      const mixMap = new Map<string, number>();
      for (const s of activeSubs) mixMap.set(s.plan.name, (mixMap.get(s.plan.name) ?? 0) + 1);
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
        monthFill: {
          pct: mf && Number(mf.capacity) ? Math.round((Number(mf.taken) / Number(mf.capacity)) * 100) : null,
          classes: Number(mf?.sessions ?? 0),
          checkins: Number(mf?.checkins ?? 0),
          noShows: Number(mf?.no_show ?? 0),
        },
        membershipMix: [...mixMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        topMembers: topRows.map((r) => ({ id: r.member_id, firstName: r.first_name, lastName: r.last_name, visits: Number(r.visits) })),
      };

      // MRR = active recurring memberships normalised to one month (docs/metrics.md).
      const mrr = activeSubs
        .filter((s) => s.plan.type === "recurring" && s.currency === t.currency)
        .reduce((sum, s) => sum + (s.plan.billingPeriod === "year" ? s.priceMinor / 12n : s.priceMinor), 0n);
      const activeMembers = new Set(activeSubs.map((s) => s.memberId)).size;

      const byMonth = new Map(trendRows.map((r) => [r.month, r.total]));
      const trend = Array.from({ length: 12 }, (_, i) => {
        const m = addMonths(trendStart, i).slice(0, 7);
        return { month: m, revenueMinor: byMonth.get(m) ?? 0n };
      });

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
          endedMemberships: { value: ended },
          checkinsToday: { value: checkinsToday },
          overduePayments: { value: pending._count, amountMinor: pending._sum.priceMinor ?? 0n },
          fillRate7d: { valuePct: fillRatePct, sessions: Number(lw?.sessions ?? 0) },
          noShowRate7d: { valuePct: noShowPct },
        },
        recentMembers,
        ...studio,
        endingSoon: endingSoon.map((s) => ({
          subscriptionId: s.id,
          endsOn: s.endsOn,
          plan: s.plan.name,
          member: s.member,
        })),
        revenueTrend: trend,
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

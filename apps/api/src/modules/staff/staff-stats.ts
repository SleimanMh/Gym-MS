import type { TenantTx } from "@gym/db";
import { allocatePay, computePay, hoursFromEntries, type PayResult } from "@gym/shared";

export interface EmployeeMonthStats {
  employeeId: string;
  hoursWorked: number;
  classesTaught: number;
  avgAttendance: number | null;
  salesMinor: bigint;
  pay: PayResult;
  /** For rankings: spots booked / offered in their classes, check-ins and no-shows, memberships sold. */
  spotsBooked: number;
  spotsOffered: number;
  attended: number;
  noShows: number;
  membershipsSold: number;
  /** For the per-location P&L: where their hours and classes happened, and their pay split by location. */
  hoursByLocation: Record<string, number>;
  classesByLocation: Record<string, number>;
  payByLocation: Record<string, bigint>;
}

/**
 * Per-employee figures for one period [from, to): hours clocked, classes taught (past classes
 * where they were the trainer), memberships they sold (payments received in the period), pay,
 * and where it all happened. One source for the staff list, payroll, rankings and the P&L's staff
 * costs. Runs inside a tenant transaction.
 */
export async function staffStats(tx: TenantTx, from: Date, to: Date, now = new Date()): Promise<Map<string, EmployeeMonthStats>> {
  const until = to < now ? to : now;
  const [employees, entries, classRows, attendRows, salesRows] = await Promise.all([
    tx.employee.findMany(),
    tx.timeEntry.findMany({ where: { clockIn: { gte: from, lt: to } }, select: { employeeId: true, locationId: true, clockIn: true, clockOut: true } }),
    tx.$queryRaw<{ trainer_user_id: string; location_id: string; classes: bigint; booked: bigint; offered: bigint }[]>`
      SELECT trainer_user_id, location_id, count(*)::bigint AS classes,
             COALESCE(SUM(booked_count), 0)::bigint AS booked, COALESCE(SUM(capacity), 0)::bigint AS offered
      FROM sessions
      WHERE status = 'scheduled' AND trainer_user_id IS NOT NULL AND starts_at >= ${from} AND starts_at < ${until}
      GROUP BY trainer_user_id, location_id`,
    tx.$queryRaw<{ trainer_user_id: string; attended: bigint; no_shows: bigint }[]>`
      SELECT s.trainer_user_id,
             count(*) FILTER (WHERE b.status = 'attended')::bigint AS attended,
             count(*) FILTER (WHERE b.status = 'no_show')::bigint AS no_shows
      FROM bookings b JOIN sessions s ON s.id = b.session_id
      WHERE s.status = 'scheduled' AND s.trainer_user_id IS NOT NULL AND s.starts_at >= ${from} AND s.starts_at < ${until}
      GROUP BY s.trainer_user_id`,
    // Sales = memberships they sold that were paid for in the period (count and amount).
    tx.$queryRaw<{ user_id: string; total: bigint; sold: bigint }[]>`
      SELECT s.created_by_user_id AS user_id, COALESCE(SUM(p.amount_minor), 0)::bigint AS total, count(DISTINCT s.id)::bigint AS sold
      FROM payments p JOIN member_subscriptions s ON s.id = p.subscription_id
      WHERE p.status = 'succeeded' AND p.paid_at >= ${from} AND p.paid_at < ${to} AND s.created_by_user_id IS NOT NULL
      GROUP BY s.created_by_user_id`,
  ]);

  const salesByUser = new Map(salesRows.map((r) => [r.user_id, r.total]));
  const soldByUser = new Map(salesRows.map((r) => [r.user_id, Number(r.sold)]));
  const attendByUser = new Map(attendRows.map((r) => [r.trainer_user_id, r]));
  const out = new Map<string, EmployeeMonthStats>();

  for (const e of employees) {
    const mine = entries.filter((x) => x.employeeId === e.id);
    const hours = hoursFromEntries(mine);
    const hoursByLocation: Record<string, number> = {};
    for (const x of mine) {
      const h = hoursFromEntries([x]);
      const loc = x.locationId ?? e.homeLocationId;
      if (loc && h > 0) hoursByLocation[loc] = (hoursByLocation[loc] ?? 0) + h;
    }
    const cls = e.userId ? classRows.filter((r) => r.trainer_user_id === e.userId) : [];
    const classesByLocation: Record<string, number> = {};
    for (const r of cls) classesByLocation[r.location_id] = Number(r.classes);
    const classesTaught = cls.reduce((s, r) => s + Number(r.classes), 0);
    const spotsBooked = cls.reduce((s, r) => s + Number(r.booked), 0);
    const spotsOffered = cls.reduce((s, r) => s + Number(r.offered), 0);
    const att = e.userId ? attendByUser.get(e.userId) : undefined;
    const sales = (e.userId && salesByUser.get(e.userId)) || 0n;

    // Salaried staff who left before this period cost nothing in it.
    const active = e.status === "active" && e.startedOn < to;
    const pay =
      active || hours > 0 || classesTaught > 0
        ? computePay({ payType: e.payType, payRateMinor: e.payRateMinor, hoursWorked: hours, classesTaught, salesMinor: sales, commissionBp: e.commissionBp })
        : { baseMinor: 0n, commissionMinor: 0n, totalMinor: 0n };

    out.set(e.id, {
      employeeId: e.id,
      hoursWorked: hours,
      classesTaught,
      avgAttendance: classesTaught ? Math.round((spotsBooked / classesTaught) * 10) / 10 : null,
      salesMinor: sales,
      pay,
      spotsBooked,
      spotsOffered,
      attended: Number(att?.attended ?? 0),
      noShows: Number(att?.no_shows ?? 0),
      membershipsSold: (e.userId && soldByUser.get(e.userId)) || 0,
      hoursByLocation,
      classesByLocation,
      payByLocation: allocatePay({ payType: e.payType, pay, homeLocationId: e.homeLocationId, hoursByLocation, classesByLocation }),
    });
  }
  return out;
}

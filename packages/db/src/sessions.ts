import { addDays, dateOnly, generateOccurrences, localDate } from "@gym/shared";
import type { TenantTx } from "./index";

/** How far ahead sessions exist. Must cover the longest booking window. */
export const GENERATE_AHEAD_DAYS = 35;

/**
 * Materialises sessions for active schedules from today to today + GENERATE_AHEAD_DAYS.
 * Idempotent (unique tenant_id + schedule_id + starts_at, skipDuplicates). Called when a schedule is
 * created and by the worker's daily maintenance job. Must run inside a tenant transaction.
 */
export async function generateSessions(
  tx: TenantTx,
  tenant: { id: string; timezone: string },
  opts: { scheduleId?: string; now?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const schedules = await tx.schedule.findMany({
    where: { tenantId: tenant.id, isActive: true, ...(opts.scheduleId ? { id: opts.scheduleId } : {}) },
    include: { location: { select: { timezone: true } } },
  });
  if (!schedules.length) return 0;

  let created = 0;
  for (const s of schedules) {
    const tz = s.location.timezone ?? tenant.timezone;
    const from = localDate(now, tz);
    const to = addDays(from, GENERATE_AHEAD_DAYS);
    const holidays = await tx.holiday.findMany({
      where: { tenantId: tenant.id, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, OR: [{ locationId: null }, { locationId: s.locationId }] },
      select: { date: true },
    });
    const occ = generateOccurrences(
      {
        weekday: s.weekday,
        startMinute: s.startMinute,
        durationMin: s.durationMin,
        validFrom: dateOnly(s.validFrom),
        validUntil: s.validUntil ? dateOnly(s.validUntil) : null,
      },
      tz,
      from,
      to,
      new Set(holidays.map((h) => dateOnly(h.date))),
    ).filter((o) => o.startsAt > now);

    if (!occ.length) continue;
    const res = await tx.session.createMany({
      data: occ.map((o) => ({
        tenantId: tenant.id,
        locationId: s.locationId,
        classTypeId: s.classTypeId,
        roomId: s.roomId,
        trainerUserId: s.trainerUserId,
        scheduleId: s.id,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        capacity: s.capacity,
      })),
      skipDuplicates: true,
    });
    created += res.count;
  }
  return created;
}

import { addDays, weekdayOf, zonedToUtc } from "./time";

export interface ScheduleRule {
  weekday: number;
  startMinute: number;
  durationMin: number;
  validFrom: string;
  validUntil: string | null;
}

/**
 * Concrete class times for a weekly schedule between two local dates (inclusive), in the
 * location's time zone, skipping holidays. Pure: the generator persists the result with
 * skipDuplicates, so running it repeatedly never creates the same session twice.
 */
export function generateOccurrences(
  rule: ScheduleRule,
  tz: string,
  fromDate: string,
  toDate: string,
  holidays: ReadonlySet<string>,
): { date: string; startsAt: Date; endsAt: Date }[] {
  const start = rule.validFrom > fromDate ? rule.validFrom : fromDate;
  const end = rule.validUntil && rule.validUntil < toDate ? rule.validUntil : toDate;
  const out: { date: string; startsAt: Date; endsAt: Date }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (weekdayOf(d) !== rule.weekday || holidays.has(d)) continue;
    const startsAt = zonedToUtc(d, rule.startMinute, tz);
    out.push({ date: d, startsAt, endsAt: new Date(startsAt.getTime() + rule.durationMin * 60_000) });
  }
  return out;
}

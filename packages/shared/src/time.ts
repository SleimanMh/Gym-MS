/**
 * Time-zone helpers without a date library. All timestamps are stored in UTC; schedules are
 * defined in the location's local time ("Tuesdays 18:30 in Asia/Beirut") and converted here.
 * Dates are plain "YYYY-MM-DD" strings.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(instant: Date, tz: string) {
  const p = fmt(tz).formatToParts(instant);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Offset of `tz` from UTC at `instant`, in minutes (Beirut summer → +180). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const x = parts(instant, tz);
  const asUtc = Date.UTC(x.y, x.m - 1, x.d, x.h, x.mi, x.s);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Local wall-clock time (date + minutes after midnight) in `tz` → UTC instant. */
export function zonedToUtc(date: string, minuteOfDay: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  const off1 = tzOffsetMinutes(new Date(naive), tz);
  let utc = naive - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = naive - off2 * 60000; // crossed a DST change
  return new Date(utc);
}

/** "YYYY-MM-DD" of `instant` as seen in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const x = parts(instant, tz);
  return `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
}

/** Minutes after local midnight of `instant` in `tz`. */
export function localMinuteOfDay(instant: Date, tz: string): number {
  const x = parts(instant, tz);
  return x.h * 60 + x.mi;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive day count between two dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "18:30" → 1110 */
export function parseHhMm(value: string): number {
  const [h, m] = value.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function formatHhMm(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

/** Date column (Prisma returns midnight UTC Date) → "YYYY-MM-DD". */
export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date at midnight UTC, for Prisma @db.Date columns. */
export function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Calendar months later, clamped to the month's last day (Jan 31 + 1 month → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Last day (inclusive) of a membership that starts on `startsOn`. NULL = open-ended. */
export function subscriptionEndsOn(
  plan: { type: string; billingPeriod: "month" | "year" | null; durationDays: number | null },
  startsOn: string,
): string | null {
  if (plan.type === "recurring") {
    return addDays(addMonths(startsOn, plan.billingPeriod === "year" ? 12 : 1), -1);
  }
  return plan.durationDays ? addDays(startsOn, plan.durationDays - 1) : null;
}

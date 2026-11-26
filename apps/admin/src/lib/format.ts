import { formatMoney } from "@gym/shared";
import type { Lang } from "./i18n";

/** All times are stored in UTC and shown in the gym's time zone. */
const loc = (lang: Lang) => (lang === "ar" ? "ar-LB" : "en-GB");

export function fmtTime(iso: string | Date, tz: string, lang: Lang) {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDate(iso: string | Date, tz: string, lang: Lang) {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function fmtDay(iso: string | Date, tz: string, lang: Lang) {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

export function fmtDateTime(iso: string | Date, tz: string, lang: Lang) {
  return `${fmtDay(iso, tz, lang)} · ${fmtTime(iso, tz, lang)}`;
}

/** A @db.Date column ("2026-11-14T00:00:00.000Z") shown as a calendar date (no time-zone shift). */
export function fmtDateOnly(iso: string, lang: Lang) {
  return fmtDate(`${iso.slice(0, 10)}T12:00:00Z`, "UTC", lang);
}

export function money(amountMinor: string | number | bigint, currency: string, lang: Lang) {
  return formatMoney(amountMinor, currency, lang);
}

/** "YYYY-MM-DD" in a time zone. */
export function localDateIn(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

/** Minutes after local midnight in `tz`. */
export function minutesInDay(iso: string | Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** "3 days ago" / "in 2 days", in the UI language. */
export function relativeDays(iso: string | Date, lang: Lang) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" }).format(days, "day");
}

/**
 * "09:00–14:00" on a 24-hour clock (compact for rotas). Each time is a bidi isolate, so in Arabic
 * the start sits on the right and the range reads naturally; an open end shows "…".
 */
export function fmtTimeRange(start: string | Date, end: string | Date | null, tz: string, lang: Lang) {
  const f = new Intl.DateTimeFormat(loc(lang), { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `⁨${f.format(new Date(start))}⁩–⁨${end ? f.format(new Date(end)) : "…"}⁩`;
}

/** 21.5 → "21.5%" / "٢١٫٥٪" in the UI language; null → "—". */
export function fmtPct(v: number | null, lang: Lang) {
  return v === null ? "—" : new Intl.NumberFormat(loc(lang), { style: "percent", maximumFractionDigits: 1 }).format(v / 100);
}

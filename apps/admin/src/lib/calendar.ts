import { addDays, SHIFT_ACTIVITIES } from "@gym/shared";
import type { CalEmployee, CalEvent, CalLabels } from "@/components/team-calendar";
import { api } from "./api";
import { localDateIn, minutesInDay } from "./format";
import type { Lang, MessageKey, T } from "./i18n";

interface ApiEvent {
  id: string;
  kind: "shift" | "class";
  employeeId: string;
  startsAt: string;
  endsAt: string;
  title: string | null;
  note: string | null;
  booked: number | null;
  capacity: number | null;
  locationId: string;
  location: string;
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Monday of the week containing `d`. */
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Activity key ("front_desk") → its name in the UI language; free text stays as typed. */
export function activityName(t: T, v: string | null) {
  if (!v) return t("cal.shift");
  return (SHIFT_ACTIVITIES as readonly string[]).includes(v) ? t(`act.${v}` as MessageKey) : v;
}

/**
 * Loads a week from `/v1/team-calendar` or `/v1/my-schedule` and places every event in the gym's
 * time zone (day + minutes), so the client calendar only draws.
 */
export async function loadWeek(path: "/v1/team-calendar" | "/v1/my-schedule", opts: { week?: string; employeeId?: string; tz: string; lang: Lang; t: T }) {
  const today = localDateIn(new Date(), opts.tz);
  const week = mondayOf(isDate(opts.week) ? opts.week! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const q = `?from=${days[0]}&to=${days[6]}${opts.employeeId ? `&employeeId=${opts.employeeId}` : ""}`;
  const data = await api<{ timezone: string; employees: CalEmployee[]; events: ApiEvent[] }>(`${path}${q}`);
  const tz = data.timezone ?? opts.tz;
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const events: CalEvent[] = data.events.map((e) => {
    const day = localDateIn(new Date(e.startsAt), tz);
    const startMin = minutesInDay(e.startsAt, tz);
    const sameDay = localDateIn(new Date(e.endsAt), tz) === day;
    const endMin = sameDay ? minutesInDay(e.endsAt, tz) : 24 * 60;
    return {
      id: e.id,
      kind: e.kind,
      employeeId: e.employeeId,
      day,
      startMin,
      endMin,
      start: hm(startMin),
      end: hm(Math.min(endMin, 24 * 60 - 1)),
      title: e.kind === "class" ? (e.title ?? "") : activityName(opts.t, e.title),
      activity: e.kind === "shift" ? e.title : null,
      note: e.note,
      locationId: e.locationId,
      location: e.location,
      booked: e.booked,
      capacity: e.capacity,
    };
  });
  const loc = opts.lang === "ar" ? "ar-LB" : "en-GB";
  const dayLabels = days.map((d) => ({
    wd: new Intl.DateTimeFormat(loc, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
    dm: new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)),
  }));
  const hoursFor = (id: string) => events.filter((e) => e.employeeId === id).reduce((h, e) => h + (e.endMin - e.startMin) / 60, 0);
  return { week, days, dayLabels, today, nowMin: minutesInDay(new Date(), tz), employees: data.employees, events, hoursFor };
}

export function calLabels(t: T): CalLabels {
  return {
    everyone: t("cal.everyone"),
    newSlot: t("cal.new"),
    addTitle: t("cal.addTitle"),
    editTitle: t("cal.editTitle"),
    who: t("cal.who"),
    activity: t("cal.activity"),
    activityPh: t("cal.activityPh"),
    where: t("cal.where"),
    day: t("cal.day"),
    from: t("cal.from"),
    to: t("cal.to"),
    note: t("cal.note"),
    save: t("cal.save"),
    add: t("cal.add"),
    del: t("cal.delete"),
    cancel: t("cal.cancel"),
    openClass: t("cal.openClass"),
    booked: t("cal.booked", { b: "{b}", c: "{c}" }),
    shift: t("cal.shift"),
    clickHint: t("cal.clickHint"),
  };
}

export const activityOptions = (t: T) => SHIFT_ACTIVITIES.map((a) => ({ value: a, label: t(`act.${a}` as MessageKey) }));

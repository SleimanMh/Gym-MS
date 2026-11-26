import { DEFAULT_EXPENSE_CATEGORIES, type MeResponse } from "@gym/shared";
import type { T } from "./i18n";
import { money } from "./format";
import type { Lang } from "./i18n";

export type PayType = "salary" | "hourly" | "per_class";

export interface Pay {
  baseMinor: string;
  commissionMinor: string;
  totalMinor: string;
}

export interface StaffStats {
  hoursWorked: number;
  classesTaught: number;
  avgAttendance: number | null;
  salesMinor: string;
  pay: Pay | null;
}

export interface Employee {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string;
  payType: PayType;
  payRateMinor: string | null;
  currency: string;
  commissionBp: number;
  homeLocationId: string | null;
  startedOn: string;
  status: "active" | "inactive";
  clockedInSince?: string | null;
  stats: StaffStats;
}

/** "$12.00 / class" — the pay rate in words, or null when the viewer can't see pay. */
export function rateText(e: { payType: PayType; payRateMinor: string | null; currency: string }, t: T, lang: Lang) {
  if (e.payRateMinor === null) return null;
  return t(`st.rate.${e.payType}`, { v: money(e.payRateMinor, e.currency, lang) });
}

/** Tabs shown on every Staff screen; payroll only for people who see pay. */
export function staffTabs(t: T, me: MeResponse, active: "team" | "rota" | "payroll" | "performance") {
  const tabs = [
    { href: "/staff", label: t("st.tab.team"), active: active === "team" },
    { href: "/staff/rota", label: t("st.tab.rota"), active: active === "rota" },
  ];
  if (me.permissions.includes("report.view")) tabs.push({ href: "/staff/performance", label: t("st.tab.performance"), active: active === "performance" });
  if (me.permissions.includes("finance.view")) tabs.push({ href: "/staff/payroll", label: t("st.tab.payroll"), active: active === "payroll" });
  return tabs;
}

export function financeTabs(t: T, active: "overview" | "locations" | "expenses" | "budgets") {
  return [
    { href: "/finance", label: t("fin.tab.overview"), active: active === "overview" },
    { href: "/finance/locations", label: t("fin.tab.locations"), active: active === "locations" },
    { href: "/finance/expenses", label: t("fin.tab.expenses"), active: active === "expenses" },
    { href: "/finance/budgets", label: t("fin.tab.budgets"), active: active === "budgets" },
  ];
}

/** "November 2026" in the UI language (month = YYYY-MM). */
export function monthName(month: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-15T00:00:00Z`),
  );
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Built-in expense categories show in the UI language; ones the gym typed stay as typed. */
export function categoryName(c: { key?: string | null; name: string | null }, lang: Lang) {
  const def = DEFAULT_EXPENSE_CATEGORIES.find((d) => d.key === c.key);
  if (def && (c.name === def.en || c.name === def.ar)) return def[lang];
  return c.name ?? "";
}

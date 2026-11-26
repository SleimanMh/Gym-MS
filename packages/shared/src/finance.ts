import { z } from "zod";

/**
 * Staff pay and profit rules (PLAN.md sections 6.6, 6.7 and 8; docs/metrics.md).
 * Pure functions: the API, the payroll export and the P&L all use the same arithmetic.
 */

export type PayType = "salary" | "hourly" | "per_class";

export interface PayInputs {
  payType: PayType;
  /** salary: per month · hourly: per hour · per_class: per class taught (minor units) */
  payRateMinor: bigint;
  hoursWorked: number;
  classesTaught: number;
  /** Membership sales credited to this person in the period (minor units). */
  salesMinor: bigint;
  /** Commission in basis points (500 = 5%). */
  commissionBp: number;
}

export interface PayResult {
  baseMinor: bigint;
  commissionMinor: bigint;
  totalMinor: bigint;
}

/** Pay for one month. Hourly pay rounds to the nearest minor unit. */
export function computePay(p: PayInputs): PayResult {
  const base =
    p.payType === "salary"
      ? p.payRateMinor
      : p.payType === "hourly"
        ? BigInt(Math.round(Number(p.payRateMinor) * p.hoursWorked))
        : p.payRateMinor * BigInt(p.classesTaught);
  const commission = (p.salesMinor * BigInt(Math.round(p.commissionBp))) / 10_000n;
  return { baseMinor: base, commissionMinor: commission, totalMinor: base + commission };
}

/** Hours between clock-in and clock-out; open entries (still clocked in) don't count yet. */
export function hoursFromEntries(entries: { clockIn: Date | string; clockOut: Date | string | null }[]): number {
  let ms = 0;
  for (const e of entries) {
    if (!e.clockOut) continue;
    ms += new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime();
  }
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export interface ProfitLine {
  revenueMinor: bigint;
  expensesMinor: bigint;
  staffMinor: bigint;
}

/** Net profit = revenue − (expenses + staff costs); margin as a percentage of revenue. */
export function profit(l: ProfitLine): { netMinor: bigint; marginPct: number | null } {
  const net = l.revenueMinor - l.expensesMinor - l.staffMinor;
  const margin = l.revenueMinor === 0n ? null : Math.round((Number(net) / Number(l.revenueMinor)) * 1000) / 10;
  return { netMinor: net, marginPct: margin };
}

/** Built-in expense categories created for every gym (names are per gym and editable). */
export const DEFAULT_EXPENSE_CATEGORIES: { key: string; en: string; ar: string }[] = [
  { key: "rent", en: "Rent", ar: "الإيجار" },
  { key: "utilities", en: "Utilities", ar: "المرافق" },
  { key: "equipment", en: "Equipment", ar: "المعدات" },
  { key: "maintenance", en: "Maintenance", ar: "الصيانة" },
  { key: "marketing", en: "Marketing", ar: "التسويق" },
  { key: "cleaning", en: "Cleaning", ar: "التنظيف" },
  { key: "software", en: "Software", ar: "البرمجيات" },
  { key: "other", en: "Other", ar: "أخرى" },
];

/** Location key for costs or revenue that belong to the whole gym (no location). */
export const SHARED_LOCATION = "shared";

/**
 * Splits `total` across keys in proportion to `weights`, in whole minor units. The rounding
 * remainder goes to the largest share, so the parts always add up to the total exactly.
 */
export function splitMinor(total: bigint, weights: Record<string, number>): Record<string, bigint> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!entries.length || sum <= 0 || total === 0n) return total === 0n ? {} : { [SHARED_LOCATION]: total };
  const out: Record<string, bigint> = {};
  let given = 0n;
  for (const [k, w] of entries) {
    const part = BigInt(Math.trunc((Number(total) * w) / sum));
    out[k] = part;
    given += part;
  }
  const [biggest] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  out[biggest] = (out[biggest] ?? 0n) + (total - given);
  return out;
}

export interface PayAllocationInput {
  payType: PayType;
  pay: PayResult;
  homeLocationId: string | null;
  /** Hours clocked per location (null location → home). */
  hoursByLocation: Record<string, number>;
  /** Classes taught per location. */
  classesByLocation: Record<string, number>;
}

/**
 * Which location each part of someone's pay belongs to, for the per-location P&L:
 * hourly pay follows where they clocked in, per-class pay where the classes ran, salary and
 * commission go to their home location. Anything without a location is "shared".
 * The parts add up to pay.totalMinor exactly.
 */
export function allocatePay(a: PayAllocationInput): Record<string, bigint> {
  const home = a.homeLocationId ?? SHARED_LOCATION;
  const out: Record<string, bigint> = {};
  const add = (k: string, v: bigint) => {
    if (v !== 0n) out[k] = (out[k] ?? 0n) + v;
  };
  const weights = a.payType === "hourly" ? a.hoursByLocation : a.payType === "per_class" ? a.classesByLocation : {};
  const base = a.payType === "salary" ? { [home]: a.pay.baseMinor } : splitMinor(a.pay.baseMinor, weights);
  for (const [k, v] of Object.entries(base)) add(k === SHARED_LOCATION ? home : k, v);
  add(home, a.pay.commissionMinor);
  return out;
}

// ───────────── Request schemas ─────────────

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const employeeSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText(30),
  title: z.string().trim().min(2).max(60),
  payType: z.enum(["salary", "hourly", "per_class"]),
  payRateMinor: z.coerce.number().int().min(0).max(100_000_000),
  commissionBp: z.coerce.number().int().min(0).max(10_000).default(0),
  homeLocationId: uuid.optional(),
  startedOn: dateStr.optional(),
  userId: uuid.optional(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;
export const updateEmployeeSchema = employeeSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() });

export const shiftSchema = z
  .object({
    employeeId: uuid,
    locationId: uuid,
    date: dateStr,
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    /** What the slot is for ("Front desk", "Personal training"…). */
    activity: optionalText(60),
    note: optionalText(200),
  })
  .refine((s) => s.end > s.start, { message: "end before start", path: ["end"] });
export type ShiftInput = z.infer<typeof shiftSchema>;

export const clockSchema = z.object({
  employeeId: uuid.optional(),
  locationId: uuid.optional(),
});

export const expenseSchema = z.object({
  categoryId: uuid,
  locationId: uuid.optional(),
  amountMinor: z.coerce.number().int().min(1).max(1_000_000_000),
  spentOn: dateStr,
  vendor: optionalText(120),
  note: optionalText(500),
  recurringMonthly: z.boolean().default(false),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseCategorySchema = z.object({ name: z.string().trim().min(2).max(60) });

export const budgetSchema = z.object({
  categoryId: uuid,
  month: monthStr,
  amountMinor: z.coerce.number().int().min(0).max(1_000_000_000),
});
export type BudgetInput = z.infer<typeof budgetSchema>;

/** Suggested activities for shift slots (staff can type their own). */
export const SHIFT_ACTIVITIES = ["front_desk", "floor", "personal_training", "cleaning", "admin", "class_cover"] as const;

export const calendarQuery = z.object({
  from: dateStr,
  to: dateStr,
  employeeId: uuid.optional(),
});

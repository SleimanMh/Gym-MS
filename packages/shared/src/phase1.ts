import { z } from "zod";
import { languageSchema } from "./schemas";

/** Request schemas for Phase 1 modules (catalogue, scheduling, members, booking, check-in, payments). */

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const email = z.string().trim().toLowerCase().email();
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, "phone number")
  .transform((v) => v.replace(/[ ()-]/g, ""));

// ───────────── Catalogue and scheduling ─────────────

export const createClassTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText(500),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2563EB"),
  durationMin: z.coerce.number().int().min(5).max(600).default(60),
  defaultCapacity: z.coerce.number().int().min(1).max(500).default(20),
});
export type CreateClassTypeInput = z.infer<typeof createClassTypeSchema>;

export const createScheduleSchema = z.object({
  locationId: uuid,
  classTypeId: uuid,
  roomId: uuid.optional(),
  trainerUserId: uuid.optional(),
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: hhmm,
  durationMin: z.coerce.number().int().min(5).max(600).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  validFrom: dateStr.optional(),
  validUntil: dateStr.optional(),
});
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const createSessionSchema = z.object({
  locationId: uuid,
  classTypeId: uuid,
  roomId: uuid.optional(),
  trainerUserId: uuid.optional(),
  date: dateStr,
  startTime: hhmm,
  durationMin: z.coerce.number().int().min(5).max(600).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const cancelSessionSchema = z.object({ reason: optionalText(200) });

export const sessionsQuerySchema = z.object({
  from: dateStr,
  to: dateStr,
  locationId: uuid.optional(),
});
export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;

// ───────────── Members and memberships ─────────────

const memberFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  dateOfBirth: dateStr.optional().or(z.literal("").transform(() => undefined)),
  gender: z.enum(["female", "male"]).optional(),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phone.optional().or(z.literal("").transform(() => undefined)),
  language: languageSchema.optional(),
  homeLocationId: uuid.optional(),
  notes: optionalText(2000),
};

export const createMemberSchema = z
  .object(memberFields)
  .refine((m) => m.email || m.phone, { message: "email or phone is required", path: ["email"] });
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object(memberFields).partial();
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberFilterSchema = z.enum(["all", "active", "pending", "expiring", "none"]);
export type MemberFilter = z.infer<typeof memberFilterSchema>;

export const membersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: memberFilterSchema.default("all"),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

export const planTypeSchema = z.enum(["recurring", "fixed_term", "class_pack", "drop_in", "trial"]);

export const createMembershipPlanSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: optionalText(500),
    type: planTypeSchema,
    priceMinor: z.coerce.number().int().min(0).max(100_000_000),
    currency: z.string().length(3).toUpperCase().optional(),
    billingPeriod: z.enum(["month", "year"]).optional(),
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
    credits: z.coerce.number().int().min(1).max(1000).optional(),
    allowedLocationIds: z.array(uuid).default([]),
    isPublic: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.type === "recurring" && !p.billingPeriod)
      ctx.addIssue({ code: "custom", path: ["billingPeriod"], message: "required for recurring plans" });
    if ((p.type === "class_pack" || p.type === "drop_in") && !p.credits)
      ctx.addIssue({ code: "custom", path: ["credits"], message: "required for packs and drop-ins" });
    if ((p.type === "fixed_term" || p.type === "trial") && !p.durationDays)
      ctx.addIssue({ code: "custom", path: ["durationDays"], message: "required for fixed-term and trial plans" });
  });
export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>;

export const paymentMethodSchema = z.enum(["cash", "card_terminal", "bank_transfer"]);

export const sellMembershipSchema = z.object({
  planId: uuid,
  startsOn: dateStr.optional(),
  autoRenew: z.boolean().default(false),
  /** Omit to sell now and collect at the front desk later (subscription stays "pending"). */
  payment: z
    .object({ method: paymentMethodSchema, note: optionalText(200) })
    .optional(),
});
export type SellMembershipInput = z.infer<typeof sellMembershipSchema>;

export const freezeSchema = z
  .object({ startsOn: dateStr, endsOn: dateStr, reason: optionalText(200) })
  .refine((f) => f.endsOn >= f.startsOn, { message: "end before start", path: ["endsOn"] });
export type FreezeInput = z.infer<typeof freezeSchema>;

export const recordPaymentSchema = z.object({
  memberId: uuid,
  subscriptionId: uuid.optional(),
  amountMinor: z.coerce.number().int().min(1).max(100_000_000),
  method: paymentMethodSchema,
  note: optionalText(200),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ───────────── Booking and check-in ─────────────

export const staffBookSchema = z.object({
  sessionId: uuid,
  memberId: uuid,
  joinWaitlist: z.boolean().default(false),
});
export type StaffBookInput = z.infer<typeof staffBookSchema>;

export const memberBookSchema = z.object({
  sessionId: uuid,
  joinWaitlist: z.boolean().default(false),
});
export type MemberBookInput = z.infer<typeof memberBookSchema>;

export const attendanceSchema = z.object({ status: z.enum(["attended", "no_show"]) });

export const checkInSchema = z
  .object({
    code: z.string().trim().min(6).max(64).optional(),
    memberId: uuid.optional(),
    locationId: uuid,
    /** Show the result without recording a check-in (the scan preview). */
    dryRun: z.boolean().default(false),
    /** Record the check-in even when it would be denied (manager decision, audited). */
    force: z.boolean().default(false),
  })
  .refine((c) => c.code || c.memberId, { message: "code or memberId is required" });
export type CheckInInput = z.infer<typeof checkInSchema>;

export const bookingPolicySchema = z.object({
  bookingWindowDays: z.coerce.number().int().min(1).max(90),
  cancellationCutoffMin: z.coerce.number().int().min(0).max(7 * 24 * 60),
  lateCancelPolicy: z.enum(["none", "lose_credit"]),
  waitlistAutoPromote: z.boolean(),
  waitlistPromoteCutoffMin: z.coerce.number().int().min(0).max(24 * 60),
  reminderLeadMin: z.coerce.number().int().min(15).max(48 * 60),
});
export type BookingPolicyInput = z.infer<typeof bookingPolicySchema>;

export const allowedOriginSchema = z.object({
  origin: z
    .string()
    .trim()
    .url()
    .transform((u) => new URL(u).origin),
});

// ───────────── Public (widget) ─────────────

export const leadSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: optionalText(80),
    email: email.optional().or(z.literal("").transform(() => undefined)),
    phone: phone.optional().or(z.literal("").transform(() => undefined)),
    message: optionalText(1000),
    locationId: uuid.optional(),
    /** Honeypot: humans leave it empty. Turnstile replaces this before launch. */
    website: z.string().max(0).optional(),
  })
  .refine((l) => l.email || l.phone, { message: "email or phone is required", path: ["email"] });
export type LeadInput = z.infer<typeof leadSchema>;

export const memberCodeStartSchema = z.object({ email });
export const memberCodeVerifySchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });

export const publicSessionsQuerySchema = z.object({
  from: dateStr.optional(),
  days: z.coerce.number().int().min(1).max(31).default(7),
  location: z.string().max(40).optional(),
});

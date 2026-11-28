import { z } from "zod";
import { PLAN_CODES } from "./entitlements";
import { OVERRIDABLE_PERMISSIONS, STAFF_ROLE_KEYS } from "./permissions";

export const languageSchema = z.enum(["en", "ar"]);
export type Language = z.infer<typeof languageSchema>;

export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and dashes");

const timeZoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown time zone");

export const createTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(120),
  defaultLanguage: languageSchema.default("en"),
  timezone: timeZoneSchema.default("Asia/Beirut"),
  currency: z.string().length(3).toUpperCase().default("USD"),
  planCode: z.enum(PLAN_CODES).default("starter"),
  firstLocationName: z.string().min(2).max(120).default("Main"),
  owner: z.object({
    email: z.string().email().toLowerCase(),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
  }),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const assignPlanSchema = z.object({
  planCode: z.enum(PLAN_CODES),
});
export type AssignPlanInput = z.infer<typeof assignPlanSchema>;

export const createLocationSchema = z.object({
  name: z.string().min(2).max(120),
  timezone: timeZoneSchema.optional(),
  address: z.string().max(300).optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const devTokenSchema = z.object({
  email: z.string().email().toLowerCase(),
  /** Omit for platform users; required for tenant staff and members. */
  tenantSlug: slugSchema.optional(),
});
export type DevTokenInput = z.infer<typeof devTokenSchema>;

/** Shape of GET /v1/me — what the admin app needs to render the shell. */
export interface MeResponse {
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant: {
    id: string;
    slug: string;
    name: string;
    defaultLanguage: Language;
    timezone: string;
    currency: string;
    primaryColor: string | null;
  } | null;
  roles: string[];
  permissions: string[];
  platformRole: string | null;
  entitlements: { planCode: string | null; features: string[]; limits: Record<string, number | null> } | null;
}

// ───────────── Sign-in and accounts (ADR 0007) ─────────────

const email = z.string().trim().toLowerCase().email().max(254);

/** Passwords people choose: 10+ characters with at least one letter and one digit. */
export const newPasswordSchema = z
  .string()
  .min(10, "PASSWORD_TOO_SHORT")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "PASSWORD_TOO_WEAK");

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

/** First sign-in (or any time): current password (the emailed one at first) + a new one. */
export const changePasswordSchema = z
  .object({ email, currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, { message: "PASSWORD_UNCHANGED", path: ["newPassword"] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The access tree: ticked permissions (only the ones owners may hand out). */
const accessSelection = z.array(z.enum(OVERRIDABLE_PERMISSIONS as [string, ...string[]])).max(OVERRIDABLE_PERMISSIONS.length);

/** POST /v1/users — owner creates a sign-in; the system emails a generated password. */
export const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email,
  role: z.enum(STAFF_ROLE_KEYS),
  permissions: accessSelection.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** PUT /v1/users/:id/access — role, plus (Pro) the ticked tree. */
export const userAccessSchema = z.object({ role: z.enum(STAFF_ROLE_KEYS), permissions: accessSelection.optional() });
export type UserAccessInput = z.infer<typeof userAccessSchema>;

export const userStatusSchema = z.object({ status: z.enum(["active", "disabled"]) });

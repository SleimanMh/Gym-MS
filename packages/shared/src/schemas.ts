import { z } from "zod";
import { PLAN_CODES } from "./entitlements";

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

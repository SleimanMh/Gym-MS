/**
 * Feature and limit keys (PLAN.md section 7).
 * The database (features, plans, plan_features) is the source of truth at runtime;
 * this catalogue is what the seed writes and what code refers to, so keys never drift.
 */

export const FEATURES = {
  BOOKING_CORE: "booking.core", // classes, bookings, waitlist, check-in
  MEMBERSHIP_CORE: "membership.core", // memberships and member CRM
  WIDGET_EMBED: "widget.embed", // website widget and hosted booking page
  PAYMENTS_MANUAL: "payments.manual", // cash and manual payments
  PAYMENTS_ONLINE: "payments.online", // online payments
  PORTAL_MEMBER: "portal.member", // member portal (PWA)
  CRM_LEADS: "crm.leads", // leads pipeline
  SALES_PROMO_CODES: "sales.promo_codes",
  DASHBOARDS_SALES: "dashboards.sales", // sales and retention dashboards
  STAFF_MANAGEMENT: "staff.management", // staff, shifts, commissions
  FINANCE_PNL: "finance.pnl", // expenses, P&L, costs dashboard
  MARKETING_AUTOMATIONS: "marketing.automations", // automations, SMS/WhatsApp
  INSIGHTS_PRICING: "insights.pricing", // pricing insights and staff performance
  IDENTITY_SSO: "identity.sso", // staff SSO (Google/Microsoft)
  IDENTITY_CUSTOM_ROLES: "identity.custom_roles",
  INTEGRATIONS_API: "integrations.api", // public API, webhooks
  BRANDING_CUSTOM_DOMAIN: "branding.custom_domain",
  REPORTS_MULTI_LOCATION: "reports.multi_location",
  BRANDING_WHITE_LABEL: "branding.white_label",
  TENANCY_DEDICATED_DB: "tenancy.dedicated_db",
} as const;
export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const LIMITS = {
  LOCATIONS: "limit.locations",
  ACTIVE_MEMBERS: "limit.active_members",
} as const;
export type LimitKey = (typeof LIMITS)[keyof typeof LIMITS];

export const PLAN_CODES = ["starter", "growth", "pro", "enterprise"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  "booking.core": "Classes, bookings, waitlist, check-in",
  "membership.core": "Memberships and member CRM",
  "widget.embed": "Website widget and hosted booking page",
  "payments.manual": "Cash and manual payments",
  "payments.online": "Online payments",
  "portal.member": "Member portal",
  "crm.leads": "Leads pipeline",
  "sales.promo_codes": "Promo codes",
  "dashboards.sales": "Sales and retention dashboards",
  "staff.management": "Staff, shifts, commissions",
  "finance.pnl": "Finance: expenses, P&L, costs dashboard",
  "marketing.automations": "Marketing automations, SMS/WhatsApp",
  "insights.pricing": "Pricing insights and staff performance",
  "identity.sso": "Staff SSO (Google/Microsoft)",
  "identity.custom_roles": "Custom roles",
  "integrations.api": "Public API and webhooks",
  "branding.custom_domain": "Custom domain",
  "reports.multi_location": "Multi-location consolidated reports",
  "branding.white_label": "White label",
  "tenancy.dedicated_db": "Dedicated database",
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  "limit.locations": "Locations included",
  "limit.active_members": "Active members included",
};

const F = FEATURES;
const starter: FeatureKey[] = [F.BOOKING_CORE, F.MEMBERSHIP_CORE, F.WIDGET_EMBED, F.PAYMENTS_MANUAL];
const growth: FeatureKey[] = [
  ...starter,
  F.PAYMENTS_ONLINE,
  F.PORTAL_MEMBER,
  F.CRM_LEADS,
  F.SALES_PROMO_CODES,
  F.DASHBOARDS_SALES,
];
const pro: FeatureKey[] = [
  ...growth,
  F.STAFF_MANAGEMENT,
  F.FINANCE_PNL,
  F.MARKETING_AUTOMATIONS,
  F.INSIGHTS_PRICING,
  F.IDENTITY_SSO,
  F.IDENTITY_CUSTOM_ROLES,
  F.INTEGRATIONS_API,
  F.BRANDING_CUSTOM_DOMAIN,
];
const enterprise: FeatureKey[] = [
  ...pro,
  F.REPORTS_MULTI_LOCATION,
  F.BRANDING_WHITE_LABEL,
  F.TENANCY_DEDICATED_DB,
];

/** `null` limit = unlimited. Starting numbers from PLAN.md section 7 — set real ones when pricing. */
export const PLAN_CATALOGUE: Record<
  PlanCode,
  { name: string; features: FeatureKey[]; limits: Record<LimitKey, number | null>; addOns: FeatureKey[] }
> = {
  starter: { name: "Starter", features: starter, limits: { "limit.locations": 1, "limit.active_members": 300 }, addOns: [] },
  growth: {
    name: "Growth",
    features: growth,
    limits: { "limit.locations": 1, "limit.active_members": 1000 },
    addOns: [F.MARKETING_AUTOMATIONS],
  },
  pro: { name: "Pro", features: pro, limits: { "limit.locations": 3, "limit.active_members": 3000 }, addOns: [] },
  enterprise: {
    name: "Enterprise",
    features: enterprise,
    limits: { "limit.locations": null, "limit.active_members": null },
    addOns: [],
  },
};

/** The lowest plan that includes a feature — used for "Available on Pro" upgrade cards. */
export function lowestPlanWith(feature: FeatureKey): PlanCode | null {
  return PLAN_CODES.find((p) => PLAN_CATALOGUE[p].features.includes(feature)) ?? null;
}

export interface EffectiveEntitlements {
  planCode: string | null;
  features: FeatureKey[];
  limits: Partial<Record<LimitKey, number | null>>;
}

export interface EntitlementInputs {
  planCode: string | null;
  planFeatures: { featureKey: string; enabled: boolean; limitValue: number | null }[];
  overrides: { featureKey: string; enabled: boolean | null; limitValue: number | null; expiresAt: Date | null }[];
  now?: Date;
}

/**
 * Effective entitlements = plan + add-ons + overrides (PLAN.md section 7).
 * Add-ons are stored as overrides with enabled=true, so one merge covers both.
 * Pure function: unit-tested, used by the API and the worker.
 */
export function computeEntitlements(input: EntitlementInputs): EffectiveEntitlements {
  const now = input.now ?? new Date();
  const enabled = new Map<string, boolean>();
  const limits = new Map<string, number | null>();

  for (const pf of input.planFeatures) {
    if (pf.featureKey.startsWith("limit.")) limits.set(pf.featureKey, pf.limitValue);
    else enabled.set(pf.featureKey, pf.enabled);
  }
  for (const o of input.overrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    if (o.featureKey.startsWith("limit.")) limits.set(o.featureKey, o.limitValue);
    else if (o.enabled !== null) enabled.set(o.featureKey, o.enabled);
  }

  return {
    planCode: input.planCode,
    features: [...enabled.entries()].filter(([, on]) => on).map(([k]) => k as FeatureKey).sort(),
    limits: Object.fromEntries(limits) as Partial<Record<LimitKey, number | null>>,
  };
}

/** True when one more item fits under the limit. Missing limit key = not allowed (deny by default). */
export function withinLimit(ent: EffectiveEntitlements, key: LimitKey, currentCount: number): boolean {
  const max = ent.limits[key];
  if (max === undefined) return false;
  if (max === null) return true;
  return currentCount < max;
}

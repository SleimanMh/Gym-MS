export * from "./entitlements";
export * from "./permissions";
export * from "./schemas";

/** Money is always integer minor units + ISO currency code; never floats (PLAN.md section 9). */
export interface Money {
  amountMinor: bigint;
  currency: string;
}

export const API_KEY_HEADER = "x-api-key";
/** Hosted booking pages and the widget's `tenant` attribute identify the gym by slug. */
export const TENANT_SLUG_HEADER = "x-tenant-slug";
export * from "./time";
export * from "./money";
export * from "./phase1";
export * from "./occurrences";
export * from "./finance";

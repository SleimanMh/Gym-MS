/**
 * Which membership (if any) lets a member into a class on a given day at a given location.
 * Pure function — the booking service loads the data and this decides (PLAN.md section 6.3).
 */

export interface EntitlementSubscription {
  id: string;
  status: "pending" | "active" | "expired" | "cancelled";
  startsOn: string;
  endsOn: string | null;
  unlimited: boolean;
  allowedLocationIds: string[];
  freezes: { startsOn: string; endsOn: string }[];
  creditBalance: number;
}

export type EntitlementDenial =
  | "NO_ACTIVE_MEMBERSHIP"
  | "MEMBERSHIP_PENDING_PAYMENT"
  | "LOCATION_NOT_INCLUDED"
  | "MEMBERSHIP_FROZEN"
  | "NO_CREDITS_LEFT";

export type EntitlementResult =
  | { ok: true; subscriptionId: string; useCredit: boolean }
  | { ok: false; code: EntitlementDenial };

const covers = (s: EntitlementSubscription, date: string) => s.startsOn <= date && (!s.endsOn || date <= s.endsOn);
export const isFrozenOn = (s: EntitlementSubscription, date: string) =>
  s.freezes.some((f) => f.startsOn <= date && date <= f.endsOn);

export function pickEntitlement(
  subs: EntitlementSubscription[],
  date: string,
  locationId: string,
): EntitlementResult {
  const inPeriod = subs.filter((s) => s.status === "active" && covers(s, date));
  if (!inPeriod.length) {
    const pending = subs.some((s) => s.status === "pending" && covers(s, date));
    return { ok: false, code: pending ? "MEMBERSHIP_PENDING_PAYMENT" : "NO_ACTIVE_MEMBERSHIP" };
  }

  const atLocation = inPeriod.filter((s) => !s.allowedLocationIds.length || s.allowedLocationIds.includes(locationId));
  if (!atLocation.length) return { ok: false, code: "LOCATION_NOT_INCLUDED" };

  const usable = atLocation.filter((s) => !isFrozenOn(s, date));
  if (!usable.length) return { ok: false, code: "MEMBERSHIP_FROZEN" };

  const unlimited = usable.find((s) => s.unlimited);
  if (unlimited) return { ok: true, subscriptionId: unlimited.id, useCredit: false };

  // Use the pack that expires first.
  const withCredits = usable
    .filter((s) => s.creditBalance > 0)
    .sort((a, b) => (a.endsOn ?? "9999-12-31").localeCompare(b.endsOn ?? "9999-12-31"));
  const pick = withCredits[0];
  return pick ? { ok: true, subscriptionId: pick.id, useCredit: true } : { ok: false, code: "NO_CREDITS_LEFT" };
}

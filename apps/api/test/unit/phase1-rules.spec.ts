import { pickEntitlement, type EntitlementSubscription } from "../../src/modules/booking/entitlement";
import { generateOccurrences } from "@gym/shared";
import { subscriptionEndsOn } from "../../src/modules/members/memberships.service";

const LOC_A = "01936a00-0000-7000-8000-0000000000a1";
const LOC_B = "01936a00-0000-7000-8000-0000000000b1";

const sub = (over: Partial<EntitlementSubscription>): EntitlementSubscription => ({
  id: "s1",
  status: "active",
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  unlimited: true,
  allowedLocationIds: [],
  freezes: [],
  creditBalance: 0,
  ...over,
});

describe("generateOccurrences", () => {
  const rule = { weekday: 2, startMinute: 18 * 60 + 30, durationMin: 45, validFrom: "2026-11-01", validUntil: null };

  it("creates one class per matching weekday in the location's time zone", () => {
    const out = generateOccurrences(rule, "Asia/Beirut", "2026-11-14", "2026-11-30", new Set());
    expect(out.map((o) => o.date)).toEqual(["2026-11-17", "2026-11-24"]); // Tuesdays
    expect(out[0]!.startsAt.toISOString()).toBe("2026-11-17T16:30:00.000Z"); // 18:30 at UTC+2
    expect(out[0]!.endsAt.getTime() - out[0]!.startsAt.getTime()).toBe(45 * 60_000);
  });

  it("skips holidays and respects the validity window", () => {
    const out = generateOccurrences(
      { ...rule, validUntil: "2026-11-25" },
      "Asia/Beirut",
      "2026-11-01",
      "2026-12-31",
      new Set(["2026-11-10"]),
    );
    expect(out.map((o) => o.date)).toEqual(["2026-11-03", "2026-11-17", "2026-11-24"]);
  });
});

describe("pickEntitlement", () => {
  it("prefers an unlimited membership", () => {
    const r = pickEntitlement([sub({ id: "pack", unlimited: false, creditBalance: 3 }), sub({ id: "unl" })], "2026-11-10", LOC_A);
    expect(r).toEqual({ ok: true, subscriptionId: "unl", useCredit: false });
  });

  it("uses the pack that expires first and needs credits", () => {
    const r = pickEntitlement(
      [
        sub({ id: "late", unlimited: false, creditBalance: 2, endsOn: "2026-12-31" }),
        sub({ id: "early", unlimited: false, creditBalance: 1, endsOn: "2026-11-20" }),
      ],
      "2026-11-10",
      LOC_A,
    );
    expect(r).toEqual({ ok: true, subscriptionId: "early", useCredit: true });
    expect(pickEntitlement([sub({ unlimited: false, creditBalance: 0 })], "2026-11-10", LOC_A)).toEqual({
      ok: false,
      code: "NO_CREDITS_LEFT",
    });
  });

  it("explains why a member can't book", () => {
    expect(pickEntitlement([], "2026-11-10", LOC_A)).toMatchObject({ code: "NO_ACTIVE_MEMBERSHIP" });
    expect(pickEntitlement([sub({ status: "pending" })], "2026-11-10", LOC_A)).toMatchObject({
      code: "MEMBERSHIP_PENDING_PAYMENT",
    });
    expect(pickEntitlement([sub({})], "2026-12-05", LOC_A)).toMatchObject({ code: "NO_ACTIVE_MEMBERSHIP" });
    expect(pickEntitlement([sub({ allowedLocationIds: [LOC_B] })], "2026-11-10", LOC_A)).toMatchObject({
      code: "LOCATION_NOT_INCLUDED",
    });
    expect(
      pickEntitlement([sub({ freezes: [{ startsOn: "2026-11-08", endsOn: "2026-11-12" }] })], "2026-11-10", LOC_A),
    ).toMatchObject({ code: "MEMBERSHIP_FROZEN" });
  });
});

describe("subscriptionEndsOn", () => {
  it("computes the last day of each plan type", () => {
    expect(subscriptionEndsOn({ type: "recurring", billingPeriod: "month", durationDays: null }, "2026-01-31")).toBe(
      "2026-02-27",
    );
    expect(subscriptionEndsOn({ type: "recurring", billingPeriod: "year", durationDays: null }, "2026-03-01")).toBe(
      "2027-02-28",
    );
    expect(subscriptionEndsOn({ type: "class_pack", billingPeriod: null, durationDays: 90 }, "2026-11-01")).toBe(
      "2027-01-29",
    );
    expect(subscriptionEndsOn({ type: "class_pack", billingPeriod: null, durationDays: null }, "2026-11-01")).toBeNull();
  });
});

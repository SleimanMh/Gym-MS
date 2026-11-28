import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePay, computePay, hoursFromEntries, profit, splitMinor } from "../src/finance";

test("salary pays the monthly rate plus commission", () => {
  const r = computePay({ payType: "salary", payRateMinor: 120_000n, hoursWorked: 0, classesTaught: 0, salesMinor: 59_000n, commissionBp: 500 });
  assert.deepEqual(r, { baseMinor: 120_000n, commissionMinor: 2_950n, totalMinor: 122_950n });
});

test("hourly pays clocked hours, rounded to the minor unit", () => {
  const r = computePay({ payType: "hourly", payRateMinor: 850n, hoursWorked: 10.5, classesTaught: 4, salesMinor: 0n, commissionBp: 0 });
  assert.equal(r.totalMinor, 8_925n);
});

test("per-class pays each class taught", () => {
  const r = computePay({ payType: "per_class", payRateMinor: 2_500n, hoursWorked: 30, classesTaught: 12, salesMinor: 0n, commissionBp: 1_000 });
  assert.equal(r.baseMinor, 30_000n);
  assert.equal(r.commissionMinor, 0n);
});

test("hours ignore an open clock-in", () => {
  const h = hoursFromEntries([
    { clockIn: "2026-11-02T08:00:00Z", clockOut: "2026-11-02T12:30:00Z" },
    { clockIn: "2026-11-03T08:00:00Z", clockOut: null },
  ]);
  assert.equal(h, 4.5);
});

test("profit and margin", () => {
  assert.deepEqual(profit({ revenueMinor: 100_000n, expensesMinor: 30_000n, staffMinor: 45_000n }), { netMinor: 25_000n, marginPct: 25 });
  assert.deepEqual(profit({ revenueMinor: 0n, expensesMinor: 10n, staffMinor: 0n }), { netMinor: -10n, marginPct: null });
});

test("splitMinor keeps every minor unit", () => {
  const r = splitMinor(1_000n, { a: 1, b: 1, c: 1 });
  assert.equal(r.a! + r.b! + r.c!, 1_000n);
  assert.deepEqual(splitMinor(0n, { a: 1 }), {});
  assert.deepEqual(splitMinor(500n, {}), { shared: 500n });
});

test("allocatePay: hourly by clocked hours, commission to home", () => {
  const r = allocatePay({
    payType: "hourly",
    pay: { baseMinor: 9_000n, commissionMinor: 500n, totalMinor: 9_500n },
    homeLocationId: "down",
    hoursByLocation: { down: 20, marina: 10 },
    classesByLocation: { marina: 4 },
  });
  assert.deepEqual(r, { down: 6_500n, marina: 3_000n });
});

test("allocatePay: per-class by where classes ran; salary to home; no location → shared", () => {
  const pc = allocatePay({
    payType: "per_class",
    pay: { baseMinor: 1_200n, commissionMinor: 0n, totalMinor: 1_200n },
    homeLocationId: "down",
    hoursByLocation: {},
    classesByLocation: { down: 2, marina: 1 },
  });
  assert.deepEqual(pc, { down: 800n, marina: 400n });
  const sal = allocatePay({
    payType: "salary",
    pay: { baseMinor: 25_000n, commissionMinor: 0n, totalMinor: 25_000n },
    homeLocationId: null,
    hoursByLocation: { marina: 5 },
    classesByLocation: {},
  });
  assert.deepEqual(sal, { shared: 25_000n });
});

test("splitMinor spreads a negative amount (gym-wide income) exactly", () => {
  const r = splitMinor(-1_001n, { a: 2, b: 1 });
  assert.equal(r.a! + r.b!, -1_001n);
});

import { changePasswordSchema, newPasswordSchema } from "../src/schemas";

test("passwords people choose need 10+ characters, a letter and a digit, and must change", () => {
  assert.equal(newPasswordSchema.safeParse("short1").success, false);
  assert.equal(newPasswordSchema.safeParse("onlyletterslong").success, false);
  assert.equal(newPasswordSchema.safeParse("Gym-member-2026").success, true);
  assert.equal(changePasswordSchema.safeParse({ email: "a@b.co", currentPassword: "Same-pass-123", newPassword: "Same-pass-123" }).success, false);
});

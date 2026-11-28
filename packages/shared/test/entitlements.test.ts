import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEntitlements, withinLimit, lowestPlanWith, PLAN_CATALOGUE } from "../src/entitlements";
import { effectivePermissions, normaliseSelection, overridesFor, permissionsForRoles, treeSelection } from "../src/permissions";

const plan = (code: keyof typeof PLAN_CATALOGUE) => [
  ...PLAN_CATALOGUE[code].features.map((featureKey) => ({ featureKey, enabled: true, limitValue: null })),
  ...Object.entries(PLAN_CATALOGUE[code].limits).map(([featureKey, limitValue]) => ({
    featureKey,
    enabled: true,
    limitValue,
  })),
];

test("plan features flow through", () => {
  const e = computeEntitlements({ planCode: "starter", planFeatures: plan("starter"), overrides: [] });
  assert.ok(e.features.includes("booking.core"));
  assert.ok(!e.features.includes("finance.pnl"));
  assert.equal(e.limits["limit.locations"], 1);
});

test("overrides enable, disable and change limits; expired overrides are ignored", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  const e = computeEntitlements({
    planCode: "starter",
    planFeatures: plan("starter"),
    overrides: [
      { featureKey: "finance.pnl", enabled: true, limitValue: null, expiresAt: null },
      { featureKey: "widget.embed", enabled: false, limitValue: null, expiresAt: null },
      { featureKey: "limit.locations", enabled: null, limitValue: 5, expiresAt: null },
      { featureKey: "staff.management", enabled: true, limitValue: null, expiresAt: new Date("2026-01-01") },
    ],
    now,
  });
  assert.ok(e.features.includes("finance.pnl"));
  assert.ok(!e.features.includes("widget.embed"));
  assert.ok(!e.features.includes("staff.management"));
  assert.equal(e.limits["limit.locations"], 5);
});

test("withinLimit: numeric, unlimited, missing", () => {
  const e = computeEntitlements({ planCode: "enterprise", planFeatures: plan("enterprise"), overrides: [] });
  assert.equal(withinLimit(e, "limit.locations", 1000), true);
  const s = computeEntitlements({ planCode: "starter", planFeatures: plan("starter"), overrides: [] });
  assert.equal(withinLimit(s, "limit.locations", 0), true);
  assert.equal(withinLimit(s, "limit.locations", 1), false);
  const none = computeEntitlements({ planCode: null, planFeatures: [], overrides: [] });
  assert.equal(withinLimit(none, "limit.locations", 0), false);
});

test("lowestPlanWith", () => {
  assert.equal(lowestPlanWith("finance.pnl"), "pro");
  assert.equal(lowestPlanWith("crm.leads"), "growth");
  assert.equal(lowestPlanWith("tenancy.dedicated_db"), "enterprise");
});

test("member role has no staff permissions", () => {
  const p = permissionsForRoles(["member"]);
  assert.ok(p.every((x) => x.startsWith("self.")));
  assert.ok(permissionsForRoles(["owner"]).includes("finance.view"));
  assert.ok(!permissionsForRoles(["owner"]).includes("self.booking"));
});


test("access: overrides add and remove on top of the role; owners are never reduced", () => {
  const trainer = effectivePermissions(["trainer"], [{ permission: "member.view", granted: false }, { permission: "report.view", granted: true }]);
  assert.ok(!trainer.includes("member.view"));
  assert.ok(trainer.includes("report.view"));
  // Security permissions can't be granted by a tweak.
  assert.ok(!effectivePermissions(["trainer"], [{ permission: "tenant.security.manage", granted: true }]).includes("tenant.security.manage"));
  assert.deepEqual(effectivePermissions(["owner"], [{ permission: "finance.view", granted: false }]), permissionsForRoles(["owner"]));
});

test("access tree: only differences from the role are stored, and branches need their first leaf", () => {
  const fd = permissionsForRoles(["front_desk"]);
  assert.deepEqual(overridesFor("front_desk", treeSelection(fd)), []);
  // Ticking "edit members" alone also opens Members; ticking finance.manage opens Finance.
  assert.deepEqual(normaliseSelection(["finance.manage"]), ["finance.view", "finance.manage"]);
  const o = overridesFor("front_desk", [...treeSelection(fd).filter((p) => p !== "sale.create" && p !== "payment.take"), "report.view"]);
  const eff = effectivePermissions(["front_desk"], o);
  assert.ok(eff.includes("report.view"));
  assert.ok(!eff.includes("sale.create"));
  assert.ok(eff.includes("checkin.create"));
});

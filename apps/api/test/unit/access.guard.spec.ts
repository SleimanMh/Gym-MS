import { BadRequestException, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { computeEntitlements, permissionsForRoles, PLAN_CATALOGUE, type PlanCode } from "@gym/shared";
import { AccessGuard } from "../../src/common/access.guard";
import {
  AuthenticatedOnly,
  PlatformOnly,
  Public,
  RequiresFeature,
  RequiresPermission,
} from "../../src/common/decorators";
import { RequestContextStore, type Principal, type RequestContext } from "../../src/common/request-context";
import type { EntitlementsService } from "../../src/modules/entitlements/entitlements.service";

class Routes {
  @Public() open() {}
  @Public({ tenant: true }) widget() {}
  @AuthenticatedOnly() me() {}
  @PlatformOnly("super_admin") platform() {}
  @PlatformOnly("super_admin", "support") platformRead() {}
  @RequiresPermission("location.view") locations() {}
  @RequiresPermission("finance.view") @RequiresFeature("finance.pnl") pnl() {}
  undeclared() {}
}

const tenant = {
  id: "01936a00-0000-7000-8000-000000000001",
  slug: "ironfit",
  name: "IronFit",
  status: "active" as const,
  defaultLanguage: "en" as const,
  timezone: "Asia/Beirut",
  currency: "USD",
};

function principal(roles: string[], extra: Partial<Principal> = {}): Principal {
  return {
    userId: "u1",
    email: "x@test",
    firstName: "X",
    lastName: "Y",
    isTenantMember: true,
    roles,
    permissions: permissionsForRoles(roles),
    platformRole: null,
    ...extra,
  };
}

function entitlementsFor(plan: PlanCode) {
  const def = PLAN_CATALOGUE[plan];
  const ent = computeEntitlements({
    planCode: plan,
    planFeatures: def.features.map((featureKey) => ({ featureKey, enabled: true, limitValue: null })),
    overrides: [],
  });
  return { get: async () => ent } as unknown as EntitlementsService;
}

async function check(
  route: keyof Routes,
  ctx: Partial<RequestContext>,
  opts: { plan?: PlanCode; method?: string } = {},
) {
  const guard = new AccessGuard(new Reflector(), entitlementsFor(opts.plan ?? "pro"));
  const exec = {
    getHandler: () => Routes.prototype[route],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ method: opts.method ?? "GET" }) }),
  } as unknown as ExecutionContext;
  const full: RequestContext = {
    requestId: "r1",
    tenant: null,
    tenantSource: null,
    apiKeyType: null,
    principal: null,
    member: null,
    ...ctx,
  };
  return RequestContextStore.run(full, () => guard.canActivate(exec));
}

describe("AccessGuard", () => {
  it("lets public routes through and requires a tenant when asked", async () => {
    await expect(check("open", {})).resolves.toBe(true);
    await expect(check("widget", {})).rejects.toThrow(BadRequestException);
    await expect(check("widget", { tenant })).resolves.toBe(true);
  });

  it("requires login for everything else", async () => {
    await expect(check("me", {})).rejects.toThrow(UnauthorizedException);
    await expect(check("locations", { tenant })).rejects.toThrow(UnauthorizedException);
    await expect(check("me", { principal: principal([]) })).resolves.toBe(true);
  });

  it("denies routes that declare no access rule", async () => {
    await expect(check("undeclared", { tenant, principal: principal(["owner"]) })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("checks tenant, membership and permissions", async () => {
    await expect(check("locations", { principal: principal(["owner"]) })).rejects.toThrow(BadRequestException);
    await expect(
      check("locations", { tenant, principal: principal(["owner"], { isTenantMember: false, permissions: [] }) }),
    ).rejects.toThrow(ForbiddenException);
    await expect(check("locations", { tenant, principal: principal(["front_desk"]) })).resolves.toBe(true);
  });

  it("gives member tokens 403 on staff endpoints", async () => {
    await expect(check("locations", { tenant, principal: principal(["member"]) })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("checks the plan's features", async () => {
    const owner = { tenant, principal: principal(["owner"]) };
    await expect(check("pnl", owner, { plan: "pro" })).resolves.toBe(true);
    await expect(check("pnl", owner, { plan: "starter" })).rejects.toMatchObject({
      response: { code: "FEATURE_NOT_IN_PLAN", requiredPlan: "pro" },
    });
  });

  it("blocks writes for read-only tenants", async () => {
    const ro = { tenant: { ...tenant, status: "read_only" as const }, principal: principal(["owner"]) };
    await expect(check("locations", ro, { method: "GET" })).resolves.toBe(true);
    await expect(check("locations", ro, { method: "POST" })).rejects.toMatchObject({
      response: { code: "TENANT_READ_ONLY" },
    });
  });

  it("limits platform routes to platform roles; support is read-only", async () => {
    await expect(check("platform", { principal: principal(["owner"]) })).rejects.toThrow(ForbiddenException);
    await expect(check("platform", { principal: principal([], { platformRole: "super_admin" }) })).resolves.toBe(
      true,
    );
    const support = { principal: principal([], { platformRole: "support" }) };
    await expect(check("platformRead", support)).resolves.toBe(true);
    await expect(check("platformRead", support, { method: "POST" })).rejects.toThrow(ForbiddenException);
  });
});

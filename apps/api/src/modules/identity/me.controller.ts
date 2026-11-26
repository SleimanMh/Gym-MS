import { Controller, Get } from "@nestjs/common";
import type { MeResponse } from "@gym/shared";
import { AuthenticatedOnly } from "../../common/decorators";
import { currentContext, requirePrincipal } from "../../common/request-context";
import { TenantDb } from "../../infra/tenant-db.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { IdentityService } from "./identity.service";

@Controller("v1/me")
export class MeController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly identity: IdentityService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Everything the admin app needs to render its shell: user, gym, roles, plan features. */
  @Get()
  @AuthenticatedOnly()
  async me(): Promise<MeResponse> {
    const ctx = currentContext();
    const p = requirePrincipal();
    const tenant = ctx.tenant && p.isTenantMember ? ctx.tenant : null;

    let primaryColor: string | null = null;
    let entitlements: MeResponse["entitlements"] = null;
    if (tenant) {
      const settings = await this.tenantDb.run((tx) => tx.tenantSettings.findUnique({ where: { tenantId: tenant.id } }));
      primaryColor = settings?.primaryColor ?? null;
      const e = await this.entitlements.get(tenant.id);
      entitlements = { planCode: e.planCode, features: e.features, limits: e.limits as Record<string, number | null> };
    }

    return {
      user: { id: p.userId, email: p.email, firstName: p.firstName, lastName: p.lastName },
      tenant: tenant ? { ...tenant, primaryColor } : null,
      roles: tenant ? p.roles : [],
      permissions: tenant ? p.permissions : [],
      platformRole: p.platformRole,
      entitlements,
    };
  }

  /** Gyms this person belongs to — the "pick your gym" step after login. */
  @Get("tenants")
  @AuthenticatedOnly()
  tenants() {
    return this.identity.tenantsForUser(requirePrincipal().userId);
  }
}

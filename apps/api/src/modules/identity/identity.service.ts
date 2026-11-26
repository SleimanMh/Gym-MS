import { Injectable } from "@nestjs/common";
import { permissionsForRoles, type PlatformRole } from "@gym/shared";
import type { Principal } from "../../common/request-context";
import { PrismaService } from "../../infra/prisma.service";
import { TenantDb } from "../../infra/tenant-db.service";
import type { VerifiedToken } from "./auth.service";

/**
 * Turns a verified token into a Principal. The identity provider authenticates; roles and
 * memberships live in our database (ADR 0003), so custom roles and location scoping stay ours.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDb,
  ) {}

  async loadPrincipal(token: Extract<VerifiedToken, { kind: "user" }>, tenantId: string | null): Promise<Principal | null> {
    let user = await this.prisma.user.findUnique({
      where: { authSubject: token.subject },
      include: { platformUser: true },
    });

    // First Keycloak sign-in: link the Keycloak account to our user by VERIFIED email. Users created
    // by the seed carry a "dev|…" placeholder subject, which a real sign-in replaces (dev tokens keep
    // working: they are minted for whatever subject the user has). Only Keycloak tokens may link.
    if (!user && token.source === "keycloak" && token.email && token.emailVerified) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: token.email } });
      if (byEmail && (!byEmail.authSubject || byEmail.authSubject.startsWith("dev|"))) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { authSubject: token.subject },
          include: { platformUser: true },
        });
      }
    }
    if (!user) return null;

    let roles: string[] = [];
    let isTenantMember = false;
    if (tenantId) {
      const found = await this.tenantDb.runFor(tenantId, async (tx) => {
        const membership = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: user.id } },
        });
        if (membership?.status !== "active") return null;
        const userRoles = await tx.userRole.findMany({ where: { userId: user.id }, select: { roleKey: true } });
        return userRoles.map((r) => r.roleKey);
      });
      if (found) {
        isTenantMember = true;
        roles = [...new Set(found)].sort();
      }
    }

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isTenantMember,
      roles,
      permissions: isTenantMember ? permissionsForRoles(roles) : [],
      platformRole: (user.platformUser?.role as PlatformRole | undefined) ?? null,
    };
  }

  async tenantsForUser(userId: string): Promise<{ tenantId: string; slug: string; name: string }[]> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; slug: string; name: string }[]>`
      SELECT tenant_id, slug, name FROM app_user_tenants(${userId}::uuid)`;
    return rows.map((r) => ({ tenantId: r.tenant_id, slug: r.slug, name: r.name }));
  }
}

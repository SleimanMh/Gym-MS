import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { setTenant } from "@gym/db";
import { DEFAULT_EXPENSE_CATEGORIES, type AssignPlanInput, type CreateTenantInput } from "@gym/shared";
import { PrismaService } from "../../infra/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { OutboxService } from "../notifications/outbox.service";
import { provisionAccount } from "../users/accounts";

/** Your side of the product: onboard gyms and assign plans (PLAN.md section 5, platform roles). */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscriptions: { where: { isCurrent: true }, include: { plan: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      defaultLanguage: t.defaultLanguage,
      currency: t.currency,
      planCode: t.subscriptions[0]?.plan.code ?? null,
      createdAt: t.createdAt,
    }));
  }

  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { features: true } });
  }

  /**
   * One transaction: tenant + subscription (platform tables), then — after switching
   * app.tenant_id to the new tenant — settings, first location, owner membership and role.
   */
  async createTenant(input: CreateTenantInput) {
    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw new NotFoundException({ code: "PLAN_NOT_FOUND" });
    if (await this.prisma.tenant.findUnique({ where: { slug: input.slug } })) {
      throw new ConflictException({ code: "SLUG_TAKEN" });
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: input.slug,
          name: input.name,
          status: "trial",
          defaultLanguage: input.defaultLanguage,
          timezone: input.timezone,
          currency: input.currency,
        },
      });
      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "trialing",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        },
      });
      await setTenant(tx, tenant.id);
      await tx.tenantSettings.create({ data: { tenantId: tenant.id } });
      await tx.location.create({
        data: { tenantId: tenant.id, slug: "main", name: input.firstLocationName },
      });
      // Starter expense categories in the gym's language (used once Finance is on the plan).
      await tx.expenseCategory.createMany({
        data: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ tenantId: tenant.id, key: c.key, name: c[input.defaultLanguage] })),
      });
      // The owner gets a sign-in with a generated password emailed to them (or, if they already
      // have an account, access to this gym with their current password). ADR 0007.
      const owner = await provisionAccount(tx, this.outbox, tenant.id, {
        email: input.owner.email,
        firstName: input.owner.firstName,
        lastName: input.owner.lastName,
        role: "owner",
        overrides: [],
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "tenant.created",
        entityType: "tenant",
        entityId: tenant.id,
        data: { planCode: input.planCode },
      });

      return { id: tenant.id, slug: tenant.slug, name: tenant.name, planCode: plan.code, ownerUserId: owner.userId };
    });
  }

  async assignPlan(tenantId: string, input: AssignPlanInput) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.plan.findUnique({ where: { code: input.planCode } }),
    ]);
    if (!tenant) throw new NotFoundException({ code: "TENANT_NOT_FOUND" });
    if (!plan) throw new NotFoundException({ code: "PLAN_NOT_FOUND" });

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenantSubscription.findFirst({ where: { tenantId, isCurrent: true } });
      await tx.tenantSubscription.updateMany({ where: { tenantId, isCurrent: true }, data: { isCurrent: false } });
      await tx.tenantSubscription.create({
        data: { tenantId, planId: plan.id, status: current?.status ?? "active", isCurrent: true },
      });
      await setTenant(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        action: "tenant.plan_changed",
        entityType: "tenant",
        entityId: tenantId,
        data: { from: current?.planId ?? null, to: plan.id },
      });
    });
    await this.entitlements.invalidate(tenantId);
    return this.entitlements.get(tenantId);
  }
}

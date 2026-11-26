import { randomBytes } from "node:crypto";
import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Prisma } from "@gym/db";
import {
  addDays,
  createMemberSchema,
  localDate,
  createMembershipPlanSchema,
  freezeSchema,
  LIMITS,
  membersQuerySchema,
  sellMembershipSchema,
  toDateColumn,
  updateMemberSchema,
  type CreateMemberInput,
  type CreateMembershipPlanInput,
  type FreezeInput,
  type MemberFilter,
  type SellMembershipInput,
  type UpdateMemberInput,
} from "@gym/shared";
import { z } from "zod";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { MembershipsService } from "./memberships.service";

export const newCheckinCode = () => randomBytes(9).toString("base64url");

const uniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Members, membership plans and memberships (PLAN.md sections 6.3 and 6.4). */
@Controller("v1")
@RequiresFeature("membership.core")
export class MembersController {
  constructor(
    private readonly db: TenantDb,
    private readonly memberships: MembershipsService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  // ── Members ──

  @Get("members")
  @RequiresPermission("member.view")
  list(@Query(new ZodPipe(membersQuerySchema)) q: z.infer<typeof membersQuerySchema>) {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    return this.db.run((tx) =>
      tx.member.findMany({
        where: {
          deletedAt: null,
          ...this.statusWhere(q.status),
          AND: terms.map((t) => ({
            OR: [
              { firstName: { contains: t, mode: "insensitive" as const } },
              { lastName: { contains: t, mode: "insensitive" as const } },
              { email: { contains: t, mode: "insensitive" as const } },
              { phone: { contains: t.replace(/[^\d+]/g, "") || t } },
            ],
          })),
        },
        include: {
          subscriptions: {
            where: { status: { in: ["active", "pending"] } },
            select: { id: true, status: true, endsOn: true, plan: { select: { name: true } } },
            orderBy: { startsOn: "desc" },
            take: 1,
          },
          checkIns: { select: { checkedInAt: true }, orderBy: { checkedInAt: "desc" }, take: 1 },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: q.take,
      }),
    );
  }

  /** How many members are in each list filter (the tabs above the member list). */
  @Get("members/counts")
  @RequiresPermission("member.view")
  counts() {
    const filters: MemberFilter[] = ["all", "active", "pending", "expiring", "none"];
    return this.db.run(async (tx) => {
      const entries = await Promise.all(
        filters.map(async (f) => [f, await tx.member.count({ where: { deletedAt: null, ...this.statusWhere(f) } })] as const),
      );
      return Object.fromEntries(entries);
    });
  }

  /** Member list filters, evaluated on the gym's "today". */
  private statusWhere(filter: MemberFilter) {
    const tz = requireTenant().timezone;
    const today = toDateColumn(localDate(new Date(), tz));
    const inWeek = toDateColumn(addDays(localDate(new Date(), tz), 7));
    const current = { status: "active" as const, startsOn: { lte: today }, OR: [{ endsOn: null }, { endsOn: { gte: today } }] };
    switch (filter) {
      case "active":
        return { subscriptions: { some: current } };
      case "pending":
        return { subscriptions: { some: { status: "pending" as const } } };
      case "expiring":
        return { subscriptions: { some: { status: "active" as const, endsOn: { gte: today, lte: inWeek } } } };
      case "none":
        return { subscriptions: { none: { OR: [current, { status: "pending" as const }] } } };
      default:
        return {};
    }
  }

  @Post("members")
  @RequiresPermission("member.manage")
  create(@Body(new ZodPipe(createMemberSchema)) body: CreateMemberInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const count = await tx.member.count({ where: { deletedAt: null, status: "active" } });
      await this.entitlements.assertWithinLimit(tenant.id, LIMITS.ACTIVE_MEMBERS, count);
      try {
        return await tx.member.create({
          data: {
            tenantId: tenant.id,
            ...body,
            dateOfBirth: body.dateOfBirth ? toDateColumn(body.dateOfBirth) : null,
            checkinCode: newCheckinCode(),
          },
        });
      } catch (e) {
        if (uniqueViolation(e)) throw new ConflictException({ code: "MEMBER_EXISTS", message: "Email or phone already used" });
        throw e;
      }
    });
  }

  /** Full profile: memberships with credits, bookings, check-ins, payments. */
  @Get("members/:id")
  @RequiresPermission("member.view")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const profile = await this.db.run(async (tx) => {
      const member = await tx.member.findFirst({
        where: { id, deletedAt: null },
        include: {
          subscriptions: {
            include: { plan: { select: { name: true, type: true } }, freezes: { orderBy: { startsOn: "asc" } } },
            orderBy: { startsOn: "desc" },
          },
          bookings: {
            include: {
              session: { select: { id: true, startsAt: true, classType: { select: { name: true, color: true } } } },
            },
            orderBy: { session: { startsAt: "desc" } },
            take: 20,
          },
          checkIns: { orderBy: { checkedInAt: "desc" }, take: 10 },
          payments: { orderBy: { paidAt: "desc" }, take: 10 },
        },
      });
      if (!member) return null;
      const [credits, visits30d, upcoming] = await Promise.all([
        tx.creditEntry.groupBy({ by: ["subscriptionId"], where: { memberId: id }, _sum: { delta: true } }),
        tx.checkIn.count({ where: { memberId: id, checkedInAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
        tx.booking.count({ where: { memberId: id, status: "booked", session: { startsAt: { gte: new Date() } } } }),
      ]);
      return { member, credits, stats: { visits30d, upcomingBookings: upcoming } };
    });
    if (!profile) throw new NotFoundException();
    const balance = new Map(profile.credits.map((c) => [c.subscriptionId, c._sum.delta ?? 0]));
    return {
      ...profile.member,
      stats: profile.stats,
      subscriptions: profile.member.subscriptions.map((s) => ({
        ...s,
        creditsLeft: s.unlimited ? null : (balance.get(s.id) ?? 0),
      })),
    };
  }

  @Patch("members/:id")
  @RequiresPermission("member.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput) {
    return this.db.run(async (tx) => {
      const found = await tx.member.findFirst({ where: { id, deletedAt: null } });
      if (!found) throw new NotFoundException();
      try {
        return await tx.member.update({
          where: { id },
          data: {
            ...body,
            ...(body.dateOfBirth !== undefined
              ? { dateOfBirth: body.dateOfBirth ? toDateColumn(body.dateOfBirth) : null }
              : {}),
          },
        });
      } catch (e) {
        if (uniqueViolation(e)) throw new ConflictException({ code: "MEMBER_EXISTS" });
        throw e;
      }
    });
  }

  /** New QR code (lost phone / shared code). The old code stops working immediately. */
  @Post("members/:id/checkin-code")
  @RequiresPermission("member.manage")
  rotateCode(@Param("id", ParseUUIDPipe) id: string) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.member.updateMany({ where: { id, deletedAt: null }, data: { checkinCode: newCheckinCode() } });
      if (!res.count) throw new NotFoundException();
      await this.audit.record(tx, { tenantId: tenant.id, action: "member.checkin_code_rotated", entityType: "member", entityId: id });
      return tx.member.findUniqueOrThrow({ where: { id }, select: { checkinCode: true } });
    });
  }

  // ── Membership plans (the gym's price list) ──

  @Get("membership-plans")
  @RequiresPermission("member.view")
  plans() {
    return this.db.run((tx) => tx.membershipPlan.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }));
  }

  @Post("membership-plans")
  @RequiresPermission("tenant.settings.manage")
  createPlan(@Body(new ZodPipe(createMembershipPlanSchema)) body: CreateMembershipPlanInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      try {
        const plan = await tx.membershipPlan.create({
          data: {
            tenantId: tenant.id,
            name: body.name,
            description: body.description ?? null,
            type: body.type,
            priceMinor: BigInt(body.priceMinor),
            currency: body.currency ?? tenant.currency,
            billingPeriod: body.type === "recurring" ? body.billingPeriod : null,
            durationDays: body.type === "recurring" ? null : (body.durationDays ?? null),
            credits: body.type === "class_pack" || body.type === "drop_in" ? body.credits : null,
            allowedLocationIds: body.allowedLocationIds,
            isPublic: body.isPublic,
          },
        });
        await this.audit.record(tx, {
          tenantId: tenant.id,
          action: "price.created",
          entityType: "membership_plan",
          entityId: plan.id,
          data: { priceMinor: plan.priceMinor.toString(), currency: plan.currency },
        });
        return plan;
      } catch (e) {
        if (uniqueViolation(e)) throw new ConflictException({ code: "PLAN_NAME_TAKEN" });
        throw e;
      }
    });
  }

  /**
   * Plans are not edited in place (prices stay as sold): deactivate the old one and create a new one.
   */
  @Patch("membership-plans/:id")
  @RequiresPermission("tenant.settings.manage")
  setPlanActive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ isActive: z.boolean().optional(), isPublic: z.boolean().optional() })))
    body: { isActive?: boolean; isPublic?: boolean },
  ) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.membershipPlan.updateMany({ where: { id }, data: body });
      if (!res.count) throw new NotFoundException();
      await this.audit.record(tx, { tenantId: tenant.id, action: "price.updated", entityType: "membership_plan", entityId: id, data: body });
      return tx.membershipPlan.findUniqueOrThrow({ where: { id } });
    });
  }

  // ── Memberships ──

  @Post("members/:id/memberships")
  @RequiresPermission("sale.create")
  sell(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(sellMembershipSchema)) body: SellMembershipInput) {
    return this.memberships.sell(id, body);
  }

  @Post("memberships/:id/freeze")
  @RequiresPermission("member.manage")
  freeze(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(freezeSchema)) body: FreezeInput) {
    return this.memberships.freeze(id, body);
  }

  @Post("memberships/:id/cancel")
  @RequiresPermission("member.manage")
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.memberships.cancel(id);
  }
}

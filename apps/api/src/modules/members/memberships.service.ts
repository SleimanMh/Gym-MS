import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  addDays,
  dateOnly,
  subscriptionEndsOn,
  daysBetween,
  localDate,
  toDateColumn,
  type FreezeInput,
  type SellMembershipInput,
} from "@gym/shared";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { PaymentsService } from "../billing/payments.service";

export { subscriptionEndsOn };

/** Selling, freezing and cancelling memberships (PLAN.md section 6.3). */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly db: TenantDb,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  sell(memberId: string, input: SellMembershipInput) {
    const tenant = requireTenant();
    const userId = requirePrincipal().userId;
    return this.db.run(async (tx) => {
      const [member, plan] = await Promise.all([
        tx.member.findFirst({ where: { id: memberId, deletedAt: null } }),
        tx.membershipPlan.findFirst({ where: { id: input.planId, isActive: true } }),
      ]);
      if (!member) throw new NotFoundException({ code: "MEMBER_NOT_FOUND" });
      if (!plan) throw new NotFoundException({ code: "PLAN_NOT_FOUND" });

      const startsOn = input.startsOn ?? localDate(new Date(), tenant.timezone);
      const endsOn = subscriptionEndsOn(plan, startsOn);
      const free = plan.priceMinor === 0n;

      const subscription = await tx.memberSubscription.create({
        data: {
          tenantId: tenant.id,
          memberId,
          planId: plan.id,
          status: free ? "active" : "pending",
          startsOn: toDateColumn(startsOn),
          endsOn: endsOn ? toDateColumn(endsOn) : null,
          autoRenew: plan.type === "recurring" && input.autoRenew,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          unlimited: plan.credits === null,
          createdByUserId: userId,
        },
      });
      if (plan.credits) {
        await tx.creditEntry.create({
          data: { tenantId: tenant.id, memberId, subscriptionId: subscription.id, delta: plan.credits, reason: "purchase" },
        });
      }

      let payment = null;
      if (input.payment && !free) {
        payment = await this.payments.record(
          tx,
          tenant.id,
          {
            memberId,
            subscriptionId: subscription.id,
            amountMinor: Number(plan.priceMinor),
            method: input.payment.method,
            note: input.payment.note,
            currency: plan.currency,
          },
          userId,
        );
      }
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "membership.sold",
        entityType: "member_subscription",
        entityId: subscription.id,
        data: { planId: plan.id, priceMinor: plan.priceMinor.toString(), paid: !!payment },
      });
      const fresh = await tx.memberSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
      return { subscription: fresh, paymentId: payment?.id ?? null, receiptNumber: payment?.receiptNumber ?? null };
    });
  }

  /** Pauses a membership; its end date moves out by the frozen days. */
  freeze(subscriptionId: string, input: FreezeInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const sub = await tx.memberSubscription.findFirst({ where: { id: subscriptionId }, include: { freezes: true } });
      if (!sub) throw new NotFoundException();
      if (sub.status !== "active") throw new ConflictException({ code: "MEMBERSHIP_NOT_ACTIVE" });
      if (sub.endsOn && input.startsOn > dateOnly(sub.endsOn)) {
        throw new ConflictException({ code: "FREEZE_AFTER_END" });
      }
      const overlaps = sub.freezes.some((f) => input.startsOn <= dateOnly(f.endsOn) && dateOnly(f.startsOn) <= input.endsOn);
      if (overlaps) throw new ConflictException({ code: "FREEZE_OVERLAPS" });

      const days = daysBetween(input.startsOn, input.endsOn) + 1;
      await tx.subscriptionFreeze.create({
        data: {
          tenantId: tenant.id,
          subscriptionId,
          startsOn: toDateColumn(input.startsOn),
          endsOn: toDateColumn(input.endsOn),
          reason: input.reason ?? null,
        },
      });
      const updated = await tx.memberSubscription.update({
        where: { id: subscriptionId },
        data: sub.endsOn ? { endsOn: toDateColumn(addDays(dateOnly(sub.endsOn), days)) } : {},
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "membership.frozen",
        entityType: "member_subscription",
        entityId: subscriptionId,
        data: { ...input, days },
      });
      return updated;
    });
  }

  cancel(subscriptionId: string) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.memberSubscription.updateMany({
        where: { id: subscriptionId, status: { in: ["active", "pending"] } },
        data: { status: "cancelled", cancelledAt: new Date(), autoRenew: false },
      });
      if (!res.count) throw new NotFoundException();
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "membership.cancelled",
        entityType: "member_subscription",
        entityId: subscriptionId,
      });
      return { ok: true };
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantTx } from "@gym/db";
import type { RecordPaymentInput } from "@gym/shared";
import { AuditService } from "../audit/audit.service";

/**
 * Cash / card terminal / bank transfer recorded at the front desk (PLAN.md section 6.5, Phase 1).
 * Online payments and invoices arrive with the gateway abstraction in Phase 2.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly audit: AuditService) {}

  /** Records a payment with the tenant's next receipt number; activates a pending membership it pays for. */
  async record(tx: TenantTx, tenantId: string, input: RecordPaymentInput & { currency: string }, byUserId: string | null) {
    const member = await tx.member.findFirst({ where: { id: input.memberId, deletedAt: null } });
    if (!member) throw new NotFoundException({ code: "MEMBER_NOT_FOUND" });

    let subscription = null;
    if (input.subscriptionId) {
      subscription = await tx.memberSubscription.findFirst({
        where: { id: input.subscriptionId, memberId: member.id },
      });
      if (!subscription) throw new NotFoundException({ code: "MEMBERSHIP_NOT_FOUND" });
      if (subscription.currency !== input.currency) throw new BadRequestException({ code: "CURRENCY_MISMATCH" });
    }

    const counter = await tx.$queryRaw<{ value: number }[]>`SELECT app_next_counter('receipt') AS value`;
    const receiptNumber = counter[0]!.value;
    const payment = await tx.payment.create({
      data: {
        tenantId,
        memberId: member.id,
        subscriptionId: subscription?.id ?? null,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        method: input.method,
        note: input.note ?? null,
        receiptNumber,
        receivedByUserId: byUserId,
      },
    });

    if (subscription?.status === "pending") {
      const paid = await tx.payment.aggregate({
        where: { subscriptionId: subscription.id, status: "succeeded" },
        _sum: { amountMinor: true },
      });
      if ((paid._sum.amountMinor ?? 0n) >= subscription.priceMinor) {
        await tx.memberSubscription.update({ where: { id: subscription.id }, data: { status: "active" } });
      }
    }

    await this.audit.record(tx, {
      tenantId,
      action: "payment.recorded",
      entityType: "payment",
      entityId: payment.id,
      data: { amountMinor: payment.amountMinor.toString(), currency: payment.currency, method: payment.method },
    });
    return payment;
  }
}

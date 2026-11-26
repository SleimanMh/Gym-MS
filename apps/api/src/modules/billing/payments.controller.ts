import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { recordPaymentSchema, type RecordPaymentInput } from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { PaymentsService } from "./payments.service";

@Controller("v1/payments")
@RequiresFeature("payments.manual")
export class PaymentsController {
  constructor(
    private readonly db: TenantDb,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @RequiresPermission("payment.take")
  list(@Query(new ZodPipe(z.object({ memberId: z.string().uuid().optional() }))) q: { memberId?: string }) {
    return this.db.run((tx) =>
      tx.payment.findMany({
        where: q.memberId ? { memberId: q.memberId } : {},
        include: { member: { select: { firstName: true, lastName: true } } },
        orderBy: { paidAt: "desc" },
        take: 100,
      }),
    );
  }

  @Post()
  @RequiresPermission("payment.take")
  record(@Body(new ZodPipe(recordPaymentSchema)) body: RecordPaymentInput) {
    const tenant = requireTenant();
    return this.db.run((tx) =>
      this.payments.record(tx, tenant.id, { ...body, currency: tenant.currency }, requirePrincipal().userId),
    );
  }

  /** Everything a printable receipt needs. */
  @Get(":id/receipt")
  @RequiresPermission("payment.take")
  async receipt(@Param("id", ParseUUIDPipe) id: string) {
    const tenant = requireTenant();
    const data = await this.db.run(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id },
        include: {
          member: { select: { firstName: true, lastName: true, email: true, phone: true } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
      });
      if (!payment) return null;
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: tenant.id } });
      return { payment, settings };
    });
    if (!data) throw new NotFoundException();
    const { payment, settings } = data;
    return {
      gym: { name: tenant.name, logoUrl: settings?.logoUrl ?? null, primaryColor: settings?.primaryColor ?? null },
      receiptNumber: payment.receiptNumber,
      paidAt: payment.paidAt,
      method: payment.method,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      note: payment.note,
      member: payment.member,
      item: payment.subscription ? payment.subscription.plan.name : null,
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { Prisma, TenantTx } from "@gym/db";
import { currentContext } from "../../common/request-context";

/** Appends to audit_logs inside the caller's tenant transaction (PLAN.md sections 6.12 and 14). */
@Injectable()
export class AuditService {
  async record(
    tx: TenantTx,
    entry: { tenantId: string; action: string; entityType: string; entityId?: string; data?: Prisma.InputJsonValue },
  ): Promise<void> {
    const ctx = currentContext();
    await tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: ctx.principal?.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        data: entry.data,
        requestId: ctx.requestId,
      },
    });
  }
}

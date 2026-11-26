import { Injectable } from "@nestjs/common";
import { withTenant, type TenantTx } from "@gym/db";
import { requireTenant } from "../common/request-context";
import { PrismaService } from "./prisma.service";

/**
 * The request-scoped tenant database client (CLAUDE.md: "Never query outside the request-scoped
 * DB client that sets app.tenant_id"). Reads the tenant from the request context and runs `fn`
 * in a transaction with app.tenant_id set, so RLS filters every statement.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.prisma, requireTenant().id, fn);
  }

  /** For code that already knows the tenant (platform console, jobs). */
  runFor<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.prisma, tenantId, fn);
  }
}

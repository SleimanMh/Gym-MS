import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@gym/db";
import { ENV, type Env } from "../config/env";

/**
 * Raw client, connected as gym_app (RLS always applies).
 * Modules must not use it for tenant-owned tables — use TenantDb.run() instead.
 * Direct use is limited to platform tables (tenants, plans, users, ...).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL, log: ["warn", "error"] });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

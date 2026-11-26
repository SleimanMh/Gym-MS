import { Global, Module } from "@nestjs/common";
import { ENV, loadEnv } from "../config/env";
import { PrismaService } from "./prisma.service";
import { TenantDb } from "./tenant-db.service";
import { CacheService } from "./cache.service";

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, PrismaService, TenantDb, CacheService],
  exports: [ENV, PrismaService, TenantDb, CacheService],
})
export class InfraModule {}

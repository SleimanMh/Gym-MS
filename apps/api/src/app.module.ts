import "./common/bigint-json";
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./common/access.guard";
import { corsMiddleware } from "./common/cors";
import { loadEnv } from "./config/env";
import { InfraModule } from "./infra/infra.module";
import { EntitlementsModule } from "./modules/entitlements/entitlements.module";
import { GymModule } from "./modules/gym/gym.module";
import { HealthController } from "./modules/health/health.controller";
import { IdentityModule } from "./modules/identity/identity.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { RequestContextMiddleware } from "./modules/tenancy/request-context.middleware";
import { TenancyModule } from "./modules/tenancy/tenancy.module";
import { UsersModule } from "./modules/users/users.module";

/**
 * Modular monolith (PLAN.md section 3). One folder per domain under src/modules.
 * Phase 0: tenancy, identity, entitlements, platform, audit, health. Phase 1: GymModule.
 */
@Module({
  imports: [InfraModule, EntitlementsModule, IdentityModule, TenancyModule, PlatformModule, GymModule, UsersModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(corsMiddleware(loadEnv().ADMIN_ORIGINS), RequestContextMiddleware)
      .forRoutes({ path: "{*splat}", method: RequestMethod.ALL });
  }
}

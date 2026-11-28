import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { IdentityModule } from "../identity/identity.module";
import { OutboxService } from "../notifications/outbox.service";
import { LocalAuthController } from "./local-auth.controller";
import { UsersController } from "./users.controller";

/** Staff sign-in (email + password) and the owner's Users & access console (ADR 0007). */
@Module({
  imports: [EntitlementsModule, IdentityModule],
  controllers: [LocalAuthController, UsersController],
  providers: [AuditService, OutboxService],
})
export class UsersModule {}

import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { OutboxService } from "../notifications/outbox.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [EntitlementsModule],
  controllers: [PlatformController],
  providers: [PlatformService, AuditService, OutboxService],
})
export class PlatformModule {}

import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { IdentityModule } from "../identity/identity.module";
import { LocationsController } from "./locations.controller";

@Module({
  imports: [IdentityModule, EntitlementsModule],
  controllers: [LocationsController],
  providers: [AuditService],
})
export class TenancyModule {}

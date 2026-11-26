import { Module } from "@nestjs/common";
import { loadEnv } from "../../config/env";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { AuthService } from "./auth.service";
import { DevTokenController } from "./dev-token.controller";
import { IdentityService } from "./identity.service";
import { MeController } from "./me.controller";

const devTokens = loadEnv().AUTH_DEV_TOKENS;

@Module({
  imports: [EntitlementsModule],
  controllers: [MeController, ...(devTokens ? [DevTokenController] : [])],
  providers: [AuthService, IdentityService],
  exports: [AuthService, IdentityService],
})
export class IdentityModule {}

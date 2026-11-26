import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { assignPlanSchema, createTenantSchema, type AssignPlanInput, type CreateTenantInput } from "@gym/shared";
import { PlatformOnly } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { PlatformService } from "./platform.service";

@Controller("v1/platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get("tenants")
  @PlatformOnly("super_admin", "support")
  listTenants() {
    return this.platform.listTenants();
  }

  @Post("tenants")
  @PlatformOnly("super_admin")
  createTenant(@Body(new ZodPipe(createTenantSchema)) body: CreateTenantInput) {
    return this.platform.createTenant(body);
  }

  @Put("tenants/:id/plan")
  @PlatformOnly("super_admin")
  assignPlan(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(assignPlanSchema)) body: AssignPlanInput) {
    return this.platform.assignPlan(id, body);
  }

  @Get("plans")
  @PlatformOnly("super_admin", "support")
  plans() {
    return this.platform.listPlans();
  }
}

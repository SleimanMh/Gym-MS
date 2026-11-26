import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { z } from "zod";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";

const stageSchema = z.object({ stage: z.enum(["new", "contacted", "trial", "member", "lost"]) });

/**
 * Leads captured by the website form (PLAN.md section 6.4). Phase 1 lists them and moves them
 * through stages; the full pipeline (assignment, activities, conversion) is Phase 2.
 */
@Controller("v1/leads")
@RequiresFeature("crm.leads")
export class LeadsController {
  constructor(private readonly db: TenantDb) {}

  @Get()
  @RequiresPermission("member.view")
  list() {
    return this.db.run((tx) => tx.lead.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
  }

  @Patch(":id")
  @RequiresPermission("member.manage")
  async setStage(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(stageSchema)) body: z.infer<typeof stageSchema>) {
    const res = await this.db.run((tx) => tx.lead.updateMany({ where: { id }, data: { stage: body.stage } }));
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}

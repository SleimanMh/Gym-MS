import { Controller, Get } from "@nestjs/common";
import { FEATURE_LABELS, LIMIT_LABELS, lowestPlanWith, type FeatureKey } from "@gym/shared";
import { RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { EntitlementsService } from "./entitlements.service";

@Controller("v1/entitlements")
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  /** The tenant's plan with every feature marked on/off, for Settings → Plan and upgrade cards. */
  @Get()
  @RequiresPermission("location.view")
  async list() {
    const ent = await this.entitlements.get(requireTenant().id);
    return {
      planCode: ent.planCode,
      features: (Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => ({
        key,
        label: FEATURE_LABELS[key],
        enabled: ent.features.includes(key),
        availableOn: lowestPlanWith(key),
      })),
      limits: Object.entries(LIMIT_LABELS).map(([key, label]) => ({
        key,
        label,
        value: ent.limits[key as keyof typeof ent.limits] ?? 0,
      })),
    };
  }
}

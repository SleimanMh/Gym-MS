import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  computeEntitlements,
  lowestPlanWith,
  withinLimit,
  type EffectiveEntitlements,
  type FeatureKey,
  type LimitKey,
} from "@gym/shared";
import { CacheService } from "../../infra/cache.service";
import { PrismaService } from "../../infra/prisma.service";

const TTL_SECONDS = 60;
const cacheKey = (tenantId: string) => `entitlements:${tenantId}`;

/** Effective entitlements = plan + add-ons + overrides, cached per tenant (PLAN.md section 7). */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async get(tenantId: string): Promise<EffectiveEntitlements> {
    const cached = await this.cache.get<EffectiveEntitlements>(cacheKey(tenantId));
    if (cached) return cached;

    const [subscription, overrides] = await Promise.all([
      this.prisma.tenantSubscription.findFirst({
        where: { tenantId, isCurrent: true },
        include: { plan: { include: { features: true } } },
      }),
      this.prisma.tenantFeatureOverride.findMany({ where: { tenantId } }),
    ]);

    const result = computeEntitlements({
      planCode: subscription?.plan.code ?? null,
      planFeatures: subscription?.plan.features ?? [],
      overrides,
    });
    await this.cache.set(cacheKey(tenantId), result, TTL_SECONDS);
    return result;
  }

  async invalidate(tenantId: string): Promise<void> {
    await this.cache.del(cacheKey(tenantId));
  }

  async has(tenantId: string, feature: FeatureKey): Promise<boolean> {
    return (await this.get(tenantId)).features.includes(feature);
  }

  /** Throws 403 LIMIT_REACHED when one more item would exceed the plan limit. */
  async assertWithinLimit(tenantId: string, key: LimitKey, currentCount: number): Promise<void> {
    const ent = await this.get(tenantId);
    if (!withinLimit(ent, key, currentCount)) {
      throw new ForbiddenException({
        code: "LIMIT_REACHED",
        limit: key,
        max: ent.limits[key] ?? 0,
        message: "Your plan's limit is reached. Upgrade to add more.",
      });
    }
  }

  static featureDenied(feature: FeatureKey) {
    return new ForbiddenException({
      code: "FEATURE_NOT_IN_PLAN",
      feature,
      requiredPlan: lowestPlanWith(feature),
    });
  }
}

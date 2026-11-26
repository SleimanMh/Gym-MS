import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { createLocationSchema, LIMITS, type CreateLocationInput } from "@gym/shared";
import { RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "location";

@Controller("v1/locations")
export class LocationsController {
  constructor(
    private readonly db: TenantDb,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequiresPermission("location.view")
  list() {
    return this.db.run((tx) =>
      tx.location.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
    );
  }

  /** Another tenant's id returns 404, never 403 — RLS makes the row invisible. */
  @Get(":id")
  @RequiresPermission("location.view")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const loc = await this.db.run((tx) => tx.location.findFirst({ where: { id, deletedAt: null } }));
    if (!loc) throw new NotFoundException();
    return loc;
  }

  @Post()
  @RequiresPermission("location.manage")
  create(@Body(new ZodPipe(createLocationSchema)) body: CreateLocationInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const count = await tx.location.count({ where: { deletedAt: null } });
      await this.entitlements.assertWithinLimit(tenant.id, LIMITS.LOCATIONS, count);

      let slug = slugify(body.name);
      if (await tx.location.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug } } })) {
        slug = `${slug}-${count + 1}`;
      }
      const loc = await tx.location.create({
        data: { tenantId: tenant.id, slug, name: body.name, timezone: body.timezone, address: body.address },
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "location.created",
        entityType: "location",
        entityId: loc.id,
      });
      return loc;
    });
  }
}

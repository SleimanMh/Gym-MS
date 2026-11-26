import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { generateApiKey, Prisma } from "@gym/db";
import { allowedOriginSchema, bookingPolicySchema, toDateColumn, type BookingPolicyInput } from "@gym/shared";
import { RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { CacheService } from "../../infra/cache.service";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(80),
  locationId: z.string().uuid().optional(),
});

/** Gym settings used by Phase 1: booking policy, website (widget) access, holidays. */
@Controller("v1/settings")
export class SettingsController {
  constructor(
    private readonly db: TenantDb,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequiresPermission("tenant.settings.manage")
  get() {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const [settings, origins, keys, holidays] = await Promise.all([
        tx.tenantSettings.findUnique({ where: { tenantId: t.id } }),
        tx.allowedOrigin.findMany({ orderBy: { createdAt: "asc" } }),
        tx.apiKey.findMany({
          where: { revokedAt: null },
          select: { id: true, type: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        tx.holiday.findMany({ where: { date: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { date: "asc" } }),
      ]);
      return {
        slug: t.slug,
        bookingPolicy: settings && {
          bookingWindowDays: settings.bookingWindowDays,
          cancellationCutoffMin: settings.cancellationCutoffMin,
          lateCancelPolicy: settings.lateCancelPolicy,
          waitlistAutoPromote: settings.waitlistAutoPromote,
          waitlistPromoteCutoffMin: settings.waitlistPromoteCutoffMin,
          reminderLeadMin: settings.reminderLeadMin,
        },
        allowedOrigins: origins,
        apiKeys: keys,
        holidays,
      };
    });
  }

  @Put("booking-policy")
  @RequiresPermission("tenant.settings.manage")
  bookingPolicy(@Body(new ZodPipe(bookingPolicySchema)) body: BookingPolicyInput) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const s = await tx.tenantSettings.upsert({
        where: { tenantId: t.id },
        create: { tenantId: t.id, ...body },
        update: body,
      });
      await this.audit.record(tx, { tenantId: t.id, action: "settings.booking_policy", entityType: "tenant", entityId: t.id, data: body });
      return s;
    });
  }

  @Post("allowed-origins")
  @RequiresPermission("tenant.settings.manage")
  async addOrigin(@Body(new ZodPipe(allowedOriginSchema)) body: { origin: string }) {
    const t = requireTenant();
    const row = await this.db.run(async (tx) => {
      try {
        return await tx.allowedOrigin.create({ data: { tenantId: t.id, origin: body.origin } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictException({ code: "ORIGIN_EXISTS" });
        throw e;
      }
    });
    await this.cache.del(`origins:${t.id}`);
    return row;
  }

  @Delete("allowed-origins/:id")
  @RequiresPermission("tenant.settings.manage")
  async removeOrigin(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    const res = await this.db.run((tx) => tx.allowedOrigin.deleteMany({ where: { id } }));
    if (!res.count) throw new NotFoundException();
    await this.cache.del(`origins:${t.id}`);
    return { ok: true };
  }

  /** New publishable key for the widget. The full key is shown once; only its hash is stored. */
  @Post("api-keys")
  @RequiresPermission("tenant.settings.manage")
  createKey() {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const { key, prefix, hash } = generateApiKey("publishable");
      const row = await tx.apiKey.create({
        data: { tenantId: t.id, type: "publishable", name: "Website widget", prefix, keyHash: hash },
      });
      await this.audit.record(tx, { tenantId: t.id, action: "api_key.created", entityType: "api_key", entityId: row.id });
      return { id: row.id, prefix, key };
    });
  }

  @Delete("api-keys/:id")
  @RequiresPermission("tenant.settings.manage")
  revokeKey(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!res.count) throw new NotFoundException();
      await this.audit.record(tx, { tenantId: t.id, action: "api_key.revoked", entityType: "api_key", entityId: id });
      return { ok: true };
    });
  }

  @Post("holidays")
  @RequiresPermission("schedule.manage")
  addHoliday(@Body(new ZodPipe(holidaySchema)) body: z.infer<typeof holidaySchema>) {
    const t = requireTenant();
    return this.db.run((tx) =>
      tx.holiday.create({
        data: { tenantId: t.id, date: toDateColumn(body.date), name: body.name, locationId: body.locationId ?? null },
      }),
    );
  }

  @Delete("holidays/:id")
  @RequiresPermission("schedule.manage")
  async removeHoliday(@Param("id", ParseUUIDPipe) id: string) {
    const res = await this.db.run((tx) => tx.holiday.deleteMany({ where: { id } }));
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }
}

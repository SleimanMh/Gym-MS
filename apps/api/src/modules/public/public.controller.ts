import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Ip, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  addDays,
  leadSchema,
  localDate,
  memberCodeStartSchema,
  memberCodeVerifySchema,
  publicSessionsQuerySchema,
  zonedToUtc,
  type LeadInput,
} from "@gym/shared";
import { Public, RequiresFeature } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { CacheService } from "../../infra/cache.service";
import { TenantDb } from "../../infra/tenant-db.service";
import { OutboxService } from "../notifications/outbox.service";
import { MemberAuthService } from "./member-auth.service";

/**
 * Public, read-mostly API for the website widget and hosted booking pages (PLAN.md section 10).
 * Tenant comes from the publishable key (x-api-key), the domain, or x-tenant-slug; browser calls
 * must come from the gym's allowed origins (checked in RequestContextMiddleware).
 */
@Controller("v1/public")
export class PublicController {
  constructor(
    private readonly db: TenantDb,
    private readonly cache: CacheService,
    private readonly outbox: OutboxService,
    private readonly memberAuth: MemberAuthService,
  ) {}

  @Get("tenant")
  @Public({ tenant: true })
  async tenant() {
    const t = requireTenant();
    const settings = await this.db.run((tx) => tx.tenantSettings.findUnique({ where: { tenantId: t.id } }));
    return {
      slug: t.slug,
      name: t.name,
      defaultLanguage: t.defaultLanguage,
      timezone: t.timezone,
      currency: t.currency,
      bookingWindowDays: settings?.bookingWindowDays ?? 7,
      cancellationCutoffMin: settings?.cancellationCutoffMin ?? 120,
      branding: {
        primaryColor: settings?.primaryColor ?? "#2563EB",
        logoUrl: settings?.logoUrl ?? null,
        poweredByVisible: settings?.poweredByVisible ?? true,
      },
    };
  }

  @Get("locations")
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  locations() {
    return this.db.run((tx) =>
      tx.location.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, slug: true, name: true, address: true, timezone: true },
        orderBy: { createdAt: "asc" },
      }),
    );
  }

  /** Upcoming classes with spots left. Limited to the gym's booking window. */
  @Get("sessions")
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  async sessions(@Query(new ZodPipe(publicSessionsQuerySchema)) q: z.infer<typeof publicSessionsQuerySchema>) {
    const t = requireTenant();
    const today = localDate(new Date(), t.timezone);
    const from = q.from && q.from > today ? q.from : today;
    return this.db.run(async (tx) => {
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: t.id } });
      const lastDay = addDays(today, settings?.bookingWindowDays ?? 7);
      const to = addDays(from, q.days - 1) < lastDay ? addDays(from, q.days - 1) : lastDay;
      const sessions = await tx.session.findMany({
        where: {
          status: "scheduled",
          startsAt: { gte: new Date(Math.max(Date.now(), zonedToUtc(from, 0, t.timezone).getTime())), lt: zonedToUtc(addDays(to, 1), 0, t.timezone) },
          location: { deletedAt: null, ...(q.location ? { slug: q.location } : {}) },
        },
        include: {
          classType: { select: { name: true, color: true, description: true } },
          location: { select: { slug: true, name: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 500,
      });
      const trainerIds = [...new Set(sessions.map((s) => s.trainerUserId).filter((x): x is string => !!x))];
      const trainers = trainerIds.length
        ? await tx.user.findMany({ where: { id: { in: trainerIds } }, select: { id: true, firstName: true } })
        : [];
      const trainerName = new Map(trainers.map((u) => [u.id, u.firstName]));
      return sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        className: s.classType.name,
        color: s.classType.color,
        description: s.classType.description,
        location: s.location,
        trainer: s.trainerUserId ? (trainerName.get(s.trainerUserId) ?? null) : null,
        capacity: s.capacity,
        spotsLeft: Math.max(0, s.capacity - s.bookedCount),
      }));
    });
  }

  @Get("plans")
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  plans() {
    return this.db.run((tx) =>
      tx.membershipPlan.findMany({
        where: { isActive: true, isPublic: true },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          priceMinor: true,
          currency: true,
          billingPeriod: true,
          durationDays: true,
          credits: true,
        },
        orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }],
      }),
    );
  }

  /** Website "free trial / contact me" form → a lead in the CRM. */
  @Post("leads")
  @HttpCode(201)
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  async lead(@Body(new ZodPipe(leadSchema)) body: LeadInput, @Ip() ip: string) {
    const t = requireTenant();
    if ((await this.cache.incr(`rl:lead:${t.id}:${ip}`, 3600)) > 10) {
      throw new HttpException({ code: "RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.db.run(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          tenantId: t.id,
          firstName: body.firstName,
          lastName: body.lastName ?? null,
          email: body.email ?? null,
          phone: body.phone ?? null,
          message: body.message ?? null,
          locationId: body.locationId ?? null,
          source: "widget",
        },
      });
      await this.outbox.enqueue(tx, t.id, "lead.created", { leadId: lead.id });
    });
    return { ok: true };
  }

  @Post("member-auth/start")
  @HttpCode(200)
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  startLogin(@Body(new ZodPipe(memberCodeStartSchema)) body: { email: string }, @Ip() ip: string) {
    return this.memberAuth.start(body.email, ip);
  }

  @Post("member-auth/verify")
  @HttpCode(200)
  @Public({ tenant: true })
  @RequiresFeature("widget.embed")
  verifyLogin(@Body(new ZodPipe(memberCodeVerifySchema)) body: { email: string; code: string }, @Ip() ip: string) {
    return this.memberAuth.verify(body.email, body.code, ip);
  }
}

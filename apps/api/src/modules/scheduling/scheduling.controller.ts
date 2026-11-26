import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  cancelSessionSchema,
  createClassTypeSchema,
  createScheduleSchema,
  createSessionSchema,
  parseHhMm,
  sessionsQuerySchema,
  toDateColumn,
  localDate,
  zonedToUtc,
  addDays,
  type CreateClassTypeInput,
  type CreateScheduleInput,
  type CreateSessionInput,
  type SessionsQuery,
} from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { generateSessions } from "@gym/db";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { BookingService } from "../booking/booking.service";

/** Class types, weekly schedules and sessions (PLAN.md section 6.1). */
@Controller("v1")
@RequiresFeature("booking.core")
export class SchedulingController {
  constructor(
    private readonly db: TenantDb,
    private readonly booking: BookingService,
    private readonly audit: AuditService,
  ) {}

  // ── Class types ──

  @Get("class-types")
  @RequiresPermission("schedule.view")
  classTypes() {
    return this.db.run((tx) => tx.classType.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }));
  }

  @Post("class-types")
  @RequiresPermission("schedule.manage")
  createClassType(@Body(new ZodPipe(createClassTypeSchema)) body: CreateClassTypeInput) {
    const tenant = requireTenant();
    return this.db.run((tx) => tx.classType.create({ data: { tenantId: tenant.id, ...body } }));
  }

  @Delete("class-types/:id")
  @RequiresPermission("schedule.manage")
  async archiveClassType(@Param("id", ParseUUIDPipe) id: string) {
    const res = await this.db.run((tx) =>
      tx.classType.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } }),
    );
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }

  // ── Trainers (staff who can lead classes) ──

  @Get("trainers")
  @RequiresPermission("schedule.view")
  trainers() {
    return this.db.run(async (tx) => {
      const roles = await tx.userRole.findMany({
        where: { roleKey: { in: ["trainer", "owner", "manager"] } },
        select: { userId: true },
      });
      const ids = [...new Set(roles.map((r) => r.userId))];
      const users = await tx.tenantMembership.findMany({
        where: { userId: { in: ids }, status: "active" },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
      return users.map((m) => m.user);
    });
  }

  // ── Weekly schedules ──

  @Get("schedules")
  @RequiresPermission("schedule.view")
  schedules() {
    return this.db.run((tx) =>
      tx.schedule.findMany({
        where: { isActive: true },
        include: { classType: { select: { name: true, color: true } }, location: { select: { name: true } } },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
    );
  }

  @Post("schedules")
  @RequiresPermission("schedule.manage")
  createSchedule(@Body(new ZodPipe(createScheduleSchema)) body: CreateScheduleInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const [location, classType] = await Promise.all([
        tx.location.findFirst({ where: { id: body.locationId, deletedAt: null } }),
        tx.classType.findFirst({ where: { id: body.classTypeId, deletedAt: null } }),
      ]);
      if (!location || !classType) throw new NotFoundException({ code: "LOCATION_OR_CLASS_TYPE_NOT_FOUND" });
      const today = localDate(new Date(), location.timezone ?? tenant.timezone);

      const schedule = await tx.schedule.create({
        data: {
          tenantId: tenant.id,
          locationId: body.locationId,
          classTypeId: body.classTypeId,
          roomId: body.roomId,
          trainerUserId: body.trainerUserId,
          weekday: body.weekday,
          startMinute: parseHhMm(body.startTime),
          durationMin: body.durationMin ?? classType.durationMin,
          capacity: body.capacity ?? classType.defaultCapacity,
          validFrom: toDateColumn(body.validFrom ?? today),
          validUntil: body.validUntil ? toDateColumn(body.validUntil) : null,
        },
      });
      const sessionsCreated = await generateSessions(tx, tenant, { scheduleId: schedule.id });
      return { ...schedule, sessionsCreated };
    });
  }

  /** Stops a weekly class. Future sessions without bookings are removed; booked ones stay until cancelled. */
  @Delete("schedules/:id")
  @RequiresPermission("schedule.manage")
  async deleteSchedule(@Param("id", ParseUUIDPipe) id: string) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.schedule.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
      if (!res.count) throw new NotFoundException();
      const removed = await tx.session.deleteMany({
        where: { scheduleId: id, startsAt: { gt: new Date() }, bookedCount: 0, waitlist: { none: {} } },
      });
      await this.audit.record(tx, { tenantId: tenant.id, action: "schedule.deleted", entityType: "schedule", entityId: id });
      return { ok: true, sessionsRemoved: removed.count };
    });
  }

  @Post("schedules/generate")
  @RequiresPermission("schedule.manage")
  async generate() {
    const tenant = requireTenant();
    const created = await this.db.run((tx) => generateSessions(tx, tenant));
    return { sessionsCreated: created };
  }

  // ── Sessions ──

  @Get("sessions")
  @RequiresPermission("schedule.view")
  sessions(@Query(new ZodPipe(sessionsQuerySchema)) q: SessionsQuery) {
    const tenant = requireTenant();
    return this.db.run((tx) =>
      tx.session.findMany({
        where: {
          startsAt: { gte: zonedToUtc(q.from, 0, tenant.timezone), lt: zonedToUtc(addDays(q.to, 1), 0, tenant.timezone) },
          ...(q.locationId ? { locationId: q.locationId } : {}),
        },
        include: {
          classType: { select: { name: true, color: true } },
          location: { select: { name: true } },
          _count: { select: { waitlist: { where: { status: "waiting" } } } },
        },
        orderBy: { startsAt: "asc" },
        take: 1000,
      }),
    );
  }

  /** Session with its roster and waitlist — the trainer / front-desk view of one class. */
  @Get("sessions/:id")
  @RequiresPermission("schedule.view")
  async session(@Param("id", ParseUUIDPipe) id: string) {
    const s = await this.db.run((tx) =>
      tx.session.findFirst({
        where: { id },
        include: {
          classType: true,
          location: { select: { id: true, name: true, timezone: true } },
          bookings: {
            where: { status: { not: "cancelled" } },
            include: { member: { select: { id: true, firstName: true, lastName: true, phone: true } } },
            orderBy: { createdAt: "asc" },
          },
          waitlist: {
            where: { status: "waiting" },
            include: { member: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    );
    if (!s) throw new NotFoundException();
    return s;
  }

  @Post("sessions")
  @RequiresPermission("schedule.manage")
  createSession(@Body(new ZodPipe(createSessionSchema)) body: CreateSessionInput) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const [location, classType] = await Promise.all([
        tx.location.findFirst({ where: { id: body.locationId, deletedAt: null } }),
        tx.classType.findFirst({ where: { id: body.classTypeId, deletedAt: null } }),
      ]);
      if (!location || !classType) throw new NotFoundException({ code: "LOCATION_OR_CLASS_TYPE_NOT_FOUND" });
      const startsAt = zonedToUtc(body.date, parseHhMm(body.startTime), location.timezone ?? tenant.timezone);
      const durationMin = body.durationMin ?? classType.durationMin;
      return tx.session.create({
        data: {
          tenantId: tenant.id,
          locationId: body.locationId,
          classTypeId: body.classTypeId,
          roomId: body.roomId,
          trainerUserId: body.trainerUserId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
          capacity: body.capacity ?? classType.defaultCapacity,
        },
      });
    });
  }

  /** The gym cancels a class: every booking is cancelled with credits returned, members are emailed. */
  @Post("sessions/:id/cancel")
  @RequiresPermission("schedule.manage")
  cancelSession(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelSessionSchema)) body: { reason?: string },
  ) {
    return this.booking.cancelSession(id, body.reason);
  }
}

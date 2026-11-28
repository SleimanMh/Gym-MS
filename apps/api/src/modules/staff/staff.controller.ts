import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Prisma, type TenantTx } from "@gym/db";
import {
  addDays,
  addMonths,
  calendarQuery,
  clockSchema,
  employeeSchema,
  localDate,
  minorDigits,
  monthStr,
  parseHhMm,
  shiftSchema,
  toDateColumn,
  updateEmployeeSchema,
  zonedToUtc,
  type EmployeeInput,
  type ShiftInput,
} from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { staffStats, type EmployeeMonthStats } from "./staff-stats";

const monthQuery = z.object({ month: monthStr.optional() });
const rangeQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** What the team screens show; pay (and where it's booked) only for people allowed to see pay. */
function viewStats(s: EmployeeMonthStats, canSeePay: boolean) {
  const { payByLocation: _byLoc, hoursByLocation: _h, classesByLocation: _c, ...rest } = s;
  return { ...rest, pay: canSeePay ? s.pay : null };
}

/** Staff, shifts, the time clock and payroll (PLAN.md section 6.6). */
@Controller("v1")
@RequiresFeature("staff.management")
export class StaffController {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  /** [from, to) of a month in the gym's time zone; defaults to the current month. */
  private monthRange(month?: string) {
    const t = requireTenant();
    const first = `${month ?? localDate(new Date(), t.timezone).slice(0, 7)}-01`;
    return { month: first.slice(0, 7), from: zonedToUtc(first, 0, t.timezone), to: zonedToUtc(addMonths(first, 1), 0, t.timezone) };
  }

  // ── Team ──

  @Get("staff")
  @RequiresPermission("staff.view")
  list(@Query(new ZodPipe(monthQuery)) q: { month?: string }) {
    const r = this.monthRange(q.month);
    const canSeePay = requirePrincipal().permissions.includes("finance.view") || requirePrincipal().permissions.includes("staff.manage");
    return this.db.run(async (tx) => {
      const [employees, stats, open] = await Promise.all([
        tx.employee.findMany({ orderBy: [{ status: "asc" }, { firstName: "asc" }] }),
        staffStats(tx, r.from, r.to),
        tx.timeEntry.findMany({ where: { clockOut: null }, select: { employeeId: true, clockIn: true } }),
      ]);
      const clockedIn = new Map(open.map((o) => [o.employeeId, o.clockIn]));
      return {
        month: r.month,
        employees: employees.map((e) => {
          const s = stats.get(e.id)!;
          return {
            ...e,
            payRateMinor: canSeePay ? e.payRateMinor : null,
            clockedInSince: clockedIn.get(e.id) ?? null,
            stats: viewStats(s, canSeePay),
          };
        }),
      };
    });
  }

  @Post("staff")
  @RequiresPermission("staff.manage")
  create(@Body(new ZodPipe(employeeSchema)) body: EmployeeInput) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      try {
        const e = await tx.employee.create({
          data: {
            tenantId: t.id,
            ...body,
            payRateMinor: BigInt(body.payRateMinor),
            currency: t.currency,
            startedOn: toDateColumn(body.startedOn ?? localDate(new Date(), t.timezone)),
          },
        });
        await this.audit.record(tx, { tenantId: t.id, action: "staff.created", entityType: "employee", entityId: e.id });
        return e;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException({ code: "EMPLOYEE_EXISTS" });
        throw err;
      }
    });
  }

  /**
   * Staff performance for a month (the "staff rankings" dashboard): classes taught, how full they
   * were, check-ins and no-shows, memberships sold and sales; pay and cost per check-in only for
   * people who see pay. Raw counts, so an owner can check them against their own records.
   */
  @Get("staff/performance")
  @RequiresPermission("report.view")
  performance(@Query(new ZodPipe(monthQuery)) q: { month?: string }) {
    const r = this.monthRange(q.month);
    const canSeePay = requirePrincipal().permissions.includes("finance.view");
    return this.db.run(async (tx) => {
      const [employees, stats] = await Promise.all([tx.employee.findMany({ orderBy: { firstName: "asc" } }), staffStats(tx, r.from, r.to)]);
      const rows = employees
        .map((e) => {
          const s = stats.get(e.id)!;
          return {
            employee: { id: e.id, firstName: e.firstName, lastName: e.lastName, title: e.title, payType: e.payType, status: e.status },
            classesTaught: s.classesTaught,
            spotsBooked: s.spotsBooked,
            spotsOffered: s.spotsOffered,
            fillPct: s.spotsOffered ? Math.round((s.spotsBooked / s.spotsOffered) * 1000) / 10 : null,
            avgAttendance: s.avgAttendance,
            attended: s.attended,
            noShows: s.noShows,
            noShowPct: s.attended + s.noShows ? Math.round((s.noShows / (s.attended + s.noShows)) * 1000) / 10 : null,
            membershipsSold: s.membershipsSold,
            salesMinor: s.salesMinor,
            hoursWorked: s.hoursWorked,
            payMinor: canSeePay ? s.pay.totalMinor : null,
            costPerCheckinMinor: canSeePay && s.attended ? s.pay.totalMinor / BigInt(s.attended) : null,
          };
        })
        .filter((x) => x.employee.status === "active" || x.classesTaught > 0 || x.membershipsSold > 0 || x.hoursWorked > 0);
      return { month: r.month, currency: requireTenant().currency, rows };
    });
  }

  @Get("staff/:id")
  @RequiresPermission("staff.view")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    const r = this.monthRange();
    const p = requirePrincipal();
    const canSeePay = p.permissions.includes("finance.view") || p.permissions.includes("staff.manage");
    const data = await this.db.run(async (tx) => {
      const e = await tx.employee.findFirst({
        where: { id },
        include: {
          shifts: { where: { startsAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { startsAt: "asc" }, take: 20 },
          timeEntries: { orderBy: { clockIn: "desc" }, take: 20 },
        },
      });
      if (!e) return null;
      const stats = (await staffStats(tx, r.from, r.to)).get(e.id)!;
      const classes = e.userId
        ? await tx.session.findMany({
            where: { trainerUserId: e.userId, status: "scheduled", startsAt: { gte: new Date() } },
            include: { classType: { select: { name: true, color: true } }, location: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 8,
          })
        : [];
      return { e, stats, classes };
    });
    if (!data) throw new NotFoundException();
    const { e, stats, classes } = data;
    return {
      ...e,
      payRateMinor: canSeePay ? e.payRateMinor : null,
      stats: viewStats(stats, canSeePay),
      upcomingClasses: classes.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        className: c.classType.name,
        color: c.classType.color,
        location: c.location.name,
        booked: c.bookedCount,
        capacity: c.capacity,
      })),
      timezone: t.timezone,
    };
  }

  @Patch("staff/:id")
  @RequiresPermission("staff.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateEmployeeSchema)) body: z.infer<typeof updateEmployeeSchema>) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const found = await tx.employee.findFirst({ where: { id } });
      if (!found) throw new NotFoundException();
      const e = await tx.employee.update({
        where: { id },
        data: {
          ...body,
          payRateMinor: body.payRateMinor === undefined ? undefined : BigInt(body.payRateMinor),
          startedOn: body.startedOn ? toDateColumn(body.startedOn) : undefined,
        },
      });
      if (body.payRateMinor !== undefined || body.payType || body.commissionBp !== undefined) {
        await this.audit.record(tx, { tenantId: t.id, action: "staff.pay_changed", entityType: "employee", entityId: id, data: { payType: e.payType, payRateMinor: e.payRateMinor.toString(), commissionBp: e.commissionBp } });
      }
      return e;
    });
  }

  // ── Shifts ──

  @Get("shifts")
  @RequiresPermission("staff.view")
  shifts(@Query(new ZodPipe(rangeQuery)) q: z.infer<typeof rangeQuery>) {
    const t = requireTenant();
    return this.db.run((tx) =>
      tx.shift.findMany({
        where: { startsAt: { gte: zonedToUtc(q.from, 0, t.timezone), lt: zonedToUtc(addDays(q.to, 1), 0, t.timezone) } },
        include: { employee: { select: { id: true, firstName: true, lastName: true, title: true } } },
        orderBy: { startsAt: "asc" },
      }),
    );
  }

  @Post("shifts")
  @RequiresPermission("staff.manage")
  addShift(@Body(new ZodPipe(shiftSchema)) body: ShiftInput) {
    return this.db.run((tx) => this.saveShift(tx, body));
  }

  /** Move or edit a slot (calendar edit dialog). */
  @Put("shifts/:id")
  @RequiresPermission("staff.manage")
  updateShift(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(shiftSchema)) body: ShiftInput) {
    return this.db.run(async (tx) => {
      if (!(await tx.shift.findFirst({ where: { id } }))) throw new NotFoundException();
      return this.saveShift(tx, body, id);
    });
  }

  @Delete("shifts/:id")
  @RequiresPermission("staff.manage")
  async removeShift(@Param("id", ParseUUIDPipe) id: string) {
    const res = await this.db.run((tx) => tx.shift.deleteMany({ where: { id } }));
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }

  /**
   * One person can't be in two slots at once (SHIFT_OVERLAP); different people may share a time
   * slot for different activities.
   */
  private async saveShift(tx: TenantTx, body: ShiftInput, id?: string) {
    const t = requireTenant();
    const [emp, loc] = await Promise.all([
      tx.employee.findFirst({ where: { id: body.employeeId } }),
      tx.location.findFirst({ where: { id: body.locationId, deletedAt: null } }),
    ]);
    if (!emp || !loc) throw new NotFoundException();
    const tz = loc.timezone ?? t.timezone;
    const startsAt = zonedToUtc(body.date, parseHhMm(body.start), tz);
    const endsAt = zonedToUtc(body.date, parseHhMm(body.end), tz);
    const clash = await tx.shift.findFirst({
      where: { employeeId: emp.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(id ? { id: { not: id } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException({ code: "SHIFT_OVERLAP" });
    const data = { tenantId: t.id, employeeId: emp.id, locationId: loc.id, startsAt, endsAt, activity: body.activity ?? null, note: body.note ?? null };
    return id ? tx.shift.update({ where: { id }, data }) : tx.shift.create({ data });
  }

  // ── Calendars ──

  /** Everyone's week (or one person's): shifts and the classes they teach, for the team calendar. */
  @Get("team-calendar")
  @RequiresPermission("staff.view")
  calendar(@Query(new ZodPipe(calendarQuery)) q: z.infer<typeof calendarQuery>) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const employees = await tx.employee.findMany({
        where: { status: "active", ...(q.employeeId ? { id: q.employeeId } : {}) },
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, lastName: true, title: true, userId: true },
      });
      return {
        timezone: t.timezone,
        employees: employees.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, title: e.title })),
        events: await this.events(tx, employees, q.from, q.to),
      };
    });
  }

  /** The signed-in person's own schedule (every staff member, whatever their role). */
  @Get("my-schedule")
  @RequiresPermission("location.view")
  mySchedule(@Query(new ZodPipe(calendarQuery.omit({ employeeId: true }))) q: { from: string; to: string }) {
    const t = requireTenant();
    const userId = requirePrincipal().userId;
    return this.db.run(async (tx) => {
      const me = await tx.employee.findFirst({
        where: { userId, status: "active" },
        select: { id: true, firstName: true, lastName: true, title: true, userId: true },
      });
      if (!me) throw new NotFoundException({ code: "NO_EMPLOYEE_RECORD" });
      return {
        timezone: t.timezone,
        employees: [{ id: me.id, firstName: me.firstName, lastName: me.lastName, title: me.title }],
        events: await this.events(tx, [me], q.from, q.to),
      };
    });
  }

  private async events(tx: TenantTx, employees: { id: string; userId: string | null }[], from: string, to: string) {
    const tz = requireTenant().timezone;
    const range = { gte: zonedToUtc(from, 0, tz), lt: zonedToUtc(addDays(to, 1), 0, tz) };
    const byUser = new Map(employees.filter((e) => e.userId).map((e) => [e.userId!, e.id]));
    const [shifts, sessions] = await Promise.all([
      tx.shift.findMany({
        where: { employeeId: { in: employees.map((e) => e.id) }, startsAt: range },
        orderBy: { startsAt: "asc" },
      }),
      byUser.size
        ? tx.session.findMany({
            where: { trainerUserId: { in: [...byUser.keys()] }, status: "scheduled", startsAt: range },
            include: { classType: { select: { name: true, color: true } }, location: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
          })
        : [],
    ]);
    const locations = new Map((await tx.location.findMany({ select: { id: true, name: true } })).map((l) => [l.id, l.name]));
    return [
      ...shifts.map((s) => ({
        id: s.id,
        kind: "shift" as const,
        employeeId: s.employeeId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: s.activity,
        note: s.note,
        color: null as string | null,
        booked: null as number | null,
        capacity: null as number | null,
        locationId: s.locationId,
        location: locations.get(s.locationId) ?? "",
      })),
      ...sessions.map((c) => ({
        id: c.id,
        kind: "class" as const,
        employeeId: byUser.get(c.trainerUserId!)!,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        title: c.classType.name as string | null,
        note: null as string | null,
        color: c.classType.color as string | null,
        booked: c.bookedCount as number | null,
        capacity: c.capacity as number | null,
        locationId: c.locationId,
        location: c.location.name,
      })),
    ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  // ── Time clock ──

  /** The signed-in person's employee record and whether they're clocked in. */
  @Get("time-clock/me")
  @RequiresPermission("location.view")
  me() {
    const userId = requirePrincipal().userId;
    return this.db.run(async (tx) => {
      const e = await tx.employee.findFirst({ where: { userId, status: "active" }, select: { id: true, firstName: true } });
      if (!e) return { employee: null, clockedInSince: null };
      const open = await tx.timeEntry.findFirst({ where: { employeeId: e.id, clockOut: null } });
      return { employee: e, clockedInSince: open?.clockIn ?? null };
    });
  }

  @Post("time-clock/in")
  @RequiresPermission("location.view")
  clockIn(@Body(new ZodPipe(clockSchema)) body: z.infer<typeof clockSchema>) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const e = await this.clockTarget(tx, body.employeeId);
      try {
        return await tx.timeEntry.create({
          data: { tenantId: t.id, employeeId: e.id, locationId: body.locationId ?? e.homeLocationId ?? null, clockIn: new Date() },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException({ code: "ALREADY_CLOCKED_IN" });
        throw err;
      }
    });
  }

  @Post("time-clock/out")
  @RequiresPermission("location.view")
  clockOut(@Body(new ZodPipe(clockSchema)) body: z.infer<typeof clockSchema>) {
    return this.db.run(async (tx) => {
      const e = await this.clockTarget(tx, body.employeeId);
      const open = await tx.timeEntry.findFirst({ where: { employeeId: e.id, clockOut: null } });
      if (!open) throw new ConflictException({ code: "NOT_CLOCKED_IN" });
      return tx.timeEntry.update({ where: { id: open.id }, data: { clockOut: new Date() } });
    });
  }

  /** Yourself, or — with staff.manage — someone else. */
  private async clockTarget(tx: TenantTx, employeeId?: string) {
    const p = requirePrincipal();
    if (employeeId) {
      const e = await tx.employee.findFirst({ where: { id: employeeId } });
      if (!e) throw new NotFoundException();
      if (e.userId !== p.userId && !p.permissions.includes("staff.manage")) throw new NotFoundException();
      return e;
    }
    const e = await tx.employee.findFirst({ where: { userId: p.userId, status: "active" } });
    if (!e) throw new NotFoundException({ code: "NO_EMPLOYEE_RECORD" });
    return e;
  }

  // ── Payroll ──

  @Get("payroll")
  @RequiresPermission("finance.view")
  payroll(@Query(new ZodPipe(monthQuery)) q: { month?: string }) {
    const r = this.monthRange(q.month);
    return this.db.run(async (tx) => {
      const [employees, stats] = await Promise.all([tx.employee.findMany({ orderBy: { firstName: "asc" } }), staffStats(tx, r.from, r.to)]);
      const rows = employees
        .map((e) => ({ employee: { id: e.id, firstName: e.firstName, lastName: e.lastName, title: e.title, payType: e.payType, payRateMinor: e.payRateMinor, commissionBp: e.commissionBp, currency: e.currency }, ...stats.get(e.id)! }))
        .filter((row) => row.pay.totalMinor > 0n);
      const total = rows.reduce((s, x) => s + x.pay.totalMinor, 0n);
      return { month: r.month, currency: requireTenant().currency, rows, totalMinor: total };
    });
  }

  /** Payroll export for the accountant (PLAN.md: not a payroll engine — hours, classes, commissions). */
  @Get("payroll/export")
  @RequiresPermission("finance.view")
  @Header("content-type", "text/csv; charset=utf-8")
  async payrollCsv(@Query(new ZodPipe(monthQuery)) q: { month?: string }) {
    const data = await this.payroll(q);
    const digits = minorDigits(data.currency);
    const money = (v: bigint) => (Number(v) / 10 ** digits).toFixed(digits);
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      ["Employee", "Title", "Pay type", "Rate", "Hours", "Classes taught", "Sales", "Base pay", "Commission", "Total", "Currency"].join(","),
      ...data.rows.map((r) =>
        [
          esc(`${r.employee.firstName} ${r.employee.lastName}`),
          esc(r.employee.title),
          r.employee.payType,
          money(r.employee.payRateMinor),
          r.hoursWorked.toFixed(2),
          String(r.classesTaught),
          money(r.salesMinor),
          money(r.pay.baseMinor),
          money(r.pay.commissionMinor),
          money(r.pay.totalMinor),
          data.currency,
        ].join(","),
      ),
    ];
    // Byte-order mark so Excel opens the CSV as UTF-8 (Arabic names).
    return String.fromCharCode(0xfeff) + `${lines.join("\n")}\n`;
  }
}

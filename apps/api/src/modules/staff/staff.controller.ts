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
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Prisma, type TenantTx } from "@gym/db";
import {
  addDays,
  addMonths,
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

  /** Staff sign-ins at this gym not yet linked to a team member (for the "linked sign-in" picker). */
  @Get("staff/logins")
  @RequiresPermission("staff.manage")
  logins() {
    return this.db.run(async (tx) => {
      const [memberships, roles, linked] = await Promise.all([
        tx.tenantMembership.findMany({ where: { status: "active" }, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
        tx.userRole.findMany({ where: { roleKey: { not: "member" } }, select: { userId: true } }),
        tx.employee.findMany({ where: { userId: { not: null } }, select: { userId: true } }),
      ]);
      const staff = new Set(roles.map((r) => r.userId));
      const taken = new Set(linked.map((l) => l.userId));
      return memberships.filter((m) => staff.has(m.userId) && !taken.has(m.userId)).map((m) => m.user);
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
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const [emp, loc] = await Promise.all([
        tx.employee.findFirst({ where: { id: body.employeeId } }),
        tx.location.findFirst({ where: { id: body.locationId, deletedAt: null } }),
      ]);
      if (!emp || !loc) throw new NotFoundException();
      const tz = loc.timezone ?? t.timezone;
      return tx.shift.create({
        data: {
          tenantId: t.id,
          employeeId: emp.id,
          locationId: loc.id,
          startsAt: zonedToUtc(body.date, parseHhMm(body.start), tz),
          endsAt: zonedToUtc(body.date, parseHhMm(body.end), tz),
          note: body.note ?? null,
        },
      });
    });
  }

  @Delete("shifts/:id")
  @RequiresPermission("staff.manage")
  async removeShift(@Param("id", ParseUUIDPipe) id: string) {
    const res = await this.db.run((tx) => tx.shift.deleteMany({ where: { id } }));
    if (!res.count) throw new NotFoundException();
    return { ok: true };
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

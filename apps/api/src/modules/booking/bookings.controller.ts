import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  addDays,
  attendanceSchema,
  staffBookSchema,
  zonedToUtc,
  type StaffBookInput,
} from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { BookingService } from "./booking.service";

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memberId: z.string().uuid().optional(),
});

/** Staff side of bookings: book a member in, cancel, mark attendance (PLAN.md section 6.1). */
@Controller("v1/bookings")
@RequiresFeature("booking.core")
export class BookingsController {
  constructor(
    private readonly booking: BookingService,
    private readonly db: TenantDb,
  ) {}

  @Get()
  @RequiresPermission("booking.view")
  list(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const tenant = requireTenant();
    return this.db.run((tx) =>
      tx.booking.findMany({
        where: {
          ...(q.memberId ? { memberId: q.memberId } : {}),
          session: {
            startsAt: { gte: zonedToUtc(q.from, 0, tenant.timezone), lt: zonedToUtc(addDays(q.to, 1), 0, tenant.timezone) },
          },
        },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
          session: {
            select: {
              id: true,
              startsAt: true,
              capacity: true,
              classType: { select: { name: true, color: true } },
              location: { select: { name: true } },
            },
          },
        },
        orderBy: { session: { startsAt: "asc" } },
        take: 500,
      }),
    );
  }

  @Post()
  @RequiresPermission("booking.create")
  book(@Body(new ZodPipe(staffBookSchema)) body: StaffBookInput) {
    return this.booking.book({ ...body, source: "staff", byUserId: requirePrincipal().userId });
  }

  @Post(":id/cancel")
  @RequiresPermission("booking.cancel")
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ waivePenalty: z.boolean().default(false) }))) body: { waivePenalty: boolean },
  ) {
    return this.booking.cancel(id, { kind: "staff", userId: requirePrincipal().userId, waivePenalty: body.waivePenalty });
  }

  @Post(":id/attendance")
  @RequiresPermission("checkin.create")
  attendance(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(attendanceSchema)) body: { status: "attended" | "no_show" },
  ) {
    return this.booking.setAttendance(id, body.status);
  }
}

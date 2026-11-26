import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { memberBookSchema, type MemberBookInput } from "@gym/shared";
import { MemberOnly, RequiresFeature } from "../../common/decorators";
import { requireMember } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { BookingService } from "../booking/booking.service";

/**
 * Member self-service (/v1/me/...): only the signed-in member's own data, used by the widget's
 * "My bookings" and later the member portal (PLAN.md section 11). The member id always comes
 * from the session, never from the request.
 */
@Controller("v1/me")
@RequiresFeature("widget.embed")
export class MemberSelfController {
  constructor(
    private readonly db: TenantDb,
    private readonly booking: BookingService,
  ) {}

  @Get("member")
  @MemberOnly()
  async profile() {
    const { memberId } = requireMember();
    return this.db.run(async (tx) => {
      const m = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, language: true, checkinCode: true },
      });
      const subs = await tx.memberSubscription.findMany({
        where: { memberId, status: { in: ["active", "pending"] } },
        include: { plan: { select: { name: true } } },
        orderBy: { startsOn: "desc" },
      });
      const credits = await tx.creditEntry.groupBy({ by: ["subscriptionId"], where: { memberId }, _sum: { delta: true } });
      const bal = new Map(credits.map((c) => [c.subscriptionId, c._sum.delta ?? 0]));
      return {
        ...m,
        memberships: subs.map((s) => ({
          id: s.id,
          name: s.plan.name,
          status: s.status,
          startsOn: s.startsOn,
          endsOn: s.endsOn,
          creditsLeft: s.unlimited ? null : (bal.get(s.id) ?? 0),
        })),
      };
    });
  }

  @Get("bookings")
  @MemberOnly()
  bookings() {
    const { memberId } = requireMember();
    const since = new Date(Date.now() - 2 * 3600_000);
    return this.db.run(async (tx) => {
      const [bookings, waitlist] = await Promise.all([
        tx.booking.findMany({
          where: { memberId, status: "booked", session: { startsAt: { gte: since } } },
          include: {
            session: {
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                classType: { select: { name: true, color: true } },
                location: { select: { name: true } },
              },
            },
          },
          orderBy: { session: { startsAt: "asc" } },
        }),
        tx.waitlistEntry.findMany({
          where: { memberId, status: "waiting", session: { startsAt: { gte: new Date() } } },
          include: {
            session: { select: { id: true, startsAt: true, classType: { select: { name: true } }, location: { select: { name: true } } } },
          },
          orderBy: { session: { startsAt: "asc" } },
        }),
      ]);
      return {
        bookings: bookings.map((b) => ({ id: b.id, status: b.status, session: b.session })),
        waitlist: waitlist.map((w) => ({ id: w.id, session: w.session })),
      };
    });
  }

  @Post("bookings")
  @MemberOnly()
  book(@Body(new ZodPipe(memberBookSchema)) body: MemberBookInput) {
    return this.booking.book({ ...body, memberId: requireMember().memberId, source: "widget" });
  }

  @Delete("bookings/:id")
  @MemberOnly()
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.booking.cancel(id, { kind: "member", memberId: requireMember().memberId });
  }

  @Delete("waitlist/:id")
  @MemberOnly()
  leaveWaitlist(@Param("id", ParseUUIDPipe) id: string) {
    return this.booking.leaveWaitlist(id, requireMember().memberId);
  }
}

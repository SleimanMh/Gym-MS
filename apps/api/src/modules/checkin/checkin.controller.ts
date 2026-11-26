import { Body, Controller, Get, NotFoundException, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { checkInSchema, daysBetween, localDate, zonedToUtc, addDays, type CheckInInput } from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { loadEntitlementSubscriptions } from "../booking/booking.service";
import { isFrozenOn, pickEntitlement } from "../booking/entitlement";

type Alert =
  | "NO_ACTIVE_MEMBERSHIP"
  | "MEMBERSHIP_PENDING_PAYMENT"
  | "LOCATION_NOT_INCLUDED"
  | "MEMBERSHIP_FROZEN"
  | "NO_CREDITS_LEFT"
  | "EXPIRES_SOON"
  | "ALREADY_CHECKED_IN_TODAY"
  | "NO_BOOKING_TODAY";

const BLOCKING: Alert[] = ["NO_ACTIVE_MEMBERSHIP", "MEMBERSHIP_PENDING_PAYMENT", "LOCATION_NOT_INCLUDED", "MEMBERSHIP_FROZEN"];

/**
 * Front-desk check-in (PLAN.md section 6.2): scan the member's QR code (a USB scanner types the
 * code into the field) or pick them from search. Validates the membership, shows alerts, and
 * marks today's class booking as attended.
 */
@Controller("v1/check-ins")
@RequiresFeature("booking.core")
export class CheckInController {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @RequiresPermission("checkin.create")
  checkIn(@Body(new ZodPipe(checkInSchema)) body: CheckInInput) {
    const tenant = requireTenant();
    const userId = requirePrincipal().userId;
    return this.db.run(async (tx) => {
      const location = await tx.location.findFirst({ where: { id: body.locationId, deletedAt: null } });
      if (!location) throw new NotFoundException({ code: "LOCATION_NOT_FOUND" });
      const member = await tx.member.findFirst({
        where: { deletedAt: null, ...(body.code ? { checkinCode: body.code } : { id: body.memberId }) },
      });
      if (!member) throw new NotFoundException({ code: "MEMBER_NOT_FOUND" });

      const tz = location.timezone ?? tenant.timezone;
      const now = new Date();
      const today = localDate(now, tz);
      const subs = await loadEntitlementSubscriptions(tx, member.id);
      const ent = pickEntitlement(subs, today, location.id);
      const alerts: Alert[] = [];
      if (!ent.ok) alerts.push(ent.code);

      const current = subs.filter((s) => s.status === "active" && s.startsOn <= today && (!s.endsOn || today <= s.endsOn));
      const soonest = current
        .filter((s) => s.endsOn && !isFrozenOn(s, today))
        .map((s) => s.endsOn!)
        .sort()[0];
      if (soonest && daysBetween(today, soonest) <= 7) alerts.push("EXPIRES_SOON");

      const dayStart = zonedToUtc(today, 0, tz);
      const dayEnd = zonedToUtc(addDays(today, 1), 0, tz);
      const already = await tx.checkIn.findFirst({
        where: { memberId: member.id, locationId: location.id, checkedInAt: { gte: dayStart, lt: dayEnd } },
      });
      if (already) alerts.push("ALREADY_CHECKED_IN_TODAY");

      // Today's booking at this location: the one starting soonest from 30 minutes ago onwards.
      const booking = await tx.booking.findFirst({
        where: {
          memberId: member.id,
          status: "booked",
          session: { locationId: location.id, startsAt: { gte: new Date(now.getTime() - 30 * 60_000), lt: dayEnd } },
        },
        include: { session: { select: { startsAt: true, classType: { select: { name: true } } } } },
        orderBy: { session: { startsAt: "asc" } },
      });
      if (!booking && ent.ok && ent.useCredit) alerts.push("NO_BOOKING_TODAY");

      const denied = alerts.some((a) => BLOCKING.includes(a));
      const result = denied ? "denied" : alerts.length ? "warning" : "ok";
      const summary = {
        result,
        alerts,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          phone: member.phone,
          membership: current[0] ? { endsOn: current[0].endsOn, creditsLeft: current[0].unlimited ? null : current[0].creditBalance } : null,
        },
        booking: booking ? { id: booking.id, startsAt: booking.session.startsAt, className: booking.session.classType.name } : null,
      };

      if (body.dryRun || (denied && !body.force)) return { ...summary, checkInId: null };

      const checkIn = await tx.checkIn.create({
        data: {
          tenantId: tenant.id,
          memberId: member.id,
          locationId: location.id,
          bookingId: booking?.id ?? null,
          method: body.code ? "qr" : "search",
          byUserId: userId,
        },
      });
      if (booking) await tx.booking.update({ where: { id: booking.id }, data: { status: "attended" } });
      if (denied) {
        await this.audit.record(tx, {
          tenantId: tenant.id,
          action: "checkin.forced",
          entityType: "member",
          entityId: member.id,
          data: { alerts },
        });
      }
      return { ...summary, checkInId: checkIn.id };
    });
  }

  @Get()
  @RequiresPermission("checkin.create")
  today(@Query(new ZodPipe(z.object({ locationId: z.string().uuid().optional() }))) q: { locationId?: string }) {
    const tenant = requireTenant();
    const today = localDate(new Date(), tenant.timezone);
    return this.db.run((tx) =>
      tx.checkIn.findMany({
        where: {
          checkedInAt: { gte: zonedToUtc(today, 0, tenant.timezone) },
          ...(q.locationId ? { locationId: q.locationId } : {}),
        },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { checkedInAt: "desc" },
        take: 100,
      }),
    );
  }
}


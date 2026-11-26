import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type TenantTx } from "@gym/db";
import { dateOnly, localDate } from "@gym/shared";
import { requireTenant, type ContextTenant } from "../../common/request-context";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { OutboxService } from "../notifications/outbox.service";
import { pickEntitlement, type EntitlementSubscription } from "./entitlement";

type Source = "staff" | "widget" | "portal";

interface LockedSession {
  id: string;
  starts_at: Date;
  ends_at: Date;
  capacity: number;
  booked_count: number;
  status: string;
  location_id: string;
}

export type BookResult =
  | { result: "booked"; bookingId: string; sessionId: string; creditUsed: boolean }
  | { result: "waitlisted"; waitlistEntryId: string; sessionId: string; position: number };

const MIN = 60_000;

/**
 * Booking rules (PLAN.md sections 6.1 and 9):
 * - capacity is enforced under a row lock on the session (SELECT … FOR UPDATE), so two people can
 *   never take the last spot;
 * - a booking needs an entitlement: an active, unfrozen membership valid that day at that location,
 *   with a credit if it's a pack (credit_ledger −1, returned on an in-time cancel);
 * - full classes take a waitlist; a cancellation promotes the first eligible person automatically;
 * - cancelling after the cut-off is a late cancel and (policy "lose_credit") keeps the credit.
 */
@Injectable()
export class BookingService {
  constructor(
    private readonly db: TenantDb,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  book(input: {
    sessionId: string;
    memberId: string;
    source: Source;
    joinWaitlist: boolean;
    byUserId?: string | null;
  }): Promise<BookResult> {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const settings = await this.settings(tx, tenant.id);
      const session = await this.lockSession(tx, input.sessionId);
      const now = Date.now();

      if (session.status !== "scheduled") throw new ConflictException({ code: "SESSION_CANCELLED" });
      const isStaff = input.source === "staff";
      if (isStaff ? session.ends_at.getTime() <= now : session.starts_at.getTime() <= now) {
        throw new ConflictException({ code: "SESSION_STARTED" });
      }
      if (!isStaff && session.starts_at.getTime() > now + settings.bookingWindowDays * 24 * 60 * MIN) {
        throw new ConflictException({ code: "OUTSIDE_BOOKING_WINDOW", bookingWindowDays: settings.bookingWindowDays });
      }

      const member = await tx.member.findFirst({ where: { id: input.memberId, deletedAt: null } });
      if (!member) throw new NotFoundException({ code: "MEMBER_NOT_FOUND" });
      if (member.status !== "active") throw new ConflictException({ code: "MEMBER_ARCHIVED" });

      const existing = await tx.booking.findFirst({
        where: { sessionId: session.id, memberId: member.id, status: { in: ["booked", "attended", "no_show"] } },
      });
      if (existing) throw new ConflictException({ code: "ALREADY_BOOKED", bookingId: existing.id });

      const ent = await this.entitlementFor(tx, tenant, member.id, session);
      if (!ent.ok) throw new ConflictException({ code: ent.code });

      if (session.booked_count >= session.capacity) {
        if (!input.joinWaitlist) throw new ConflictException({ code: "SESSION_FULL" });
        const already = await tx.waitlistEntry.findFirst({
          where: { sessionId: session.id, memberId: member.id, status: "waiting" },
        });
        const entry =
          already ?? (await tx.waitlistEntry.create({ data: { tenantId: tenant.id, sessionId: session.id, memberId: member.id } }));
        const position = await tx.waitlistEntry.count({
          where: { sessionId: session.id, status: "waiting", createdAt: { lte: entry.createdAt } },
        });
        return { result: "waitlisted", waitlistEntryId: entry.id, sessionId: session.id, position };
      }

      const booking = await this.createBooking(tx, tenant.id, session.id, member.id, ent, input.source, input.byUserId);
      return { result: "booked", bookingId: booking.id, sessionId: session.id, creditUsed: booking.creditUsed };
    });
  }

  cancel(
    bookingId: string,
    actor: { kind: "staff"; userId: string; waivePenalty: boolean } | { kind: "member"; memberId: string },
  ) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id: bookingId } });
      if (!booking || (actor.kind === "member" && booking.memberId !== actor.memberId)) throw new NotFoundException();

      const settings = await this.settings(tx, tenant.id);
      const session = await this.lockSession(tx, booking.sessionId);
      if (booking.status !== "booked") throw new ConflictException({ code: "NOT_CANCELLABLE", status: booking.status });
      const now = Date.now();
      if (session.starts_at.getTime() <= now) throw new ConflictException({ code: "SESSION_STARTED" });

      const late = now > session.starts_at.getTime() - settings.cancellationCutoffMin * MIN;
      const waived = actor.kind === "staff" && actor.waivePenalty;
      const penalize = late && !waived && settings.lateCancelPolicy === "lose_credit";

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: late && !waived ? "late_cancel" : "cancelled", cancelledAt: new Date() },
      });
      const creditReturned = booking.creditUsed && !penalize && !!booking.subscriptionId;
      if (creditReturned) {
        await tx.creditEntry.create({
          data: {
            tenantId: tenant.id,
            memberId: booking.memberId,
            subscriptionId: booking.subscriptionId!,
            bookingId: booking.id,
            delta: 1,
            reason: "booking_refund",
          },
        });
      }
      await tx.session.update({ where: { id: session.id }, data: { bookedCount: { decrement: 1 } } });
      await this.outbox.enqueue(
        tx,
        tenant.id,
        "booking.cancelled",
        { bookingId: booking.id, late, creditReturned },
        `booking.cancelled:${booking.id}`,
      );
      if (actor.kind === "staff") {
        await this.audit.record(tx, {
          tenantId: tenant.id,
          action: "booking.cancelled",
          entityType: "booking",
          entityId: booking.id,
          data: { late, waived },
        });
      }

      let promoted: string | null = null;
      if (settings.waitlistAutoPromote && now < session.starts_at.getTime() - settings.waitlistPromoteCutoffMin * MIN) {
        promoted = await this.promoteNext(tx, tenant, { ...session, booked_count: session.booked_count - 1 });
      }
      return { status: late && !waived ? "late_cancel" : "cancelled", late, creditReturned, promotedBookingId: promoted };
    });
  }

  /** The gym cancels a class. Bookings are cancelled without penalty and members are notified. */
  cancelSession(sessionId: string, reason?: string) {
    const tenant = requireTenant();
    return this.db.run(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (session.status === "cancelled") throw new ConflictException({ code: "SESSION_CANCELLED" });

      const bookings = await tx.booking.findMany({ where: { sessionId, status: "booked" } });
      for (const b of bookings) {
        await tx.booking.update({ where: { id: b.id }, data: { status: "cancelled", cancelledAt: new Date() } });
        if (b.creditUsed && b.subscriptionId) {
          await tx.creditEntry.create({
            data: {
              tenantId: tenant.id,
              memberId: b.memberId,
              subscriptionId: b.subscriptionId,
              bookingId: b.id,
              delta: 1,
              reason: "booking_refund",
            },
          });
        }
        await this.outbox.enqueue(tx, tenant.id, "session.cancelled", { bookingId: b.id, reason: reason ?? null }, `session.cancelled:${b.id}`);
      }
      await tx.waitlistEntry.updateMany({ where: { sessionId, status: "waiting" }, data: { status: "removed" } });
      await tx.session.update({
        where: { id: sessionId },
        data: { status: "cancelled", cancelReason: reason ?? null, bookedCount: 0 },
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        action: "session.cancelled",
        entityType: "session",
        entityId: sessionId,
        data: { bookingsCancelled: bookings.length, reason: reason ?? null },
      });
      return { ok: true, bookingsCancelled: bookings.length };
    });
  }

  setAttendance(bookingId: string, status: "attended" | "no_show") {
    return this.db.run(async (tx) => {
      const b = await tx.booking.findFirst({ where: { id: bookingId } });
      if (!b) throw new NotFoundException();
      if (!["booked", "attended", "no_show"].includes(b.status)) {
        throw new ConflictException({ code: "NOT_ATTENDABLE", status: b.status });
      }
      return tx.booking.update({ where: { id: b.id }, data: { status } });
    });
  }

  leaveWaitlist(entryId: string, memberId: string) {
    return this.db.run(async (tx) => {
      const res = await tx.waitlistEntry.updateMany({
        where: { id: entryId, memberId, status: "waiting" },
        data: { status: "removed" },
      });
      if (!res.count) throw new NotFoundException();
      return { ok: true };
    });
  }

  // ───────────── internals ─────────────

  private async createBooking(
    tx: TenantTx,
    tenantId: string,
    sessionId: string,
    memberId: string,
    ent: { subscriptionId: string; useCredit: boolean },
    source: Source | "waitlist",
    byUserId?: string | null,
  ) {
    let booking;
    try {
      booking = await tx.booking.create({
        data: {
          tenantId,
          sessionId,
          memberId,
          subscriptionId: ent.subscriptionId,
          source,
          creditUsed: ent.useCredit,
          createdByUserId: byUserId ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: "ALREADY_BOOKED" });
      }
      throw e;
    }
    if (ent.useCredit) {
      await tx.creditEntry.create({
        data: { tenantId, memberId, subscriptionId: ent.subscriptionId, bookingId: booking.id, delta: -1, reason: "booking" },
      });
    }
    await tx.session.update({ where: { id: sessionId }, data: { bookedCount: { increment: 1 } } });
    await this.outbox.enqueue(
      tx,
      tenantId,
      source === "waitlist" ? "waitlist.promoted" : "booking.created",
      { bookingId: booking.id },
      `booking.created:${booking.id}`,
    );
    return booking;
  }

  /** Gives the freed spot to the first waiting member who is still entitled. Returns the new booking id. */
  private async promoteNext(tx: TenantTx, tenant: ContextTenant, session: LockedSession): Promise<string | null> {
    if (session.booked_count >= session.capacity) return null;
    const waiting = await tx.waitlistEntry.findMany({
      where: { sessionId: session.id, status: "waiting" },
      orderBy: { createdAt: "asc" },
    });
    for (const entry of waiting) {
      const active = await tx.booking.findFirst({
        where: { sessionId: session.id, memberId: entry.memberId, status: { in: ["booked", "attended", "no_show"] } },
      });
      if (active) {
        await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "removed" } });
        continue;
      }
      const ent = await this.entitlementFor(tx, tenant, entry.memberId, session);
      if (!ent.ok) continue;
      const booking = await this.createBooking(tx, tenant.id, session.id, entry.memberId, ent, "waitlist");
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: "promoted", promotedBookingId: booking.id },
      });
      return booking.id;
    }
    return null;
  }

  private async lockSession(tx: TenantTx, sessionId: string): Promise<LockedSession> {
    const rows = await tx.$queryRaw<LockedSession[]>`
      SELECT id, starts_at, ends_at, capacity, booked_count, status::text AS status, location_id
      FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    const s = rows[0];
    if (!s) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
    return s;
  }

  private async settings(tx: TenantTx, tenantId: string) {
    const s = await tx.tenantSettings.findUnique({ where: { tenantId } });
    return {
      bookingWindowDays: s?.bookingWindowDays ?? 7,
      cancellationCutoffMin: s?.cancellationCutoffMin ?? 120,
      lateCancelPolicy: s?.lateCancelPolicy ?? "lose_credit",
      waitlistAutoPromote: s?.waitlistAutoPromote ?? true,
      waitlistPromoteCutoffMin: s?.waitlistPromoteCutoffMin ?? 60,
    };
  }

  private async entitlementFor(tx: TenantTx, tenant: ContextTenant, memberId: string, session: LockedSession) {
    const location = await tx.location.findFirst({ where: { id: session.location_id }, select: { timezone: true } });
    const date = localDate(session.starts_at, location?.timezone ?? tenant.timezone);
    return pickEntitlement(await loadEntitlementSubscriptions(tx, memberId), date, session.location_id);
  }
}

/** Active/pending memberships of a member with freezes and credit balances, shaped for pickEntitlement(). */
export async function loadEntitlementSubscriptions(tx: TenantTx, memberId: string): Promise<EntitlementSubscription[]> {
  const [subs, credits] = await Promise.all([
    tx.memberSubscription.findMany({
      where: { memberId, status: { in: ["active", "pending"] } },
      include: { plan: { select: { allowedLocationIds: true } }, freezes: true },
    }),
    tx.creditEntry.groupBy({ by: ["subscriptionId"], where: { memberId }, _sum: { delta: true } }),
  ]);
  const balance = new Map(credits.map((c) => [c.subscriptionId, c._sum.delta ?? 0]));
  return subs.map((s) => ({
    id: s.id,
    status: s.status,
    startsOn: dateOnly(s.startsOn),
    endsOn: s.endsOn ? dateOnly(s.endsOn) : null,
    unlimited: s.unlimited,
    allowedLocationIds: s.plan.allowedLocationIds,
    freezes: s.freezes.map((f) => ({ startsOn: dateOnly(f.startsOn), endsOn: dateOnly(f.endsOn) })),
    creditBalance: balance.get(s.id) ?? 0,
  }));
}

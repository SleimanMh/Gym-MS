import { Injectable } from "@nestjs/common";
import type { Prisma, TenantTx } from "@gym/db";

/**
 * Domain events are written to outbox_events in the SAME transaction as the change, so an
 * email/webhook can never be lost or sent for a change that rolled back. The worker delivers them.
 */
export type OutboxEventType =
  | "booking.created"
  | "booking.cancelled"
  | "booking.reminder"
  | "waitlist.promoted"
  | "session.cancelled"
  | "membership.expiring"
  | "member.login_code"
  | "lead.created"
  /** Email a new staff account its generated password (scrubbed once sent). */
  | "user.invite"
  /** Email a reset, generated password (scrubbed once sent). */
  | "user.password_reset";

@Injectable()
export class OutboxService {
  async enqueue(
    tx: TenantTx,
    tenantId: string,
    type: OutboxEventType,
    payload: Prisma.InputJsonObject,
    dedupeKey?: string,
  ): Promise<void> {
    await tx.outboxEvent.createMany({
      data: [{ tenantId, type, payload, dedupeKey: dedupeKey ?? null }],
      skipDuplicates: true,
    });
  }
}

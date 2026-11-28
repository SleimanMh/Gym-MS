/**
 * Background jobs run by the worker (src/worker.ts). Each one touches tenant data only through
 * withTenant(), exactly like an API request (CLAUDE.md).
 */
import { generateSessions, withTenant, type PrismaClient, type TenantTx } from "@gym/db";
import { addDays, addMonths, dateOnly, localDate, toDateColumn } from "@gym/shared";
import { renderEmail, type EmailContext, type EmailKind } from "./templates";

export interface Mailer {
  send(msg: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface JobConfig {
  publicAppUrl: string;
  /** Each gym's own address, e.g. http://{slug}.localhost:3000 (ADR 0007). */
  gymUrlTemplate?: string;
}

/** Emails that carry a secret (code or generated password): scrubbed from the outbox once sent. */
const SECRET_KINDS = new Set<string>(["member.login_code", "user.invite", "user.password_reset"]);

const EMAIL_KINDS = new Set<EmailKind>([
  "booking.created",
  "booking.cancelled",
  "booking.reminder",
  "waitlist.promoted",
  "session.cancelled",
  "membership.expiring",
  "member.login_code",
  "user.invite",
  "user.password_reset",
]);

/** Delivers pending outbox events. Returns how many were processed. */
export async function dispatchOutbox(prisma: PrismaClient, mailer: Mailer, cfg: JobConfig, limit = 50): Promise<number> {
  const claimed = await prisma.$queryRaw<{ id: string; tenant_id: string }[]>`SELECT id, tenant_id FROM app_claim_outbox(${limit}::int)`;
  for (const { id, tenant_id } of claimed) {
    try {
      // 1. Read what to do (inside the tenant transaction)…
      const { event, msg } = await withTenant(prisma, tenant_id, async (tx) => {
        const ev = await tx.outboxEvent.findUniqueOrThrow({ where: { id } });
        const m = EMAIL_KINDS.has(ev.type as EmailKind)
          ? await buildEmail(tx, tenant_id, ev.type as EmailKind, ev.payload as Record<string, unknown>, cfg)
          : null;
        return { event: ev, msg: m };
      });

      // 2. …do the slow external call outside it, so SMTP or Keycloak can't hold a transaction open…
      const note: string | null = null;
      if (msg) await mailer.send(msg);

      // 3. …then mark it done. Codes and generated passwords must not linger once delivered.
      const payload = SECRET_KINDS.has(event.type) ? { delivered: true } : (event.payload ?? {});
      await withTenant(prisma, tenant_id, (tx) =>
        tx.outboxEvent.update({
          where: { id },
          data: { processedAt: new Date(), lockedUntil: null, lastError: note, payload: payload as object },
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await withTenant(prisma, tenant_id, (tx) =>
        tx.outboxEvent.update({
          where: { id },
          // Retry in 4 minutes; app_claim_outbox gives up after 8 attempts (see last_error).
          data: { lastError: message.slice(0, 500), lockedUntil: new Date(Date.now() + 60_000 * 2 ** 2) },
        }),
      ).catch(() => undefined);
      console.error(JSON.stringify({ job: "outbox.dispatch", tenant_id, event_id: id, error: message }));
    }
  }
  return claimed.length;
}

async function buildEmail(
  tx: TenantTx,
  tenantId: string,
  kind: EmailKind,
  payload: Record<string, unknown>,
  cfg: JobConfig,
): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
  const base = {
    gymName: tenant.name,
    color: settings?.primaryColor ?? "#2563EB",
    bookingUrl: `${cfg.publicAppUrl}/book/${tenant.slug}`,
  };
  const langOf = (l: string | null) => (l ?? tenant.defaultLanguage) as "en" | "ar";

  let ctx: EmailContext;
  let to: string | null;

  if (kind === "user.invite" || kind === "user.password_reset") {
    // Staff account emails: the generated password and this gym's own sign-in address.
    const p = payload as { email: string; firstName: string; tempPassword: string; expiresDays: number };
    const gymUrl = (cfg.gymUrlTemplate ?? `${cfg.publicAppUrl}`).replace("{slug}", tenant.slug);
    return {
      to: p.email,
      ...renderEmail(kind, {
        ...base,
        lang: tenant.defaultLanguage as "en" | "ar",
        firstName: p.firstName,
        email: p.email,
        tempPassword: p.tempPassword,
        expiresDays: p.expiresDays,
        bookingUrl: `${gymUrl}/login`,
      }),
    };
  }

  if (kind === "member.login_code" || kind === "membership.expiring") {
    let member;
    if (kind === "membership.expiring") {
      const sub = await tx.memberSubscription.findFirst({
        where: { id: String(payload.subscriptionId) },
        include: { member: true, plan: { select: { name: true } } },
      });
      if (!sub) return null;
      member = sub.member;
      ctx = {
        ...base,
        lang: langOf(member.language),
        firstName: member.firstName,
        planName: sub.plan.name,
        endsOn: sub.endsOn ? dateOnly(sub.endsOn) : "",
        daysLeft: Number(payload.daysLeft),
      };
    } else {
      member = await tx.member.findFirst({ where: { id: String(payload.memberId) } });
      if (!member) return null;
      ctx = {
        ...base,
        lang: langOf(member.language),
        firstName: member.firstName,
        code: String(payload.code),
        ttlMin: Number(payload.ttlMin),
      };
    }
    to = member.email;
  } else {
    const booking = await tx.booking.findFirst({
      where: { id: String(payload.bookingId) },
      include: {
        member: true,
        session: { include: { classType: { select: { name: true } }, location: { select: { name: true, timezone: true } } } },
      },
    });
    if (!booking) return null;
    const lang = langOf(booking.member.language);
    const tz = booking.session.location.timezone ?? tenant.timezone;
    ctx = {
      ...base,
      lang,
      firstName: booking.member.firstName,
      className: booking.session.classType.name,
      location: booking.session.location.name,
      when: new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", {
        timeZone: tz,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(booking.session.startsAt),
      late: payload.late === true,
      creditReturned: payload.creditReturned === true,
      reason: typeof payload.reason === "string" ? payload.reason : null,
    };
    to = booking.member.email;
  }

  if (!to) return null; // no email on file — WhatsApp/SMS arrive in Phase 4
  return { to, ...renderEmail(kind, ctx) };
}

/**
 * Every few minutes, per active tenant: extend sessions, queue class reminders and
 * "membership expiring" emails, and expire memberships that ended.
 */
export async function runMaintenance(prisma: PrismaClient, now = new Date()): Promise<Record<string, number>> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["trial", "active", "past_due"] } },
    select: { id: true, timezone: true },
  });
  const totals = { sessions: 0, reminders: 0, expiring: 0, expired: 0 };
  for (const tenant of tenants) {
    try {
      const r = await withTenant(prisma, tenant.id, (tx) => maintainTenant(tx, tenant, now), { timeoutMs: 60_000 });
      totals.sessions += r.sessions;
      totals.reminders += r.reminders;
      totals.expiring += r.expiring;
      totals.expired += r.expired;
    } catch (e) {
      console.error(JSON.stringify({ job: "maintenance", tenant_id: tenant.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return totals;
}

async function maintainTenant(tx: TenantTx, tenant: { id: string; timezone: string }, now: Date) {
  const sessions = await generateSessions(tx, tenant, { now });

  const settings = await tx.tenantSettings.findUnique({ where: { tenantId: tenant.id } });
  const leadMs = (settings?.reminderLeadMin ?? 120) * 60_000;
  const due = await tx.booking.findMany({
    where: {
      status: "booked",
      reminderSentAt: null,
      session: { status: "scheduled", startsAt: { gt: now, lte: new Date(now.getTime() + leadMs) } },
    },
    select: { id: true },
  });
  for (const b of due) {
    await tx.outboxEvent.createMany({
      data: [{ tenantId: tenant.id, type: "booking.reminder", payload: { bookingId: b.id }, dedupeKey: `reminder:${b.id}` }],
      skipDuplicates: true,
    });
  }
  if (due.length) {
    await tx.booking.updateMany({ where: { id: { in: due.map((b) => b.id) } }, data: { reminderSentAt: now } });
  }

  const today = localDate(now, tenant.timezone);
  let expiring = 0;
  for (const daysLeft of [7, 1]) {
    // Auto-renew members get the reminder too: automatic renewal needs online payments (Phase 2),
    // so today every membership really does end on its end date. When renewal lands, skip only
    // memberships that WILL renew (auto-renew + a saved payment method).
    const subs = await tx.memberSubscription.findMany({
      where: { status: "active", endsOn: toDateColumn(addDays(today, daysLeft)) },
      select: { id: true },
    });
    for (const s of subs) {
      const r = await tx.outboxEvent.createMany({
        data: [
          {
            tenantId: tenant.id,
            type: "membership.expiring",
            payload: { subscriptionId: s.id, daysLeft },
            dedupeKey: `expiring:${s.id}:${daysLeft}`,
          },
        ],
        skipDuplicates: true,
      });
      expiring += r.count;
    }
  }

  const expired = await tx.memberSubscription.updateMany({
    where: { status: "active", endsOn: { lt: toDateColumn(today) } },
    data: { status: "expired" },
  });

  // Monthly repeating expenses (rent, utilities…): add this month's copy once its day arrives.
  // Idempotent via unique (tenant_id, recurring_parent_id, spent_on).
  const templates = await tx.expense.findMany({
    where: { tenantId: tenant.id, recurringMonthly: true, deletedAt: null, recurringParentId: null },
  });
  const monthFirst = `${today.slice(0, 7)}-01`;
  const lastDay = Number(addDays(addMonths(monthFirst, 1), -1).slice(8));
  for (const tpl of templates) {
    const day = Math.min(Number(dateOnly(tpl.spentOn).slice(8)), lastDay);
    const dueOn = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    if (dueOn > today || dueOn <= dateOnly(tpl.spentOn)) continue;
    await tx.expense.createMany({
      data: [
        {
          tenantId: tenant.id,
          categoryId: tpl.categoryId,
          locationId: tpl.locationId,
          amountMinor: tpl.amountMinor,
          currency: tpl.currency,
          spentOn: toDateColumn(dueOn),
          vendor: tpl.vendor,
          note: tpl.note,
          recurringParentId: tpl.id,
        },
      ],
      skipDuplicates: true,
    });
  }

  return { sessions, reminders: due.length, expiring, expired: expired.count };
}

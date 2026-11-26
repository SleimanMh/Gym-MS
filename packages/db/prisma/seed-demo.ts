/**
 * Rich demo data so every screen has something real to show: a year of members joining, renewing
 * and leaving; six weeks of past classes with attendance; upcoming bookings (some classes full, with
 * waitlists); gym-floor check-ins; today's activity; website leads.
 *
 * Deterministic (seeded PRNG) and written through withTenant() as the app role. Runs once per gym:
 * skipped when the generated members already exist. Names are invented; emails use example.com.
 */
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  addDays,
  generateOccurrences,
  localDate,
  subscriptionEndsOn,
  toDateColumn,
  zonedToUtc,
} from "@gym/shared";
import { DEMO } from "../src/demo";
import { withTenant } from "../src/index";

function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Names = { female: string[]; male: string[]; last: string[] };

const LATIN: Names = {
  female: ["Maya", "Nour", "Lara", "Rita", "Yasmine", "Hiba", "Tala", "Joelle", "Reem", "Dima", "Christelle", "Zeina", "Sarah", "Nadine", "Layal", "Mira", "Carla", "Rania"],
  male: ["Karim", "Fadi", "Elie", "Jad", "Hadi", "Marc", "Rami", "Tarek", "Ali", "Georges", "Wael", "Nabil", "Charbel", "Ziad", "Samir", "Bassel", "Anthony", "Hassan"],
  last: ["Khoury", "Haddad", "Nassar", "Saab", "Aoun", "Frem", "Hamdan", "Matar", "Daher", "Rizk", "Chami", "Salameh", "Azar", "Gemayel", "Hayek", "Sleiman", "Karam", "Moussa", "Tannous", "Bou Khalil"],
};
const ARABIC: Names = {
  female: ["مريم", "نور", "سارة", "ريم", "لينا", "هبة", "دانة", "جنى", "رنا", "سلمى"],
  male: ["أحمد", "محمد", "عمر", "خالد", "يوسف", "حسن", "علي", "طارق", "سامي", "زياد"],
  last: ["الخطيب", "العلي", "حمدان", "شهاب", "عيسى", "منصور", "الحسيني", "قاسم", "بدران", "سلامة"],
};

interface DemoPlan {
  id: string;
  name: string;
  type: "recurring" | "fixed_term" | "class_pack" | "drop_in" | "trial";
  priceMinor: bigint;
  billingPeriod: "month" | "year" | null;
  durationDays: number | null;
  credits: number | null;
}

interface SubSpan {
  id: string;
  startsOn: string;
  endsOn: string | null;
  status: "pending" | "active" | "expired" | "cancelled";
  credits: number | null;
  used: number;
}

interface GymSpec {
  t: (typeof DEMO)[keyof typeof DEMO];
  names: Names;
  count: number;
  seed: number;
  phonePrefix: string;
  leadCount: number;
  latin: boolean;
}

const METHODS = ["cash", "cash", "card_terminal", "card_terminal", "bank_transfer"] as const;

export async function seedDemo(prisma: PrismaClient) {
  await seedGymDemo(prisma, { t: DEMO.ironfit, names: LATIN, count: 72, seed: 7, phonePrefix: "+961703", leadCount: 18, latin: true });
  await seedGymDemo(prisma, { t: DEMO.pulse, names: ARABIC, count: 22, seed: 11, phonePrefix: "+961713", leadCount: 6, latin: false });
}

async function seedGymDemo(prisma: PrismaClient, spec: GymSpec) {
  const { t } = spec;
  const rnd = prng(spec.seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } });
  const tz = tenant.timezone;
  const now = new Date();
  const today = localDate(now, tz);

  await withTenant(
    prisma,
    t.id,
    async (tx) => {
      if (await tx.member.findFirst({ where: { phone: { startsWith: spec.phonePrefix } } })) return;

      const plans = (await tx.membershipPlan.findMany({ where: { isActive: true } })) as DemoPlan[];
      const byType = (ty: DemoPlan["type"]) => plans.filter((p) => p.type === ty);
      const monthly = byType("recurring").find((p) => p.billingPeriod === "month")!;
      const annual = byType("recurring").find((p) => p.billingPeriod === "year");
      const pack = byType("class_pack")[0];
      const dropIn = byType("drop_in")[0];
      const trial = byType("trial")[0];

      let receipt = (await tx.tenantCounter.findUnique({ where: { tenantId_key: { tenantId: t.id, key: "receipt" } } }))?.value ?? 0;
      const payments: Prisma.PaymentCreateManyInput[] = [];
      const credits: { tenantId: string; memberId: string; subscriptionId: string; delta: number; reason: "purchase" | "booking" }[] = [];
      const pay = (memberId: string, subscriptionId: string, amount: bigint, startsOn: string) => {
        receipt += 1;
        payments.push({
          tenantId: t.id,
          memberId,
          subscriptionId,
          amountMinor: amount,
          currency: tenant.currency,
          method: pick(METHODS),
          receiptNumber: receipt,
          paidAt: zonedToUtc(startsOn, between(8 * 60, 20 * 60), tz),
        });
      };

      // ── Members and their membership history ──
      const members: { id: string; subs: SubSpan[]; regular: boolean }[] = [];
      for (let i = 0; i < spec.count; i++) {
        const female = rnd() < 0.5;
        const first = pick(female ? spec.names.female : spec.names.male);
        const last = pick(spec.names.last);
        const joinedDaysAgo = Math.floor(rnd() ** 1.4 * 360) + 1; // more recent joiners than old ones
        const joined = addDays(today, -joinedDaysAgo);
        const email = spec.latin
          ? `${first}.${last}.${i}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.com"
          : rnd() < 0.7
            ? `member${i}.${spec.t.slug}@example.com`
            : null;
        const member = await tx.member.create({
          data: {
            tenantId: t.id,
            firstName: first,
            lastName: last,
            email,
            phone: `${spec.phonePrefix}${String(100 + i).padStart(3, "0")}`,
            gender: female ? "female" : "male",
            language: spec.latin ? (rnd() < 0.2 ? "ar" : "en") : "ar",
            homeLocationId: pick(t.locations).id,
            checkinCode: randomBytes(9).toString("base64url"),
            dateOfBirth: toDateColumn(addDays(today, -between(18 * 365, 55 * 365))),
            emergencyContactName: rnd() < 0.6 ? `${pick(spec.names.female)} ${last}` : null,
            createdAt: zonedToUtc(joined, between(9 * 60, 20 * 60), tz),
          },
        });

        const subs: SubSpan[] = [];
        const add = async (plan: DemoPlan, startsOn: string, status: SubSpan["status"], paid: boolean) => {
          const endsOn = subscriptionEndsOn(plan, startsOn);
          const sub = await tx.memberSubscription.create({
            data: {
              tenantId: t.id,
              memberId: member.id,
              planId: plan.id,
              status,
              startsOn: toDateColumn(startsOn),
              endsOn: endsOn ? toDateColumn(endsOn) : null,
              priceMinor: plan.priceMinor,
              currency: tenant.currency,
              unlimited: plan.credits === null,
              autoRenew: plan.type === "recurring",
              cancelledAt: status === "cancelled" ? zonedToUtc(startsOn, 12 * 60, tz) : null,
            },
          });
          if (plan.credits) credits.push({ tenantId: t.id, memberId: member.id, subscriptionId: sub.id, delta: plan.credits, reason: "purchase" });
          if (paid && plan.priceMinor > 0n) pay(member.id, sub.id, plan.priceMinor, startsOn);
          subs.push({ id: sub.id, startsOn, endsOn, status, credits: plan.credits, used: 0 });
          return endsOn;
        };

        const roll = rnd();
        if (roll < 0.1 && trial) {
          // Recent trial, some converted to monthly.
          const start = addDays(today, -between(0, 20));
          const end = await add(trial, start, start > addDays(today, -7) ? "active" : "expired", false);
          if (end && end < today && rnd() < 0.6) await add(monthly, addDays(end, 1), "active", true);
        } else if (roll < 0.22 && annual) {
          await add(annual, joined, "active", true);
        } else if (roll < 0.42 && pack) {
          // Packs bought every ~6 weeks.
          let start = joined;
          while (start <= today) {
            const end = subscriptionEndsOn(pack, start)!;
            await add(pack, start, end < today ? "expired" : "active", true);
            start = addDays(start, between(35, 60));
          }
        } else if (roll < 0.47 && dropIn) {
          await add(dropIn, addDays(today, -between(0, 25)), "active", true);
        } else {
          // Monthly: renews every month until they leave (about 1 in 5 leave at some point).
          const leavesAfter = rnd() < 0.22 ? between(1, 8) : Infinity;
          let start = joined;
          for (let m = 0; start <= today; m++) {
            const end = subscriptionEndsOn(monthly, start)!;
            const current = end >= today;
            if (m >= leavesAfter) {
              if (rnd() < 0.5) await add(monthly, start, "cancelled", false);
              break;
            }
            const unpaid = current && rnd() < 0.08;
            await add(monthly, start, current ? (unpaid ? "pending" : "active") : "expired", !unpaid);
            start = addDays(end, 1);
          }
          // A few current members are on holiday this week.
          const cur = subs.find((s) => s.status === "active" && s.startsOn <= today && (!s.endsOn || s.endsOn >= today));
          if (cur && rnd() < 0.05) {
            await tx.subscriptionFreeze.create({
              data: { tenantId: t.id, subscriptionId: cur.id, startsOn: toDateColumn(addDays(today, -3)), endsOn: toDateColumn(addDays(today, 10)), reason: "Travel" },
            });
          }
        }
        members.push({ id: member.id, subs, regular: rnd() < 0.55 });
      }

      // ── Classes: past six weeks (generated directly) and the next few weeks ──
      const schedules = await tx.schedule.findMany({ where: { tenantId: t.id, isActive: true }, include: { location: true } });
      const past: { scheduleId: string; locationId: string; classTypeId: string; trainerUserId: string | null; startsAt: Date; endsAt: Date; capacity: number }[] = [];
      for (const s of schedules) {
        const occ = generateOccurrences(
          { weekday: s.weekday, startMinute: s.startMinute, durationMin: s.durationMin, validFrom: addDays(today, -42), validUntil: null },
          s.location.timezone ?? tz,
          addDays(today, -42),
          today,
          new Set(),
        ).filter((o) => o.startsAt < now);
        for (const o of occ) {
          past.push({ scheduleId: s.id, locationId: s.locationId, classTypeId: s.classTypeId, trainerUserId: s.trainerUserId, startsAt: o.startsAt, endsAt: o.endsAt, capacity: s.capacity });
        }
      }
      await tx.session.createMany({ data: past.map((p) => ({ tenantId: t.id, ...p })), skipDuplicates: true });

      const sessions = await tx.session.findMany({
        where: { tenantId: t.id, status: "scheduled", startsAt: { gte: zonedToUtc(addDays(today, -42), 0, tz), lt: zonedToUtc(addDays(today, 8), 0, tz) } },
        orderBy: { startsAt: "asc" },
      });

      const eligibleSub = (m: (typeof members)[number], date: string) =>
        m.subs.find(
          (s) =>
            s.status === "active" || s.status === "expired"
              ? s.startsOn <= date && (!s.endsOn || date <= s.endsOn) && (s.credits === null || s.used < s.credits)
              : false,
        );

      const bookings: {
        tenantId: string;
        sessionId: string;
        memberId: string;
        subscriptionId: string;
        status: "booked" | "attended" | "no_show" | "late_cancel";
        source: "staff" | "widget";
        creditUsed: boolean;
        createdAt: Date;
        cancelledAt: Date | null;
      }[] = [];
      const checkIns: { tenantId: string; memberId: string; locationId: string; method: "qr" | "search"; checkedInAt: Date }[] = [];
      const waitlist: { tenantId: string; sessionId: string; memberId: string; createdAt: Date }[] = [];

      for (const s of sessions) {
        const date = localDate(s.startsAt, tz);
        const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(s.startsAt));
        const isPast = s.startsAt < now;
        const daysAhead = (s.startsAt.getTime() - now.getTime()) / 86_400_000;
        // Evenings and weekends fill up; early mornings and midday less; far-future classes are still filling.
        let fill = hour >= 17 ? 0.75 + rnd() * 0.35 : hour < 9 ? 0.45 + rnd() * 0.35 : 0.3 + rnd() * 0.4;
        // Evenings in the next few days are where the waitlists form.
        if (!isPast) fill = daysAhead < 4 && hour >= 17 ? 1.05 + rnd() * 0.3 : fill * Math.max(0.35, 1 - daysAhead / 9);
        const wanted = Math.round(s.capacity * Math.min(fill, 1.25));
        const pool = members.filter((m) => eligibleSub(m, date)).sort(() => rnd() - 0.5);
        const regularsFirst = [...pool.filter((m) => m.regular), ...pool.filter((m) => !m.regular)];
        let seats = 0;
        for (const m of regularsFirst) {
          if (seats >= wanted) break;
          const sub = eligibleSub(m, date)!;
          if (seats >= s.capacity) {
            if (!isPast && waitlist.filter((w) => w.sessionId === s.id).length < 4) {
              waitlist.push({ tenantId: t.id, sessionId: s.id, memberId: m.id, createdAt: new Date(s.startsAt.getTime() - between(2, 48) * 3_600_000) });
            }
            seats++;
            continue;
          }
          const r = rnd();
          const status = !isPast ? "booked" : r < 0.86 ? "attended" : r < 0.94 ? "no_show" : "late_cancel";
          const creditUsed = sub.credits !== null;
          if (creditUsed && status !== "late_cancel") sub.used++;
          if (creditUsed && status === "late_cancel") sub.used++; // late cancel keeps the credit
          const bookedAt = new Date(s.startsAt.getTime() - between(3, 120) * 3_600_000);
          bookings.push({
            tenantId: t.id,
            sessionId: s.id,
            memberId: m.id,
            subscriptionId: sub.id,
            status,
            source: rnd() < 0.7 ? "widget" : "staff",
            creditUsed,
            createdAt: bookedAt < now ? bookedAt : new Date(now.getTime() - 3_600_000),
            cancelledAt: status === "late_cancel" ? new Date(s.startsAt.getTime() - between(15, 100) * 60_000) : null,
          });
          if (status === "attended") {
            checkIns.push({ tenantId: t.id, memberId: m.id, locationId: s.locationId, method: rnd() < 0.85 ? "qr" : "search", checkedInAt: new Date(s.startsAt.getTime() - between(2, 15) * 60_000) });
          }
          if (status !== "late_cancel") seats++;
        }
      }

      // Gym-floor visits without a class (unlimited members), past six weeks and earlier today.
      for (const m of members) {
        for (let d = 42; d >= 0; d--) {
          const date = addDays(today, -d);
          const sub = eligibleSub(m, date);
          if (!sub || sub.credits !== null || rnd() > (m.regular ? 0.32 : 0.12)) continue;
          const at = zonedToUtc(date, between(6 * 60, 21 * 60), tz);
          if (at < now) checkIns.push({ tenantId: t.id, memberId: m.id, locationId: pick(t.locations).id, method: "qr", checkedInAt: at });
        }
      }

      await tx.payment.createMany({ data: payments });
      await tx.tenantCounter.upsert({
        where: { tenantId_key: { tenantId: t.id, key: "receipt" } },
        create: { tenantId: t.id, key: "receipt", value: receipt },
        update: { value: receipt },
      });
      await tx.creditEntry.createMany({ data: credits });
      await tx.booking.createMany({ data: bookings, skipDuplicates: true });

      // Credits used by pack bookings (−1 each; late cancels keep the credit used).
      const used = await tx.booking.findMany({ where: { tenantId: t.id, creditUsed: true, memberId: { in: members.map((m) => m.id) } } });
      await tx.creditEntry.createMany({
        data: used.map((b) => ({ tenantId: t.id, memberId: b.memberId, subscriptionId: b.subscriptionId!, bookingId: b.id, delta: -1, reason: "booking" as const })),
      });
      await tx.waitlistEntry.createMany({ data: waitlist, skipDuplicates: true });
      await tx.checkIn.createMany({ data: checkIns });
      await tx.booking.updateMany({
        where: { tenantId: t.id, status: "booked", memberId: { in: members.map((m) => m.id) }, session: { startsAt: { lt: now } } },
        data: { status: "attended" },
      });
      await tx.$executeRaw`
        UPDATE sessions s SET booked_count = (
          SELECT count(*) FROM bookings b
          WHERE b.session_id = s.id AND b.status IN ('booked', 'attended', 'no_show'))
        WHERE s.tenant_id = ${t.id}::uuid`;

      // Website leads.
      const stages = ["new", "new", "new", "contacted", "contacted", "trial", "member", "lost"] as const;
      const sources = ["widget", "widget", "widget", "instagram", "walk-in", "referral"];
      const messages = spec.latin
        ? ["Do you have women-only classes?", "Interested in boxing for beginners", "What are your opening hours on Sunday?", null, "Can I try a spin class first?", null]
        : ["هل توجد حصص للنساء فقط؟", "أريد تجربة حصة يوغا", null];
      await tx.lead.createMany({
        data: Array.from({ length: spec.leadCount }, (_, i) => {
          const female = rnd() < 0.5;
          const first = pick(female ? spec.names.female : spec.names.male);
          const createdAt = zonedToUtc(addDays(today, -Math.floor(rnd() ** 1.5 * 60)), between(8 * 60, 22 * 60), tz);
          return {
            tenantId: t.id,
            firstName: first,
            lastName: pick(spec.names.last),
            email: rnd() < 0.7 ? `lead${i}.${t.slug}@example.com` : null,
            phone: `${spec.phonePrefix.replace(/3$/, "9")}${String(100 + i).padStart(3, "0")}`,
            message: pick(messages),
            source: pick(sources),
            stage: pick(stages),
            createdAt: createdAt < now ? createdAt : now,
          };
        }),
      });

    },
    { timeoutMs: 600_000 },
  );
}

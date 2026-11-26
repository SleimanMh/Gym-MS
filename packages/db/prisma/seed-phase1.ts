/**
 * Phase 1 demo data: class types, weekly schedules, membership plans, members in every
 * membership state the front desk meets, and a year of payment history for the dashboard.
 * Idempotent: keyed on fixed ids / unique names; members' memberships are only created once.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { addDays, localDate, parseHhMm, subscriptionEndsOn, toDateColumn, zonedToUtc } from "@gym/shared";
import { DEMO } from "../src/demo";
import { generateSessions } from "../src/sessions";
import { withTenant, type TenantTx } from "../src/index";

/** Stable UUID from a label, so re-running the seed updates instead of duplicating. */
const demoId = (label: string) => {
  const h = createHash("sha256").update(label).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

type PlanSeed = {
  name: string;
  type: "recurring" | "fixed_term" | "class_pack" | "drop_in" | "trial";
  priceMinor: number;
  billingPeriod?: "month" | "year";
  durationDays?: number;
  credits?: number;
  description?: string;
};

type MemberSeed = {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  language?: "en" | "ar";
  plan?: string;
  /** Days ago the membership started (default 0). */
  startedDaysAgo?: number;
  paid?: boolean;
  freezeNow?: boolean;
};

const IRONFIT = {
  classTypes: [
    { name: "HIIT", color: "#DC2626", durationMin: 45, defaultCapacity: 16, description: "High-intensity intervals. All levels." },
    { name: "Yoga", color: "#059669", durationMin: 60, defaultCapacity: 20, description: "Vinyasa flow with mobility work." },
    { name: "Spin", color: "#7C3AED", durationMin: 45, defaultCapacity: 12, description: "Indoor cycling to music." },
    { name: "Boxing", color: "#EA580C", durationMin: 60, defaultCapacity: 14, description: "Pads, bags and conditioning." },
  ],
  // [class type, location index, weekday (0 = Sun), start, capacity override]
  schedules: [
    ["HIIT", 0, 1, "07:00"], ["HIIT", 0, 3, "07:00"], ["HIIT", 0, 2, "18:00", 2],
    ["Yoga", 0, 2, "09:30"], ["Yoga", 0, 4, "19:00"], ["Yoga", 1, 6, "10:00"],
    ["Spin", 0, 1, "18:30"], ["Spin", 1, 3, "18:30"], ["Spin", 0, 5, "17:30"],
    ["Boxing", 0, 4, "20:00"], ["Boxing", 1, 0, "11:00"], ["HIIT", 1, 6, "12:00"],
  ] as [string, number, number, string, number?][],
  plans: [
    { name: "Monthly unlimited", type: "recurring", priceMinor: 5900, billingPeriod: "month", description: "All classes, all branches." },
    { name: "Annual unlimited", type: "recurring", priceMinor: 59000, billingPeriod: "year", description: "Two months free." },
    { name: "10-class pack", type: "class_pack", priceMinor: 12000, credits: 10, durationDays: 90 },
    { name: "Drop-in", type: "drop_in", priceMinor: 1500, credits: 1, durationDays: 30 },
    { name: "Free 7-day trial", type: "trial", priceMinor: 0, durationDays: 7 },
  ] as PlanSeed[],
  members: [
    { firstName: "Omar", lastName: "Saleh", email: "member@ironfit.test", phone: "+96170000001", plan: "Monthly unlimited", startedDaysAgo: 10, paid: true },
    { firstName: "Karim", lastName: "Haddad", email: "karim@ironfit.test", phone: "+96170000002", plan: "10-class pack", startedDaysAgo: 20, paid: true },
    { firstName: "Sara", lastName: "Khalil", email: "sara@ironfit.test", phone: "+96170000003", plan: "Monthly unlimited", paid: false },
    { firstName: "Yara", lastName: "Mansour", email: "yara@ironfit.test", phone: "+96170000004", plan: "Monthly unlimited", startedDaysAgo: 25, paid: true },
    { firstName: "Ziad", lastName: "Fares", email: "ziad@ironfit.test", phone: "+96170000005", plan: "Annual unlimited", startedDaysAgo: 120, paid: true, freezeNow: true },
    { firstName: "Hala", lastName: "Nasr", phone: "+96170000006" },
    { firstName: "Tony", lastName: "Abboud", email: "tony@ironfit.test", phone: "+96170000007", plan: "Drop-in", paid: true },
    { firstName: "Rana", lastName: "Daher", email: "rana@ironfit.test", phone: "+96170000008", language: "ar", plan: "Free 7-day trial" },
  ] as MemberSeed[],
};

const PULSE = {
  classTypes: [
    { name: "يوغا", color: "#059669", durationMin: 60, defaultCapacity: 15, description: "يوغا للمبتدئين" },
    { name: "تمارين القوة", color: "#0EA5E9", durationMin: 45, defaultCapacity: 12, description: "تمارين بالأوزان" },
  ],
  schedules: [
    ["يوغا", 0, 1, "19:00"], ["يوغا", 0, 3, "19:00"], ["تمارين القوة", 0, 2, "18:00"], ["تمارين القوة", 0, 4, "18:00"],
  ] as [string, number, number, string, number?][],
  plans: [{ name: "اشتراك شهري", type: "recurring", priceMinor: 4000, billingPeriod: "month" }] as PlanSeed[],
  members: [
    { firstName: "ليلى", lastName: "حداد", email: "layla@pulse.test", phone: "+96171000001", language: "ar", plan: "اشتراك شهري", startedDaysAgo: 5, paid: true },
    { firstName: "سامر", lastName: "يوسف", email: "samer@pulse.test", phone: "+96171000002", language: "ar", plan: "اشتراك شهري", paid: false },
  ] as MemberSeed[],
};

async function nextReceipt(tx: TenantTx): Promise<number> {
  const r = await tx.$queryRaw<{ value: number }[]>`SELECT app_next_counter('receipt') AS value`;
  return r[0]!.value;
}

async function seedGym(
  prisma: PrismaClient,
  t: (typeof DEMO)[keyof typeof DEMO],
  data: typeof IRONFIT,
  /** Class type name → the coach (user email) who leads it. */
  trainers: Record<string, string>,
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } });
  const trainerUsers = await prisma.user.findMany({ where: { email: { in: Object.values(trainers) } } });
  const trainerFor = (classType: string) => trainerUsers.find((u) => u.email === trainers[classType])?.id ?? null;
  const tz = tenant.timezone;
  const today = localDate(new Date(), tz);

  await withTenant(
    prisma,
    t.id,
    async (tx) => {
      const classTypeId = new Map<string, string>();
      for (const c of data.classTypes) {
        const row = await tx.classType.upsert({
          where: { tenantId_name: { tenantId: t.id, name: c.name } },
          create: { tenantId: t.id, ...c },
          update: { color: c.color, description: c.description },
        });
        classTypeId.set(c.name, row.id);
      }

      for (const [i, [ct, loc, weekday, time, cap]] of data.schedules.entries()) {
        const type = data.classTypes.find((c) => c.name === ct)!;
        const id = demoId(`${t.slug}:schedule:${i}`);
        const location = t.locations[loc]!;
        await tx.schedule.upsert({
          where: { id },
          create: {
            id,
            tenantId: t.id,
            locationId: location.id,
            classTypeId: classTypeId.get(ct)!,
            trainerUserId: trainerFor(ct),
            weekday,
            startMinute: parseHhMm(time),
            durationMin: type.durationMin,
            capacity: cap ?? type.defaultCapacity,
            validFrom: toDateColumn(addDays(today, -60)),
          },
          update: { trainerUserId: trainerFor(ct) },
        });
      }

      const planId = new Map<string, { id: string; plan: PlanSeed }>();
      for (const [i, p] of data.plans.entries()) {
        const row = await tx.membershipPlan.upsert({
          where: { tenantId_name: { tenantId: t.id, name: p.name } },
          create: {
            tenantId: t.id,
            name: p.name,
            description: p.description ?? null,
            type: p.type,
            priceMinor: BigInt(p.priceMinor),
            currency: tenant.currency,
            billingPeriod: p.billingPeriod ?? null,
            durationDays: p.type === "recurring" ? null : (p.durationDays ?? null),
            credits: p.credits ?? null,
            sortOrder: i,
          },
          update: {},
        });
        planId.set(p.name, { id: row.id, plan: p });
      }

      for (const m of data.members) {
        const existing = await tx.member.findFirst({ where: { phone: m.phone } });
        const member =
          existing ??
          (await tx.member.create({
            data: {
              tenantId: t.id,
              firstName: m.firstName,
              lastName: m.lastName,
              email: m.email ?? null,
              phone: m.phone,
              language: m.language ?? null,
              homeLocationId: t.locations[0]!.id,
              checkinCode: randomBytes(9).toString("base64url"),
              createdAt: new Date(Date.now() - (m.startedDaysAgo ?? 0) * 86_400_000),
            },
          }));
        if (existing || !m.plan) continue;

        const { id: pid, plan } = planId.get(m.plan)!;
        const startsOn = addDays(today, -(m.startedDaysAgo ?? 0));
        const endsOn = subscriptionEndsOn(
          { type: plan.type, billingPeriod: plan.billingPeriod ?? null, durationDays: plan.type === "recurring" ? null : (plan.durationDays ?? null) },
          startsOn,
        );
        const free = plan.priceMinor === 0;
        const sub = await tx.memberSubscription.create({
          data: {
            tenantId: t.id,
            memberId: member.id,
            planId: pid,
            status: free || m.paid ? "active" : "pending",
            startsOn: toDateColumn(startsOn),
            endsOn: endsOn ? toDateColumn(endsOn) : null,
            priceMinor: BigInt(plan.priceMinor),
            currency: tenant.currency,
            unlimited: !plan.credits,
          },
        });
        if (plan.credits) {
          await tx.creditEntry.create({
            data: { tenantId: t.id, memberId: member.id, subscriptionId: sub.id, delta: plan.credits, reason: "purchase" },
          });
        }
        if (m.paid && !free) {
          await tx.payment.create({
            data: {
              tenantId: t.id,
              memberId: member.id,
              subscriptionId: sub.id,
              amountMinor: BigInt(plan.priceMinor),
              currency: tenant.currency,
              method: "cash",
              receiptNumber: await nextReceipt(tx),
              paidAt: zonedToUtc(startsOn, 10 * 60, tz),
            },
          });
        }
        if (m.freezeNow) {
          await tx.subscriptionFreeze.create({
            data: {
              tenantId: t.id,
              subscriptionId: sub.id,
              startsOn: toDateColumn(addDays(today, -2)),
              endsOn: toDateColumn(addDays(today, 12)),
              reason: "Travel",
            },
          });
          if (endsOn) await tx.memberSubscription.update({ where: { id: sub.id }, data: { endsOn: toDateColumn(addDays(endsOn, 15)) } });
        }
      }

      await generateSessions(tx, { id: t.id, timezone: tz });
    },
    { timeoutMs: 120_000 },
  );
}

export async function seedPhase1(prisma: PrismaClient) {
  await seedGym(prisma, DEMO.ironfit, IRONFIT, {
    HIIT: "coach@ironfit.test",
    Yoga: "lara.coach@ironfit.test",
    Spin: "hiba.coach@ironfit.test",
    Boxing: "ziad.coach@ironfit.test",
  });
  await seedGym(prisma, DEMO.pulse, PULSE, {});
}

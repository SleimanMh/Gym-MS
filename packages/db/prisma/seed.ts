/**
 * Seed: features, the four plans, one platform super admin, and two demo tenants.
 * Idempotent — safe to run repeatedly. Runs as the APP role (scripts/with-env.mjs), so RLS applies
 * and tenant data is written through withTenant() exactly like the API.
 *
 * Demo logins (dev tokens; POST /v1/dev/token):
 *   platform@gym.local                         — platform super admin
 *   owner@ironfit.test / frontdesk@ironfit.test / coach@ironfit.test / accounts@ironfit.test / member@ironfit.test — "ironfit" (Pro)
 *   owner@pulse.test                           — tenant "pulse" (Starter)
 */
import {
  DEFAULT_ROLES,
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLAN_CATALOGUE,
  PLAN_CODES,
  type RoleKey,
} from "@gym/shared";
import { createPrismaClient, hashApiKey, withTenant } from "../src/index";
import { DEMO } from "../src/demo";
import { seedDemo } from "./seed-demo";
import { seedPhase1 } from "./seed-phase1";
import { seedStaffFinance } from "./seed-staff-finance";

const prisma = createPrismaClient();


async function seedCatalogue() {
  for (const [key, description] of Object.entries(FEATURE_LABELS)) {
    await prisma.feature.upsert({
      where: { key },
      create: { key, kind: "feature", description },
      update: { description },
    });
  }
  for (const [key, description] of Object.entries(LIMIT_LABELS)) {
    await prisma.feature.upsert({
      where: { key },
      create: { key, kind: "limit", description },
      update: { description },
    });
  }

  for (const [i, code] of PLAN_CODES.entries()) {
    const def = PLAN_CATALOGUE[code];
    const plan = await prisma.plan.upsert({
      where: { code },
      create: { code, name: def.name, sortOrder: i },
      update: { name: def.name, sortOrder: i },
    });
    await prisma.planFeature.deleteMany({ where: { planId: plan.id } });
    await prisma.planFeature.createMany({
      data: [
        ...def.features.map((featureKey) => ({ planId: plan.id, featureKey, enabled: true })),
        ...Object.entries(def.limits).map(([featureKey, limitValue]) => ({
          planId: plan.id,
          featureKey,
          enabled: true,
          limitValue,
        })),
      ],
    });
  }
}

async function upsertUser(email: string, firstName: string, lastName: string) {
  return prisma.user.upsert({
    where: { email },
    create: { email, firstName, lastName, authSubject: `dev|${email}` },
    update: { firstName, lastName },
  });
}

async function seedTenant(t: (typeof DEMO)[keyof typeof DEMO]) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: t.plan } });

  await prisma.tenant.upsert({
    where: { id: t.id },
    create: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: "active",
      defaultLanguage: t.language,
      timezone: "Asia/Beirut",
      currency: "USD",
    },
    update: { name: t.name, defaultLanguage: t.language },
  });

  const current = await prisma.tenantSubscription.findFirst({ where: { tenantId: t.id, isCurrent: true } });
  if (current?.planId !== plan.id) {
    await prisma.tenantSubscription.updateMany({ where: { tenantId: t.id, isCurrent: true }, data: { isCurrent: false } });
    await prisma.tenantSubscription.create({
      data: { tenantId: t.id, planId: plan.id, status: "active", isCurrent: true },
    });
  }

  const users = [];
  for (const u of t.users) users.push({ ...u, record: await upsertUser(u.email, u.firstName, u.lastName) });

  await withTenant(prisma, t.id, async (tx) => {
    await tx.tenantSettings.upsert({
      where: { tenantId: t.id },
      create: { tenantId: t.id, primaryColor: t.color },
      update: { primaryColor: t.color },
    });

    for (const l of t.locations) {
      await tx.location.upsert({
        where: { id: l.id },
        create: { id: l.id, tenantId: t.id, slug: l.slug, name: l.name },
        update: { name: l.name },
      });
    }

    await tx.apiKey.upsert({
      where: { keyHash: hashApiKey(t.publishableKey) },
      create: {
        tenantId: t.id,
        type: "publishable",
        name: "Website widget (dev)",
        prefix: t.publishableKey.slice(0, 10),
        keyHash: hashApiKey(t.publishableKey),
      },
      update: {},
    });

    await tx.allowedOrigin.upsert({
      where: { tenantId_origin: { tenantId: t.id, origin: "http://localhost:5173" } },
      create: { tenantId: t.id, origin: "http://localhost:5173" },
      update: {},
    });

    for (const u of users) {
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: t.id, userId: u.record.id } },
        create: { tenantId: t.id, userId: u.record.id, status: "active" },
        update: { status: "active" },
      });
      await tx.userRole.deleteMany({ where: { tenantId: t.id, userId: u.record.id } });
      await tx.userRole.createMany({
        data: u.roles.map((roleKey) => {
          if (!(roleKey in DEFAULT_ROLES)) throw new Error(`unknown role ${roleKey}`);
          return { tenantId: t.id, userId: u.record.id, roleKey: roleKey as RoleKey };
        }),
      });
    }
  });
}

async function main() {
  await seedCatalogue();

  const admin = await upsertUser("platform@gym.local", "Platform", "Admin");
  await prisma.platformUser.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, role: "super_admin" },
    update: { role: "super_admin" },
  });

  await seedTenant(DEMO.ironfit);
  await seedTenant(DEMO.pulse);
  await seedPhase1(prisma);
  await seedDemo(prisma);
  await seedStaffFinance(prisma);

  console.log("Seed complete.");
  console.log(`  ironfit publishable key: ${DEMO.ironfit.publishableKey}`);
  console.log(`  pulse   publishable key: ${DEMO.pulse.publishableKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

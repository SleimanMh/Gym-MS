/**
 * Phase 3 demo data: the team (employees on salary, hourly and per-class pay), the front-desk
 * roster, a year of clock-ins, who sold which membership (for commissions), expense categories,
 * twelve months of expenses (rent and other monthly bills as repeating templates) and this
 * month's budgets.
 *
 * Expenses and staff only for IronFit (Pro); Pulse (Starter) only gets the default categories.
 * Deterministic and written through withTenant() as the app role. Skipped when the gym already
 * has employees.
 */
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES, addDays, addMonths, localDate, toDateColumn, zonedToUtc } from "@gym/shared";
import { DEMO } from "../src/demo";
import { withTenant, type TenantTx } from "../src/index";

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

async function seedCategories(tx: TenantTx, tenantId: string, lang: "en" | "ar") {
  const ids = new Map<string, string>();
  for (const c of DEFAULT_EXPENSE_CATEGORIES) {
    const row = await tx.expenseCategory.upsert({
      where: { tenantId_name: { tenantId, name: c[lang] } },
      create: { tenantId, key: c.key, name: c[lang] },
      update: { key: c.key },
    });
    ids.set(c.key, row.id);
  }
  return ids;
}

type EmpSeed = {
  email?: string;
  firstName: string;
  lastName: string;
  title: string;
  payType: "salary" | "hourly" | "per_class";
  rate: number; // minor units
  commissionBp?: number;
  location: number;
  monthsAgo: number;
  login?: boolean; // links to the user with this email
  phone: string;
};

const TEAM: EmpSeed[] = [
  { email: "frontdesk@ironfit.test", firstName: "Lea", lastName: "Khoury", title: "Front desk lead", payType: "hourly", rate: 500, commissionBp: 500, location: 0, monthsAgo: 13, login: true, phone: "+96176100001" },
  { email: "coach@ironfit.test", firstName: "Nadim", lastName: "Aoun", title: "Head coach · HIIT", payType: "per_class", rate: 1400, commissionBp: 300, location: 0, monthsAgo: 13, login: true, phone: "+96176100002" },
  { email: "lara.coach@ironfit.test", firstName: "Lara", lastName: "Saab", title: "Yoga instructor", payType: "per_class", rate: 1200, location: 0, monthsAgo: 10, login: true, phone: "+96176100003" },
  { email: "hiba.coach@ironfit.test", firstName: "Hiba", lastName: "Matar", title: "Spin instructor", payType: "per_class", rate: 1200, location: 1, monthsAgo: 8, login: true, phone: "+96176100004" },
  { email: "ziad.coach@ironfit.test", firstName: "Ziad", lastName: "Rizk", title: "Boxing coach & floor trainer", payType: "hourly", rate: 800, commissionBp: 200, location: 1, monthsAgo: 6, login: true, phone: "+96176100005" },
  { email: "accounts@ironfit.test", firstName: "Joelle", lastName: "Azar", title: "Accountant (part-time)", payType: "salary", rate: 20000, location: 0, monthsAgo: 12, login: true, phone: "+96176100006" },
  { firstName: "Fadi", lastName: "Chami", title: "Facility assistant", payType: "salary", rate: 25000, location: 0, monthsAgo: 11, phone: "+96176100007" },
];

export async function seedStaffFinance(prisma: PrismaClient) {
  await withTenant(prisma, DEMO.pulse.id, (tx) => seedCategories(tx, DEMO.pulse.id, "ar"));

  const t = DEMO.ironfit;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } });
  const tz = tenant.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const users = await prisma.user.findMany({ where: { email: { in: t.users.map((u) => u.email) } } });
  const userId = (email?: string) => users.find((u) => u.email === email)?.id ?? null;
  const rnd = prng(23);
  const at = (d: string, hh: number, mm = 0) => zonedToUtc(d, hh * 60 + mm, tz);

  await withTenant(
    prisma,
    t.id,
    async (tx) => {
      if (await tx.employee.count()) return;
      const cat = await seedCategories(tx, t.id, "en");

      // ── Team ──
      const emp = new Map<string, { id: string; startedOn: string; seed: EmpSeed }>();
      for (const e of TEAM) {
        const startedOn = addMonths(thisMonth, -e.monthsAgo);
        const row = await tx.employee.create({
          data: {
            tenantId: t.id,
            userId: e.login ? userId(e.email) : null,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email ?? null,
            phone: e.phone,
            title: e.title,
            payType: e.payType,
            payRateMinor: BigInt(e.rate),
            currency: tenant.currency,
            commissionBp: e.commissionBp ?? 0,
            homeLocationId: t.locations[e.location]!.id,
            startedOn: toDateColumn(startedOn),
          },
        });
        emp.set(e.firstName, { id: row.id, startedOn, seed: e });
      }

      // ── Rota: front desk and floor shifts, four weeks back and two weeks ahead ──
      // [employee, weekdays, start hour, end hour, location, activity]
      const ROTA: [string, number[], number, number, number, string][] = [
        ["Lea", [1, 3, 5, 6], 9, 14, 0, "front_desk"],
        ["Ziad", [0, 4], 10, 14, 1, "floor"],
        ["Fadi", [1, 3, 5], 6, 12, 0, "cleaning"],
        ["Fadi", [2, 4, 6], 15, 21, 1, "floor"],
      ];
      // Extra slots that overlap other people's on purpose (same time, different activity).
      const EXTRA: [string, number[], number, number, number, string][] = [
        ["Nadim", [1, 3], 10, 11, 0, "personal_training"],
        ["Lara", [2, 4], 12, 13, 0, "personal_training"],
        ["Hiba", [5], 11, 12, 1, "personal_training"],
        ["Joelle", [1], 10, 13, 0, "admin"],
      ];
      const shifts = [];
      for (let d = addDays(today, -28); d <= addDays(today, 14); d = addDays(d, 1)) {
        for (const [name, days, from, to, loc, activity] of [...ROTA, ...EXTRA]) {
          if (!days.includes(weekday(d))) continue;
          shifts.push({ tenantId: t.id, employeeId: emp.get(name)!.id, locationId: t.locations[loc]!.id, startsAt: at(d, from), endsAt: at(d, to), activity });
        }
      }
      await tx.shift.createMany({ data: shifts });

      // ── Clock-ins for the hourly staff since they started (a few minutes either side of the shift) ──
      const entries = [];
      for (const name of ["Lea", "Ziad"]) {
        const e = emp.get(name)!;
        const rota = ROTA.filter((r) => r[0] === name);
        for (let d = e.startedOn; d <= today; d = addDays(d, 1)) {
          for (const [, days, from, to, loc] of rota) {
            if (!days.includes(weekday(d)) || rnd() < 0.06) continue; // the odd day off
            const clockIn = at(d, from, Math.round(rnd() * 14) - 7);
            if (clockIn > now) continue;
            const end = at(d, to, Math.round(rnd() * 25) - 5);
            entries.push({ tenantId: t.id, employeeId: e.id, locationId: t.locations[loc]!.id, clockIn, clockOut: end > now ? null : end });
          }
        }
      }
      // Only the latest entry per person may be open (one-open-entry rule); close any earlier ones.
      const open = new Set<string>();
      for (const en of entries.sort((a, b) => b.clockIn.getTime() - a.clockIn.getTime())) {
        if (en.clockOut === null) {
          if (open.has(en.employeeId)) en.clockOut = new Date(en.clockIn.getTime() + 4 * 3_600_000);
          open.add(en.employeeId);
        }
      }
      await tx.timeEntry.createMany({ data: entries });

      // ── Who sold each membership: mostly the front desk, some the head coach and the owner ──
      const sellers = [userId("frontdesk@ironfit.test"), userId("frontdesk@ironfit.test"), userId("frontdesk@ironfit.test"), userId("coach@ironfit.test"), userId("owner@ironfit.test"), userId("ziad.coach@ironfit.test")];
      const subs = await tx.memberSubscription.findMany({ where: { createdByUserId: null }, select: { id: true, createdAt: true }, orderBy: { createdAt: "asc" } });
      const ziadFrom = at(emp.get("Ziad")!.startedOn, 0);
      for (const s of subs) {
        let seller = sellers[Math.floor(rnd() * sellers.length)]!;
        if (seller === userId("ziad.coach@ironfit.test") && s.createdAt < ziadFrom) seller = sellers[0]!;
        await tx.memberSubscription.update({ where: { id: s.id }, data: { createdByUserId: seller } });
      }

      // ── Expenses: twelve months ──
      const owner = userId("owner@ironfit.test");
      const accountant = userId("accounts@ironfit.test");
      const first = addMonths(thisMonth, -11);
      const expenses: {
        id?: string;
        categoryId: string;
        locationId: string | null;
        amountMinor: bigint;
        spentOn: string;
        vendor: string;
        note?: string;
        recurringMonthly?: boolean;
        recurringParentId?: string;
      }[] = [];

      // Monthly bills: a template in the first month, then the worker's copies (same day each month).
      const BILLS: [string, number, string, number, number][] = [
        ["rent", 1, "Hamra Properties — Downtown lease", 55000, 0],
        ["rent", 1, "Marina Towers — unit 4B", 32000, 1],
        ["cleaning", 5, "SparkleClean", 12000, 0],
        ["software", 3, "Studio software subscription", 5900, 0],
        ["utilities", 10, "Ogero internet", 4500, 0],
      ];
      for (const [key, day, vendor, amount, loc] of BILLS) {
        const tpl = await tx.expense.create({
          data: {
            tenantId: t.id,
            categoryId: cat.get(key)!,
            locationId: t.locations[loc]!.id,
            amountMinor: BigInt(amount),
            currency: tenant.currency,
            spentOn: toDateColumn(`${first.slice(0, 8)}${String(day).padStart(2, "0")}`),
            vendor,
            recurringMonthly: true,
            createdByUserId: owner,
          },
        });
        for (let m = addMonths(first, 1); m <= thisMonth; m = addMonths(m, 1)) {
          const due = `${m.slice(0, 8)}${String(day).padStart(2, "0")}`;
          if (due > today) continue;
          expenses.push({ categoryId: tpl.categoryId, locationId: tpl.locationId, amountMinor: tpl.amountMinor, spentOn: due, vendor, recurringParentId: tpl.id });
        }
      }

      // Variable costs.
      for (let i = 0, m = first; m <= thisMonth; i++, m = addMonths(m, 1)) {
        const month = Number(m.slice(5, 7));
        const day = (d: number) => {
          const s = `${m.slice(0, 8)}${String(d).padStart(2, "0")}`;
          return s <= today ? s : null;
        };
        const summer = month >= 6 && month <= 9 ? 1.45 : month === 12 || month <= 2 ? 1.2 : 1;
        for (const [loc, base] of [[0, 11000], [1, 6000]] as const) {
          const d = day(18);
          if (d) expenses.push({ categoryId: cat.get("utilities")!, locationId: t.locations[loc]!.id, amountMinor: BigInt(Math.round((base * summer * (0.9 + rnd() * 0.2)) / 100) * 100), spentOn: d, vendor: "EDL electricity + generator" });
        }
        if (rnd() < 0.8) {
          const d = day(8 + Math.floor(rnd() * 12));
          if (d) expenses.push({ categoryId: cat.get("marketing")!, locationId: null, amountMinor: BigInt(Math.round((6000 + rnd() * 14000) / 500) * 500), spentOn: d, vendor: rnd() < 0.6 ? "Instagram ads" : "Flyers — PrintHub", note: month === 1 ? "New year campaign" : undefined });
        }
        if (i % 2 === 1 || rnd() < 0.3) {
          const d = day(12 + Math.floor(rnd() * 14));
          if (d) expenses.push({ categoryId: cat.get("maintenance")!, locationId: t.locations[rnd() < 0.7 ? 0 : 1]!.id, amountMinor: BigInt(Math.round((4000 + rnd() * 10000) / 500) * 500), spentOn: d, vendor: rnd() < 0.5 ? "FixIt technicians" : "AC service — CoolAir" });
        }
        const d = day(20);
        if (d) expenses.push({ categoryId: cat.get("other")!, locationId: null, amountMinor: BigInt(2500 + Math.round(rnd() * 10) * 100), spentOn: d, vendor: "Water & supplies" });
      }
      const EQUIPMENT: [number, number, string, string][] = [
        [-10, 48000, "Kettlebells & rack — FitSupply", "Downtown floor"],
        [-7, 92000, "Two spin bikes — CycleTech", "Marina spin room"],
        [-4, 24000, "Boxing gloves & pads", ""],
        [-1, 36000, "Rowing machine (used)", ""],
        [0, 16000, "Yoga mats ×30", ""],
      ];
      for (const [offset, amount, vendor, note] of EQUIPMENT) {
        const d = addDays(addMonths(thisMonth, offset), 13);
        if (d > today) continue;
        expenses.push({ categoryId: cat.get("equipment")!, locationId: t.locations[0]!.id, amountMinor: BigInt(amount), spentOn: d, vendor, note: note || undefined });
      }
      await tx.expense.createMany({
        data: expenses.map((e) => ({
          tenantId: t.id,
          categoryId: e.categoryId,
          locationId: e.locationId,
          amountMinor: e.amountMinor,
          currency: tenant.currency,
          spentOn: toDateColumn(e.spentOn),
          vendor: e.vendor,
          note: e.note ?? null,
          recurringParentId: e.recurringParentId ?? null,
          createdByUserId: e.recurringParentId ? null : accountant,
        })),
      });

      // ── This month's budgets ──
      const BUDGETS: Record<string, number> = { rent: 87000, utilities: 26000, cleaning: 15000, software: 6000, marketing: 15000, maintenance: 8000, equipment: 30000, other: 6000 };
      for (const [key, amount] of Object.entries(BUDGETS)) {
        await tx.budget.create({ data: { tenantId: t.id, categoryId: cat.get(key)!, month: toDateColumn(thisMonth), amountMinor: BigInt(amount), currency: tenant.currency } });
      }
    },
    { timeoutMs: 120_000 },
  );
}

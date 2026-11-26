/**
 * Phase 3 (staff and finance) against the real, seeded database: who can see what (roles and
 * plan), the time clock rules, shifts, payroll export, expenses, budgets, and that another gym's
 * staff and money rows are invisible (RLS).
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createPrismaClient, DEMO, withTenant, type PrismaClient } from "@gym/db";
import { addDays, localDate } from "@gym/shared";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("Phase 3: staff and finance (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = Date.now().toString(36);
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const token = async (email: string, tenantSlug: string) => {
    const k = `${email}|${tenantSlug}`;
    tokens[k] ??= (await http().post("/v1/dev/token").send({ email, tenantSlug }).expect(201)).body.accessToken;
    return `Bearer ${tokens[k]}`;
  };
  const owner = () => token("owner@ironfit.test", "ironfit");
  const accountant = () => token("accounts@ironfit.test", "ironfit");
  const frontDesk = () => token("frontdesk@ironfit.test", "ironfit");
  const coach = () => token("coach@ironfit.test", "ironfit");
  const as = async (auth: string, method: "get" | "post" | "put" | "patch" | "delete", path: string, body?: object) => {
    const r = http()[method](path).set("authorization", auth);
    return body ? r.send(body) : r;
  };
  const today = () => localDate(new Date(), "Asia/Beirut");

  beforeAll(async () => {
    process.env.AUTH_DEV_TOKENS ??= "true";
    process.env.DEV_JWT_SECRET ??= "isolation-test-secret-at-least-32-characters";
    process.env.MEMBER_JWT_SECRET ??= "isolation-member-secret-at-least-32-characters";
    const { AppModule } = await import("../../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  // ── Access ──

  it("keeps staff and finance behind the plan (Starter gym gets FEATURE_NOT_IN_PLAN)", async () => {
    const pulse = await token("owner@pulse.test", "pulse");
    for (const path of ["/v1/staff", "/v1/payroll", "/v1/finance/overview", "/v1/expenses"]) {
      const r = await as(pulse, "get", path);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("FEATURE_NOT_IN_PLAN");
    }
  });

  it("hides the team from coaches and front desk, and members get no staff access", async () => {
    expect((await as(await coach(), "get", "/v1/staff")).status).toBe(403);
    expect((await as(await frontDesk(), "get", "/v1/payroll")).status).toBe(403);
    expect((await as(await frontDesk(), "get", "/v1/finance/overview")).status).toBe(403);
    const member = await token("member@ironfit.test", "ironfit");
    expect((await as(member, "get", "/v1/staff")).status).toBe(403);
  });

  it("shows pay to the accountant but doesn't let them change the team", async () => {
    const acc = await accountant();
    const list = await as(acc, "get", "/v1/staff");
    expect(list.status).toBe(200);
    expect(list.body.employees.length).toBeGreaterThanOrEqual(7);
    const lea = list.body.employees.find((e: { email: string }) => e.email === "frontdesk@ironfit.test");
    expect(lea.payRateMinor).not.toBeNull();
    expect(lea.stats.pay.totalMinor).toBeDefined();
    expect((await as(acc, "patch", `/v1/staff/${lea.id}`, { title: "Hacked" })).status).toBe(403);
    expect((await as(acc, "post", "/v1/staff", { firstName: "X", lastName: "Y", title: "Nope", payType: "hourly", payRateMinor: 100 })).status).toBe(403);
  });

  // ── Team, pay changes, shifts ──

  let employeeId: string;

  it("adds a team member and audits pay changes", async () => {
    const auth = await owner();
    const created = await as(auth, "post", "/v1/staff", {
      firstName: "Test",
      lastName: run,
      email: `staff-${run}@example.com`,
      title: "Weekend cover",
      payType: "hourly",
      payRateMinor: 700,
      commissionBp: 250,
    });
    expect(created.status).toBe(201);
    employeeId = created.body.id;

    const dup = await as(auth, "post", "/v1/staff", { firstName: "Again", lastName: run, email: `staff-${run}@example.com`, title: "Dup", payType: "hourly", payRateMinor: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("EMPLOYEE_EXISTS");

    expect((await as(auth, "patch", `/v1/staff/${employeeId}`, { payRateMinor: 900 })).status).toBe(200);
    const audit = await withTenant(prisma, DEMO.ironfit.id, (tx) =>
      tx.auditLog.findFirst({ where: { action: "staff.pay_changed", entityId: employeeId } }),
    );
    expect(audit).not.toBeNull();
  });

  it("plans and removes a shift; an end before the start is rejected", async () => {
    const auth = await owner();
    const date = addDays(today(), 3);
    const bad = await as(auth, "post", "/v1/shifts", { employeeId, locationId: DEMO.ironfit.locations[0]!.id, date, start: "15:00", end: "09:00" });
    expect(bad.status).toBe(400);
    const s = await as(auth, "post", "/v1/shifts", { employeeId, locationId: DEMO.ironfit.locations[0]!.id, date, start: "09:00", end: "13:00" });
    expect(s.status).toBe(201);
    const week = await as(auth, "get", `/v1/shifts?from=${date}&to=${date}`);
    expect(week.body.some((x: { id: string }) => x.id === s.body.id)).toBe(true);
    expect((await as(auth, "delete", `/v1/shifts/${s.body.id}`)).status).toBe(200);
    expect((await as(auth, "delete", `/v1/shifts/${s.body.id}`)).status).toBe(404);
  });

  // ── Time clock ──

  it("clocks yourself in once, refuses a second clock-in, and clocks out", async () => {
    const fd = await frontDesk();
    // Leave the demo data as we found it if Lea happens to be clocked in.
    await as(fd, "post", "/v1/time-clock/out", {});
    const first = await as(fd, "post", "/v1/time-clock/in", {});
    expect(first.status).toBe(201);
    const again = await as(fd, "post", "/v1/time-clock/in", {});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_CLOCKED_IN");
    expect((await as(fd, "get", "/v1/time-clock/me")).body.clockedInSince).not.toBeNull();
    expect((await as(fd, "post", "/v1/time-clock/out", {})).status).toBe(201);
    const out = await as(fd, "post", "/v1/time-clock/out", {});
    expect(out.status).toBe(409);
    expect(out.body.code).toBe("NOT_CLOCKED_IN");
  });

  it("doesn't let front desk clock someone else in, and the owner (no team record) gets NO_EMPLOYEE_RECORD", async () => {
    expect((await as(await frontDesk(), "post", "/v1/time-clock/in", { employeeId })).status).toBe(404);
    const r = await as(await owner(), "post", "/v1/time-clock/in", {});
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NO_EMPLOYEE_RECORD");
  });

  // ── Payroll ──

  it("exports payroll as CSV with a UTF-8 byte-order mark", async () => {
    const r = await http().get("/v1/payroll/export").set("authorization", await accountant()).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    const buf = r.body as Buffer;
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buf.toString("utf8").slice(1).split("\n")[0]).toMatch(/^Employee,Title,Pay type/);
  });

  // ── Expenses and budgets ──

  it("records an expense, lists it in its month, and removes it", async () => {
    const auth = await accountant();
    const cats = (await as(auth, "get", "/v1/expense-categories")).body as { id: string; key: string | null }[];
    const other = cats.find((c) => c.key === "other")!;
    const created = await as(auth, "post", "/v1/expenses", { categoryId: other.id, amountMinor: 1234, spentOn: today(), vendor: `Test ${run}` });
    expect(created.status).toBe(201);
    const month = today().slice(0, 7);
    const listed = await as(auth, "get", `/v1/expenses?month=${month}`);
    expect(listed.body.some((e: { id: string }) => e.id === created.body.id)).toBe(true);
    expect((await as(auth, "delete", `/v1/expenses/${created.body.id}`)).status).toBe(200);
    const after = await as(auth, "get", `/v1/expenses?month=${month}`);
    expect(after.body.some((e: { id: string }) => e.id === created.body.id)).toBe(false);
    // Front desk can't record expenses.
    expect((await as(await frontDesk(), "post", "/v1/expenses", { categoryId: other.id, amountMinor: 1, spentOn: today() })).status).toBe(403);
  });

  it("rejects another gym's category and duplicate category names", async () => {
    const auth = await accountant();
    const pulseCat = await withTenant(prisma, DEMO.pulse.id, (tx) => tx.expenseCategory.findFirstOrThrow());
    const r = await as(auth, "post", "/v1/expenses", { categoryId: pulseCat.id, amountMinor: 100, spentOn: today() });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("CATEGORY_NOT_FOUND");
    const dup = await as(auth, "post", "/v1/expense-categories", { name: "Rent" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("CATEGORY_EXISTS");
  });

  it("sets a budget (upsert) and the overview reports it", async () => {
    const auth = await accountant();
    const cats = (await as(auth, "get", "/v1/expense-categories")).body as { id: string; key: string | null }[];
    const software = cats.find((c) => c.key === "software")!;
    const month = today().slice(0, 7);
    expect((await as(auth, "put", "/v1/budgets", { categoryId: software.id, month, amountMinor: 7000 })).status).toBe(200);
    expect((await as(auth, "put", "/v1/budgets", { categoryId: software.id, month, amountMinor: 6000 })).status).toBe(200);
    const o = await as(auth, "get", "/v1/finance/overview");
    expect(o.status).toBe(200);
    expect(o.body.series).toHaveLength(12);
    expect(o.body.kpis.revenue.valueMinor).toBeDefined();
    const line = o.body.costsByCategory.find((c: { id?: string }) => c.id === software.id);
    expect(line.budgetMinor).toBe("6000");
  });

  // ── Profit per location and staff rankings (exit gate) ──

  it("splits the month's P&L by location so locations + gym-wide add up to the overview and payroll", async () => {
    const auth = await accountant();
    const [byLoc, overview, payroll] = await Promise.all([
      as(auth, "get", "/v1/finance/locations"),
      as(auth, "get", "/v1/finance/overview"),
      as(auth, "get", "/v1/payroll"),
    ]);
    expect(byLoc.status).toBe(200);
    const b = byLoc.body;
    expect(b.locations.map((l: { id: string }) => l.id).sort()).toEqual(DEMO.ironfit.locations.map((l) => l.id).sort());
    const sum = (k: "revenueMinor" | "expensesMinor" | "staffMinor" | "netMinor" | "netAllocatedMinor") =>
      b.locations.reduce((s: bigint, l: Record<string, string>) => s + BigInt(l[k]!), 0n);
    expect(sum("revenueMinor") + BigInt(b.shared.revenueMinor)).toBe(BigInt(b.total.revenueMinor));
    expect(sum("expensesMinor") + BigInt(b.shared.expensesMinor)).toBe(BigInt(b.total.expensesMinor));
    expect(sum("staffMinor") + BigInt(b.shared.staffMinor)).toBe(BigInt(b.total.staffMinor));
    // Same totals as the overview and payroll screens.
    expect(b.total.revenueMinor).toBe(overview.body.kpis.revenue.valueMinor);
    expect(b.total.netMinor).toBe(overview.body.kpis.net.valueMinor);
    expect(b.total.staffMinor).toBe(payroll.body.totalMinor);
    // After spreading gym-wide costs, the locations add up to the whole gym.
    expect(sum("netAllocatedMinor") - BigInt(b.shared.unallocatedMinor)).toBe(BigInt(b.total.netMinor));
    expect(b.locations[0].trend).toHaveLength(6);
    expect(b.locations[0].trend[5].netMinor).toBe(b.locations[0].netMinor);
  });

  it("puts an expense on the location it was recorded for", async () => {
    const auth = await accountant();
    const marina = DEMO.ironfit.locations[1]!.id;
    const before = (await as(auth, "get", "/v1/finance/locations")).body.locations.find((l: { id: string }) => l.id === marina);
    const cats = (await as(auth, "get", "/v1/expense-categories")).body as { id: string; key: string | null }[];
    const e = await as(auth, "post", "/v1/expenses", { categoryId: cats.find((c) => c.key === "maintenance")!.id, locationId: marina, amountMinor: 4321, spentOn: today() });
    const after = (await as(auth, "get", "/v1/finance/locations")).body.locations.find((l: { id: string }) => l.id === marina);
    expect(BigInt(after.expensesMinor) - BigInt(before.expensesMinor)).toBe(4321n);
    await as(auth, "delete", `/v1/expenses/${e.body.id}`);
  });

  it("keeps per-location profit for finance roles only", async () => {
    expect((await as(await frontDesk(), "get", "/v1/finance/locations")).status).toBe(403);
    const pulse = await as(await token("owner@pulse.test", "pulse"), "get", "/v1/finance/locations");
    expect(pulse.status).toBe(403);
    expect(pulse.body.code).toBe("FEATURE_NOT_IN_PLAN");
  });

  it("ranks staff on counts that match the records", async () => {
    const auth = await owner();
    const r = await as(auth, "get", "/v1/staff/performance");
    expect(r.status).toBe(200);
    const nadim = r.body.rows.find((x: { employee: { firstName: string } }) => x.employee.firstName === "Nadim");
    // Count his past classes this month straight from the sessions table.
    const coach = await prisma.user.findUniqueOrThrow({ where: { email: "coach@ironfit.test" } });
    const monthStart = new Date(`${today().slice(0, 7)}-01T00:00:00+02:00`);
    const counted = await withTenant(prisma, DEMO.ironfit.id, (tx) =>
      tx.session.findMany({ where: { trainerUserId: coach.id, status: "scheduled", startsAt: { gte: monthStart, lt: new Date() } }, select: { bookedCount: true, capacity: true } }),
    );
    expect(nadim.classesTaught).toBe(counted.length);
    expect(nadim.spotsBooked).toBe(counted.reduce((s, x) => s + x.bookedCount, 0));
    expect(nadim.spotsOffered).toBe(counted.reduce((s, x) => s + x.capacity, 0));
    expect(nadim.payMinor).not.toBeNull();
  });

  it("shows rankings to owners and accountants, never to coaches; pay only with finance access", async () => {
    expect((await as(await coach(), "get", "/v1/staff/performance")).status).toBe(403);
    expect((await as(await frontDesk(), "get", "/v1/staff/performance")).status).toBe(403);
    const acc = await as(await accountant(), "get", "/v1/staff/performance");
    expect(acc.status).toBe(200);
    expect(acc.body.rows.every((x: { payMinor: string | null }) => x.payMinor !== null)).toBe(true);
    // The team list never exposes the per-location pay split.
    const team = await as(await accountant(), "get", "/v1/staff");
    expect(team.body.employees[0].stats.payByLocation).toBeUndefined();
  });

  // ── Isolation ──

  it("never shows one gym's staff, shifts or expenses to another (RLS)", async () => {
    const counts = await withTenant(prisma, DEMO.pulse.id, async (tx) => ({
      employee: await tx.employee.findFirst({ where: { id: employeeId } }),
      ironfitShifts: await tx.shift.count({ where: { tenantId: DEMO.ironfit.id } }),
      ironfitExpenses: await tx.expense.count({ where: { tenantId: DEMO.ironfit.id } }),
      ironfitBudgets: await tx.budget.count({ where: { tenantId: DEMO.ironfit.id } }),
      ironfitTime: await tx.timeEntry.count({ where: { tenantId: DEMO.ironfit.id } }),
    }));
    expect(counts).toEqual({ employee: null, ironfitShifts: 0, ironfitExpenses: 0, ironfitBudgets: 0, ironfitTime: 0 });
  });

  afterAll(async () => {
    if (!employeeId || !prisma) return;
    await withTenant(prisma, DEMO.ironfit.id, (tx) => tx.employee.delete({ where: { id: employeeId } })).catch(() => undefined);
  });
});

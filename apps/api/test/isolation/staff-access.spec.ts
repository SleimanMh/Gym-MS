/**
 * Staff access and calendars against the seeded database: the owner sets a person's role and
 * per-area access (and it really changes what they can open), only owners can, the team calendar
 * shows shifts and classes, slots may overlap across people but not for one person, everyone sees
 * their own schedule, and per-person access rows stay inside their gym (RLS).
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createPrismaClient, DEMO, withTenant, type PrismaClient } from "@gym/db";
import { addDays, localDate } from "@gym/shared";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("Staff access and calendars (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const token = async (email: string, tenantSlug = "ironfit") => {
    const k = `${email}|${tenantSlug}`;
    tokens[k] ??= (await http().post("/v1/dev/token").send({ email, tenantSlug }).expect(201)).body.accessToken;
    return `Bearer ${tokens[k]}`;
  };
  const owner = () => token("owner@ironfit.test");
  const as = async (auth: string, method: "get" | "post" | "put" | "delete", path: string, body?: object) => {
    const r = http()[method](path).set("authorization", auth);
    return body ? r.send(body) : r;
  };
  const today = () => localDate(new Date(), "Asia/Beirut");
  const week = () => ({ from: today(), to: addDays(today(), 6) });
  let lea: { id: string };
  let fadi: { id: string };
  let lara: { id: string };

  beforeAll(async () => {
    process.env.AUTH_DEV_TOKENS ??= "true";
    process.env.DEV_JWT_SECRET ??= "isolation-test-secret-at-least-32-characters";
    process.env.MEMBER_JWT_SECRET ??= "isolation-member-secret-at-least-32-characters";
    const { AppModule } = await import("../../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = createPrismaClient(process.env.DATABASE_URL);
    const team = (await as(await owner(), "get", "/v1/staff")).body.employees as { id: string; firstName: string }[];
    lea = team.find((e) => e.firstName === "Lea")!;
    fadi = team.find((e) => e.firstName === "Fadi")!;
    lara = team.find((e) => e.firstName === "Lara")!;
  });
  afterAll(async () => {
    // Put Lea back to plain front desk.
    if (app && lea) await as(await owner(), "put", `/v1/staff/${lea.id}/access`, { role: "front_desk" });
    await app?.close();
    await prisma?.$disconnect();
  });

  // ── Access ──

  it("owner gives front desk the dashboard and hides sales — and it changes what they can open", async () => {
    const auth = await owner();
    const before = await as(auth, "get", `/v1/staff/${lea.id}/access`);
    expect(before.status).toBe(200);
    expect(before.body.role).toBe("front_desk");
    expect(before.body.areas.dashboard).toBe("none");
    expect(before.body.areas.members).toBe("manage");

    const fd = await token("frontdesk@ironfit.test");
    expect((await as(fd, "get", "/v1/dashboard/overview")).status).toBe(403);

    const put = await as(auth, "put", `/v1/staff/${lea.id}/access`, { role: "front_desk", areas: { dashboard: "view", sales: "none" } });
    expect(put.status).toBe(200);
    expect(put.body.customised).toBe(true);

    const me = (await as(fd, "get", "/v1/me")).body;
    expect(me.permissions).toContain("report.view");
    expect(me.permissions).not.toContain("sale.create");
    expect(me.permissions).toContain("checkin.create"); // untouched areas keep the role's access
    expect((await as(fd, "get", "/v1/dashboard/overview")).status).toBe(200);

    const audit = await withTenant(prisma, DEMO.ironfit.id, (tx) => tx.auditLog.findFirst({ where: { action: "staff.access_changed", entityId: lea.id }, orderBy: { createdAt: "desc" } }));
    expect(audit).not.toBeNull();

    // Back to the role's defaults: no tweaks left.
    const reset = await as(auth, "put", `/v1/staff/${lea.id}/access`, { role: "front_desk" });
    expect(reset.body.customised).toBe(false);
    expect((await as(fd, "get", "/v1/me")).body.permissions).not.toContain("report.view");
  });

  it("changing the role swaps the whole access set", async () => {
    const auth = await owner();
    await as(auth, "put", `/v1/staff/${lea.id}/access`, { role: "manager" });
    const me = (await as(await token("frontdesk@ironfit.test"), "get", "/v1/me")).body;
    expect(me.roles).toEqual(["manager"]);
    expect(me.permissions).toContain("staff.manage");
    await as(auth, "put", `/v1/staff/${lea.id}/access`, { role: "front_desk" });
  });

  it("only owners change access; nobody can grant security permissions or change their own", async () => {
    expect((await as(await token("accounts@ironfit.test"), "put", `/v1/staff/${lea.id}/access`, { role: "owner" })).status).toBe(403);
    expect((await as(await token("accounts@ironfit.test"), "get", `/v1/staff/${lea.id}/access`)).status).toBe(403);
    // Areas are a fixed list — "security" isn't one of them.
    expect((await as(await owner(), "put", `/v1/staff/${lea.id}/access`, { role: "front_desk", areas: { security: "manage" } })).status).toBe(400);
    // The owner linked as a team member can't edit themselves.
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ironfit.test" } });
    const emp = await as(await owner(), "post", "/v1/staff", { firstName: "Rami", lastName: "Owner", title: "Owner", payType: "salary", payRateMinor: 0, userId: ownerUser.id });
    expect(emp.status).toBe(201);
    const self = await as(await owner(), "put", `/v1/staff/${emp.body.id}/access`, { role: "trainer" });
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("CANNOT_CHANGE_OWN_ACCESS");
    await withTenant(prisma, DEMO.ironfit.id, (tx) => tx.employee.delete({ where: { id: emp.body.id } }));
    // Someone without a sign-in has no access to set.
    const noLogin = await as(await owner(), "put", `/v1/staff/${fadi.id}/access`, { role: "front_desk" });
    expect(noLogin.status).toBe(409);
    expect(noLogin.body.code).toBe("NO_LINKED_SIGNIN");
  });

  // ── Calendars ──

  it("lets two people share a time slot for different activities, but not one person twice", async () => {
    const auth = await owner();
    const date = addDays(today(), 2);
    const loc = DEMO.ironfit.locations[0]!.id;
    const a = await as(auth, "post", "/v1/shifts", { employeeId: lara.id, locationId: loc, date, start: "15:00", end: "16:00", activity: "personal_training" });
    const b = await as(auth, "post", "/v1/shifts", { employeeId: lea.id, locationId: loc, date, start: "15:00", end: "16:00", activity: "front_desk" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const clash = await as(auth, "post", "/v1/shifts", { employeeId: lara.id, locationId: loc, date, start: "15:30", end: "16:30", activity: "admin" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("SHIFT_OVERLAP");
    // Moving a slot onto itself is fine; moving it later works.
    const moved = await as(auth, "put", `/v1/shifts/${a.body.id}`, { employeeId: lara.id, locationId: loc, date, start: "15:30", end: "16:30", activity: "personal_training" });
    expect(moved.status).toBe(200);

    const cal = await as(auth, "get", `/v1/team-calendar?from=${date}&to=${date}`);
    expect(cal.status).toBe(200);
    const ids = cal.body.events.map((e: { id: string }) => e.id);
    expect(ids).toEqual(expect.arrayContaining([a.body.id, b.body.id]));
    expect(cal.body.events.find((e: { id: string }) => e.id === a.body.id).title).toBe("personal_training");

    await as(auth, "delete", `/v1/shifts/${a.body.id}`);
    await as(auth, "delete", `/v1/shifts/${b.body.id}`);
  });

  it("shows each person their own schedule, including the classes they teach", async () => {
    const coach = await token("coach@ironfit.test");
    const r = await as(coach, "get", `/v1/my-schedule?from=${week().from}&to=${week().to}`);
    expect(r.status).toBe(200);
    expect(r.body.employees).toHaveLength(1);
    expect(r.body.employees[0].firstName).toBe("Nadim");
    expect(r.body.events.every((e: { employeeId: string }) => e.employeeId === r.body.employees[0].id)).toBe(true);
    expect(r.body.events.some((e: { kind: string }) => e.kind === "class")).toBe(true);
    // Coaches can't open the team calendar; the owner (not on the team) has no personal schedule.
    expect((await as(coach, "get", `/v1/team-calendar?from=${week().from}&to=${week().to}`)).status).toBe(403);
    const ownerMine = await as(await owner(), "get", `/v1/my-schedule?from=${week().from}&to=${week().to}`);
    expect(ownerMine.status).toBe(404);
    expect(ownerMine.body.code).toBe("NO_EMPLOYEE_RECORD");
  });

  // ── Isolation ──

  it("keeps per-person access rows inside their gym (RLS)", async () => {
    await as(await owner(), "put", `/v1/staff/${lea.id}/access`, { role: "front_desk", areas: { dashboard: "view" } });
    const ironfit = await withTenant(prisma, DEMO.ironfit.id, (tx) => tx.userPermissionOverride.count());
    const fromPulse = await withTenant(prisma, DEMO.pulse.id, (tx) => tx.userPermissionOverride.count({ where: { tenantId: DEMO.ironfit.id } }));
    expect(ironfit).toBeGreaterThan(0);
    expect(fromPulse).toBe(0);
    // Another gym can't read it either (Pulse is on Starter, so the whole staff area is off there).
    expect((await as(await token("owner@pulse.test", "pulse"), "get", `/v1/staff/${lea.id}/access`)).status).toBe(403);
  });
});

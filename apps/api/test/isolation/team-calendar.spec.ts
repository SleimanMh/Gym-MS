/**
 * Team calendars against the seeded database: shifts and classes per person, slots may overlap
 * across people but not for one person, and everyone sees their own schedule.
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DEMO } from "@gym/db";
import { addDays, localDate } from "@gym/shared";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("Team calendars (HTTP)", () => {
  let app: INestApplication;
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
  let lara: { id: string };

  beforeAll(async () => {
    process.env.AUTH_DEV_TOKENS ??= "true";
    process.env.DEV_JWT_SECRET ??= "isolation-test-secret-at-least-32-characters";
    process.env.MEMBER_JWT_SECRET ??= "isolation-member-secret-at-least-32-characters";
    const { AppModule } = await import("../../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const team = (await as(await owner(), "get", "/v1/staff")).body.employees as { id: string; firstName: string }[];
    lea = team.find((e) => e.firstName === "Lea")!;
    lara = team.find((e) => e.firstName === "Lara")!;
  });
  afterAll(async () => {
    await app?.close();
  });

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
    const moved = await as(auth, "put", `/v1/shifts/${a.body.id}`, { employeeId: lara.id, locationId: loc, date, start: "15:30", end: "16:30", activity: "personal_training" });
    expect(moved.status).toBe(200);

    const cal = await as(auth, "get", `/v1/team-calendar?from=${date}&to=${date}`);
    expect(cal.status).toBe(200);
    expect(cal.body.events.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining([a.body.id, b.body.id]));
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
});

/**
 * Staff accounts and sign-in (ADR 0007) end to end against the seeded test database:
 * a new gym's owner gets a generated password by email → must choose their own at first sign-in →
 * creates staff users with a role and an access tree → the tree decides what they can open →
 * reset, disable, lockout, wrong gym, and one gym's users invisible to another.
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createPrismaClient, DEMO, withTenant, type PrismaClient } from "@gym/db";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("Staff accounts and password sign-in (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = Date.now().toString(36);
  const slug = `acc-${run}`;
  const ownerEmail = `owner.${run}@test.dev`;
  const sent: { to: string; text: string }[] = [];
  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string, gym?: string) => {
    const r = http().post("/v1/auth/login");
    return (gym ? r.set("x-tenant-slug", gym) : r).send({ email, password });
  };
  const change = (email: string, currentPassword: string, newPassword: string, gym = slug) =>
    http().post("/v1/auth/change-password").set("x-tenant-slug", gym).send({ email, currentPassword, newPassword });
  const as = (token: string, method: "get" | "post" | "put", path: string, body?: object) => {
    const r = http()[method](path).set("authorization", `Bearer ${token}`).set("x-tenant-slug", slug);
    return body ? r.send(body) : r;
  };
  /** Delivers this gym's pending emails through a fake mailer and returns the password in the latest one to `to`. */
  const emailedPassword = async (to: string) => {
    const { dispatchOutbox } = await import("../../src/modules/notifications/jobs");
    for (let i = 0; i < 5; i++) await dispatchOutbox(prisma, { send: async (m) => void sent.push(m) }, { publicAppUrl: "http://localhost:3000", gymUrlTemplate: "http://{slug}.localhost:3000" });
    const mail = [...sent].reverse().find((m) => m.to === to);
    return /(?:Temporary password|كلمة المرور المؤقتة): ([A-Za-z0-9-]+)/.exec(mail?.text ?? "")?.[1] ?? null;
  };
  let tenantId: string;
  let ownerToken: string;

  beforeAll(async () => {
    process.env.AUTH_DEV_TOKENS ??= "true";
    process.env.DEV_JWT_SECRET ??= "isolation-test-secret-at-least-32-characters";
    process.env.MEMBER_JWT_SECRET ??= "isolation-member-secret-at-least-32-characters";
    process.env.AUTH_JWT_SECRET ??= "isolation-auth-secret-at-least-32-characters-long";
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

  it("creates a gym whose owner gets a generated password by email (scrubbed once sent)", async () => {
    const platform = (await login("platform@gym.local", "Gym-demo-2026")).body.accessToken as string;
    expect(platform).toBeTruthy();
    const created = await http()
      .post("/v1/platform/tenants")
      .set("authorization", `Bearer ${platform}`)
      .send({ slug, name: `Accounts ${run}`, planCode: "pro", owner: { email: ownerEmail, firstName: "Olga", lastName: "Owner" } });
    expect(created.status).toBe(201);
    tenantId = created.body.id;

    const pw = await emailedPassword(ownerEmail);
    expect(pw).toMatch(/^[A-Za-z0-9]{7}-[A-Za-z0-9]{7}$/);
    const mail = sent.find((m) => m.to === ownerEmail)!;
    expect(mail.text).toContain(`http://${slug}.localhost:3000/login`);
    const event = await withTenant(prisma, tenantId, (tx) => tx.outboxEvent.findFirst({ where: { type: "user.invite" } }));
    expect(event?.payload).toEqual({ delivered: true }); // the password isn't kept

    // First sign-in: the generated password only lets them choose their own.
    const first = await login(ownerEmail, pw!, slug);
    expect(first.body).toEqual({ status: "password_change_required" });
    expect((await change(ownerEmail, pw!, "short1")).status).toBe(400);
    const changed = await change(ownerEmail, pw!, "Olga-strong-2026");
    expect(changed.status).toBe(200);
    ownerToken = changed.body.accessToken;
    expect((await as(ownerToken, "get", "/v1/me")).body.tenant.slug).toBe(slug);
    // The emailed password no longer works; the new one does.
    expect((await login(ownerEmail, pw!, slug)).body.code).toBe("INVALID_CREDENTIALS");
    expect((await login(ownerEmail, "Olga-strong-2026", slug)).body.status).toBe("ok");
  });

  it("only lets staff sign in at their own gym's address", async () => {
    expect((await login(ownerEmail, "Olga-strong-2026", "ironfit")).body.code).toBe("INVALID_CREDENTIALS");
    expect((await login(ownerEmail, "Olga-strong-2026")).body.code).toBe("USE_GYM_ADDRESS");
    // A member's account can't use the staff sign-in.
    expect((await login("member@ironfit.test", "Gym-demo-2026", "ironfit")).body.code).toBe("INVALID_CREDENTIALS");
    // Wrong password and unknown email look the same.
    expect((await login(ownerEmail, "nope", slug)).body.code).toBe("INVALID_CREDENTIALS");
    expect((await login(`nobody.${run}@test.dev`, "nope", slug)).body.code).toBe("INVALID_CREDENTIALS");
  });

  let staffId: string;
  const staffEmail = `desk.${run}@test.dev`;

  it("owner creates a front-desk user with a custom access tree, and it decides what they can open", async () => {
    const created = await as(ownerToken, "post", "/v1/users", {
      firstName: "Dana",
      lastName: "Desk",
      email: staffEmail,
      role: "front_desk",
      // Front desk defaults, minus sales & payments, plus the dashboard.
      permissions: ["report.view", "schedule.view", "booking.view", "booking.create", "booking.cancel", "member.view", "member.manage", "checkin.create"],
    });
    expect(created.status).toBe(201);
    expect(created.body.invited).toBe(true);
    staffId = created.body.userId;

    const list = await as(ownerToken, "get", "/v1/users");
    const row = list.body.find((u: { id: string }) => u.id === staffId);
    expect(row).toMatchObject({ status: "invited", role: "front_desk", customised: true });

    const pw = await emailedPassword(staffEmail);
    const signedIn = await change(staffEmail, pw!, "Dana-desk-2026");
    const staffToken = signedIn.body.accessToken as string;
    const me = (await as(staffToken, "get", "/v1/me")).body;
    expect(me.permissions).toContain("report.view");
    expect(me.permissions).not.toContain("sale.create");
    expect((await as(staffToken, "get", "/v1/dashboard/overview")).status).toBe(200);
    expect((await as(staffToken, "get", "/v1/users")).status).toBe(403);
    expect((await as(ownerToken, "get", "/v1/users")).body.find((u: { id: string }) => u.id === staffId).status).toBe("active");

    // Ticking an action opens its area: finance.manage alone brings finance.view with it.
    const put = await as(ownerToken, "put", `/v1/users/${staffId}/access`, { role: "front_desk", permissions: ["checkin.create", "finance.manage"] });
    expect(put.body.selection).toEqual(expect.arrayContaining(["finance.view", "finance.manage", "checkin.create"]));
    expect(put.body.selection).not.toContain("member.view");
    expect((await as(staffToken, "get", "/v1/me")).body.permissions).not.toContain("member.view");

    const audit = await withTenant(prisma, tenantId, (tx) => tx.auditLog.findFirst({ where: { action: "user.access_changed", entityId: staffId } }));
    expect(audit).not.toBeNull();
  });

  it("guards the console: no self-changes, nothing outside the tree, no duplicate users", async () => {
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
    const self = await as(ownerToken, "put", `/v1/users/${ownerUser.id}/access`, { role: "trainer" });
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("CANNOT_CHANGE_OWN_ACCESS");
    expect((await as(ownerToken, "put", `/v1/users/${staffId}/access`, { role: "front_desk", permissions: ["tenant.security.manage"] })).status).toBe(400);
    expect((await as(ownerToken, "post", "/v1/users", { firstName: "D", lastName: "D", email: staffEmail, role: "trainer" })).body.code).toBe("USER_EXISTS");
  });

  it("resets a password (old sessions end) and disables a user", async () => {
    const old = (await login(staffEmail, "Dana-desk-2026", slug)).body.accessToken as string;
    expect((await as(old, "get", "/v1/me")).status).toBe(200);
    expect((await as(ownerToken, "post", `/v1/users/${staffId}/reset-password`)).status).toBe(200);
    expect((await as(old, "get", "/v1/me")).status).toBe(401); // session version bumped
    const pw = await emailedPassword(staffEmail);
    expect((await login(staffEmail, pw!, slug)).body.status).toBe("password_change_required");

    expect((await as(ownerToken, "put", `/v1/users/${staffId}/status`, { status: "disabled" })).status).toBe(200);
    const blocked = await change(staffEmail, pw!, "Dana-desk-2027");
    expect(blocked.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("locks an account for 15 minutes after five wrong passwords", async () => {
    const email = `lock.${run}@test.dev`;
    await as(ownerToken, "post", "/v1/users", { firstName: "Lou", lastName: "Lock", email, role: "trainer" });
    const pw = await emailedPassword(email);
    for (let i = 0; i < 5; i++) expect((await login(email, `wrong-${i}`, slug)).body.code).toBe("INVALID_CREDENTIALS");
    const locked = await login(email, pw!, slug);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("keeps each gym's users to itself", async () => {
    // IronFit's owner can't see or touch this gym's users: another gym's person is a 404.
    const ironfitOwner = (await login("owner@ironfit.test", "Gym-demo-2026", "ironfit")).body.accessToken as string;
    const r = await http().get(`/v1/users/${staffId}`).set("authorization", `Bearer ${ironfitOwner}`).set("x-tenant-slug", "ironfit");
    expect(r.status).toBe(404);
    const list = await http().get("/v1/users").set("authorization", `Bearer ${ironfitOwner}`).set("x-tenant-slug", "ironfit");
    expect(list.body.some((u: { email: string }) => u.email === staffEmail)).toBe(false);
    // A token for one gym doesn't work at another gym's address.
    const cross = await http().get("/v1/locations").set("authorization", `Bearer ${ownerToken}`).set("x-tenant-slug", DEMO.ironfit.slug);
    expect([401, 403]).toContain(cross.status);
    // Access rows stay inside their gym (RLS).
    const fromIronfit = await withTenant(prisma, DEMO.ironfit.id, (tx) => tx.userPermissionOverride.count({ where: { tenantId } }));
    expect(fromIronfit).toBe(0);
  });
});

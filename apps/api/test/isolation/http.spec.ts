/**
 * HTTP-level isolation: boots the real AppModule against the seeded database and calls it the way
 * the admin app and widget do. Requires AUTH_DEV_TOKENS=true (dev tokens stand in for Keycloak).
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DEMO } from "@gym/db";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("tenant isolation (HTTP)", () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  const token = async (email: string, tenantSlug?: string) => {
    const k = `${email}|${tenantSlug ?? ""}`;
    if (!tokens[k]) {
      const res = await request(app.getHttpServer()).post("/v1/dev/token").send({ email, tenantSlug }).expect(201);
      tokens[k] = res.body.accessToken as string;
    }
    return tokens[k]!;
  };
  /** GET as a user (or anonymously) and assert the status. */
  const get = async (path: string, status: number, email?: string, tenantSlug?: string) => {
    const auth = email ? `Bearer ${await token(email, tenantSlug)}` : null;
    const r = request(app.getHttpServer()).get(path);
    return (auth ? r.set("authorization", auth) : r).expect(status);
  };

  beforeAll(async () => {
    process.env.AUTH_DEV_TOKENS ??= "true";
    process.env.DEV_JWT_SECRET ??= "isolation-test-secret-at-least-32-characters";
    // Import after env is set: modules read config at import time.
    const { AppModule } = await import("../../src/app.module");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app?.close());

  it("rejects anonymous access to staff endpoints", async () => {
    await get("/v1/locations", 401);
  });

  it("lists only the caller's gym's locations", async () => {
    const res = await get("/v1/locations", 200, "owner@ironfit.test", "ironfit");
    const ids = (res.body as { id: string }[]).map((l) => l.id).sort();
    expect(ids).toEqual(DEMO.ironfit.locations.map((l) => l.id).sort());
  });

  it("returns 404 for another gym's record", async () => {
    await get(`/v1/locations/${DEMO.pulse.locations[0]!.id}`, 404, "owner@ironfit.test", "ironfit");
  });

  it("refuses a token for a gym the user doesn't belong to", async () => {
    await request(app.getHttpServer())
      .post("/v1/dev/token")
      .send({ email: "owner@ironfit.test", tenantSlug: "pulse" })
      .expect(403);
  });

  it("gives member tokens 403 on staff endpoints", async () => {
    await get("/v1/locations", 403, "member@ironfit.test", "ironfit");
  });

  it("rejects a token for one gym combined with another gym's API key", async () => {
    await request(app.getHttpServer())
      .get("/v1/locations")
      .set("authorization", `Bearer ${await token("owner@ironfit.test", "ironfit")}`)
      .set("x-api-key", DEMO.pulse.publishableKey)
      .expect(403);
  });

  it("enforces plan limits (Starter = 1 location)", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/locations")
      .set("authorization", `Bearer ${await token("owner@pulse.test", "pulse")}`)
      .send({ name: "Second branch" })
      .expect(403);
    expect(res.body.code).toBe("LIMIT_REACHED");
  });

  it("serves public tenant info from a publishable key", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/public/tenant")
      .set("x-api-key", DEMO.ironfit.publishableKey)
      .expect(200);
    expect(res.body.slug).toBe("ironfit");
    await request(app.getHttpServer()).get("/v1/public/tenant").set("x-api-key", "pk_bad").expect(401);
  });

  it("keeps the platform console for platform users", async () => {
    await get("/v1/platform/tenants", 403, "owner@ironfit.test", "ironfit");
    const res = await get("/v1/platform/tenants", 200, "platform@gym.local");
    expect((res.body as { slug: string }[]).map((t) => t.slug)).toEqual(expect.arrayContaining(["ironfit", "pulse"]));
  });

  it("returns the shell payload from /v1/me", async () => {
    const res = await get("/v1/me", 200, "frontdesk@ironfit.test", "ironfit");
    expect(res.body.tenant.slug).toBe("ironfit");
    expect(res.body.roles).toEqual(["front_desk"]);
    expect(res.body.permissions).not.toContain("finance.view");
    expect(res.body.entitlements.planCode).toBe("pro");
  });

  // Keycloak tokens carry no gym; the admin sends the chosen gym as x-tenant-slug (ADR 0003).
  it("lets a signed-in person choose a gym only among those they belong to", async () => {
    const auth = `Bearer ${await token("owner@ironfit.test")}`; // no gym in the token
    const own = await request(app.getHttpServer()).get("/v1/locations").set("authorization", auth).set("x-tenant-slug", "ironfit");
    expect(own.status).toBe(200);
    const other = await request(app.getHttpServer()).get("/v1/locations").set("authorization", auth).set("x-tenant-slug", "pulse");
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("NOT_A_MEMBER_OF_TENANT");
    const me = await request(app.getHttpServer()).get("/v1/me").set("authorization", auth).set("x-tenant-slug", "pulse");
    expect(me.body.tenant).toBeNull();
    const gyms = await request(app.getHttpServer()).get("/v1/me/tenants").set("authorization", auth);
    expect((gyms.body as { slug: string }[]).map((g) => g.slug)).toEqual(["ironfit"]);
  });

  it("invites a new gym's owner: the worker creates their sign-in account", async () => {
    const run = Date.now().toString(36);
    const created = await request(app.getHttpServer())
      .post("/v1/platform/tenants")
      .set("authorization", `Bearer ${await token("platform@gym.local")}`)
      .send({ slug: `gym-${run}`, name: `Test Gym ${run}`, owner: { email: `owner.${run}@test.dev`, firstName: "Olga", lastName: "Owner" } });
    expect(created.status).toBe(201);

    const { createPrismaClient, withTenant } = await import("@gym/db");
    const { dispatchOutbox } = await import("../../src/modules/notifications/jobs");
    const prisma = createPrismaClient(process.env.DATABASE_URL);
    const invited: { email: string }[] = [];
    try {
      const event = await withTenant(prisma, created.body.id, (tx) => tx.outboxEvent.findFirst({ where: { type: "user.invite" } }));
      expect(event?.payload).toMatchObject({ email: `owner.${run}@test.dev`, firstName: "Olga" });

      const identity = { invite: async (u: { email: string }) => void invited.push(u) };
      for (let i = 0; i < 10 && !invited.length; i++) {
        await dispatchOutbox(prisma, { send: async () => undefined }, { publicAppUrl: "http://localhost:3000", identity });
      }
      expect(invited.map((u) => u.email)).toContain(`owner.${run}@test.dev`);
    } finally {
      await prisma.$disconnect();
    }
  });
});

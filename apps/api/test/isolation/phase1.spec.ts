/**
 * Phase 1 end to end against the real, seeded database: scheduling → members → memberships →
 * booking / waitlist / credits → member login → widget origin rules → check-in → receipts →
 * cross-tenant access → email delivery through the outbox worker.
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createPrismaClient, DEMO, withTenant, type PrismaClient } from "@gym/db";
import { addDays, localDate } from "@gym/shared";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("Phase 1 flows (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = Date.now().toString(36);
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const staffToken = async (email: string, tenantSlug: string) => {
    const k = `${email}|${tenantSlug}`;
    tokens[k] ??= (await http().post("/v1/dev/token").send({ email, tenantSlug }).expect(201)).body.accessToken;
    return `Bearer ${tokens[k]}`;
  };
  const owner = () => staffToken("owner@ironfit.test", "ironfit");
  const as = async (auth: string, method: "get" | "post" | "put" | "delete", path: string, body?: object) => {
    const r = http()[method](path).set("authorization", auth);
    return body ? r.send(body) : r;
  };

  // Fixtures created through the API
  let sessionId: string;
  let memberA: { id: string; email: string; checkinCode: string };
  let memberB: { id: string; email: string };
  let memberToken: string;

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

  it("creates a class type and a one-off class with one spot", async () => {
    const auth = await owner();
    const ct = await as(auth, "post", "/v1/class-types", { name: `Test ${run}`, durationMin: 50, defaultCapacity: 1 });
    expect(ct.status).toBe(201);
    const tomorrow = addDays(localDate(new Date(), "Asia/Beirut"), 1);
    const s = await as(auth, "post", "/v1/sessions", {
      locationId: DEMO.ironfit.locations[0]!.id,
      classTypeId: ct.body.id,
      date: tomorrow,
      startTime: "10:00",
    });
    expect(s.status).toBe(201);
    expect(s.body.capacity).toBe(1);
    sessionId = s.body.id;
  });

  it("registers members and sells memberships (paid, with a receipt)", async () => {
    const auth = await owner();
    const plans = (await as(auth, "get", "/v1/membership-plans")).body as { id: string; name: string }[];
    const monthly = plans.find((p) => p.name === "Monthly unlimited")!;
    const pack = plans.find((p) => p.name === "10-class pack")!;

    const a = await as(auth, "post", "/v1/members", { firstName: "Ann", lastName: `Test${run}`, email: `ann.${run}@test.dev` });
    const b = await as(auth, "post", "/v1/members", { firstName: "Ben", lastName: `Test${run}`, email: `ben.${run}@test.dev` });
    expect([a.status, b.status]).toEqual([201, 201]);
    memberA = a.body;
    memberB = b.body;

    const dup = await as(auth, "post", "/v1/members", { firstName: "X", lastName: "Y", email: `ann.${run}@test.dev` });
    expect(dup.status).toBe(409);

    const soldA = await as(auth, "post", `/v1/members/${memberA.id}/memberships`, { planId: monthly.id, payment: { method: "cash" } });
    const soldB = await as(auth, "post", `/v1/members/${memberB.id}/memberships`, { planId: pack.id, payment: { method: "card_terminal" } });
    expect(soldA.body.subscription.status).toBe("active");
    expect(soldB.body.subscription.status).toBe("active");
    expect(soldB.body.receiptNumber).toBe(soldA.body.receiptNumber + 1);

    const receipt = await as(auth, "get", `/v1/payments/${soldA.body.paymentId}/receipt`);
    expect(receipt.body).toMatchObject({ amountMinor: "5900", currency: "USD", item: "Monthly unlimited" });
  });

  it("enforces capacity, waitlists, and promotes on cancellation (credits follow)", async () => {
    const auth = await owner();
    const first = await as(auth, "post", "/v1/bookings", { sessionId, memberId: memberA.id });
    expect(first.body).toMatchObject({ result: "booked", creditUsed: false });

    const full = await as(auth, "post", "/v1/bookings", { sessionId, memberId: memberB.id });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("SESSION_FULL");

    const again = await as(auth, "post", "/v1/bookings", { sessionId, memberId: memberA.id });
    expect(again.body.code).toBe("ALREADY_BOOKED");

    const wl = await as(auth, "post", "/v1/bookings", { sessionId, memberId: memberB.id, joinWaitlist: true });
    expect(wl.body).toMatchObject({ result: "waitlisted", position: 1 });

    const cancel = await as(auth, "post", `/v1/bookings/${first.body.bookingId}/cancel`, {});
    expect(cancel.body.status).toBe("cancelled");
    expect(cancel.body.promotedBookingId).toBeTruthy();

    const session = (await as(auth, "get", `/v1/sessions/${sessionId}`)).body;
    expect(session.bookedCount).toBe(1);
    expect(session.bookings.find((b: { status: string }) => b.status === "booked").member.id).toBe(memberB.id);

    const profileB = (await as(auth, "get", `/v1/members/${memberB.id}`)).body;
    expect(profileB.subscriptions[0].creditsLeft).toBe(9);
  });

  it("lets a member sign in with an emailed code and manage their own bookings", async () => {
    const pub = () => http().post("/v1/public/member-auth/start").set("x-api-key", DEMO.ironfit.publishableKey);
    expect((await pub().send({ email: memberB.email })).body).toEqual({ sent: true });
    // Unknown emails get the same answer (no account enumeration).
    expect((await pub().send({ email: `nobody.${run}@test.dev` })).body).toEqual({ sent: true });

    const event = await withTenant(prisma, DEMO.ironfit.id, (tx) =>
      tx.outboxEvent.findFirst({
        where: { type: "member.login_code", payload: { path: ["memberId"], equals: memberB.id } },
        orderBy: { createdAt: "desc" },
      }),
    );
    const code = (event!.payload as { code: string }).code;

    const bad = await http()
      .post("/v1/public/member-auth/verify")
      .set("x-api-key", DEMO.ironfit.publishableKey)
      .send({ email: memberB.email, code: code === "000000" ? "111111" : "000000" });
    expect(bad.status).toBe(401);

    const ok = await http()
      .post("/v1/public/member-auth/verify")
      .set("x-api-key", DEMO.ironfit.publishableKey)
      .send({ email: memberB.email, code });
    expect(ok.status).toBe(200);
    memberToken = `Bearer ${ok.body.accessToken}`;

    const mine = await as(memberToken, "get", "/v1/me/bookings");
    expect(mine.body.bookings).toHaveLength(1);
    const bookingId = mine.body.bookings[0].id;

    // Staff endpoints are off limits for member tokens.
    expect((await as(memberToken, "get", "/v1/members")).status).toBe(403);

    const cancelled = await as(memberToken, "delete", `/v1/me/bookings/${bookingId}`);
    expect(cancelled.body).toMatchObject({ status: "cancelled", creditReturned: true });
    const profile = await as(memberToken, "get", "/v1/me/member");
    expect(profile.body.memberships[0].creditsLeft).toBe(10);
    expect(profile.body.id).toBe(memberB.id);
  });

  it("can't touch another member's booking", async () => {
    const auth = await owner();
    const booked = await as(auth, "post", "/v1/bookings", { sessionId, memberId: memberA.id });
    expect(booked.body.result).toBe("booked");
    expect((await as(memberToken, "delete", `/v1/me/bookings/${booked.body.bookingId}`)).status).toBe(404);
  });

  it("serves the widget only on the gym's allowed websites", async () => {
    const get = (origin?: string) => {
      const r = http().get("/v1/public/sessions").set("x-api-key", DEMO.ironfit.publishableKey);
      return origin ? r.set("origin", origin) : r;
    };
    const res = await get("http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("spotsLeft");
    expect((await get("https://evil.example")).status).toBe(403);
    expect((await get()).status).toBe(200); // server-to-server

    const bySlug = await http().get("/v1/public/tenant").set("x-tenant-slug", "pulse");
    expect(bySlug.body.slug).toBe("pulse");
    const mismatch = await http().get("/v1/public/tenant").set("x-tenant-slug", "pulse").set("x-api-key", DEMO.ironfit.publishableKey);
    expect(mismatch.status).toBe(403);
  });

  it("checks members in by QR code and links today's booking", async () => {
    const auth = await staffToken("frontdesk@ironfit.test", "ironfit");
    const preview = await as(auth, "post", "/v1/check-ins", {
      code: memberA.checkinCode,
      locationId: DEMO.ironfit.locations[0]!.id,
      dryRun: true,
    });
    expect(preview.body).toMatchObject({ result: "ok", checkInId: null });

    const done = await as(auth, "post", "/v1/check-ins", { code: memberA.checkinCode, locationId: DEMO.ironfit.locations[0]!.id });
    expect(done.body.checkInId).toBeTruthy();

    const noMembership = await as(auth, "post", "/v1/members", { firstName: "Walk", lastName: `In${run}`, phone: `+9617${Date.now() % 1000000}` });
    const denied = await as(auth, "post", "/v1/check-ins", { memberId: noMembership.body.id, locationId: DEMO.ironfit.locations[0]!.id });
    expect(denied.body).toMatchObject({ result: "denied", alerts: ["NO_ACTIVE_MEMBERSHIP"], checkInId: null });
  });

  it("keeps every Phase 1 record inside its gym", async () => {
    const pulse = await staffToken("owner@pulse.test", "pulse");
    expect((await as(pulse, "get", `/v1/sessions/${sessionId}`)).status).toBe(404);
    expect((await as(pulse, "get", `/v1/members/${memberA.id}`)).status).toBe(404);
    const pulseSessions = (await as(pulse, "get", `/v1/sessions?from=${localDate(new Date(), "UTC")}&to=${addDays(localDate(new Date(), "UTC"), 14)}`)).body;
    expect(pulseSessions.every((s: { tenantId: string }) => s.tenantId === DEMO.pulse.id)).toBe(true);
    // Booking another gym's member into your own class: the member doesn't exist for you.
    // Use a class that hasn't started yet, so the only thing that can fail is the member lookup.
    const upcoming = pulseSessions.find((s: { startsAt: string; status: string }) => s.status === "scheduled" && new Date(s.startsAt) > new Date());
    const res = await as(pulse, "post", "/v1/bookings", { sessionId: upcoming.id, memberId: memberA.id });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MEMBER_NOT_FOUND");
    // A member token for one gym can't be used with another gym's key.
    const cross = await http().get("/v1/me/bookings").set("authorization", memberToken).set("x-api-key", DEMO.pulse.publishableKey);
    expect(cross.status).toBe(403);
  });

  it("writes outbox events for member emails and delivers every one of them", async () => {
    const { dispatchOutbox, runMaintenance } = await import("../../src/modules/notifications/jobs");
    const bEvents = () =>
      withTenant(prisma, DEMO.ironfit.id, async (tx) => {
        const bookingIds = (await tx.booking.findMany({ where: { memberId: memberB.id }, select: { id: true } })).map((b) => b.id);
        return tx.outboxEvent.findMany({
          where: {
            OR: [
              ...bookingIds.map((id) => ({ payload: { path: ["bookingId"], equals: id } })),
              { type: "member.login_code", payload: { path: ["memberId"], equals: memberB.id } },
            ],
          },
        });
      });

    // The events were written in the same transactions as the changes.
    const types = new Set((await bEvents()).map((e) => e.type));
    expect([...types]).toEqual(expect.arrayContaining(["waitlist.promoted", "booking.cancelled", "member.login_code"]));

    // Deliver. A dev worker may be running and claim some of them first; either way all must end up delivered.
    const sent: { to: string; subject: string }[] = [];
    const mailer = { send: async (m: { to: string; subject: string }) => void sent.push(m) };
    for (let i = 0; i < 20; i++) {
      while ((await dispatchOutbox(prisma, mailer, { publicAppUrl: "http://localhost:3000" })) > 0);
      if ((await bEvents()).every((e) => e.processedAt)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const events = await bEvents();
    expect(events.every((e) => e.processedAt && !e.lastError)).toBe(true);

    // Delivered login codes are scrubbed from the outbox.
    expect(events.filter((e) => e.type === "member.login_code").every((e) => !(e.payload as { code?: string }).code)).toBe(true);

    const totals = await runMaintenance(prisma);
    expect(totals).toHaveProperty("sessions");
  });

  it("reminds auto-renew members before their membership ends (renewal isn't automatic yet)", async () => {
    const { runMaintenance } = await import("../../src/modules/notifications/jobs");
    const auth = await owner();
    const plans = (await as(auth, "get", "/v1/membership-plans")).body as { id: string; name: string }[];
    const monthly = plans.find((p) => p.name === "Monthly unlimited")!;
    const c = await as(auth, "post", "/v1/members", { firstName: "Cara", lastName: `Test${run}`, email: `cara.${run}@test.dev` });
    const sold = await as(auth, "post", `/v1/members/${c.body.id}/memberships`, {
      planId: monthly.id,
      autoRenew: true,
      payment: { method: "cash" },
    });
    expect(sold.body.subscription.autoRenew).toBe(true);

    // Make it end exactly 7 days from the gym's today.
    const endsOn = addDays(localDate(new Date(), "Asia/Beirut"), 7);
    await withTenant(prisma, DEMO.ironfit.id, (tx) =>
      tx.memberSubscription.update({ where: { id: sold.body.subscription.id }, data: { endsOn: new Date(`${endsOn}T00:00:00.000Z`) } }),
    );

    await runMaintenance(prisma);
    const reminder = await withTenant(prisma, DEMO.ironfit.id, (tx) =>
      tx.outboxEvent.findFirst({ where: { dedupeKey: `expiring:${sold.body.subscription.id}:7` } }),
    );
    expect(reminder?.type).toBe("membership.expiring");
  });

  it("gives a signed-in member their own check-in code (shown as a QR code in the widget)", async () => {
    const res = await as(memberToken, "get", "/v1/me/member");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(memberB.id);
    expect(typeof res.body.checkinCode).toBe("string");
    expect(res.body.checkinCode.length).toBeGreaterThanOrEqual(8);
  });
});

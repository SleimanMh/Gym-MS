import { KeycloakAdmin } from "../../src/modules/identity/keycloak-admin";

type Call = { method: string; url: string; body?: string };

/** A fake Keycloak that records calls; `existing` = users already in the realm. */
function fakeKeycloak(existing: { id: string; email: string }[] = []) {
  const calls: Call[] = [];
  const http = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : init?.body?.toString() });
    if (url.endsWith("/protocol/openid-connect/token")) return Response.json({ access_token: "svc-token" });
    if (method === "GET" && url.includes("/users?")) {
      const email = new URL(url).searchParams.get("email");
      return Response.json(existing.filter((u) => u.email === email));
    }
    if (method === "POST" && url.endsWith("/users")) {
      return new Response(null, { status: 201, headers: { location: "http://kc/admin/realms/gym/users/new-id" } });
    }
    if (method === "PUT" && url.includes("/execute-actions-email")) return new Response(null, { status: 204 });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { http, calls };
}

const admin = (http: typeof fetch) =>
  new KeycloakAdmin(
    {
      baseUrl: "http://kc",
      realm: "gym",
      clientId: "gym-api-admin",
      clientSecret: "secret",
      redirectClientId: "gym-admin",
      redirectUri: "http://app/auth/login",
    },
    http,
  );

const target = { email: "new.owner@example.com", firstName: "New", lastName: "Owner" };

describe("KeycloakAdmin.invite", () => {
  it("creates the account with required actions and emails the set-password link", async () => {
    const { http, calls } = fakeKeycloak();
    const r = await admin(http).invite(target);
    expect(r).toEqual({ userId: "new-id", created: true, emailed: true });

    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "POST /realms/gym/protocol/openid-connect/token",
      "GET /admin/realms/gym/users",
      "POST /admin/realms/gym/users",
      "PUT /admin/realms/gym/users/new-id/execute-actions-email",
    ]);
    const created = JSON.parse(calls[2]!.body!);
    expect(created).toMatchObject({ username: target.email, email: target.email, enabled: true, emailVerified: false });
    expect(created.requiredActions).toEqual(["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
    const mail = new URL(calls[3]!.url);
    expect(mail.searchParams.get("client_id")).toBe("gym-admin");
    expect(mail.searchParams.get("redirect_uri")).toBe("http://app/auth/login");
  });

  it("reuses an existing account and sends nothing", async () => {
    const { http, calls } = fakeKeycloak([{ id: "kc-1", email: target.email }]);
    expect(await admin(http).invite(target)).toEqual({ userId: "kc-1", created: false, emailed: false });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/users"))).toBe(false);
  });

  it("derives base URL and realm from the issuer", () => {
    expect(() =>
      KeycloakAdmin.fromIssuer({ issuer: "http://localhost:8080/realms/gym", clientId: "c", clientSecret: "secret12", appUrl: "http://localhost:3000" }),
    ).not.toThrow();
    expect(() =>
      KeycloakAdmin.fromIssuer({ issuer: "http://localhost:8080/not-a-realm", clientId: "c", clientSecret: "secret12", appUrl: "x" }),
    ).toThrow(/realms/);
  });
});

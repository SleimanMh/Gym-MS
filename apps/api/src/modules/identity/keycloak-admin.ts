/**
 * Minimal Keycloak Admin REST client for staff provisioning (ADR 0003).
 *
 * The worker uses it to handle `user.invite` outbox events: make sure the person has a Keycloak
 * account, then ask Keycloak to email them a link to set a password and verify their email.
 * Our database stays the source of truth for memberships and roles; Keycloak only authenticates.
 */

export interface InviteTarget {
  email: string;
  firstName: string;
  lastName: string;
}

export interface KeycloakAdminConfig {
  /** Keycloak base URL as the worker reaches it, e.g. http://localhost:8080 */
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  /** Client and page the set-password email returns the person to. */
  redirectClientId: string;
  redirectUri: string;
}

type Fetch = typeof fetch;

const INVITE_ACTIONS = ["UPDATE_PASSWORD", "VERIFY_EMAIL"];
const LINK_LIFESPAN_SECONDS = 7 * 24 * 3600;

export class KeycloakAdmin {
  constructor(
    private readonly cfg: KeycloakAdminConfig,
    private readonly http: Fetch = fetch,
  ) {}

  /** Derives the config from KEYCLOAK_ISSUER (".../realms/<realm>") and optional internal URL. */
  static fromIssuer(opts: {
    issuer: string;
    internalUrl?: string;
    clientId: string;
    clientSecret: string;
    appUrl: string;
  }): KeycloakAdmin {
    const m = /^(.*)\/realms\/([^/]+)\/?$/.exec(opts.issuer);
    if (!m) throw new Error(`KEYCLOAK_ISSUER must look like https://host/realms/<realm>, got ${opts.issuer}`);
    return new KeycloakAdmin({
      baseUrl: (opts.internalUrl ?? m[1]!).replace(/\/$/, ""),
      realm: m[2]!,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      redirectClientId: "gym-admin",
      redirectUri: `${opts.appUrl.replace(/\/$/, "")}/auth/login`,
    });
  }

  /**
   * Idempotent: an existing account (same email) is reused. A brand-new account gets the
   * set-password email; an existing one doesn't (they already have a way to sign in).
   */
  async invite(target: InviteTarget): Promise<{ userId: string; created: boolean; emailed: boolean }> {
    const token = await this.serviceToken();
    const existing = await this.findByEmail(token, target.email);
    if (existing) return { userId: existing, created: false, emailed: false };

    const res = await this.http(`${this.adminBase()}/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        username: target.email,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        enabled: true,
        emailVerified: false,
        requiredActions: INVITE_ACTIONS,
      }),
    });
    if (res.status === 409) {
      // Created concurrently by another attempt — treat as existing.
      const id = await this.findByEmail(token, target.email);
      if (id) return { userId: id, created: false, emailed: false };
    }
    if (!res.ok) throw new Error(`Keycloak create user failed: ${res.status} ${await res.text()}`);
    const userId = res.headers.get("location")?.split("/").pop();
    if (!userId) throw new Error("Keycloak create user: no Location header");

    const params = new URLSearchParams({
      client_id: this.cfg.redirectClientId,
      redirect_uri: this.cfg.redirectUri,
      lifespan: String(LINK_LIFESPAN_SECONDS),
    });
    const mail = await this.http(`${this.adminBase()}/users/${userId}/execute-actions-email?${params}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(INVITE_ACTIONS),
    });
    if (!mail.ok) throw new Error(`Keycloak invitation email failed: ${mail.status} ${await mail.text()}`);
    return { userId, created: true, emailed: true };
  }

  private adminBase() {
    return `${this.cfg.baseUrl}/admin/realms/${encodeURIComponent(this.cfg.realm)}`;
  }

  private async serviceToken(): Promise<string> {
    const res = await this.http(`${this.cfg.baseUrl}/realms/${encodeURIComponent(this.cfg.realm)}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`Keycloak service token failed: ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  private async findByEmail(token: string, email: string): Promise<string | null> {
    const res = await this.http(`${this.adminBase()}/users?${new URLSearchParams({ email, exact: "true" })}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Keycloak user lookup failed: ${res.status}`);
    const users = (await res.json()) as { id: string; email?: string }[];
    return users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  }
}

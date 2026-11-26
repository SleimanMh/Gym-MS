/**
 * Staff sign-in through Keycloak (ADR 0003): Authorization Code + PKCE, done server-side by the
 * admin app. Tokens live in httpOnly cookies — the browser's JavaScript never sees them.
 *
 * Edge-safe (used by middleware.ts): no Node-only APIs in this file.
 */

const issuer = process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/gym";

export const AUTH = {
  /** Browser-facing issuer (redirects, and the `iss` the API checks). */
  issuer,
  /** How this server reaches Keycloak for token calls (in Docker: http://keycloak:8080/realms/gym). */
  internalIssuer: process.env.KEYCLOAK_INTERNAL_ISSUER ?? issuer,
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? "gym-admin",
  appUrl: (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

/** The seeded-user picker on /login. Off in production unless explicitly enabled. */
export const devLoginEnabled =
  process.env.DEV_LOGIN === "true" || (process.env.DEV_LOGIN !== "false" && process.env.NODE_ENV !== "production");

export const COOKIE = {
  access: "gym_token",
  refresh: "gym_refresh",
  idToken: "gym_idt",
  /** Chosen gym (slug) for people who work at several; sent to the API as x-tenant-slug. */
  tenant: "gym_tenant",
  /** PKCE verifier + state between /auth/login and /auth/callback. */
  oidc: "gym_oidc",
} as const;

export const cookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  ...(maxAge ? { maxAge } : {}),
});

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
}

export const endpoints = {
  authorize: () => `${AUTH.issuer}/protocol/openid-connect/auth`,
  token: () => `${AUTH.internalIssuer}/protocol/openid-connect/token`,
  logout: () => `${AUTH.issuer}/protocol/openid-connect/logout`,
};

/** Seconds-since-epoch expiry of a JWT, without verifying it (the API verifies). */
export function jwtExp(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenSet | null> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${AUTH.appUrl}/auth/callback`,
    client_id: AUTH.clientId,
    code_verifier: verifier,
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet | null> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: AUTH.clientId });
}

async function tokenRequest(form: Record<string, string>): Promise<TokenSet | null> {
  try {
    const res = await fetch(endpoints.token(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as TokenSet) : null;
  } catch {
    return null;
  }
}

/** Cookies to set after a successful sign-in or refresh. */
export function sessionCookies(t: TokenSet): { name: string; value: string; maxAge: number }[] {
  const sessionMax = t.refresh_expires_in || t.expires_in;
  const out: { name: string; value: string; maxAge: number }[] = [{ name: COOKIE.access, value: t.access_token, maxAge: sessionMax }];
  if (t.refresh_token) out.push({ name: COOKIE.refresh, value: t.refresh_token, maxAge: sessionMax });
  if (t.id_token) out.push({ name: COOKIE.idToken, value: t.id_token, maxAge: sessionMax });
  return out;
}

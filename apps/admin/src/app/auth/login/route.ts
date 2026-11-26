import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH, COOKIE, cookieOptions, endpoints } from "@/lib/auth";

/** Starts Keycloak sign-in: PKCE verifier + state in a short-lived cookie, then redirect. */
export function GET(req: NextRequest) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const next = req.nextUrl.searchParams.get("next");
  const returnTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const url = new URL(endpoints.authorize());
  url.search = new URLSearchParams({
    client_id: AUTH.clientId,
    redirect_uri: `${AUTH.appUrl}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ui_locales: req.cookies.get("lang")?.value === "ar" ? "ar" : "en",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE.oidc, JSON.stringify({ state, verifier, returnTo }), { ...cookieOptions(600), path: "/auth" });
  return res;
}

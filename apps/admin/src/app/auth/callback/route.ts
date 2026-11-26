import { NextResponse, type NextRequest } from "next/server";
import { AUTH, COOKIE, cookieOptions, exchangeCode, sessionCookies } from "@/lib/auth";

/** Keycloak sends the person back here with a one-time code; trade it for tokens. */
export async function GET(req: NextRequest) {
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${AUTH.appUrl}/login?error=${reason}`);
    res.cookies.delete({ name: COOKIE.oidc, path: "/auth" });
    return res;
  };

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail("sso");
  let saved: { state: string; verifier: string; returnTo: string };
  try {
    saved = JSON.parse(req.cookies.get(COOKIE.oidc)?.value ?? "");
  } catch {
    return fail("expired");
  }
  const code = p.get("code");
  if (!code || p.get("state") !== saved.state) return fail("state");

  const tokens = await exchangeCode(code, saved.verifier);
  if (!tokens) return fail("sso");

  const res = NextResponse.redirect(`${AUTH.appUrl}${saved.returnTo}`);
  for (const c of sessionCookies(tokens)) res.cookies.set(c.name, c.value, cookieOptions(c.maxAge));
  res.cookies.delete({ name: COOKIE.oidc, path: "/auth" });
  res.cookies.delete(COOKIE.tenant); // a new person signed in: pick their gym afresh
  return res;
}

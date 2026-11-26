import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, cookieOptions, jwtExp, refreshTokens, sessionCookies } from "@/lib/auth";

/**
 * Keeps Keycloak sessions alive: access tokens last 15 minutes, so shortly before expiry the
 * refresh token is traded for a new pair. The new token is also put on the incoming request,
 * so the page being rendered right now already uses it.
 */
export async function middleware(req: NextRequest) {
  const refresh = req.cookies.get(COOKIE.refresh)?.value;
  if (!refresh) return NextResponse.next(); // dev tokens and signed-out visitors

  const exp = jwtExp(req.cookies.get(COOKIE.access)?.value);
  if (exp && exp - Date.now() / 1000 > 60) return NextResponse.next();

  const tokens = await refreshTokens(refresh);
  if (!tokens) {
    // Session ended in Keycloak (signed out elsewhere, idle too long): drop it; pages send to /login.
    req.cookies.delete(COOKIE.access);
    const res = NextResponse.next({ request: { headers: req.headers } });
    for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.idToken]) res.cookies.delete(name);
    return res;
  }

  const cookies = sessionCookies(tokens);
  for (const c of cookies) req.cookies.set(c.name, c.value);
  const res = NextResponse.next({ request: { headers: req.headers } });
  for (const c of cookies) res.cookies.set(c.name, c.value, cookieOptions(c.maxAge));
  return res;
}

export const config = {
  // Everything except static files and the sign-in routes themselves.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/).*)"],
};

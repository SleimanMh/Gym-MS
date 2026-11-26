import { NextResponse, type NextRequest } from "next/server";
import { AUTH, COOKIE, cookieOptions } from "@/lib/auth";

/**
 * Remembers which gym a person is working in (they may work at several). The API still checks
 * the person's membership of that gym on every request — this cookie only chooses, it doesn't grant.
 */
export function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const res = NextResponse.redirect(`${AUTH.appUrl}/`);
  if (/^[a-z0-9-]{3,40}$/.test(slug)) res.cookies.set(COOKIE.tenant, slug, cookieOptions(60 * 60 * 24 * 365));
  return res;
}

/**
 * Sign-in cookies and the gym address (ADR 0007).
 *
 * Every gym has its own address — `http://{slug}.localhost:3000` locally, `https://{slug}.<domain>`
 * in production (NEXT_PUBLIC_GYM_URL_TEMPLATE). Cookies are host-only, so each gym's address keeps
 * its own sessions. The bare address (no gym) is for platform staff.
 */

export const COOKIE = {
  /** Staff session (API token), httpOnly. */
  staff: "gym_token",
  /** Member session (API member token), httpOnly. */
  member: "gym_member",
  /** Email waiting for a first-login password change (short-lived, never in the URL). */
  pendingEmail: "gym_pw_email",
} as const;

export const cookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  ...(maxAge ? { maxAge } : {}),
});

const TEMPLATE = process.env.NEXT_PUBLIC_GYM_URL_TEMPLATE ?? "http://{slug}.localhost:3000";

/** "ironfit.localhost:3000" → "ironfit"; the bare host → null. */
export function gymFromHost(host: string | null): string | null {
  if (!host) return null;
  const tpl = new URL(TEMPLATE.replace("{slug}", "x"));
  const suffix = `.${tpl.host.slice(2)}`; // ".localhost:3000"
  const h = host.toLowerCase();
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) ? slug : null;
}

/** The address of a gym, e.g. http://ironfit.localhost:3000 */
export const gymUrl = (slug: string) => TEMPLATE.replace("{slug}", slug);
export const platformUrl = () => {
  const u = new URL(TEMPLATE.replace("{slug}", "x"));
  return `${u.protocol}//${u.host.slice(2)}`;
};

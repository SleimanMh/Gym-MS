import { cookies, headers } from "next/headers";
import type { MeResponse } from "@gym/shared";
import { COOKIE, gymFromHost } from "./session";

export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const TOKEN_COOKIE = COOKIE.staff;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * The gym of the address this page was opened at (ironfit.localhost:3000 → "ironfit"), or null.
 * After a server action redirects, Next renders the next page internally with the server's own host
 * and the browser's in x-forwarded-host, so that one is read first. (Which gym's pages you see is
 * not a security boundary: the API checks every token belongs to the gym it's used for.)
 */
export async function currentGym(): Promise<string | null> {
  const h = await headers();
  return gymFromHost(h.get("x-forwarded-host")?.split(",")[0]?.trim() ?? null) ?? gymFromHost(h.get("host"));
}

/**
 * Server-side API call as the signed-in person: staff token by default, member token for the
 * member area. The gym always comes from the address (`x-tenant-slug`); the API also checks the
 * token belongs to that gym.
 */
export async function api<T>(path: string, init: RequestInit & { as?: "staff" | "member" | "anonymous" } = {}): Promise<T> {
  const { as = "staff", ...rest } = init;
  const jar = await cookies();
  const token = as === "anonymous" ? undefined : jar.get(as === "member" ? COOKIE.member : COOKIE.staff)?.value;
  const gym = await currentGym();
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(gym ? { "x-tenant-slug": gym } : {}),
      ...rest.headers,
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>("/v1/me");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

/** Public branding of the gym at this address (name, colour, language), or null on the bare address / unknown gym. */
export async function getGym(): Promise<{ slug: string; name: string; defaultLanguage: "en" | "ar"; branding: { primaryColor: string } } | null> {
  if (!(await currentGym())) return null;
  try {
    return await api("/v1/public/tenant", { as: "anonymous" });
  } catch (e) {
    // Unknown gym at this address (the API answers UNKNOWN_TENANT) → show "no gym here".
    if (e instanceof ApiError && [400, 401, 404].includes(e.status)) return null;
    throw e;
  }
}

import { cookies } from "next/headers";
import type { MeResponse } from "@gym/shared";

export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const TOKEN_COOKIE = "gym_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * Server-side API call with the signed-in user's token (httpOnly cookie) and, for people who work
 * at several gyms, the gym they chose (`x-tenant-slug`; the API checks they belong to it).
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  const tenant = jar.get("gym_tenant")?.value;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { "x-tenant-slug": tenant } : {}),
      ...init.headers,
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

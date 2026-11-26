"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { API_URL, ApiError, TOKEN_COOKIE, api } from "@/lib/api";
import { AUTH, COOKIE, devLoginEnabled, endpoints } from "@/lib/auth";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

export async function setLocation(formData: FormData) {
  const id = String(formData.get("location") ?? "");
  (await cookies()).set("loc", /^[0-9a-f-]{36}$/i.test(id) ? id : "", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang") === "ar" ? "ar" : "en";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/**
 * Development sign-in through POST /v1/dev/token (seeded users, no password). Only shown when
 * DEV_LOGIN is on; the API refuses dev tokens in production regardless.
 */
export async function devLogin(formData: FormData) {
  if (!devLoginEnabled) redirect("/login");
  const value = String(formData.get("who") ?? "");
  const [email, tenantSlug] = value.split("|");
  const res = await fetch(`${API_URL}/v1/dev/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, tenantSlug: tenantSlug || undefined }),
    cache: "no-store",
  });
  if (!res.ok) redirect(`/login?error=${res.status}`);
  const { accessToken } = (await res.json()) as { accessToken: string };
  const jar = await cookies();
  for (const name of [COOKIE.refresh, COOKIE.idToken]) jar.delete(name);
  jar.set(TOKEN_COOKIE, accessToken, { ...cookieOpts, maxAge: 12 * 3600 });
  // Dev tokens name their gym in the token; keep the chosen-gym cookie in step with it.
  if (tenantSlug) jar.set(COOKIE.tenant, tenantSlug, cookieOpts);
  else jar.delete(COOKIE.tenant);
  redirect(tenantSlug ? "/" : "/platform");
}

/** Signs out here and, for Keycloak sessions, in Keycloak too (single sign-out). */
export async function logout() {
  const jar = await cookies();
  const idToken = jar.get(COOKIE.idToken)?.value;
  for (const name of [TOKEN_COOKIE, COOKIE.refresh, COOKIE.idToken, COOKIE.tenant]) jar.delete(name);
  if (idToken) {
    const url = new URL(endpoints.logout());
    url.search = new URLSearchParams({
      client_id: AUTH.clientId,
      id_token_hint: idToken,
      post_logout_redirect_uri: `${AUTH.appUrl}/login`,
    }).toString();
    redirect(url.toString());
  }
  redirect("/login");
}

export async function createLocation(formData: FormData) {
  try {
    await api("/v1/locations", { method: "POST", body: JSON.stringify({ name: String(formData.get("name") ?? "") }) });
  } catch (e) {
    if (e instanceof ApiError) {
      const code = (e.body as { code?: string } | null)?.code ?? String(e.status);
      redirect(`/settings?error=${encodeURIComponent(code)}`);
    }
    throw e;
  }
  revalidatePath("/settings");
}

export async function createTenant(formData: FormData) {
  const f = (k: string) => String(formData.get(k) ?? "");
  try {
    await api("/v1/platform/tenants", {
      method: "POST",
      body: JSON.stringify({
        slug: f("slug"),
        name: f("name"),
        planCode: f("planCode"),
        defaultLanguage: f("defaultLanguage"),
        owner: { email: f("ownerEmail"), firstName: f("ownerFirstName"), lastName: f("ownerLastName") },
      }),
    });
  } catch (e) {
    if (e instanceof ApiError) {
      const code = (e.body as { code?: string } | null)?.code ?? String(e.status);
      redirect(`/platform?error=${encodeURIComponent(code)}`);
    }
    throw e;
  }
  revalidatePath("/platform");
}

export async function assignPlan(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  await api(`/v1/platform/tenants/${tenantId}/plan`, {
    method: "PUT",
    body: JSON.stringify({ planCode: String(formData.get("planCode") ?? "") }),
  });
  revalidatePath("/platform");
}

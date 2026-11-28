"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { API_URL, ApiError, api, currentGym } from "@/lib/api";
import { COOKIE, cookieOptions, gymUrl } from "@/lib/session";

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

/** POST to the API's public sign-in endpoints for the gym at this address. */
async function publicPost<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const gym = await currentGym();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(gym ? { "x-tenant-slug": gym } : {}) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, code: (data as { code?: string } | null)?.code ?? (res.status === 400 ? "VALIDATION_FAILED" : String(res.status)) };
  return { ok: true, data: data as T };
}

type SignInResult = { status: "ok"; accessToken: string; expiresIn: number; tenantSlug: string | null } | { status: "password_change_required" };

async function startSession(r: Extract<SignInResult, { status: "ok" }>) {
  const jar = await cookies();
  jar.delete(COOKIE.pendingEmail);
  jar.set(COOKIE.staff, r.accessToken, cookieOptions(r.expiresIn));
  redirect(r.tenantSlug ? "/" : "/platform");
}

/** Staff sign-in with email + password at the gym's own address (ADR 0007). */
export async function signIn(f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const r = await publicPost<SignInResult>("/v1/auth/login", { email, password: String(f.get("password") ?? "") });
  if (!r.ok) redirect(`/login?error=${encodeURIComponent(r.code)}`);
  if (r.data.status === "password_change_required") {
    // First sign-in with the emailed password: choose your own next. The email waits in a short-lived cookie.
    (await cookies()).set(COOKIE.pendingEmail, email, cookieOptions(15 * 60));
    redirect("/login/new-password");
  }
  await startSession(r.data);
}

/** Current (emailed) password + a new one → signed in. */
export async function changePassword(f: FormData) {
  const jar = await cookies();
  const email = jar.get(COOKIE.pendingEmail)?.value ?? String(f.get("email") ?? "").trim().toLowerCase();
  const newPassword = String(f.get("newPassword") ?? "");
  if (newPassword !== String(f.get("confirm") ?? "")) redirect("/login/new-password?error=PASSWORD_MISMATCH");
  const r = await publicPost<SignInResult>("/v1/auth/change-password", { email, currentPassword: String(f.get("currentPassword") ?? ""), newPassword });
  if (!r.ok) redirect(`/login/new-password?error=${encodeURIComponent(r.code)}`);
  if (r.data.status !== "ok") redirect("/login");
  await startSession(r.data);
}

/** Member sign-in, step 1: email them a 6-digit code. */
export async function memberStart(f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const r = await publicPost("/v1/public/member-auth/start", { email });
  if (!r.ok) redirect(`/login?as=member&error=${encodeURIComponent(r.code)}`);
  (await cookies()).set(COOKIE.pendingEmail, email, cookieOptions(15 * 60));
  redirect("/login?as=member&step=code");
}

/** Member sign-in, step 2: the code → member session → member area. */
export async function memberVerify(f: FormData) {
  const jar = await cookies();
  const email = jar.get(COOKIE.pendingEmail)?.value ?? "";
  const r = await publicPost<{ accessToken: string; expiresIn: number }>("/v1/public/member-auth/verify", { email, code: String(f.get("code") ?? "").trim() });
  if (!r.ok) redirect(`/login?as=member&step=code&error=${encodeURIComponent(r.code)}`);
  jar.delete(COOKIE.pendingEmail);
  jar.set(COOKIE.member, r.data.accessToken, cookieOptions(r.data.expiresIn));
  redirect("/me");
}

export async function logout() {
  const jar = await cookies();
  for (const name of [COOKIE.staff, COOKIE.pendingEmail]) jar.delete(name);
  redirect("/login");
}

export async function memberLogout() {
  (await cookies()).delete(COOKIE.member);
  redirect("/login?as=member");
}

/** Bare address: "which gym?" → that gym's own sign-in page. */
export async function findGym(f: FormData) {
  const slug = String(f.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) redirect("/login?error=GYM_NOT_FOUND");
  redirect(`${gymUrl(slug)}/login`);
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

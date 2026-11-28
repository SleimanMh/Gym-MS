"use server";

import { redirect } from "next/navigation";
import { act, field } from "@/lib/act";

const perms = (f: FormData) => f.getAll("perm").map(String);

/** Owner sets a password and hands it over themselves (no email). */
export async function setUserPassword(f: FormData) {
  const id = field(f, "id")!;
  const back = `/settings/users/${id}`;
  if (String(f.get("password") ?? "") !== String(f.get("confirm") ?? "")) redirect(`${back}?error=PASSWORD_MISMATCH`);
  await act(
    `/v1/users/${id}/password`,
    { method: "PUT", body: { password: String(f.get("password") ?? ""), mustChangePassword: f.get("mustChange") === "on" } },
    back,
    () => `${back}?done=password`,
  );
}

/** Owner creates a staff sign-in: the API emails a generated password, or the owner sets one now. */
export async function createUser(f: FormData) {
  const role = field(f, "role");
  const permissions = perms(f);
  const setNow = f.get("pwHow") === "set";
  if (setNow && String(f.get("password") ?? "") !== String(f.get("confirm") ?? "")) redirect("/settings/users/new?error=PASSWORD_MISMATCH");
  await act<{ userId: string; invited: boolean; passwordSet: boolean }>(
    "/v1/users",
    {
      method: "POST",
      body: {
        firstName: field(f, "firstName"),
        lastName: field(f, "lastName"),
        email: field(f, "email"),
        role,
        permissions: role === "owner" || !f.has("permSet") ? undefined : permissions,
        ...(setNow ? { password: String(f.get("password") ?? ""), mustChangePassword: f.get("mustChange") === "on" } : {}),
      },
    },
    "/settings/users/new",
    (r) => `/settings/users/${r.userId}?done=${r.passwordSet ? "createdSet" : r.invited ? "created" : "added"}`,
  );
}

export async function saveUserAccess(f: FormData) {
  const id = field(f, "id")!;
  const role = field(f, "role");
  await act(
    `/v1/users/${id}/access`,
    { method: "PUT", body: { role, permissions: role === "owner" || !f.has("permSet") ? undefined : perms(f) } },
    `/settings/users/${id}`,
    () => `/settings/users/${id}?done=saved`,
  );
}

export async function resetUserPassword(f: FormData) {
  const id = field(f, "id")!;
  await act(`/v1/users/${id}/reset-password`, { method: "POST" }, `/settings/users/${id}`, () => `/settings/users/${id}?done=reset`);
}

export async function setUserStatus(f: FormData) {
  const id = field(f, "id")!;
  await act(`/v1/users/${id}/status`, { method: "PUT", body: { status: field(f, "status") } }, `/settings/users/${id}`);
}

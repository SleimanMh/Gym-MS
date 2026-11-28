"use server";

import { act, field } from "@/lib/act";

const perms = (f: FormData) => f.getAll("perm").map(String);

/** Owner creates a staff sign-in; the API emails a generated password. */
export async function createUser(f: FormData) {
  const role = field(f, "role");
  const permissions = perms(f);
  await act<{ userId: string; invited: boolean }>(
    "/v1/users",
    {
      method: "POST",
      body: {
        firstName: field(f, "firstName"),
        lastName: field(f, "lastName"),
        email: field(f, "email"),
        role,
        permissions: role === "owner" || !f.has("permSet") ? undefined : permissions,
      },
    },
    "/settings/users/new",
    (r) => `/settings/users/${r.userId}?done=${r.invited ? "created" : "added"}`,
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

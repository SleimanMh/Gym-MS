"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError, api } from "@/lib/api";
import { field } from "@/lib/act";

/** Member actions call the API as the member (their own token); errors come back as ?error=CODE. */
async function asMember(path: string, init: RequestInit) {
  try {
    await api(path, { ...init, as: "member" });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) redirect("/login?as=member");
      redirect(`/me?error=${encodeURIComponent((e.body as { code?: string } | null)?.code ?? String(e.status))}`);
    }
    throw e;
  }
  revalidatePath("/me");
}

export async function bookClass(f: FormData) {
  await asMember("/v1/me/bookings", { method: "POST", body: JSON.stringify({ sessionId: field(f, "sessionId"), joinWaitlist: f.get("waitlist") === "1" }) });
}

export async function cancelBooking(f: FormData) {
  await asMember(`/v1/me/bookings/${field(f, "id")}`, { method: "DELETE" });
}

export async function leaveWaitlist(f: FormData) {
  await asMember(`/v1/me/waitlist/${field(f, "id")}`, { method: "DELETE" });
}

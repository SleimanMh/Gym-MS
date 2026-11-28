"use server";

import { parseMoney } from "@gym/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { act, field } from "@/lib/act";
import { ar3, en3 } from "@/lib/messages-phase3";

/** A same-site path from a hidden "back" field ("//host" would be another site). */
const safeBack = (v: string | undefined, fallback: string) => (v && v.startsWith("/") && !v.startsWith("//") ? v : fallback);

/** Where the form was submitted from (so the top-bar clock works on any page). */
async function backPath(f: FormData) {
  const explicit = field(f, "back");
  if (explicit) return safeBack(explicit, "/");
  const ref = (await headers()).get("referer");
  try {
    return ref ? new URL(ref).pathname : "/";
  } catch {
    return "/";
  }
}

function payFields(f: FormData, back: string) {
  const currency = field(f, "currency") ?? "USD";
  let payRateMinor: number;
  try {
    payRateMinor = Number(parseMoney(field(f, "rate") ?? "0", currency));
  } catch {
    redirect(`${back}?error=VALIDATION_FAILED`);
  }
  const pct = Number(field(f, "commission") ?? "0");
  return {
    payType: field(f, "payType"),
    payRateMinor,
    commissionBp: Number.isFinite(pct) ? Math.round(pct * 100) : 0,
  };
}

export async function createEmployee(f: FormData) {
  const back = "/staff/new";
  let userId: string | undefined;
  // "Give them a sign-in": create the account first (the API emails a temporary password).
  if (f.get("signIn") === "on") {
    const r = await act<{ userId: string }>(
      "/v1/users",
      { method: "POST", body: { firstName: field(f, "firstName"), lastName: field(f, "lastName"), email: field(f, "email"), role: field(f, "role") } },
      back,
    );
    userId = r.userId;
  }
  await act<{ id: string }>(
    "/v1/staff",
    {
      method: "POST",
      body: {
        firstName: field(f, "firstName"),
        lastName: field(f, "lastName"),
        email: field(f, "email"),
        phone: field(f, "phone"),
        title: field(f, "title"),
        ...payFields(f, back),
        homeLocationId: field(f, "homeLocationId"),
        startedOn: field(f, "startedOn"),
        userId,
      },
    },
    back,
    (e) => `/staff/${e.id}`,
  );
}

export async function updateEmployee(f: FormData) {
  const id = field(f, "id")!;
  const back = `/staff/${id}`;
  await act(
    `/v1/staff/${id}`,
    {
      method: "PATCH",
      body: {
        title: field(f, "title"),
        ...payFields(f, back),
        homeLocationId: field(f, "homeLocationId"),
        status: field(f, "status"),
      },
    },
    back,
  );
}

export async function clockIn(f: FormData) {
  await act("/v1/time-clock/in", { method: "POST", body: { employeeId: field(f, "employeeId") } }, await backPath(f));
}

export async function clockOut(f: FormData) {
  await act("/v1/time-clock/out", { method: "POST", body: { employeeId: field(f, "employeeId") } }, await backPath(f));
}

/** Activity typed in either language → its key when it's one of the suggestions. */
function activityKey(v: string | undefined) {
  if (!v) return undefined;
  const k = (Object.keys(en3) as (keyof typeof en3)[]).find((key) => key.startsWith("act.") && (en3[key] === v || ar3[key] === v));
  return k ? k.slice(4) : v;
}

/** Add or edit a calendar slot (the quick-add dialog). */
export async function saveSlot(f: FormData) {
  const back = safeBack(field(f, "back"), "/staff/schedule");
  const id = field(f, "id");
  await act(
    id ? `/v1/shifts/${id}` : "/v1/shifts",
    {
      method: id ? "PUT" : "POST",
      body: {
        employeeId: field(f, "employeeId"),
        locationId: field(f, "locationId"),
        date: field(f, "date"),
        start: field(f, "start"),
        end: field(f, "end"),
        activity: activityKey(field(f, "activity")),
        note: field(f, "note"),
      },
    },
    back,
  );
}

export async function deleteSlot(f: FormData) {
  await act(`/v1/shifts/${field(f, "id")}`, { method: "DELETE" }, safeBack(field(f, "back"), "/staff/schedule"));
}

export async function removeShift(f: FormData) {
  await act(`/v1/shifts/${field(f, "id")}`, { method: "DELETE" }, safeBack(field(f, "back"), "/staff/rota"));
}

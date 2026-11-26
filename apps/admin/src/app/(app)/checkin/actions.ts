"use server";

import { revalidatePath } from "next/cache";
import { ApiError, api } from "@/lib/api";

export interface CheckInState {
  result: "ok" | "warning" | "denied" | "error";
  alerts: string[];
  member: { id: string; firstName: string; lastName: string } | null;
  booking: { className: string; startsAt: string } | null;
  checkedIn: boolean;
  error?: string;
  at: number;
}

/** Called by the check-in screen; returns the result card (no redirect, so the scanner field keeps focus). */
export async function checkIn(_prev: CheckInState | null, f: FormData): Promise<CheckInState> {
  const code = String(f.get("code") ?? "").trim();
  const memberId = String(f.get("memberId") ?? "").trim();
  try {
    const r = await api<{
      result: "ok" | "warning" | "denied";
      alerts: string[];
      member: { id: string; firstName: string; lastName: string };
      booking: { className: string; startsAt: string } | null;
      checkInId: string | null;
    }>("/v1/check-ins", {
      method: "POST",
      body: JSON.stringify({
        ...(code ? { code } : { memberId }),
        locationId: String(f.get("locationId") ?? ""),
        force: f.get("force") === "1",
      }),
    });
    revalidatePath("/checkin");
    return { result: r.result, alerts: r.alerts, member: r.member, booking: r.booking, checkedIn: !!r.checkInId, at: Date.now() };
  } catch (e) {
    const code = e instanceof ApiError ? ((e.body as { code?: string } | null)?.code ?? "generic") : "generic";
    return { result: "error", alerts: [], member: null, booking: null, checkedIn: false, error: code, at: Date.now() };
  }
}

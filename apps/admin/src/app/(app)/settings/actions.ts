"use server";

import { parseMoney } from "@gym/shared";
import { redirect } from "next/navigation";
import { act, field, intField } from "@/lib/act";

const tab = (name: string) => `/settings?tab=${name}`;

export async function createPlan(f: FormData) {
  const currency = field(f, "currency") ?? "USD";
  let priceMinor: number;
  try {
    priceMinor = Number(parseMoney(field(f, "price") ?? "0", currency));
  } catch {
    redirect(`${tab("plans")}&error=VALIDATION_FAILED`);
  }
  const type = field(f, "type");
  await act(
    "/v1/membership-plans",
    {
      method: "POST",
      body: {
        name: field(f, "name"),
        type,
        priceMinor,
        billingPeriod: type === "recurring" ? field(f, "billingPeriod") : undefined,
        durationDays: type === "recurring" ? undefined : intField(f, "durationDays"),
        credits: type === "class_pack" || type === "drop_in" ? intField(f, "credits") : undefined,
      },
    },
    tab("plans"),
  );
}

export async function togglePlan(f: FormData) {
  await act(`/v1/membership-plans/${field(f, "id")}`, { method: "PATCH", body: { isActive: f.get("isActive") === "1" } }, tab("plans"));
}

export async function saveBookingPolicy(f: FormData) {
  await act(
    "/v1/settings/booking-policy",
    {
      method: "PUT",
      body: {
        bookingWindowDays: intField(f, "bookingWindowDays"),
        cancellationCutoffMin: intField(f, "cancellationCutoffMin"),
        lateCancelPolicy: field(f, "lateCancelPolicy"),
        waitlistAutoPromote: f.get("waitlistAutoPromote") === "on",
        waitlistPromoteCutoffMin: intField(f, "waitlistPromoteCutoffMin"),
        reminderLeadMin: intField(f, "reminderLeadMin"),
      },
    },
    tab("booking"),
  );
}

export async function addOrigin(f: FormData) {
  await act("/v1/settings/allowed-origins", { method: "POST", body: { origin: field(f, "origin") } }, tab("website"));
}

export async function removeOrigin(f: FormData) {
  await act(`/v1/settings/allowed-origins/${field(f, "id")}`, { method: "DELETE" }, tab("website"));
}

export async function createKey() {
  await act<{ key: string }>("/v1/settings/api-keys", { method: "POST" }, tab("website"), (r) => `${tab("website")}&newKey=${encodeURIComponent(r.key)}`);
}

export async function addHoliday(f: FormData) {
  await act("/v1/settings/holidays", { method: "POST", body: { date: field(f, "date"), name: field(f, "name") } }, tab("holidays"));
}

export async function removeHoliday(f: FormData) {
  await act(`/v1/settings/holidays/${field(f, "id")}`, { method: "DELETE" }, tab("holidays"));
}

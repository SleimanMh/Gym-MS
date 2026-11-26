"use server";

import { act, field } from "@/lib/act";

export async function createMember(f: FormData) {
  await act<{ id: string }>(
    "/v1/members",
    {
      method: "POST",
      body: {
        firstName: field(f, "firstName"),
        lastName: field(f, "lastName"),
        email: field(f, "email"),
        phone: field(f, "phone"),
        dateOfBirth: field(f, "dateOfBirth"),
        gender: field(f, "gender"),
        emergencyContactName: field(f, "emergencyContactName"),
        emergencyContactPhone: field(f, "emergencyContactPhone"),
        language: field(f, "language"),
        notes: field(f, "notes"),
      },
    },
    "/members/new",
    (m) => `/members/${m.id}`,
  );
}

export async function sellMembership(f: FormData) {
  const memberId = field(f, "memberId")!;
  const method = field(f, "method");
  await act(
    `/v1/members/${memberId}/memberships`,
    {
      method: "POST",
      body: {
        planId: field(f, "planId"),
        startsOn: field(f, "startsOn"),
        payment: method && method !== "later" ? { method } : undefined,
      },
    },
    `/members/${memberId}`,
  );
}

export async function recordPayment(f: FormData) {
  const memberId = field(f, "memberId")!;
  await act(
    "/v1/payments",
    {
      method: "POST",
      body: {
        memberId,
        subscriptionId: field(f, "subscriptionId"),
        amountMinor: Number(field(f, "amountMinor")),
        method: field(f, "method"),
      },
    },
    `/members/${memberId}`,
  );
}

export async function freezeMembership(f: FormData) {
  await act(
    `/v1/memberships/${field(f, "subscriptionId")}/freeze`,
    { method: "POST", body: { startsOn: field(f, "startsOn"), endsOn: field(f, "endsOn") } },
    `/members/${field(f, "memberId")}`,
  );
}

export async function cancelMembership(f: FormData) {
  await act(`/v1/memberships/${field(f, "subscriptionId")}/cancel`, { method: "POST" }, `/members/${field(f, "memberId")}`);
}

export async function rotateCode(f: FormData) {
  const id = field(f, "memberId")!;
  await act(`/v1/members/${id}/checkin-code`, { method: "POST" }, `/members/${id}`);
}

"use server";

import { act, field, intField } from "@/lib/act";

export async function createClassType(f: FormData) {
  await act(
    "/v1/class-types",
    {
      method: "POST",
      body: {
        name: field(f, "name"),
        color: field(f, "color"),
        durationMin: intField(f, "durationMin"),
        defaultCapacity: intField(f, "defaultCapacity"),
        description: field(f, "description"),
      },
    },
    "/schedule/setup",
  );
}

export async function createWeekly(f: FormData) {
  await act(
    "/v1/schedules",
    {
      method: "POST",
      body: {
        locationId: field(f, "locationId"),
        classTypeId: field(f, "classTypeId"),
        trainerUserId: field(f, "trainerUserId"),
        weekday: intField(f, "weekday"),
        startTime: field(f, "startTime"),
        capacity: intField(f, "capacity"),
      },
    },
    "/schedule/setup",
  );
}

export async function stopWeekly(f: FormData) {
  await act(`/v1/schedules/${field(f, "id")}`, { method: "DELETE" }, "/schedule/setup");
}

export async function createOneOff(f: FormData) {
  await act<{ id: string }>(
    "/v1/sessions",
    {
      method: "POST",
      body: {
        locationId: field(f, "locationId"),
        classTypeId: field(f, "classTypeId"),
        trainerUserId: field(f, "trainerUserId"),
        date: field(f, "date"),
        startTime: field(f, "startTime"),
        capacity: intField(f, "capacity"),
      },
    },
    "/schedule/setup",
    (s) => `/schedule/${s.id}`,
  );
}

export async function bookMember(f: FormData) {
  const sessionId = field(f, "sessionId")!;
  await act(
    "/v1/bookings",
    { method: "POST", body: { sessionId, memberId: field(f, "memberId"), joinWaitlist: f.get("joinWaitlist") === "1" } },
    `/schedule/${sessionId}`,
  );
}

export async function cancelBooking(f: FormData) {
  await act(
    `/v1/bookings/${field(f, "bookingId")}/cancel`,
    { method: "POST", body: { waivePenalty: f.get("waive") === "on" } },
    `/schedule/${field(f, "sessionId")}`,
  );
}

export async function markAttendance(f: FormData) {
  await act(
    `/v1/bookings/${field(f, "bookingId")}/attendance`,
    { method: "POST", body: { status: field(f, "status") } },
    `/schedule/${field(f, "sessionId")}`,
  );
}

export async function cancelSession(f: FormData) {
  const id = field(f, "sessionId")!;
  await act(`/v1/sessions/${id}/cancel`, { method: "POST", body: { reason: field(f, "reason") } }, `/schedule/${id}`);
}

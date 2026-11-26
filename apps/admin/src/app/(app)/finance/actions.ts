"use server";

import { parseMoney } from "@gym/shared";
import { redirect } from "next/navigation";
import { act, field } from "@/lib/act";

const safeBack = (v: string | undefined, fallback: string) => (v && v.startsWith("/") && !v.startsWith("//") ? v : fallback);

function amount(f: FormData, name: string, back: string) {
  try {
    return Number(parseMoney(field(f, name) ?? "", field(f, "currency") ?? "USD"));
  } catch {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=VALIDATION_FAILED`);
  }
}

export async function addExpense(f: FormData) {
  const back = safeBack(field(f, "back"), "/finance/expenses");
  await act(
    "/v1/expenses",
    {
      method: "POST",
      body: {
        categoryId: field(f, "categoryId"),
        locationId: field(f, "locationId"),
        amountMinor: amount(f, "amount", back),
        spentOn: field(f, "spentOn"),
        vendor: field(f, "vendor"),
        note: field(f, "note"),
        recurringMonthly: f.get("recurringMonthly") === "on",
      },
    },
    back,
  );
}

export async function removeExpense(f: FormData) {
  await act(`/v1/expenses/${field(f, "id")}`, { method: "DELETE" }, safeBack(field(f, "back"), "/finance/expenses"));
}

export async function addCategory(f: FormData) {
  await act("/v1/expense-categories", { method: "POST", body: { name: field(f, "name") } }, safeBack(field(f, "back"), "/finance/expenses"));
}

export async function setBudget(f: FormData) {
  const back = safeBack(field(f, "back"), "/finance/budgets");
  await act(
    "/v1/budgets",
    { method: "PUT", body: { categoryId: field(f, "categoryId"), month: field(f, "month"), amountMinor: amount(f, "amount", back) } },
    back,
  );
}

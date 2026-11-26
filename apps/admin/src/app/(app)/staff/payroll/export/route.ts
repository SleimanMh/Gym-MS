import { cookies } from "next/headers";
import { API_URL, TOKEN_COOKIE } from "@/lib/api";

/** Streams the payroll CSV from the API with the signed-in user's token (the API checks finance.view). */
export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month") ?? "";
  const q = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `?month=${month}` : "";
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  const tenant = jar.get("gym_tenant")?.value;
  const res = await fetch(`${API_URL}/v1/payroll/export${q}`, {
    cache: "no-store",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(tenant ? { "x-tenant-slug": tenant } : {}) },
  });
  if (!res.ok) return new Response(null, { status: res.status });
  return new Response(await res.arrayBuffer(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payroll-${month || "current"}.csv"`,
    },
  });
}

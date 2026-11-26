import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError, api } from "./api";

/**
 * Server-action helper: call the API; on an API error, go back to `back` with ?error=<code>
 * (the page translates it); on success revalidate `back` (or redirect to `then`).
 */
export async function act<T = unknown>(
  path: string,
  init: { method: string; body?: unknown },
  back: string,
  then?: (result: T) => string,
): Promise<T> {
  let result: T;
  try {
    result = await api<T>(path, {
      method: init.method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (e) {
    if (e instanceof ApiError) {
      const code = (e.body as { code?: string } | null)?.code ?? String(e.status);
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`);
    }
    throw e;
  }
  revalidatePath(back.split("?")[0]!);
  if (then) redirect(then(result));
  return result;
}

/** FormData helpers: trimmed string or undefined. */
export const field = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? undefined : v;
};
export const intField = (f: FormData, k: string) => {
  const v = field(f, k);
  return v === undefined ? undefined : Number(v);
};

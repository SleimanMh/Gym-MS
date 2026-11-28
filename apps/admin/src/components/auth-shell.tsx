import type { CSSProperties, ReactNode } from "react";
import { setLanguage } from "@/app/actions";
import type { T } from "@/lib/i18n";
import { Button } from "./ui";

/** Centered card in the gym's colour, with the language switch. Shared with the new-password page. */
export function Shell({
  children,
  lang,
  t,
  color,
  gymName,
}: {
  children: ReactNode;
  lang: "en" | "ar";
  t: T;
  color?: string;
  gymName?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4" style={{ "--accent": color ?? "#6D5DF6" } as CSSProperties}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-fg" aria-hidden>
              {[...(gymName ?? "G")][0]}
            </span>
            <span className="font-semibold">{gymName ?? t("app.name")}</span>
          </div>
          <form action={setLanguage}>
            <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
            <Button variant="secondary" className="h-9 px-4" lang={lang === "ar" ? "en" : "ar"}>
              {t("lang.switch")}
            </Button>
          </form>
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface p-6 shadow-[0_1px_2px_rgba(18,18,24,0.04)]">{children}</div>
      </div>
    </main>
  );
}

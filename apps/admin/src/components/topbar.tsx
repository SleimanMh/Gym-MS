import Link from "next/link";
import { Clock3, ScanLine, Search } from "lucide-react";
import { setLanguage, setLocation } from "@/app/actions";
import { clockIn, clockOut } from "@/app/(app)/staff/actions";
import { fmtTime } from "@/lib/format";
import type { Lang, T } from "@/lib/i18n";
import { LocationSwitcher } from "./location-switcher";
import { Button } from "./ui";

/** Top row: member search pill, branch switcher, language, and the check-in shortcut. */
export function TopBar({
  t,
  lang,
  locations,
  currentLocation,
  canCheckIn,
  clock,
}: {
  t: T;
  lang: Lang;
  locations: { id: string; name: string }[];
  currentLocation: string;
  canCheckIn: boolean;
  /** The signed-in person's time clock; null when they aren't on the team. */
  clock: { since: string | null; timezone: string } | null;
}) {
  return (
    <header className="flex h-[72px] items-center gap-3 px-4 md:px-8">
      <form action="/members" className="relative hidden max-w-sm flex-1 sm:block" role="search">
        <Search size={16} aria-hidden className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          name="q"
          placeholder={t("top.search")}
          aria-label={t("top.search")}
          className="h-11 w-full rounded-full bg-surface ps-11 pe-4 text-sm shadow-[0_1px_2px_rgba(18,18,24,0.04)] placeholder:text-faint"
        />
      </form>

      <div className="ms-auto flex items-center gap-2">
        <LocationSwitcher
          locations={locations}
          current={currentLocation}
          allLabel={t("top.allLocationsShort")}
          label={t("top.location")}
          action={setLocation}
        />
        {clock && (
          <form action={clock.since ? clockOut : clockIn}>
            <button
              type="submit"
              title={clock.since ? t("clock.since", { t: fmtTime(clock.since, clock.timezone, lang) }) : t("clock.offShift")}
              className="transition-subtle flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(18,18,24,0.04)] hover:bg-sunken"
            >
              {clock.since ? (
                <span className="relative flex size-2.5" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
              ) : (
                <Clock3 size={16} aria-hidden className="text-muted" />
              )}
              <span className="hidden md:inline">
                {clock.since ? `${t("clock.out")} · ${fmtTime(clock.since, clock.timezone, lang)}` : t("clock.in")}
              </span>
            </button>
          </form>
        )}
        <form action={setLanguage}>
          <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
          <Button variant="secondary" type="submit" className="h-11 px-4" lang={lang === "ar" ? "en" : "ar"}>
            {t("lang.switch")}
          </Button>
        </form>
        {canCheckIn && (
          <Link href="/checkin">
            <Button className="h-11 px-5">
              <ScanLine size={17} aria-hidden />
              <span className="hidden sm:inline">{t("nav.checkin")}</span>
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}

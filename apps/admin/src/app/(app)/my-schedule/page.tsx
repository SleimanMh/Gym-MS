import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@gym/shared";
import { deleteSlot, saveSlot } from "@/app/(app)/staff/actions";
import { LockedFeature } from "@/components/blocks";
import { TeamCalendar } from "@/components/team-calendar";
import { Card, PageHeader } from "@/components/ui";
import { ApiError, api, getMe } from "@/lib/api";
import { activityOptions, calLabels, loadWeek } from "@/lib/calendar";
import { getT } from "@/lib/i18n";

/** Every staff member's own week: their shifts, activities and the classes they teach. Read-only. */
export default async function MySchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.tenant || !me.permissions.includes("location.view")) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  let w: Awaited<ReturnType<typeof loadWeek>>;
  try {
    w = await loadWeek("/v1/my-schedule", { week: sp.week, tz: me.tenant.timezone, lang, t });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return (
        <>
          <PageHeader title={t("cal.mine")} />
          <Card>
            <p className="text-muted">{err("NO_EMPLOYEE_RECORD")}</p>
          </Card>
        </>
      );
    }
    throw e;
  }
  const locations = await api<{ id: string; name: string }[]>("/v1/locations");
  const me0 = w.employees[0]!;

  return (
    <>
      <PageHeader
        title={t("cal.mine")}
        subtitle={`${t("cal.mineSubtitle", { d: `${w.dayLabels[0]!.dm} – ${w.dayLabels[6]!.dm}` })} · ${t("cal.hours", {
          n: new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB", { maximumFractionDigits: 1 }).format(w.hoursFor(me0.id)),
        })}`}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/my-schedule?week=${addDays(w.week, -7)}`} aria-label={t("cal.prev")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <Link href="/my-schedule" className="transition-subtle rounded-full px-3 py-1.5 text-sm font-medium hover:bg-sunken">
              {t("cal.today")}
            </Link>
            <Link href={`/my-schedule?week=${addDays(w.week, 7)}`} aria-label={t("cal.next")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <TeamCalendar
        days={w.days}
        dayLabels={w.dayLabels}
        today={w.today}
        nowMin={w.nowMin}
        employees={w.employees}
        events={w.events}
        locations={locations}
        activities={activityOptions(t)}
        canEdit={false}
        showFilter={false}
        labels={calLabels(t)}
        saveAction={saveSlot}
        deleteAction={deleteSlot}
        back="/my-schedule"
      />
    </>
  );
}

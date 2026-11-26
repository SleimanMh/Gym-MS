import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@gym/shared";
import { LockedFeature } from "@/components/blocks";
import { TeamCalendar } from "@/components/team-calendar";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { activityOptions, calLabels, loadWeek } from "@/lib/calendar";
import { getT } from "@/lib/i18n";
import { staffTabs } from "@/lib/staff";
import { deleteSlot, saveSlot } from "../actions";

/** Everyone's week like a Teams calendar: shifts, activities and classes side by side; click to add. */
export default async function TeamSchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("staff.view") || !me.tenant) notFound();
  if (!me.entitlements?.features.includes("staff.management")) return <LockedFeature feature="staff.management" t={t} />;

  const [w, locations] = await Promise.all([
    loadWeek("/v1/team-calendar", { week: sp.week, tz: me.tenant.timezone, lang, t }),
    api<{ id: string; name: string }[]>("/v1/locations"),
  ]);
  const back = `/staff/schedule?week=${w.week}`;

  return (
    <>
      <PageHeader
        title={t("cal.title")}
        subtitle={t("cal.subtitle", { d: `${w.dayLabels[0]!.dm} – ${w.dayLabels[6]!.dm}` })}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/staff/schedule?week=${addDays(w.week, -7)}`} aria-label={t("cal.prev")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <Link href="/staff/schedule" className="transition-subtle rounded-full px-3 py-1.5 text-sm font-medium hover:bg-sunken">
              {t("cal.today")}
            </Link>
            <Link href={`/staff/schedule?week=${addDays(w.week, 7)}`} aria-label={t("cal.next")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <Tabs items={staffTabs(t, me, "schedule")} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}
      <TeamCalendar
        days={w.days}
        dayLabels={w.dayLabels}
        today={w.today}
        nowMin={w.nowMin}
        employees={w.employees}
        events={w.events}
        locations={locations}
        activities={activityOptions(t)}
        canEdit={me.permissions.includes("staff.manage")}
        labels={calLabels(t)}
        saveAction={saveSlot}
        deleteAction={deleteSlot}
        back={back}
      />
    </>
  );
}

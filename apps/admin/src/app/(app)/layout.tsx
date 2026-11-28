import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { MobileNav, Sidebar, type SidebarItem } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { api, getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";
import { getLocationId } from "@/lib/location";
import { visibleNav } from "@/lib/nav";

const ROLE_NAMES: Record<string, { en: string; ar: string }> = {
  owner: { en: "Owner", ar: "المالك" },
  manager: { en: "Manager", ar: "مدير" },
  front_desk: { en: "Front desk", ar: "الاستقبال" },
  trainer: { en: "Trainer", ar: "مدرب" },
  accountant: { en: "Accountant", ar: "محاسب" },
};

/** The staff app shell. Everything inside is for one gym (the tenant in the token). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  // The gym comes from the address (ADR 0007); platform staff on the bare address go to their console.
  if (!me.tenant) redirect(me.platformRole ? "/platform" : "/login");

  const { t, lang } = await getT();
  const features = me.entitlements?.features ?? [];
  const locations = me.permissions.includes("location.view")
    ? await api<{ id: string; name: string }[]>("/v1/locations")
    : [];
  const currentLocation = await getLocationId(locations);
  // Time clock in the top bar for anyone on the team (front desk and coaches have no Staff page).
  const clock = features.includes("staff.management")
    ? await api<{ employee: { id: string } | null; clockedInSince: string | null }>("/v1/time-clock/me").catch(() => null)
    : null;

  const items: SidebarItem[] = visibleNav(me.permissions).map((n) => ({
    href: n.href,
    label: t(n.label),
    icon: n.icon,
    group: n.group,
    locked: !!n.feature && !features.includes(n.feature),
  }));
  // Anyone on the team gets their own schedule (owners and managers also have the team calendar).
  if (clock?.employee) items.splice(1, 0, { href: "/my-schedule", label: t("cal.mine"), icon: "CalendarClock", group: "gym", locked: false });

  const role = me.roles.map((r) => ROLE_NAMES[r]?.[lang] ?? r).join(", ");

  return (
    <div className="flex min-h-screen" style={{ "--accent": me.tenant.primaryColor ?? "#6D5DF6" } as CSSProperties}>
      <Sidebar
        gym={{ name: me.tenant.name, initial: [...me.tenant.name][0] ?? "G", plan: me.entitlements?.planCode ?? null }}
        items={items}
        groups={{ gym: t("navg.gym"), business: t("navg.business") }}
        user={{
          name: `${me.user.firstName} ${me.user.lastName}`,
          role,
          initials: `${me.user.firstName[0] ?? ""}${me.user.lastName[0] ?? ""}`.toUpperCase(),
          logoutLabel: t("top.logout"),
        }}
        logout={logout}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          t={t}
          lang={lang}
          locations={locations}
          currentLocation={currentLocation}
          canCheckIn={me.permissions.includes("checkin.create") && features.includes("booking.core")}
          clock={clock?.employee ? { since: clock.clockedInSince, timezone: me.tenant.timezone } : null}
        />
        <MobileNav items={items.filter((i) => i.group !== "admin" || i.href === "/settings")} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Lock,
  LogOut,
  Settings,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  CalendarClock,
  LayoutDashboard,
  CalendarDays,
  Ticket,
  Users,
  TrendingUp,
  UserCog,
  Wallet,
  Settings,
};

export interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  locked: boolean;
  group: "gym" | "business" | "admin";
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
}

/** A round icon button on the dark rail; the label appears as a tooltip on hover and focus. */
function RailLink({ item, active }: { item: SidebarItem; active: boolean }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "transition-subtle group relative flex size-11 items-center justify-center rounded-full",
        active ? "bg-accent text-accent-fg" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon size={19} aria-hidden />
      {item.locked && (
        <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-ink-soft text-white/70" aria-hidden>
          <Lock size={9} />
        </span>
      )}
      <span
        className="pointer-events-none absolute start-full z-30 ms-3 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      >
        {item.label}
      </span>
    </Link>
  );
}

/** Desktop: a dark icon rail with the gym's mark on top and who is signed in at the bottom. */
export function Sidebar({
  gym,
  items,
  user,
  logout,
}: {
  gym: { name: string; initial: string; plan: string | null };
  items: SidebarItem[];
  groups?: { gym: string; business: string };
  user: { name: string; role: string; initials: string; logoutLabel: string };
  logout: (formData: FormData) => void;
}) {
  const isActive = useActive();
  const byGroup = (g: SidebarItem["group"]) => items.filter((i) => i.group === g);

  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 p-3 md:block">
      <div className="flex h-full w-[72px] flex-col items-center rounded-[28px] bg-ink py-4">
        <div
          className="mb-6 flex size-11 items-center justify-center rounded-full bg-white text-base font-bold text-ink"
          title={gym.plan ? `${gym.name} · ${gym.plan}` : gym.name}
          aria-label={gym.name}
        >
          {gym.initial}
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2" aria-label="Main">
          {byGroup("gym").map((i) => (
            <RailLink key={i.href} item={i} active={isActive(i.href)} />
          ))}
          {byGroup("business").length > 0 && <span className="my-2 h-px w-6 bg-white/10" aria-hidden />}
          {byGroup("business").map((i) => (
            <RailLink key={i.href} item={i} active={isActive(i.href)} />
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2">
          {byGroup("admin").map((i) => (
            <RailLink key={i.href} item={i} active={isActive(i.href)} />
          ))}
          <form action={logout}>
            <button
              className="transition-subtle group relative flex size-11 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
              aria-label={user.logoutLabel}
            >
              <LogOut size={18} aria-hidden className="rtl:-scale-x-100" />
              <span className="pointer-events-none absolute start-full z-30 ms-3 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
                {user.logoutLabel}
              </span>
            </button>
          </form>
          <div
            className="mt-2 flex size-11 items-center justify-center rounded-full bg-accent-line text-sm font-bold text-accent-deep ring-2 ring-white/20"
            title={`${user.name} · ${user.role}`}
            aria-label={`${user.name}, ${user.role}`}
          >
            {user.initials}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Phones: the same destinations as a scrollable pill strip under the top bar. */
export function MobileNav({ items }: { items: SidebarItem[] }) {
  const isActive = useActive();
  return (
    <nav className="flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:hidden" aria-label="Main">
      {items.map((i) => {
        const Icon = ICONS[i.icon] ?? LayoutDashboard;
        const active = isActive(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-subtle flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium",
              active ? "bg-ink text-white" : "bg-surface text-muted",
            )}
          >
            <Icon size={16} aria-hidden />
            {i.label}
            {i.locked && <Lock size={12} aria-hidden className="opacity-60" />}
          </Link>
        );
      })}
    </nav>
  );
}

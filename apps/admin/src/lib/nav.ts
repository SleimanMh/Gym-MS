import type { FeatureKey, Permission } from "@gym/shared";
import type { MessageKey } from "./i18n";

/**
 * Left sidebar: at most 8 items (PLAN.md section 12). Items hide by ROLE (permission);
 * items outside the PLAN stay visible and show an upgrade card instead of disappearing.
 * `phase` marks areas not built yet (rendered by the [section] placeholder page).
 */
export interface NavItem {
  href: string;
  label: MessageKey;
  icon: "LayoutDashboard" | "CalendarDays" | "Ticket" | "Users" | "TrendingUp" | "UserCog" | "Wallet" | "Settings";
  permission: Permission;
  feature?: FeatureKey;
  phase?: string;
  group: "gym" | "business" | "admin";
}

export const NAV: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: "LayoutDashboard", permission: "report.view", group: "gym" },
  { href: "/schedule", label: "nav.schedule", icon: "CalendarDays", permission: "schedule.view", feature: "booking.core", group: "gym" },
  { href: "/bookings", label: "nav.bookings", icon: "Ticket", permission: "booking.view", feature: "booking.core", group: "gym" },
  { href: "/members", label: "nav.members", icon: "Users", permission: "member.view", feature: "membership.core", group: "gym" },
  { href: "/sales", label: "nav.sales", icon: "TrendingUp", permission: "sale.create", feature: "crm.leads", group: "business" },
  { href: "/staff", label: "nav.staff", icon: "UserCog", permission: "staff.view", feature: "staff.management", group: "business" },
  { href: "/finance", label: "nav.finance", icon: "Wallet", permission: "finance.view", feature: "finance.pnl", group: "business" },
  { href: "/settings", label: "nav.settings", icon: "Settings", permission: "tenant.settings.manage", group: "admin" },
];

export function visibleNav(permissions: readonly string[]): NavItem[] {
  return NAV.filter((n) => permissions.includes(n.permission));
}

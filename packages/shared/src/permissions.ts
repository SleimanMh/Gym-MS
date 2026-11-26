/**
 * Fine-grained permissions; roles are bundles of permissions (PLAN.md section 5).
 * Deny by default: an endpoint without a permission requirement must be explicitly @Public().
 */

export const PERMISSIONS = [
  "tenant.settings.manage",
  "tenant.billing.manage",
  "tenant.security.manage",
  "location.view",
  "location.manage",
  "staff.view",
  "staff.manage",
  "member.view",
  "member.manage",
  "member.export",
  "schedule.view",
  "schedule.manage",
  "schedule.own",
  "booking.view",
  "booking.create",
  "booking.cancel",
  "checkin.create",
  "sale.create",
  "payment.take",
  "finance.view",
  "finance.manage",
  "report.view",
  "audit.view",
  // Member self-service (/v1/me/...)
  "self.profile",
  "self.booking",
  "self.payment",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = ["owner", "manager", "front_desk", "trainer", "accountant", "member"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const STAFF_ALL = PERMISSIONS.filter((p) => !p.startsWith("self."));

export const DEFAULT_ROLES: Record<RoleKey, { name: string; permissions: Permission[] }> = {
  owner: { name: "Owner", permissions: [...STAFF_ALL] },
  manager: {
    name: "Manager",
    permissions: [
      "location.view",
      "staff.view",
      "staff.manage",
      "member.view",
      "member.manage",
      "member.export",
      "schedule.view",
      "schedule.manage",
      "booking.view",
      "booking.create",
      "booking.cancel",
      "checkin.create",
      "sale.create",
      "payment.take",
      "report.view",
    ],
  },
  front_desk: {
    name: "Front desk",
    permissions: [
      "location.view",
      "member.view",
      "member.manage",
      "schedule.view",
      "booking.view",
      "booking.create",
      "booking.cancel",
      "checkin.create",
      "sale.create",
      "payment.take",
    ],
  },
  trainer: {
    name: "Trainer",
    permissions: ["location.view", "member.view", "schedule.view", "schedule.own", "booking.view", "checkin.create"],
  },
  accountant: {
    name: "Accountant",
    permissions: [
      "location.view",
      "member.view",
      "schedule.view",
      "booking.view",
      "staff.view",
      "finance.view",
      "finance.manage",
      "report.view",
    ],
  },
  member: { name: "Member", permissions: ["self.profile", "self.booking", "self.payment"] },
};

/** Union of permissions for a set of roles. Unknown role keys contribute nothing. */
export function permissionsForRoles(roles: readonly string[]): Permission[] {
  const out = new Set<Permission>();
  for (const r of roles) {
    const def = DEFAULT_ROLES[r as RoleKey];
    if (def) def.permissions.forEach((p) => out.add(p));
  }
  return [...out].sort();
}

export const PLATFORM_ROLES = ["super_admin", "support"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

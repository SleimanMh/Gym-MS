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

// ───────────── Per-person access (Users & access) ─────────────

/** Staff roles an owner can give someone (members are not staff). */
export const STAFF_ROLE_KEYS = ["owner", "manager", "front_desk", "trainer", "accountant"] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

/**
 * The access tree the owner ticks per person: one branch per area of the app, its permissions as
 * leaves. The first leaf opens the area; the others need it (ticking one ticks the first, unticking
 * the first unticks the branch). Security, billing and audit are never in the tree — owners only.
 */
export const ACCESS_TREE = [
  { key: "dashboard", permissions: ["report.view"] },
  { key: "schedule", permissions: ["schedule.view", "schedule.manage"] },
  { key: "bookings", permissions: ["booking.view", "booking.create", "booking.cancel"] },
  { key: "members", permissions: ["member.view", "member.manage", "member.export"] },
  { key: "checkin", permissions: ["checkin.create"] },
  { key: "sales", permissions: ["sale.create", "payment.take"] },
  { key: "staff", permissions: ["staff.view", "staff.manage"] },
  { key: "finance", permissions: ["finance.view", "finance.manage"] },
  { key: "settings", permissions: ["tenant.settings.manage", "location.manage"] },
] as const satisfies readonly { key: string; permissions: readonly Permission[] }[];
export type AccessAreaKey = (typeof ACCESS_TREE)[number]["key"];

/** Permissions an owner may add or remove per person. */
export const OVERRIDABLE_PERMISSIONS: Permission[] = ACCESS_TREE.flatMap((a) => [...a.permissions]);

export interface PermissionOverride {
  permission: string;
  granted: boolean;
}

/**
 * Roles plus per-person tweaks. Owners always keep everything (nobody can lock the owner out);
 * tweaks outside OVERRIDABLE_PERMISSIONS are ignored.
 */
export function effectivePermissions(roles: readonly string[], overrides: readonly PermissionOverride[]): Permission[] {
  const out = new Set(permissionsForRoles(roles));
  if (roles.includes("owner")) return [...out].sort();
  for (const o of overrides) {
    if (!(OVERRIDABLE_PERMISSIONS as string[]).includes(o.permission)) continue;
    if (o.granted) out.add(o.permission as Permission);
    else out.delete(o.permission as Permission);
  }
  return [...out].sort();
}

/** The ticked leaves of the tree for a set of permissions. */
export function treeSelection(perms: readonly string[]): Permission[] {
  return OVERRIDABLE_PERMISSIONS.filter((p) => perms.includes(p));
}

/** Applies the tree rule: a branch's other leaves need its first leaf. */
export function normaliseSelection(selected: readonly string[]): Permission[] {
  const set = new Set(selected.filter((p) => (OVERRIDABLE_PERMISSIONS as string[]).includes(p)));
  for (const a of ACCESS_TREE) {
    if (a.permissions.slice(1).some((p) => set.has(p))) set.add(a.permissions[0]);
  }
  return OVERRIDABLE_PERMISSIONS.filter((p) => set.has(p));
}

/**
 * The overrides that turn a role into the ticked tree — only what differs from the role is stored,
 * so a later change to a role's defaults still reaches everyone who wasn't customised.
 */
export function overridesFor(role: StaffRoleKey, selected: readonly string[]): PermissionOverride[] {
  if (role === "owner") return [];
  const base = new Set<string>(permissionsForRoles([role]));
  const want = new Set<string>(normaliseSelection(selected));
  const out: PermissionOverride[] = [];
  for (const p of OVERRIDABLE_PERMISSIONS) {
    if (want.has(p) && !base.has(p)) out.push({ permission: p, granted: true });
    if (!want.has(p) && base.has(p)) out.push({ permission: p, granted: false });
  }
  return out;
}

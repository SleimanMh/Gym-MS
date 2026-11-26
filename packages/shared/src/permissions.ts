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

// ───────────── Per-person access (Staff page) ─────────────

/** Staff roles an owner can give someone (members are not staff). */
export const STAFF_ROLE_KEYS = ["owner", "manager", "front_desk", "trainer", "accountant"] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

/**
 * What the owner sees in the access editor: one row per area of the app, each Hidden / View /
 * (Manage). `view` permissions open the area; `manage` adds the ones that change things.
 * Areas with no `manage` list are simply on or off.
 */
export const ACCESS_AREAS = [
  { key: "dashboard", view: ["report.view"], manage: [] },
  { key: "schedule", view: ["schedule.view"], manage: ["schedule.manage"] },
  { key: "bookings", view: ["booking.view"], manage: ["booking.create", "booking.cancel"] },
  { key: "members", view: ["member.view"], manage: ["member.manage", "member.export"] },
  { key: "checkin", view: ["checkin.create"], manage: [] },
  { key: "sales", view: ["sale.create"], manage: ["payment.take"] },
  { key: "staff", view: ["staff.view"], manage: ["staff.manage"] },
  { key: "finance", view: ["finance.view"], manage: ["finance.manage"] },
  { key: "settings", view: ["tenant.settings.manage", "location.manage"], manage: [] },
] as const satisfies readonly { key: string; view: readonly Permission[]; manage: readonly Permission[] }[];
export type AccessAreaKey = (typeof ACCESS_AREAS)[number]["key"];
export type AccessLevel = "none" | "view" | "manage";

/** Permissions an owner may add or remove per person. Security, billing and audit stay with owners. */
export const OVERRIDABLE_PERMISSIONS: Permission[] = ACCESS_AREAS.flatMap((a) => [...a.view, ...a.manage]);

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

/**
 * Level per area for a set of permissions: open when all its view permissions are there; "manage"
 * when any of its manage permissions are (front desk edits members but doesn't export them).
 */
export function accessLevels(perms: readonly string[]): Record<AccessAreaKey, AccessLevel> {
  const all = (list: readonly string[]) => list.every((p) => perms.includes(p));
  const any = (list: readonly string[]) => list.some((p) => perms.includes(p));
  return Object.fromEntries(
    ACCESS_AREAS.map((a) => [a.key, !all(a.view) ? "none" : a.manage.length && any(a.manage) ? "manage" : "view"]),
  ) as Record<AccessAreaKey, AccessLevel>;
}

/**
 * The overrides that turn a role's permissions into the chosen levels — only what differs from the
 * role is stored, so changing a role's defaults later still reaches everyone who wasn't customised.
 */
export function overridesFor(role: StaffRoleKey, levels: Partial<Record<AccessAreaKey, AccessLevel>>): PermissionOverride[] {
  if (role === "owner") return [];
  const base = new Set<string>(permissionsForRoles([role]));
  const baseLevels = accessLevels([...base]);
  const out: PermissionOverride[] = [];
  for (const a of ACCESS_AREAS) {
    const level = levels[a.key];
    // Unchanged areas keep the role's exact permissions (a role may hold part of "manage").
    if (!level || level === baseLevels[a.key]) continue;
    const want = new Set<string>(level === "none" ? [] : level === "view" || !a.manage.length ? a.view : [...a.view, ...a.manage]);
    for (const p of [...a.view, ...a.manage]) {
      if (want.has(p) && !base.has(p)) out.push({ permission: p, granted: true });
      if (!want.has(p) && base.has(p)) out.push({ permission: p, granted: false });
    }
  }
  return out;
}

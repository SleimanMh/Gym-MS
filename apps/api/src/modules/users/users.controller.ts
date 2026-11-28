import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import type { TenantTx } from "@gym/db";
import {
  ACCESS_TREE,
  createUserSchema,
  effectivePermissions,
  overridesFor,
  permissionsForRoles,
  STAFF_ROLE_KEYS,
  treeSelection,
  userAccessSchema,
  userStatusSchema,
  type CreateUserInput,
  type StaffRoleKey,
  type UserAccessInput,
} from "@gym/shared";
import { RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { OutboxService } from "../notifications/outbox.service";
import { provisionAccount, setTemporaryPassword, TEMP_PASSWORD_DAYS } from "./accounts";

const isStaffRole = (r: string): r is StaffRoleKey => (STAFF_ROLE_KEYS as readonly string[]).includes(r);

/**
 * Users & access (ADR 0007): the owner's console for staff sign-ins — create a user (generated
 * password emailed), set their role and access tree, reset their password, disable them.
 * Owners only (tenant.security.manage). Users are global rows, but every action first proves the
 * person belongs to THIS gym through its RLS-protected membership: another gym's user is a 404.
 */
@Controller("v1/users")
export class UsersController {
  constructor(
    private readonly db: TenantDb,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get()
  @RequiresPermission("tenant.security.manage")
  list() {
    return this.db.run(async (tx) => {
      const [memberships, roles, tweaks, employees] = await Promise.all([
        tx.tenantMembership.findMany({
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true, mustChangePassword: true } } },
        }),
        tx.userRole.findMany({ select: { userId: true, roleKey: true } }),
        tx.userPermissionOverride.findMany({ select: { userId: true } }),
        tx.employee.findMany({ where: { userId: { not: null } }, select: { id: true, userId: true } }),
      ]);
      return memberships
        .map((m) => {
          const role = roles.find((r) => r.userId === m.userId && isStaffRole(r.roleKey))?.roleKey ?? null;
          return {
            ...m.user,
            status: m.status,
            role,
            customised: tweaks.some((t) => t.userId === m.userId),
            employeeId: employees.find((e) => e.userId === m.userId)?.id ?? null,
          };
        })
        .filter((u) => u.role) // staff accounts only; members sign in separately
        .sort((a, b) => a.firstName.localeCompare(b.firstName));
    });
  }

  @Post()
  @RequiresPermission("tenant.security.manage")
  async create(@Body(new ZodPipe(createUserSchema)) body: CreateUserInput) {
    const t = requireTenant();
    const overrides = body.role === "owner" || !body.permissions ? [] : overridesFor(body.role, body.permissions);
    await this.assertCustomAllowed(overrides.length);
    return this.db.run(async (tx) => {
      const r = await provisionAccount(tx, this.outbox, t.id, { ...body, overrides });
      await this.audit.record(tx, { tenantId: t.id, action: "user.created", entityType: "user", entityId: r.userId, data: { role: body.role, invited: r.invited } });
      return r;
    });
  }

  /** One user: who they are, their role, and their access tree (with each role's defaults for the editor). */
  @Get(":id")
  @RequiresPermission("tenant.security.manage")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    const customAllowed = await this.entitlements.has(t.id, "identity.custom_roles");
    return this.db.run(async (tx) => {
      const m = await this.membership(tx, id);
      const [roles, tweaks, employee] = await Promise.all([
        tx.userRole.findMany({ where: { userId: id }, select: { roleKey: true } }),
        tx.userPermissionOverride.findMany({ where: { userId: id }, select: { permission: true, granted: true } }),
        tx.employee.findFirst({ where: { userId: id }, select: { id: true } }),
      ]);
      const keys = roles.map((r) => r.roleKey);
      return {
        id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        lastLoginAt: m.user.lastLoginAt,
        mustChangePassword: m.user.mustChangePassword,
        status: m.status,
        role: keys.find(isStaffRole) ?? null,
        selection: treeSelection(effectivePermissions(keys, tweaks)),
        customised: tweaks.length > 0,
        isSelf: id === requirePrincipal().userId,
        employeeId: employee?.id ?? null,
        tree: ACCESS_TREE,
        roleDefaults: Object.fromEntries(STAFF_ROLE_KEYS.map((r) => [r, treeSelection(permissionsForRoles([r]))])),
        customAllowed,
      };
    });
  }

  /** Role + ticked access tree. You can't change your own; the gym keeps at least one owner. Audited. */
  @Put(":id/access")
  @RequiresPermission("tenant.security.manage")
  async setAccess(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(userAccessSchema)) body: UserAccessInput) {
    const t = requireTenant();
    const overrides = body.role === "owner" || !body.permissions ? [] : overridesFor(body.role, body.permissions);
    await this.assertCustomAllowed(overrides.length);
    this.notSelf(id);
    return this.db.run(async (tx) => {
      await this.membership(tx, id);
      const before = await tx.userRole.findMany({ where: { userId: id }, select: { roleKey: true } });
      if (before.some((r) => r.roleKey === "owner") && body.role !== "owner") await this.assertAnotherOwner(tx, id);
      // Staff roles are replaced; a "member" role (they also train here) is kept.
      await tx.userRole.deleteMany({ where: { userId: id, roleKey: { in: [...STAFF_ROLE_KEYS] } } });
      await tx.userRole.create({ data: { tenantId: t.id, userId: id, roleKey: body.role } });
      await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
      if (overrides.length) await tx.userPermissionOverride.createMany({ data: overrides.map((o) => ({ tenantId: t.id, userId: id, ...o })) });
      await this.audit.record(tx, {
        tenantId: t.id,
        action: "user.access_changed",
        entityType: "user",
        entityId: id,
        data: { from: before.map((r) => r.roleKey), role: body.role, overrides: overrides.map((o) => ({ permission: o.permission, granted: o.granted })) },
      });
      return { role: body.role, selection: treeSelection(effectivePermissions([body.role], overrides)), customised: overrides.length > 0 };
    });
  }

  /** Emails a new generated password; their current sessions end. */
  @Post(":id/reset-password")
  @HttpCode(200)
  @RequiresPermission("tenant.security.manage")
  resetPassword(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    this.notSelf(id);
    return this.db.run(async (tx) => {
      const m = await this.membership(tx, id);
      const tempPassword = await setTemporaryPassword(tx, id);
      await this.outbox.enqueue(
        tx,
        t.id,
        "user.password_reset",
        { userId: id, email: m.user.email, firstName: m.user.firstName, tempPassword, expiresDays: TEMP_PASSWORD_DAYS },
        `user.password_reset:${id}:${Date.now()}`,
      );
      await this.audit.record(tx, { tenantId: t.id, action: "user.password_reset", entityType: "user", entityId: id });
      return { ok: true };
    });
  }

  /** Disable (can't sign in to this gym) or re-enable. */
  @Put(":id/status")
  @RequiresPermission("tenant.security.manage")
  setStatus(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(userStatusSchema)) body: { status: "active" | "disabled" }) {
    const t = requireTenant();
    this.notSelf(id);
    return this.db.run(async (tx) => {
      const m = await this.membership(tx, id);
      if (body.status === "disabled") {
        const roles = await tx.userRole.findMany({ where: { userId: id }, select: { roleKey: true } });
        if (roles.some((r) => r.roleKey === "owner")) await this.assertAnotherOwner(tx, id);
      }
      // Re-enabling someone who never chose a password puts them back to "invited".
      const status = body.status === "active" && m.user.mustChangePassword ? "invited" : body.status;
      await tx.tenantMembership.update({ where: { id: m.id }, data: { status } });
      await this.audit.record(tx, { tenantId: t.id, action: `user.${body.status === "disabled" ? "disabled" : "enabled"}`, entityType: "user", entityId: id });
      return { status };
    });
  }

  private async membership(tx: TenantTx, userId: string) {
    const m = await tx.tenantMembership.findFirst({
      where: { userId },
      include: { user: { select: { email: true, firstName: true, lastName: true, lastLoginAt: true, mustChangePassword: true } } },
    });
    if (!m) throw new NotFoundException();
    return m;
  }

  private notSelf(id: string) {
    if (id === requirePrincipal().userId) throw new ForbiddenException({ code: "CANNOT_CHANGE_OWN_ACCESS" });
  }

  private async assertAnotherOwner(tx: TenantTx, userId: string) {
    const owners = await tx.userRole.findMany({ where: { roleKey: "owner", userId: { not: userId } }, select: { userId: true } });
    const active = owners.length
      ? await tx.tenantMembership.count({ where: { userId: { in: owners.map((o) => o.userId) }, status: { not: "disabled" } } })
      : 0;
    if (!active) throw new ConflictException({ code: "LAST_OWNER" });
  }

  private async assertCustomAllowed(tweaks: number) {
    if (tweaks && !(await this.entitlements.has(requireTenant().id, "identity.custom_roles"))) {
      throw EntitlementsService.featureDenied("identity.custom_roles");
    }
  }
}

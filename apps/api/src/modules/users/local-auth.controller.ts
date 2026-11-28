import { Body, Controller, HttpCode, HttpException, HttpStatus, Ip, Post, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword, type User } from "@gym/db";
import { changePasswordSchema, loginSchema, STAFF_ROLE_KEYS, type ChangePasswordInput, type LoginInput } from "@gym/shared";
import { Public } from "../../common/decorators";
import { currentContext, type ContextTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { CacheService } from "../../infra/cache.service";
import { PrismaService } from "../../infra/prisma.service";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuthService } from "../identity/auth.service";

const MAX_FAILED = 5;
const LOCK_MIN = 15;
// Compared against when the email is unknown, so a wrong email and a wrong password take as long.
const DUMMY_HASH = hashPassword("not-a-real-password-0");

/**
 * Email + password sign-in for staff (ADR 0007). The gym comes from the address the person signs
 * in at (ironfit.<domain> → x-tenant-slug); without a gym only platform staff may sign in.
 * Errors never say whether an email exists. Five wrong passwords lock the account for 15 minutes.
 */
@Controller("v1/auth")
export class LocalAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDb,
    private readonly cache: CacheService,
    private readonly auth: AuthService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @Public()
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Ip() ip: string) {
    await this.rateLimit(`rl:login-ip:${ip}`, 30, 600);
    await this.rateLimit(`rl:login:${body.email}`, 10, 600);
    const tenant = currentContext().tenant;
    const user = await this.check(body.email, body.password, tenant);
    // A generated password only lets you choose your own.
    if (user.mustChangePassword) return { status: "password_change_required" as const };
    return { status: "ok" as const, ...(await this.issue(user, tenant)) };
  }

  /** First sign-in (generated password) or any later change: current password + a new one. */
  @Post("change-password")
  @HttpCode(200)
  @Public()
  async changePassword(@Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput, @Ip() ip: string) {
    await this.rateLimit(`rl:login-ip:${ip}`, 30, 600);
    await this.rateLimit(`rl:login:${body.email}`, 10, 600);
    const tenant = currentContext().tenant;
    const user = await this.check(body.email, body.currentPassword, tenant);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        mustChangePassword: false,
        passwordExpiresAt: null,
        failedLogins: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
      },
    });
    return { status: "ok" as const, ...(await this.issue(updated, tenant)) };
  }

  /** Password + lockout + expiry + "may sign in here" checks. Throws on any failure. */
  private async check(email: string, password: string, tenant: ContextTenant | null): Promise<User> {
    const invalid = () => new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    const user = await this.prisma.user.findUnique({ where: { email }, include: { platformUser: true } });
    if (!user?.passwordHash) {
      await verifyPassword(password, await DUMMY_HASH);
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException({ code: "ACCOUNT_LOCKED" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } : { failedLogins: failed },
      });
      throw invalid();
    }
    if (user.mustChangePassword && user.passwordExpiresAt && user.passwordExpiresAt < new Date()) {
      throw new UnauthorizedException({ code: "PASSWORD_EXPIRED" });
    }

    if (tenant) {
      // Staff of THIS gym only (members use the member sign-in; another gym's staff can't get in here).
      const access = await this.tenantDb.runFor(tenant.id, async (tx) => {
        const m = await tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } } });
        const roles = await tx.userRole.findMany({ where: { userId: user.id }, select: { roleKey: true } });
        return { status: m?.status ?? null, staff: roles.some((r) => (STAFF_ROLE_KEYS as readonly string[]).includes(r.roleKey)) };
      });
      if (!access.status || !access.staff) throw invalid();
      if (access.status === "disabled") throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    } else if (!user.platformUser) {
      // No gym in the address: only platform staff sign in here; gym staff use their gym's address.
      throw new UnauthorizedException({ code: "USE_GYM_ADDRESS" });
    }

    if (user.failedLogins || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return user;
  }

  private async issue(user: User, tenant: ContextTenant | null) {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (tenant) {
      // Invited → active once they're actually in (owner-set password without a forced change).
      await this.tenantDb.runFor(tenant.id, (tx) =>
        tx.tenantMembership.updateMany({ where: { userId: user.id, status: "invited" }, data: { status: "active" } }),
      );
    }
    const { token, expiresIn } = await this.auth.mintSessionToken({
      userId: user.id,
      email: user.email,
      tenantId: tenant?.id ?? null,
      sessionVersion: user.sessionVersion,
    });
    return { accessToken: token, expiresIn, tenantSlug: tenant?.slug ?? null };
  }

  private async rateLimit(key: string, max: number, windowSec: number) {
    if ((await this.cache.incr(key, windowSec)) > max) {
      throw new HttpException({ code: "RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

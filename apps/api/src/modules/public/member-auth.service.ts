import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import { requireTenant } from "../../common/request-context";
import { CacheService } from "../../infra/cache.service";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuthService } from "../identity/auth.service";
import { OutboxService } from "../notifications/outbox.service";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

/**
 * Passwordless member sign-in for the widget: email → 6-digit code → member session token.
 * Responses never reveal whether an email belongs to a member. Keycloak member login (magic link,
 * Google/Apple) replaces this later; the session token shape stays the same for the widget.
 */
@Injectable()
export class MemberAuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: TenantDb,
    private readonly cache: CacheService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
  ) {}

  async start(email: string, ip: string): Promise<{ sent: true }> {
    const tenant = requireTenant();
    await this.rateLimit(`rl:code:${tenant.id}:${email}`, 5, 3600);
    await this.rateLimit(`rl:code-ip:${ip}`, 20, 3600);

    await this.db.run(async (tx) => {
      const member = await tx.member.findFirst({ where: { email, deletedAt: null, status: "active" } });
      if (!member) return;
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.memberLoginCode.create({
        data: {
          tenantId: tenant.id,
          memberId: member.id,
          codeHash: this.hash(member.id, code),
          expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
        },
      });
      await this.outbox.enqueue(tx, tenant.id, "member.login_code", { memberId: member.id, code, ttlMin: CODE_TTL_MIN });
    });
    return { sent: true };
  }

  async verify(email: string, code: string, ip: string) {
    const tenant = requireTenant();
    await this.rateLimit(`rl:verify-ip:${ip}`, 30, 600);
    const result = await this.db.run(async (tx) => {
      const member = await tx.member.findFirst({ where: { email, deletedAt: null, status: "active" } });
      if (!member) return null;
      const entry = await tx.memberLoginCode.findFirst({
        where: { memberId: member.id, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!entry || entry.attempts >= MAX_ATTEMPTS) return null;
      const ok = timingSafeEqual(Buffer.from(entry.codeHash), Buffer.from(this.hash(member.id, code)));
      await tx.memberLoginCode.update({
        where: { id: entry.id },
        data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
      });
      return ok ? member : null;
    });
    if (!result) throw new UnauthorizedException({ code: "INVALID_CODE" });

    const { token, expiresIn } = await this.auth.mintMemberToken(result.id, tenant.id);
    return {
      accessToken: token,
      expiresIn,
      member: { id: result.id, firstName: result.firstName, lastName: result.lastName, email: result.email },
    };
  }

  private hash(memberId: string, code: string): string {
    return createHmac("sha256", this.env.CODE_PEPPER).update(`${memberId}:${code}`).digest("hex");
  }

  private async rateLimit(key: string, max: number, windowSec: number) {
    if ((await this.cache.incr(key, windowSec)) > max) {
      throw new HttpException({ code: "RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

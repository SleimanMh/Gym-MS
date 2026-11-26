import { randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, Logger, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { resolveApiKey, withTenant } from "@gym/db";
import { API_KEY_HEADER, TENANT_SLUG_HEADER } from "@gym/shared";
import { ENV, type Env } from "../../config/env";
import {
  RequestContextStore,
  type ContextTenant,
  type MemberSession,
  type RequestContext,
} from "../../common/request-context";
import { CacheService } from "../../infra/cache.service";
import { PrismaService } from "../../infra/prisma.service";
import { AuthService } from "../identity/auth.service";
import { IdentityService } from "../identity/identity.service";
import { parseHost, pickTenant } from "./tenant-resolver";

/**
 * Runs first on every request (PLAN.md section 3, "How a request flows"):
 * 1. verify the bearer token, if any (staff user or member)
 * 2. resolve the tenant: token claim → API key → domain / tenant-slug header
 * 3. browser calls from a gym's website: the Origin must be on the gym's allowed origins
 * 4. load the principal (staff) or member session for that tenant
 * 5. run the rest of the request inside an AsyncLocalStorage context
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly log = new Logger("http");

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly auth: AuthService,
    private readonly identity: IdentityService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const started = Date.now();
    const requestId = (req.header("x-request-id") ?? "").slice(0, 64) || randomUUID();
    res.setHeader("x-request-id", requestId);

    const bearer = /^Bearer (.+)$/i.exec(req.header("authorization") ?? "")?.[1];
    const token = bearer ? await this.auth.verify(bearer) : null;

    const rawKey = req.header(API_KEY_HEADER);
    const key = rawKey ? await resolveApiKey(this.prisma, rawKey) : null;
    if (rawKey && !key) throw new UnauthorizedException({ code: "INVALID_API_KEY" });

    const slugHeader = req.header(TENANT_SLUG_HEADER)?.toLowerCase();
    const hostTenantId = await this.tenantIdFromHost(req.headers.host);
    const slugTenantId = slugHeader ? await this.tenantIdFromSlug(slugHeader) : null;
    if (slugHeader && !slugTenantId) throw new UnauthorizedException({ code: "UNKNOWN_TENANT" });
    if (hostTenantId && slugTenantId && hostTenantId !== slugTenantId) {
      throw new ForbiddenException({ code: "TENANT_MISMATCH" });
    }

    const tokenTenantId =
      token?.kind === "member"
        ? token.tenantId
        : (token?.tenantId ?? (token?.tenantSlug ? await this.tenantIdFromSlug(token.tenantSlug) : null));

    const picked = pickTenant({
      token: tokenTenantId,
      apiKey: key?.tenantId ?? null,
      domain: hostTenantId ?? slugTenantId,
    });

    const tenant = picked ? await this.loadTenant(picked.tenantId) : null;
    if (tenant) await this.assertOriginAllowed(req.header("origin"), tenant.id);

    const principal =
      token?.kind === "user" ? await this.identity.loadPrincipal(token, tenant?.id ?? null) : null;
    const member = token?.kind === "member" && tenant ? await this.loadMember(tenant.id, token.memberId) : null;
    if (token?.kind === "member" && !member) throw new UnauthorizedException({ code: "INVALID_TOKEN" });

    const ctx: RequestContext = {
      requestId,
      tenant,
      tenantSource: tenant ? picked!.source : null,
      apiKeyType: key?.keyType ?? null,
      principal,
      member,
    };

    res.on("finish", () => {
      // Structured log line with tenant_id, user_id, request_id (PLAN.md section 13).
      this.log.log(
        JSON.stringify({
          request_id: requestId,
          tenant_id: tenant?.id ?? null,
          user_id: principal?.userId ?? null,
          member_id: member?.memberId ?? null,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Date.now() - started,
        }),
      );
    });

    RequestContextStore.run(ctx, () => next());
  }

  /**
   * Browsers send Origin on cross-site calls. Anything other than our own apps must be one of
   * the gym's allowed website origins (Settings → Website), so a copied widget key is useless
   * on someone else's site. Server-to-server calls (no Origin) are unaffected.
   */
  private async assertOriginAllowed(origin: string | undefined, tenantId: string) {
    if (!origin || origin === "null") return;
    if (this.env.ADMIN_ORIGINS.includes(origin) || origin === new URL(this.env.PUBLIC_APP_URL).origin) return;
    const allowed = await this.allowedOrigins(tenantId);
    if (!allowed.includes(origin)) throw new ForbiddenException({ code: "ORIGIN_NOT_ALLOWED", origin });
  }

  private async allowedOrigins(tenantId: string): Promise<string[]> {
    const cacheKey = `origins:${tenantId}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;
    const rows = await withTenant(this.prisma, tenantId, (tx) => tx.allowedOrigin.findMany({ select: { origin: true } }));
    const list = rows.map((r) => r.origin);
    await this.cache.set(cacheKey, list, 60);
    return list;
  }

  private async loadMember(tenantId: string, memberId: string): Promise<MemberSession | null> {
    const m = await withTenant(this.prisma, tenantId, (tx) =>
      tx.member.findFirst({ where: { id: memberId, deletedAt: null, status: "active" } }),
    );
    return m
      ? { memberId: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email, language: m.language }
      : null;
  }

  private async tenantIdFromSlug(slug: string): Promise<string | null> {
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
    const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return t?.id ?? null;
  }

  private async tenantIdFromHost(host: string | undefined): Promise<string | null> {
    const parsed = parseHost(host, this.env.APP_ROOT_DOMAIN);
    if (!parsed) return null;
    const t = await this.prisma.tenant.findUnique({
      where: "slug" in parsed ? { slug: parsed.slug } : { customDomain: parsed.customDomain },
      select: { id: true },
    });
    return t?.id ?? null;
  }

  private async loadTenant(id: string): Promise<ContextTenant | null> {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t || t.status === "cancelled" || t.status === "suspended") return null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      defaultLanguage: t.defaultLanguage,
      timezone: t.timezone,
      currency: t.currency,
    };
  }
}

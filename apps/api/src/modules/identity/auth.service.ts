import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, decodeJwt, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { ENV, type Env } from "../../config/env";

export const DEV_ISSUER = "gym-dev";
/** Member sessions issued by the API after an email-code login (until Keycloak member login). */
export const MEMBER_ISSUER = "gym-member";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifiedToken =
  | {
      kind: "user";
      /** Who issued it: real sign-in (Keycloak) or a development token. */
      source: "keycloak" | "dev";
      subject: string;
      /** Explicit tenant claim (dev tokens, or a Keycloak mapper). */
      tenantId: string | null;
      /**
       * Keycloak Organizations: the organization alias equals the tenant slug (ADR 0003). Set only when
       * the token carries exactly one organization — request scope `organization:<alias>` to pick one.
       */
      tenantSlug: string | null;
      email: string | null;
      emailVerified: boolean;
    }
  | { kind: "member"; memberId: string; tenantId: string };

/**
 * Verifies access tokens:
 * - staff/platform users: Keycloak (JWKS, issuer + audience), or dev HS256 tokens when AUTH_DEV_TOKENS=true;
 * - members: HS256 tokens this API issues after an email-code login (audience "gym-member").
 */
@Injectable()
export class AuthService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly devKey: Uint8Array | null;
  private readonly memberKey: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.jwks = createRemoteJWKSet(new URL(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`));
    this.devKey = env.AUTH_DEV_TOKENS && env.DEV_JWT_SECRET ? new TextEncoder().encode(env.DEV_JWT_SECRET) : null;
    this.memberKey = new TextEncoder().encode(env.MEMBER_JWT_SECRET);
  }

  async verify(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;
    let issuer: string | undefined;
    try {
      issuer = decodeJwt(token).iss;
      if (issuer === MEMBER_ISSUER) {
        ({ payload } = await jwtVerify(token, this.memberKey, {
          issuer: MEMBER_ISSUER,
          audience: MEMBER_ISSUER,
          algorithms: ["HS256"],
        }));
      } else if (issuer === DEV_ISSUER) {
        if (!this.devKey) throw new Error("dev tokens disabled");
        ({ payload } = await jwtVerify(token, this.devKey, {
          issuer: DEV_ISSUER,
          audience: this.env.KEYCLOAK_AUDIENCE,
          algorithms: ["HS256"],
        }));
      } else {
        ({ payload } = await jwtVerify(token, this.jwks, {
          issuer: this.env.KEYCLOAK_ISSUER,
          audience: this.env.KEYCLOAK_AUDIENCE,
        }));
      }
    } catch {
      throw new UnauthorizedException({ code: "INVALID_TOKEN" });
    }
    if (!payload.sub) throw new UnauthorizedException({ code: "INVALID_TOKEN" });

    const tenantId = typeof payload.tenant_id === "string" && payload.tenant_id ? payload.tenant_id : null;
    if (tenantId && !UUID_RE.test(tenantId)) throw new UnauthorizedException({ code: "INVALID_TOKEN" });

    if (issuer === MEMBER_ISSUER) {
      if (!tenantId || !UUID_RE.test(payload.sub)) throw new UnauthorizedException({ code: "INVALID_TOKEN" });
      return { kind: "member", memberId: payload.sub, tenantId };
    }

    return {
      kind: "user",
      source: issuer === DEV_ISSUER ? "dev" : "keycloak",
      subject: payload.sub,
      tenantId,
      tenantSlug: singleOrganization(payload.organization),
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true || payload.iss === DEV_ISSUER,
    };
  }

  async mintDevToken(claims: { subject: string; email: string; tenantId: string | null }): Promise<string> {
    if (!this.devKey) throw new Error("dev tokens disabled");
    return new SignJWT({ email: claims.email, ...(claims.tenantId ? { tenant_id: claims.tenantId } : {}) })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.subject)
      .setIssuer(DEV_ISSUER)
      .setAudience(this.env.KEYCLOAK_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(this.devKey);
  }

  async mintMemberToken(memberId: string, tenantId: string): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = 30 * 24 * 3600;
    const token = await new SignJWT({ tenant_id: tenantId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(memberId)
      .setIssuer(MEMBER_ISSUER)
      .setAudience(MEMBER_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.memberKey);
    return { token, expiresIn };
  }
}

/** Keycloak emits `organization` as ["alias"] or { alias: {...} } depending on mapper settings. */
function singleOrganization(claim: unknown): string | null {
  const aliases = Array.isArray(claim)
    ? claim.filter((x): x is string => typeof x === "string")
    : claim && typeof claim === "object"
      ? Object.keys(claim)
      : [];
  return aliases.length === 1 ? aliases[0]!.toLowerCase() : null;
}

import { AsyncLocalStorage } from "node:async_hooks";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { Permission, PlatformRole } from "@gym/shared";

export interface ContextTenant {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "past_due" | "read_only" | "suspended" | "cancelled";
  defaultLanguage: "en" | "ar";
  timezone: string;
  currency: string;
}

export interface Principal {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Active membership in the resolved tenant. False = authenticated but not part of this gym. */
  isTenantMember: boolean;
  roles: string[];
  permissions: Permission[];
  platformRole: PlatformRole | null;
}

/** A gym member signed in through the widget / portal (email code today, Keycloak later). */
export interface MemberSession {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  language: "en" | "ar" | null;
}

export interface RequestContext {
  requestId: string;
  tenant: ContextTenant | null;
  tenantSource: "token" | "api_key" | "domain" | null;
  apiKeyType: "publishable" | "secret" | null;
  /** Staff / platform user. */
  principal: Principal | null;
  /** Member session. Never set together with `principal`. */
  member: MemberSession | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};

export function currentContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No request context — code is running outside a request or job scope");
  return ctx;
}

/** Throws unless a tenant was resolved for this request. */
export function requireTenant(): ContextTenant {
  const t = currentContext().tenant;
  if (!t) throw new BadRequestException({ code: "TENANT_REQUIRED", message: "No tenant context for this request" });
  return t;
}

export function requireMember(): MemberSession {
  const m = currentContext().member;
  if (!m) throw new UnauthorizedException();
  return m;
}

export function requirePrincipal(): Principal {
  const p = currentContext().principal;
  if (!p) throw new UnauthorizedException();
  return p;
}

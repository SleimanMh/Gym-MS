import { ForbiddenException } from "@nestjs/common";

export type TenantSource = "token" | "api_key" | "domain";

export interface TenantCandidates {
  token: string | null;
  apiKey: string | null;
  domain: string | null;
}

/**
 * Picks the tenant for a request in the order from PLAN.md section 4:
 * token claim → API key → custom domain / subdomain.
 * If two sources name DIFFERENT tenants the request is rejected — e.g. a token for gym A used
 * with gym B's widget key — rather than silently preferring one.
 */
export function pickTenant(c: TenantCandidates): { tenantId: string; source: TenantSource } | null {
  const ordered: [TenantSource, string | null][] = [
    ["token", c.token],
    ["api_key", c.apiKey],
    ["domain", c.domain],
  ];
  const present = ordered.filter((x): x is [TenantSource, string] => !!x[1]);
  const first = present[0];
  if (!first) return null;
  if (present.some(([, id]) => id !== first[1])) {
    throw new ForbiddenException({ code: "TENANT_MISMATCH" });
  }
  return { tenantId: first[1], source: first[0] };
}

const RESERVED_SUBDOMAINS = new Set(["api", "app", "www", "admin", "cdn", "docs", "status", "auth"]);

/**
 * Host → what to look up. `ironfit.yourapp.com` → { slug: "ironfit" };
 * `book.ironfitgym.com` → { customDomain }; the root/reserved hosts → null.
 */
export function parseHost(
  rawHost: string | undefined,
  rootDomain: string,
): { slug: string } | { customDomain: string } | null {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().replace(/:\d+$/, "");
  const root = rootDomain.toLowerCase();
  if (host === root || host === "127.0.0.1" || host === "[::1]") return null;
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return null;
    return { slug: sub };
  }
  if (root === "localhost") return null; // local dev: unknown hosts are not custom domains
  return { customDomain: host };
}

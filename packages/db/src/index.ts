import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/** A Prisma client bound to one transaction in which app.tenant_id is set. */
export type TenantTx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: url ?? process.env.DATABASE_URL,
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/**
 * The ONLY way to touch tenant-owned tables.
 *
 * Opens a transaction, sets `app.tenant_id` with SET LOCAL semantics (set_config(..., true)),
 * then runs `fn`. Row-Level Security filters every query in `fn` to that tenant, and rejects
 * writes of rows with another tenant_id. The setting ends with the transaction, so a pooled
 * connection can never leak one tenant's context into the next request.
 *
 * Used identically by API requests, background jobs and the seed.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await setTenant(tx, tenantId);
      return fn(tx);
    },
    { timeout: options?.timeoutMs ?? 10_000 },
  );
}

/**
 * Set (or switch) the tenant inside an open transaction. Use withTenant() unless you need
 * platform rows and tenant rows in ONE transaction (e.g. creating a tenant).
 */
export async function setTenant(tx: TenantTx, tenantId: string): Promise<void> {
  if (!UUID_RE.test(tenantId)) throw new Error("setTenant: tenantId must be a UUID");
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Resolve a publishable/secret API key to its tenant without a tenant context.
 * Calls a SECURITY DEFINER SQL function (see the RLS migration), so the app role still
 * cannot read api_keys across tenants directly.
 */
export async function resolveApiKey(
  prisma: PrismaClient,
  rawKey: string,
): Promise<{ tenantId: string; keyType: "publishable" | "secret" } | null> {
  const rows = await prisma.$queryRaw<{ tenant_id: string; key_type: "publishable" | "secret" }[]>`
    SELECT tenant_id, key_type FROM app_resolve_api_key(${hashApiKey(rawKey)})`;
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, keyType: row.key_type } : null;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(type: "publishable" | "secret"): { key: string; prefix: string; hash: string } {
  const key = `${type === "publishable" ? "pk" : "sk"}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}
export * from "./demo";
export * from "./sessions";

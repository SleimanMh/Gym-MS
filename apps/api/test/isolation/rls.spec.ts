/**
 * Database-level tenant isolation (PLAN.md sections 4 and 14). Runs against a real, migrated and
 * seeded Postgres, connected as gym_app — the same role as the API. Every assertion here must
 * hold even if application code forgets a WHERE clause.
 */
import { createPrismaClient, DEMO, resolveApiKey, withTenant, type PrismaClient } from "@gym/db";

const A = DEMO.ironfit;
const B = DEMO.pulse;

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("RLS isolation (database)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(() => prisma.$disconnect());

  it("connects as a role that cannot bypass RLS", async () => {
    const [row] = await prisma.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(row).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it("sees nothing without a tenant context", async () => {
    expect(await prisma.location.count()).toBe(0);
    expect(await prisma.tenantMembership.count()).toBe(0);
    expect(await prisma.apiKey.count()).toBe(0);
  });

  it("sees only its own tenant's rows", async () => {
    const rows = await withTenant(prisma, A.id, (tx) => tx.location.findMany());
    expect(rows.length).toBe(A.locations.length);
    expect(rows.every((r) => r.tenantId === A.id)).toBe(true);
  });

  it("cannot read another tenant's row by id", async () => {
    const other = B.locations[0]!.id;
    expect(await withTenant(prisma, A.id, (tx) => tx.location.findUnique({ where: { id: other } }))).toBeNull();
  });

  it("cannot insert a row for another tenant", async () => {
    await expect(
      withTenant(prisma, A.id, (tx) =>
        tx.location.create({ data: { tenantId: B.id, slug: "sneaky", name: "Sneaky" } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update or delete another tenant's rows", async () => {
    const other = B.locations[0]!.id;
    const updated = await withTenant(prisma, A.id, (tx) =>
      tx.location.updateMany({ where: { id: other }, data: { name: "Hacked" } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await withTenant(prisma, A.id, (tx) => tx.location.deleteMany({ where: { id: other } }));
    expect(deleted.count).toBe(0);
    const still = await withTenant(prisma, B.id, (tx) => tx.location.findUnique({ where: { id: other } }));
    expect(still?.name).toBe(B.locations[0]!.name);
  });

  it("cannot move a row to another tenant", async () => {
    const mine = A.locations[0]!.id;
    await expect(
      withTenant(prisma, A.id, (tx) => tx.location.update({ where: { id: mine }, data: { tenantId: B.id } })),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot attach a child row to another tenant's parent", async () => {
    await expect(
      withTenant(prisma, A.id, (tx) =>
        tx.room.create({ data: { tenantId: A.id, locationId: B.locations[0]!.id, name: "Cross" } }),
      ),
    ).rejects.toThrow();
  });

  it("does not leak the tenant setting across transactions on a pooled connection", async () => {
    await withTenant(prisma, A.id, (tx) => tx.location.count());
    expect(await prisma.location.count()).toBe(0);
  });

  it("cannot rewrite the audit log", async () => {
    await expect(withTenant(prisma, A.id, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(/permission denied/i);
  });

  it("resolves API keys without exposing the api_keys table", async () => {
    expect(await resolveApiKey(prisma, A.publishableKey)).toEqual({ tenantId: A.id, keyType: "publishable" });
    expect(await resolveApiKey(prisma, "pk_nope")).toBeNull();
  });

  it("has RLS enabled on every table with a tenant_id column", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; rls: boolean; policies: bigint }[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id')`;
    // Platform tables that carry tenant_id but are managed by the platform, not the tenant.
    const platformTables = new Set(["tenant_subscriptions", "tenant_feature_overrides"]);
    const unprotected = rows.filter((r) => !platformTables.has(r.table_name) && (!r.rls || Number(r.policies) === 0));
    expect(unprotected.map((r) => r.table_name)).toEqual([]);
  });
});

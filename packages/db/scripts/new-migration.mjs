// Creates a migration from the schema change since the last one:  pnpm db:new-migration <name>
//
// Why not `prisma migrate dev`? It diffs against a shadow database, sees our hand-written
// constraints (same-tenant composite FKs, partial unique indexes, RLS helpers) as drift and
// generates statements that DROP them. Diffing schema → schema never touches them.
//
// After generating, add a sibling "<name>_rls" migration for any new tenant-owned table
// (see CLAUDE.md), then `pnpm db:deploy`.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) {
  console.error("usage: pnpm db:new-migration <name>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = resolve(root, "prisma/schema.prisma");
const snapshot = resolve(root, "prisma/.schema-snapshot.prisma");

const sql = execFileSync(
  "npx",
  ["prisma", "migrate", "diff", "--from-schema-datamodel", snapshot, "--to-schema-datamodel", schema, "--script"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: "postgresql://unused@localhost/unused" } },
);

if (/^-- This is an empty migration/m.test(sql)) {
  console.log("No schema changes.");
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = resolve(root, `prisma/migrations/${ts}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "migration.sql"), sql);
copyFileSync(schema, snapshot);
console.log(`Created prisma/migrations/${ts}_${name}/migration.sql`);

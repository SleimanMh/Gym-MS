// Runs a command with DATABASE_URL pointed at the owner role (migrations, seed).
// The running API never uses the owner role: it connects as gym_app, which cannot bypass RLS.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const p of [resolve(here, "../.env"), resolve(here, "../../../.env")]) {
  if (existsSync(p)) process.loadEnvFile(p);
}

if (!process.env.DATABASE_OWNER_URL) {
  console.error("DATABASE_OWNER_URL is not set (see .env.example).");
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_OWNER_URL },
});
process.exit(result.status ?? 1);

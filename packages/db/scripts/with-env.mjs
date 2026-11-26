// Runs a command with the repo-root .env loaded, as the APP role (DATABASE_URL = gym_app).
// The seed uses this so Row-Level Security protects it exactly like an API request.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const p of [resolve(here, "../.env"), resolve(here, "../../../.env")]) {
  if (existsSync(p)) process.loadEnvFile(p);
}
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: process.env });
process.exit(result.status ?? 1);

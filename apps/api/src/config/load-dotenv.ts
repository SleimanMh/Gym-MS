// Imported first by main.ts / worker.ts: loads the repo-root .env in development.
// Real environments set variables directly; existing variables are never overwritten.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.NODE_ENV !== "production") {
  for (const p of [resolve(__dirname, "../../.env"), resolve(__dirname, "../../../../.env")]) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      break;
    }
  }
}

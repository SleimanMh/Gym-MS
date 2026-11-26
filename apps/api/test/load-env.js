// Loads the repo-root .env for integration tests (CI sets the variables directly).
// Assigns into process.env explicitly: Jest gives each test file its own copy of process.env,
// which process.loadEnvFile() would not update.
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parseEnv } = require("node:util");

for (const p of [resolve(__dirname, "../.env"), resolve(__dirname, "../../../.env")]) {
  if (!existsSync(p)) continue;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(p, "utf8")))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

// Tests create members, classes and bookings. Point them at their own database when one is
// configured, so they never leave "Test…" records in the demo data people look at.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

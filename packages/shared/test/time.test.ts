import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, localDate, weekdayOf, zonedToUtc, tzOffsetMinutes, parseHhMm } from "../src/time";
import { formatMoney, parseMoney } from "../src/money";

test("zonedToUtc converts local wall time across DST", () => {
  // Beirut: UTC+2 in winter, UTC+3 in summer.
  assert.equal(zonedToUtc("2026-01-15", parseHhMm("18:30"), "Asia/Beirut").toISOString(), "2026-01-15T16:30:00.000Z");
  assert.equal(zonedToUtc("2026-07-15", parseHhMm("18:30"), "Asia/Beirut").toISOString(), "2026-07-15T15:30:00.000Z");
  assert.equal(zonedToUtc("2026-07-15", 0, "UTC").toISOString(), "2026-07-15T00:00:00.000Z");
  assert.equal(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Asia/Beirut"), 180);
});

test("localDate respects the time zone", () => {
  assert.equal(localDate(new Date("2026-03-10T23:30:00Z"), "Asia/Beirut"), "2026-03-11");
  assert.equal(localDate(new Date("2026-03-10T23:30:00Z"), "UTC"), "2026-03-10");
});

test("date arithmetic", () => {
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(weekdayOf("2026-11-15"), 0); // Sunday
});

test("money parse/format", () => {
  assert.equal(parseMoney("49.9", "USD"), 4990n);
  assert.equal(parseMoney("100", "JOD"), 100000n); // 3 decimals
  assert.throws(() => parseMoney("1.234", "USD"));
  assert.equal(formatMoney(4990n, "USD"), "$49.90");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseMappingSeed } from "../packages/core/src/seed.js";
import { CONSOLE_ROUTES } from "../apps/console/src/routes.js";

test("yaml seed parses and does not default past_due revoke", () => {
  const rows = parseMappingSeed(readFileSync("config/mapping.seed.yaml", "utf8"));
  assert.ok(rows.length >= 4);
  assert.equal(rows.every((row) => row.revoke_on_past_due === false), true);
  assert.equal(rows.some((row) => row.event_type === "invoice.paid"), false);
});

test("console has no replay execute route", () => {
  const joined = CONSOLE_ROUTES.join("\n");
  assert.equal(joined.includes("execute"), false);
  assert.equal(joined.includes("POST /replay"), false);
  assert.ok(CONSOLE_ROUTES.includes("GET /replay"));
  assert.ok(CONSOLE_ROUTES.includes("POST /mapping/toggle"));
});

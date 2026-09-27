import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOW_REASONS as CORE_REASONS } from "../packages/core/src/constants.js";
import { clampEventTimestamp } from "../packages/core/src/signatures.js";
import { ALLOW_REASONS as SDK_REASONS } from "../packages/sdk-ts/src/index.js";

test("sdk and http share the same reason codes", () => {
  assert.deepEqual([...SDK_REASONS], [...CORE_REASONS]);
  assert.ok(CORE_REASONS.includes("bad_request"));
  assert.ok(CORE_REASONS.includes("maydo_unavailable"));
});

test("event timestamps in the future clamp to the verified signature", () => {
  const signature = 1_758_900_000;
  const past = new Date((signature - 10) * 1000).toISOString();
  assert.equal(clampEventTimestamp(past, signature), past);
  assert.equal(clampEventTimestamp(null, signature), null);
  assert.equal(clampEventTimestamp("not-a-date", signature), null);
  const future = new Date((signature + 86_400) * 1000).toISOString();
  assert.equal(clampEventTimestamp(future, signature), new Date(signature * 1000).toISOString());
});

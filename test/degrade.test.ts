import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldEnqueueAudit } from "../packages/core/src/evaluate.js";

test("degrade keeps every deny and samples allows", () => {
  assert.equal(shouldEnqueueAudit("deny", 10_000, 1000, 0.9), true);
  assert.equal(shouldEnqueueAudit("allow", 10_000, 1000, 0.02), false);
  assert.equal(shouldEnqueueAudit("allow", 10_000, 1000, 0.009), true);
  assert.equal(shouldEnqueueAudit("allow", 10, 1000, 0.9), true);
});

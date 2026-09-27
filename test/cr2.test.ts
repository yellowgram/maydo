import assert from "node:assert/strict";
import { test } from "node:test";
import { planEvent } from "../packages/adapters/src/plan.js";
import type { NormalizedEvent } from "../packages/adapters/src/normalize.js";
import {
  ACTION_MAX_LEN,
  ACTOR_MAX_LEN,
  DEV_KEY_PEPPER,
  MAPPING_ACTION_CAP,
  assertKeyPepper,
  isProductionRuntime,
  shouldEnqueueAudit,
} from "../packages/core/src/index.js";

function event(partial: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    provider: "polar",
    providerEventId: "wh_cr2",
    eventType: "order.paid",
    livemode: false,
    eventTs: "2026-09-26T12:00:00.000Z",
    bindingId: "sub_cr2",
    actorFromMetadata: "org_buyer",
    actionsFromMetadata: ["export.pdf"],
    customerId: "cus_cr2",
    productOrPriceId: null,
    status: "paid",
    ...partial,
  };
}

test("dev pepper is refused unless local insecure secrets are explicit", () => {
  assert.throws(
    () => assertKeyPepper(DEV_KEY_PEPPER, { production: false, allowInsecureDevSecrets: false }),
    /MAYDO_KEY_PEPPER/,
  );
  assert.doesNotThrow(() =>
    assertKeyPepper(DEV_KEY_PEPPER, { production: false, allowInsecureDevSecrets: true }),
  );
  assert.throws(
    () => assertKeyPepper("a".repeat(32), { production: true, allowInsecureDevSecrets: true }),
    /MAYDO_ALLOW_INSECURE_DEV_SECRETS/,
  );
  assert.throws(
    () => assertKeyPepper(DEV_KEY_PEPPER, { production: true, allowInsecureDevSecrets: false }),
    /non-default/,
  );
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ MAYDO_REQUIRE_PRODUCTION: "1" }), true);
  assert.equal(isProductionRuntime({ NODE_ENV: "development" }), false);
});

test("degrade never drops a deny", () => {
  for (const unit of [0, 0.5, 0.999]) {
    assert.equal(shouldEnqueueAudit("deny", 50_000, 1000, unit), true);
  }
});

test("checkout metadata that disagrees with the actor map does not grant", () => {
  const plan = planEvent(event(), null, "org_mapped", [], []);
  assert.equal(plan.kind, "dead");
  if (plan.kind === "dead") assert.equal(plan.reason, "actor_metadata_mismatch");
});

test("a spoofed refund actor still revokes stored grants for the mapped actor", () => {
  const plan = planEvent(
    event({
      eventType: "order.refunded",
      status: "refunded",
      actorFromMetadata: "org_victim",
      actionsFromMetadata: ["export.pdf"],
    }),
    null,
    "org_mapped",
    [],
    [
      { actor: "org_mapped", action: "export.pdf" },
      { actor: "org_mapped", action: "admin.seat" },
    ],
  );
  assert.equal(plan.kind, "expand");
  if (plan.kind !== "expand") return;
  assert.equal(plan.intent, "revoke");
  assert.equal(plan.note, "actor_metadata_mismatch");
  assert.equal(plan.rows.some((row) => row.actor === "org_victim"), false);
  assert.deepEqual(plan.rows.map((row) => row.action).sort(), ["admin.seat", "export.pdf"]);
});

test("grant fan-out above the cap dead-letters and a refund of stored grants does not", () => {
  const tooMany = Array.from({ length: MAPPING_ACTION_CAP + 1 }, (_, i) => `action.${i}`);
  const granted = planEvent(event({ actionsFromMetadata: tooMany }), null, null, [], []);
  assert.equal(granted.kind, "dead");
  if (granted.kind === "dead") assert.equal(granted.reason, "action_cap_exceeded");

  const existing = tooMany.map((action) => ({ actor: "org_buyer", action }));
  const revoked = planEvent(
    event({ eventType: "order.refunded", status: "refunded", actionsFromMetadata: ["export.pdf"] }),
    null,
    null,
    [],
    existing,
  );
  assert.equal(revoked.kind, "expand");
  if (revoked.kind !== "expand") return;
  assert.equal(revoked.rows.length, MAPPING_ACTION_CAP + 1);
  assert.equal(revoked.intent, "revoke");
});

test("oversized checkout actor is a dead letter", () => {
  const plan = planEvent(event({ actorFromMetadata: "a".repeat(ACTOR_MAX_LEN + 1) }), null, null, [], []);
  assert.equal(plan.kind, "dead");
  if (plan.kind === "dead") assert.equal(plan.reason, "field_too_long");
  const action = planEvent(
    event({ actionsFromMetadata: ["b".repeat(ACTION_MAX_LEN + 1)] }),
    null,
    null,
    [],
    [],
  );
  assert.equal(action.kind, "dead");
  if (action.kind === "dead") assert.equal(action.reason, "field_too_long");
});

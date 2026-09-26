import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { polarDisposition, stripeDisposition } from "../packages/adapters/src/eventMap.js";
import { normalizePolar, normalizeStripe } from "../packages/adapters/src/normalize.js";
import { planEvent } from "../packages/adapters/src/plan.js";

type Pin = {
  grant: string[];
  revoke: string[];
  noop: string[];
  revoke_when_status?: Record<string, string[]>;
};

test("polar pin matches the adapter", () => {
  const pin = JSON.parse(readFileSync("fixtures/polar/event_types.pin.json", "utf8")) as Pin;
  for (const type of pin.grant) assert.equal(polarDisposition(type), "grant", type);
  for (const type of pin.revoke) assert.equal(polarDisposition(type), "revoke", type);
  for (const type of pin.noop) assert.equal(polarDisposition(type), "noop", type);
  assert.equal(polarDisposition("subscription.past_due", { revokeOnPastDue: true }), "revoke");
  assert.equal(polarDisposition("subscription.updated"), "noop");
  assert.equal(polarDisposition("subscription.canceled"), "noop");
});

test("stripe pin matches the adapter", () => {
  const pin = JSON.parse(readFileSync("fixtures/stripe/event_types.pin.json", "utf8")) as Pin;
  for (const type of pin.grant) assert.equal(stripeDisposition(type, null), "grant", type);
  for (const type of pin.revoke) assert.equal(stripeDisposition(type, null), "revoke", type);
  for (const type of pin.noop) {
    if (type === "customer.subscription.updated") {
      assert.equal(stripeDisposition(type, "active"), "noop");
      continue;
    }
    assert.equal(stripeDisposition(type, null), "noop", type);
  }
  for (const status of pin.revoke_when_status?.["customer.subscription.updated"] ?? []) {
    assert.equal(stripeDisposition("customer.subscription.updated", status), "revoke", status);
  }
  assert.equal(stripeDisposition("invoice.paid", "paid"), "noop");
});

test("fixture bodies follow the pin", () => {
  const paid = JSON.parse(readFileSync("fixtures/polar/order.paid.json", "utf8")) as Record<string, unknown>;
  const refunded = JSON.parse(readFileSync("fixtures/polar/order.refunded.json", "utf8")) as Record<string, unknown>;
  const partial = JSON.parse(readFileSync("fixtures/polar/order.partially_refunded.json", "utf8")) as Record<string, unknown>;
  const revoked = JSON.parse(readFileSync("fixtures/polar/subscription.revoked.json", "utf8")) as Record<string, unknown>;
  assert.equal(paid.type, "order.paid");
  assert.equal(refunded.type, "order.refunded");
  assert.equal(partial.type, "order.refunded");
  assert.equal((partial.data as { status: string }).status, "partially_refunded");
  assert.equal(revoked.type, "subscription.revoked");

  const partialEvent = normalizePolar(partial, "wh_partial", "1758900000");
  const plan = planEvent(
    partialEvent,
    null,
    null,
    [],
    [
      { actor: "org_fixture", action: "export.pdf" },
      { actor: "org_fixture", action: "admin.seat" },
    ],
  );
  assert.equal(plan.kind, "expand");
  if (plan.kind !== "expand") return;
  assert.equal(plan.intent, "revoke");
  assert.deepEqual(
    plan.rows.map((row) => row.action).sort(),
    ["admin.seat", "export.pdf"],
  );

  const stripePaid = JSON.parse(readFileSync("fixtures/stripe/checkout.session.completed.json", "utf8")) as Record<string, unknown>;
  const normalized = normalizeStripe(stripePaid, "fallback");
  assert.equal(normalized.providerEventId, "evt_checkout_fixture");
  assert.equal(normalized.bindingId, "sub_stripe_fixture");
  const granted = planEvent(normalized, null, null, [], []);
  assert.equal(granted.kind, "expand");

  const active = JSON.parse(readFileSync("fixtures/stripe/subscription.updated.active.json", "utf8")) as Record<string, unknown>;
  const activePlan = planEvent(normalizeStripe(active, "fallback"), null, null, [], []);
  assert.equal(activePlan.kind, "ignore");

  const canceled = JSON.parse(readFileSync("fixtures/stripe/subscription.updated.canceled.json", "utf8")) as Record<string, unknown>;
  const canceledPlan = planEvent(normalizeStripe(canceled, "fallback"), null, null, [], []);
  assert.equal(canceledPlan.kind, "expand");
});

test("unresolved actor does not grant", () => {
  const body = JSON.parse(readFileSync("fixtures/polar/order.paid.json", "utf8")) as {
    data: { metadata: Record<string, string> };
  };
  delete body.data.metadata.maydo_actor;
  const event = normalizePolar(body as unknown as Record<string, unknown>, "wh_missing", "1758900000");
  const plan = planEvent(event, null, null, [], []);
  assert.equal(plan.kind, "dead");
  if (plan.kind === "dead") assert.equal(plan.reason, "actor_unresolved");
});

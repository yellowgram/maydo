import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { signPolar, signStripe, verifyPolarSignature, verifyStripeSignature } from "../packages/core/src/signatures.js";

test("stripe signature roundtrip and mismatch", () => {
  const body = Buffer.from('{"id":"evt_1"}');
  const secret = "whsec_test_secret";
  const now = 1_758_900_000_000;
  const header = signStripe(body, secret, 1_758_900_000);
  const ok = verifyStripeSignature(body, header, secret, now);
  assert.equal(ok.ok, true);
  const bad = verifyStripeSignature(body, header, "whsec_other", now);
  assert.equal(bad.ok, false);
});

test("polar standard-webhooks and raw-secret eras", () => {
  const body = Buffer.from('{"type":"order.paid"}');
  const rawKey = Buffer.from("polar-key-material");
  const secret = `whsec_${rawKey.toString("base64")}`;
  const now = 1_758_900_000_000;
  const header = signPolar(body, secret, "msg_1", 1_758_900_000);
  const ok = verifyPolarSignature(body, { id: "msg_1", timestamp: "1758900000", signature: header }, secret, now);
  assert.equal(ok.ok, true);

  const legacySecret = "legacy-polar-secret";
  const mac = createHmac("sha256", Buffer.from(legacySecret))
    .update(`msg_2.1758900000.${body.toString("utf8")}`)
    .digest("base64");
  const legacy = verifyPolarSignature(
    body,
    { id: "msg_2", timestamp: "1758900000", signature: `v1,${mac}` },
    legacySecret,
    now,
  );
  assert.equal(legacy.ok, true);
  const stale = verifyPolarSignature(
    body,
    { id: "msg_2", timestamp: "100", signature: `v1,${mac}` },
    legacySecret,
    now,
  );
  assert.equal(stale.ok, false);
});

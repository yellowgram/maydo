import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGrants, type GrantView } from "../packages/core/src/evaluate.js";

const now = new Date("2026-09-26T12:00:00Z");

function grant(partial: Partial<GrantView> & Pick<GrantView, "id">): GrantView {
  return {
    source: "local",
    state: "active",
    precedence_class: "allow",
    sticky: false,
    expires_at: null,
    ...partial,
  };
}

test("active allow", () => {
  const result = evaluateGrants([grant({ id: "g1" })], now);
  assert.equal(result.allow, true);
  assert.equal(result.reason, "grant_active");
});

test("no grant", () => {
  const result = evaluateGrants([], now);
  assert.equal(result.reason, "no_grant");
});

test("expired is distinct from no_grant", () => {
  const result = evaluateGrants(
    [grant({ id: "g1", expires_at: new Date("2026-09-01T00:00:00Z") })],
    now,
  );
  assert.equal(result.allow, false);
  assert.equal(result.reason, "expired");
});

test("provider revoke beats non-sticky local allow", () => {
  const result = evaluateGrants(
    [
      grant({ id: "local", source: "local" }),
      grant({ id: "prov", source: "stripe", state: "revoked", precedence_class: "deny" }),
    ],
    now,
  );
  assert.equal(result.allow, false);
  assert.equal(result.reason, "explicit_revoke");
});

test("sticky local allow survives provider revoke", () => {
  const result = evaluateGrants(
    [
      grant({
        id: "sticky",
        sticky: true,
        expires_at: new Date("2026-12-01T00:00:00Z"),
      }),
      grant({ id: "prov", source: "polar", state: "revoked", precedence_class: "deny" }),
    ],
    now,
  );
  assert.equal(result.allow, true);
  assert.equal(result.reason, "grant_active");
  assert.deepEqual(result.grant_ids, ["sticky"]);
});

test("local revoke wins over sticky and provider allow", () => {
  const result = evaluateGrants(
    [
      grant({ id: "deny", state: "revoked", precedence_class: "deny" }),
      grant({ id: "sticky", sticky: true, expires_at: new Date("2026-12-01T00:00:00Z") }),
      grant({ id: "paid", source: "stripe" }),
    ],
    now,
  );
  assert.equal(result.allow, false);
  assert.equal(result.reason, "explicit_revoke");
  assert.deepEqual(result.grant_ids, ["deny"]);
});

test("a newer provider binding still allows when an older binding is revoked", () => {
  const result = evaluateGrants(
    [
      grant({ id: "old", source: "stripe", state: "revoked", precedence_class: "deny" }),
      grant({ id: "new", source: "stripe" }),
    ],
    now,
  );
  assert.equal(result.allow, true);
  assert.deepEqual(result.grant_ids, ["new"]);
});

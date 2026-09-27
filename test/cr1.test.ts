import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_SESSION_SECRET, idempotencyKey } from "../packages/core/src/index.js";
import { clientIpFromRequest } from "../packages/core/src/net.js";
import { createConsoleServer } from "../apps/console/src/server.js";

test("idempotency key includes actor and does not split on pipe", () => {
  const left = idempotencyKey("polar", "wh_1", "revoke", "export.pdf", "a|b");
  const right = idempotencyKey("polar", "wh_1", "revoke", "export.pdf|a", "b");
  assert.notEqual(left, right);
  assert.equal(left.includes("a%7Cb"), true);
  assert.equal(right.includes("export.pdf%7Ca"), true);
  assert.notEqual(
    idempotencyKey("polar", "wh_1", "revoke", "export.pdf", "actor_one"),
    idempotencyKey("polar", "wh_1", "revoke", "export.pdf", "actor_two"),
  );
});

test("X-Forwarded-For is ignored unless the proxy is trusted", () => {
  const spoofed = clientIpFromRequest({
    socketIp: "127.0.0.1",
    forwardedFor: "10.9.8.7",
    trustProxy: false,
  });
  assert.equal(spoofed, "127.0.0.1");
  const rightmost = clientIpFromRequest({
    socketIp: "127.0.0.1",
    forwardedFor: "10.9.8.7, 192.0.2.10",
    trustProxy: true,
  });
  assert.equal(rightmost, "192.0.2.10");
});

test("console refuses the public dev session secret", () => {
  assert.throws(
    () => createConsoleServer({ pool: {} as never, pepper: "pepper", sessionSecret: DEV_SESSION_SECRET }),
    /MAYDO_SESSION_SECRET/,
  );
  const server = createConsoleServer({
    pool: {} as never,
    pepper: "pepper",
    sessionSecret: DEV_SESSION_SECRET,
    allowInsecureDevSecrets: true,
  });
  server.close();
});

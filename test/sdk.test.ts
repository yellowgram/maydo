import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "../packages/sdk-ts/src/index.js";

test("sdk refuses operator keys and cache over 5s", () => {
  assert.throws(() => createClient({ apiKey: "md_op_secret", baseUrl: "http://localhost" }));
  assert.throws(() => createClient({ apiKey: "sk_live_nope", baseUrl: "http://localhost" }));
  assert.throws(() =>
    createClient({ apiKey: "md_test_ok", baseUrl: "http://localhost", cache: { ttlMs: 5001 } }),
  );
});

test("cache is off by default and fail-closed on 500 and timeout", async () => {
  const calls: number[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls.push(Date.now());
    return new Response(JSON.stringify({
      allow: true,
      reason: "grant_active",
      grant_ids: ["g1"],
      evaluated_at: "2026-09-26T00:00:00.000Z",
    }), { status: 200 });
  }) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_test_abc", baseUrl: "http://maydo.test" });
    await client.allow({ actor: "a", action: "b" });
    await client.allow({ actor: "a", action: "b" });
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = (async () => new Response("nope", { status: 503 })) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_live_abc", baseUrl: "http://maydo.test" });
    const denied = await client.allow({ actor: "a", action: "b" });
    assert.equal(denied.allow, false);
    assert.equal(denied.reason, "maydo_unavailable");
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => undefined);
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_test_abc", baseUrl: "http://maydo.test", timeoutMs: 30 });
    const denied = await client.allow({ actor: "a", action: "b" });
    assert.equal(denied.allow, false);
    assert.equal(denied.reason, "maydo_unavailable");
  } finally {
    globalThis.fetch = original;
  }
});

test("sdk keeps a client deny and does not cache an outage", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async () => {
    calls.push("bad");
    return new Response(
      JSON.stringify({
        allow: false,
        reason: "bad_request",
        error: "bad_request",
        grant_ids: [],
        evaluated_at: "2026-09-26T00:00:00.000Z",
      }),
      { status: 400 },
    );
  }) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_test_abc", baseUrl: "http://maydo.test", cache: { ttlMs: 1000 } });
    const denied = await client.allow({ actor: "a", action: "b" });
    assert.equal(denied.allow, false);
    assert.equal(denied.reason, "bad_request");
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = (async () => {
    calls.push("down");
    return new Response("nope", { status: 503 });
  }) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_test_abc", baseUrl: "http://maydo.test", cache: { ttlMs: 5000 } });
    const first = await client.allow({ actor: "a", action: "b" });
    const second = await client.allow({ actor: "a", action: "b" });
    assert.equal(first.reason, "maydo_unavailable");
    assert.equal(second.reason, "maydo_unavailable");
    assert.equal(calls.filter((item) => item === "down").length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("sdk does not trust allow:true on a 500", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ allow: true, reason: "grant_active", grant_ids: [], evaluated_at: "x" }), {
      status: 500,
    })) as typeof fetch;
  try {
    const client = createClient({ apiKey: "md_test_abc", baseUrl: "http://maydo.test" });
    const denied = await client.allow({ actor: "a", action: "b" });
    assert.equal(denied.allow, false);
    assert.equal(denied.reason, "maydo_unavailable");
  } finally {
    globalThis.fetch = original;
  }
});

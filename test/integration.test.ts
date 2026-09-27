import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { hashApiKey, mintKey, parseMappingSeed, signPolar, signStripe } from "../packages/core/src/index.js";
import { createApiServer, listen } from "../apps/api/src/server.js";
import { applyPayload, assertRuntimeRole, drainAuditBatch, drainOnce, makePool, migrate, replayExecute, seedMappings, withTenant } from "../packages/db/src/index.js";
import { createLocalGrant, listGrantsForAllow, revokeGrant } from "../packages/db/src/grants.js";
import { evaluateGrants } from "../packages/core/src/evaluate.js";
import { createClient } from "../packages/sdk-ts/src/index.js";
import { createConsoleServer } from "../apps/console/src/server.js";

const MIGRATOR = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/maydo";
const API_URL = process.env.DATABASE_URL_API ?? "postgres://maydo_api:maydo_api_dev@127.0.0.1:5432/maydo";
const WORKER_URL = process.env.DATABASE_URL_WORKER ?? "postgres://maydo_worker:maydo_worker_dev@127.0.0.1:5432/maydo";
const PEPPER = process.env.MAYDO_KEY_PEPPER ?? "dev-pepper-change-me";

const migrator = new pg.Pool({ connectionString: MIGRATOR, max: 4 });
const apiPool = makePool(API_URL, "maydo-test-api");
const workerPool = makePool(WORKER_URL, "maydo-test-worker");

before(async () => {
  await migrate(MIGRATOR);
  await truncate();
});

after(async () => {
  await migrator.end();
  await apiPool.end();
  await workerPool.end();
});

describe("postgres kernel", { concurrency: 1 }, () => {
  test("worker role is not BYPASSRLS and a forgotten GUC cannot write another tenant", async () => {
    const roles = await migrator.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('maydo_api', 'maydo_worker')`,
    );
    assert.equal(roles.rowCount, 2);
    for (const role of roles.rows) {
      assert.equal(role.rolbypassrls, false, role.rolname);
      assert.equal(role.rolsuper, false, role.rolname);
    }

    const tenantA = await insertTenant("A");
    const tenantB = await insertTenant("B");
    const grantA = await insertGrant(tenantA, "actor-a", "export.pdf", "local", "bind-a");
    const grantB = await insertGrant(tenantB, "actor-b", "export.pdf", "local", "bind-b");

    const client = await workerPool.connect();
    try {
      await client.query("BEGIN");
      const forgotten = await client.query(`UPDATE maydo.grants SET note = 'pwned' WHERE id = $1`, [grantB]);
      assert.equal(forgotten.rowCount, 0);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query(`SELECT set_config('maydo.tenant_id', $1, true)`, [tenantA]);
      const crossed = await client.query(`UPDATE maydo.grants SET note = 'pwned' WHERE tenant_id = $1`, [tenantB]);
      assert.equal(crossed.rowCount, 0);
      const own = await client.query(`UPDATE maydo.grants SET note = 'touched' WHERE tenant_id = $1 AND id = $2`, [
        tenantA,
        grantA,
      ]);
      assert.equal(own.rowCount, 1);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await assert.rejects(
        applyPayload(client, tenantB, {
          intent: "grant",
          actor: "victim",
          action: "export.pdf",
          source: "stripe",
          binding_id: "forged",
        }),
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const notes = await migrator.query<{ id: string; note: string | null }>(
      `SELECT id, note FROM maydo.grants WHERE id = ANY($1::uuid[])`,
      [[grantA, grantB]],
    );
    for (const row of notes.rows) assert.notEqual(row.note, "pwned");
    const forged = await migrator.query(`SELECT count(*)::int AS n FROM maydo.grants WHERE binding_id = 'forged'`);
    assert.equal(forged.rows[0].n, 0);
  });

  test("drain sets the tenant GUC from the outbox row, ignoring a decoy in the payload", async () => {
    await truncate();
    const tenantA = await insertTenant("drain-a");
    const tenantB = await insertTenant("drain-b");
    const grantB = await insertGrant(tenantB, "actor-b", "export.pdf", "stripe", "sub_b");
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_drain', 'grant', 'stripe|evt_drain|grant:export.pdf', 'pending', $2::jsonb)`,
      [
        tenantA,
        JSON.stringify({
          intent: "grant",
          actor: "actor-a",
          action: "export.pdf",
          source: "stripe",
          binding_id: "sub_a",
          source_event_id: "evt_drain",
          event_ts: new Date().toISOString(),
          decoy_tenant_id: tenantB,
        }),
      ],
    );
    const drained = await drainOnce(workerPool);
    assert.equal(drained, true);
    const grantsA = await migrator.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM maydo.grants WHERE binding_id = 'sub_a'`,
    );
    assert.equal(grantsA.rowCount, 1);
    assert.equal(grantsA.rows[0].tenant_id, tenantA);
    const stillB = await migrator.query<{ note: string | null }>(`SELECT note FROM maydo.grants WHERE id = $1`, [grantB]);
    assert.equal(stillB.rows[0].note, null);
  });

  test("duplicate stripe webhook is 200 and one grant; bad signature and livemode are 400", async () => {
    await truncate();
    const tenant = await insertTenant("stripe");
    const secret = "whsec_test_stripe";
    const token = "stripetoken123";
    const decision = mintKey("md_test_");
    await insertKey(tenant, decision.token);
    await migrator.query(
      `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
       VALUES ($1, 'stripe', $2, $3, false)`,
      [tenant, token, secret],
    );
    const server = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000 });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const body = Buffer.from(
        JSON.stringify({
          id: "evt_once",
          object: "event",
          type: "checkout.session.completed",
          livemode: false,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: "cs_once",
              object: "checkout.session",
              customer: "cus_once",
              subscription: "sub_once",
              metadata: { maydo_actor: "org_once", maydo_action: "export.pdf" },
            },
          },
        }),
      );
      const sig = signStripe(body, secret, Math.floor(Date.now() / 1000));
      const first = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, { "stripe-signature": sig });
      const second = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, { "stripe-signature": sig });
      assert.equal(first.status, 200);
      assert.equal(first.json.status, "ok");
      assert.equal(second.status, 200);
      assert.equal(second.json.status, "duplicate");

      const bad = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, { "stripe-signature": "t=1,v1=nope" });
      assert.equal(bad.status, 400);

      const liveBody = Buffer.from(body.toString("utf8").replace('"livemode":false', '"livemode":true').replace("evt_once", "evt_live"));
      const liveSig = signStripe(liveBody, secret, Math.floor(Date.now() / 1000));
      const live = await request(port, "POST", `/v1/webhooks/stripe/${token}`, liveBody, { "stripe-signature": liveSig });
      assert.equal(live.status, 400);
      assert.equal(live.json.error, "livemode_mismatch");

      await drainAll();
      const grants = await migrator.query(`SELECT * FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
      assert.equal(grants.rowCount, 1);

      const allowed = await request(
        port,
        "POST",
        "/v1/allow",
        JSON.stringify({ actor: "org_once", action: "export.pdf" }),
        { authorization: `Bearer ${decision.token}`, "content-type": "application/json" },
      );
      assert.equal(allowed.status, 200);
      assert.equal(allowed.json.allow, true);
      assert.equal(allowed.json.reason, "grant_active");

      const sdk = createClient({ apiKey: decision.token, baseUrl: `http://127.0.0.1:${port}` });
      const viaSdk = await sdk.allow({ actor: "org_once", action: "export.pdf" });
      assert.equal(viaSdk.allow, true);
    } finally {
      server.close();
    }
  });

  test("multi-action expansion reports an incomplete set until every row drains", async () => {
    await truncate();
    const tenant = await insertTenant("multi");
    const { token, secret } = await polarEndpoint(tenant);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const body = Buffer.from(
        JSON.stringify({
          type: "order.paid",
          timestamp: new Date().toISOString(),
          data: {
            id: "ord_multi",
            status: "paid",
            subscription_id: "sub_multi",
            metadata: { maydo_actor: "org_multi", maydo_actions: ["export.pdf", "admin.seat"] },
          },
        }),
      );
      const ts = Math.floor(Date.now() / 1000);
      const posted = await request(port, "POST", `/v1/webhooks/polar/${token}`, body, polarHeaders(body, secret, "wh_multi", ts));
      assert.equal(posted.status, 200);
      assert.equal(posted.json.status, "ok");
      const sets = await migrator.query<{ expansion_set_id: string; n: number }>(
        `SELECT expansion_set_id, count(*)::int AS n FROM maydo.outbox WHERE tenant_id = $1 GROUP BY expansion_set_id`,
        [tenant],
      );
      assert.equal(sets.rowCount, 1);
      assert.equal(sets.rows[0].n, 2);
      assert.equal(await drainOnce(workerPool), true);
      const midGrants = await migrator.query(`SELECT action FROM maydo.grants WHERE tenant_id = $1 AND state = 'active'`, [
        tenant,
      ]);
      assert.equal(midGrants.rowCount, 1);
      const mid = await withTenant(apiPool, tenant, (client) =>
        client.query(
          `SELECT expansion_set_id FROM maydo.outbox WHERE tenant_id = $1
           GROUP BY expansion_set_id
           HAVING count(*) FILTER (WHERE state = 'done') < count(*)`,
          [tenant],
        ),
      );
      assert.equal(mid.rowCount, 1);
      assert.equal(await drainOnce(workerPool), true);
      const done = await withTenant(apiPool, tenant, (client) =>
        client.query(
          `SELECT expansion_set_id FROM maydo.outbox WHERE tenant_id = $1
           GROUP BY expansion_set_id
           HAVING count(*) FILTER (WHERE state = 'done') < count(*)`,
          [tenant],
        ),
      );
      assert.equal(done.rowCount, 0);
      const grants = await migrator.query(`SELECT action FROM maydo.grants WHERE tenant_id = $1 AND state = 'active'`, [tenant]);
      assert.deepEqual(grants.rows.map((row: { action: string }) => row.action).sort(), ["admin.seat", "export.pdf"]);
    } finally {
      server.close();
    }
  });

  test("partial refund revokes every action on the binding", async () => {
    await truncate();
    const tenant = await insertTenant("refund");
    const { token, secret } = await polarEndpoint(tenant);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      await postPolar(port, token, secret, "wh_pay", {
        type: "order.paid",
        data: {
          id: "ord_ref",
          status: "paid",
          subscription_id: "sub_ref",
          metadata: { maydo_actor: "org_ref", maydo_actions: ["export.pdf", "admin.seat"] },
        },
      });
      await drainAll();
      await postPolar(port, token, secret, "wh_refund", {
        type: "order.refunded",
        data: {
          id: "ord_ref",
          status: "partially_refunded",
          subscription_id: "sub_ref",
          metadata: { maydo_actor: "org_ref", maydo_action: "export.pdf" },
        },
      });
      await drainAll();
      const grants = await migrator.query<{ action: string; state: string }>(
        `SELECT action, state FROM maydo.grants WHERE tenant_id = $1 AND source = 'polar' ORDER BY action`,
        [tenant],
      );
      assert.equal(grants.rowCount, 2);
      assert.equal(grants.rows.every((row) => row.state === "revoked"), true);
    } finally {
      server.close();
    }
  });

  test("unresolved actor becomes a dead letter and no grant", async () => {
    await truncate();
    const tenant = await insertTenant("unresolved");
    const { token, secret } = await polarEndpoint(tenant);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await postPolar(port, token, secret, "wh_nobody", {
        type: "order.paid",
        data: { id: "ord_nobody", status: "paid", subscription_id: "sub_nobody", metadata: {} },
      });
      assert.equal(response.status, 200);
      assert.equal(response.json.status, "dead");
      assert.equal(response.json.reason, "actor_unresolved");
      const letters = await migrator.query(`SELECT reason FROM maydo.dead_letters WHERE tenant_id = $1`, [tenant]);
      assert.equal(letters.rowCount, 1);
      assert.equal(letters.rows[0].reason, "actor_unresolved");
      const grants = await migrator.query(`SELECT count(*)::int AS n FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
      assert.equal(grants.rows[0].n, 0);
      const outbox = await migrator.query(`SELECT count(*)::int AS n FROM maydo.outbox WHERE tenant_id = $1`, [tenant]);
      assert.equal(outbox.rows[0].n, 0);
    } finally {
      server.close();
    }
  });

  test("sticky requires expiry, provider revoke skips it, and local revoke wins", async () => {
    await truncate();
    const tenant = await insertTenant("sticky");
    await withTenant(apiPool, tenant, async (client) => {
      await assert.rejects(
        createLocalGrant(client, {
          tenantId: tenant,
          actor: "org_sticky",
          action: "export.pdf",
          bindingId: "local_sticky",
          sticky: true,
          expiresAt: null,
          note: null,
          createdBy: "test",
        }),
        /expires_at/,
      );
      const tooFar = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
      await assert.rejects(
        createLocalGrant(client, {
          tenantId: tenant,
          actor: "org_sticky",
          action: "export.pdf",
          bindingId: "local_sticky",
          sticky: true,
          expiresAt: tooFar,
          note: null,
          createdBy: "test",
        }),
      );
      const created = await createLocalGrant(client, {
        tenantId: tenant,
        actor: "org_sticky",
        action: "export.pdf",
        bindingId: "local_sticky",
        sticky: true,
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        note: "pilot",
        createdBy: "test",
      });
      const plain = await createLocalGrant(client, {
        tenantId: tenant,
        actor: "org_plain",
        action: "export.pdf",
        bindingId: "local_plain",
        sticky: false,
        expiresAt: null,
        note: null,
        createdBy: "test",
      });
      assert.equal(created.sticky, true);
      assert.equal(plain.sticky, false);
    });

    const { token, secret } = await polarEndpoint(tenant);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      await postPolar(port, token, secret, "wh_revoke_sticky", {
        type: "subscription.revoked",
        data: {
          id: "sub_sticky",
          status: "revoked",
          metadata: { maydo_actor: "org_sticky", maydo_action: "export.pdf" },
        },
      });
      await postPolar(port, token, secret, "wh_revoke_plain", {
        type: "subscription.revoked",
        data: {
          id: "sub_plain",
          status: "revoked",
          metadata: { maydo_actor: "org_plain", maydo_action: "export.pdf" },
        },
      });
      await drainAll();
      const sticky = await loadDecision(tenant, "org_sticky", "export.pdf");
      assert.equal(sticky.allow, true, "sticky survives provider revoke");
      const plain = await loadDecision(tenant, "org_plain", "export.pdf");
      assert.equal(plain.allow, false);
      assert.equal(plain.reason, "explicit_revoke");

      await withTenant(apiPool, tenant, async (client) => {
        const row = await client.query<{ id: string }>(
          `SELECT id FROM maydo.grants WHERE tenant_id = $1 AND actor = 'org_sticky' AND source = 'local'`,
          [tenant],
        );
        const { revokeGrant } = await import("../packages/db/src/grants.js");
        await revokeGrant(client, tenant, row.rows[0].id, "test");
      });
      const after = await loadDecision(tenant, "org_sticky", "export.pdf");
      assert.equal(after.allow, false);
      assert.equal(after.reason, "explicit_revoke");
    } finally {
      server.close();
    }
  });

  test("allow fails closed when the database is unreachable", async () => {
    const dead = makePool("postgres://maydo_api:maydo_api_dev@127.0.0.1:1/maydo", "dead");
    const server = createApiServer({ pool: dead, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await request(
        port,
        "POST",
        "/v1/allow",
        JSON.stringify({ actor: "a", action: "b" }),
        { authorization: "Bearer md_test_whatever", "content-type": "application/json" },
      );
      assert.equal(response.status, 503);
      assert.equal(response.json.allow, false);
      assert.equal(response.json.reason, "maydo_unavailable");
      const operator = await request(
        port,
        "POST",
        "/v1/allow",
        JSON.stringify({ actor: "a", action: "b" }),
        { authorization: "Bearer md_op_not_a_decision_key", "content-type": "application/json" },
      );
      assert.equal(operator.status, 401);
      assert.equal(operator.json.allow, false);
      assert.equal(operator.json.reason, "auth_failed");
    } finally {
      server.close();
      await dead.end();
    }
  });

  test("webhook database failure is HTTP 500", async () => {
    await truncate();
    const tenant = await insertTenant("boom");
    const secret = "whsec_boom";
    const token = "boomtoken";
    await migrator.query(
      `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
       VALUES ($1, 'stripe', $2, $3, false)`,
      [tenant, token, secret],
    );
    await migrator.query(`REVOKE INSERT ON maydo.provider_events FROM maydo_api`);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const body = Buffer.from(
        JSON.stringify({
          id: "evt_boom",
          type: "checkout.session.completed",
          livemode: false,
          created: Math.floor(Date.now() / 1000),
          data: { object: { id: "cs_boom", metadata: { maydo_actor: "a", maydo_action: "b" } } },
        }),
      );
      const response = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, {
        "stripe-signature": signStripe(body, secret, Math.floor(Date.now() / 1000)),
      });
      assert.equal(response.status, 500);
      assert.equal(response.json.error, "ingest_failed");
    } finally {
      server.close();
      await migrator.query(`GRANT INSERT ON maydo.provider_events TO maydo_api`);
    }
  });

  test("cli rejects sticky without expires_at", () => {
    const result = spawnSync(
      process.execPath,
      ["dist/packages/cli/src/main.js", "grants", "create", "--actor", "a", "--action", "b", "--sticky"],
      {
        env: { ...process.env, DATABASE_URL_API: API_URL, MAYDO_TENANT_ID: "00000000-0000-0000-0000-000000000000", MAYDO_KEY_PEPPER: PEPPER },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}`, /sticky_expires_required|expires_at/);
  });

  test("poison outbox dead-letters and replay execute reopens it once", async () => {
    await truncate();
    const tenant = await insertTenant("replay");
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'polar', 'evt_poison', 'grant', 'polar|evt_poison|grant:export.pdf', 'pending', '{"intent":"grant"}'::jsonb)`,
      [tenant],
    );
    assert.equal(await drainOnce(workerPool), true);
    const dead = await migrator.query<{ id: string; reason: string; outbox_id: string }>(
      `SELECT id, reason, outbox_id FROM maydo.dead_letters WHERE tenant_id = $1`,
      [tenant],
    );
    assert.equal(dead.rowCount, 1);
    assert.match(dead.rows[0].reason, /incomplete payload/);
    const reopened = await withTenant(apiPool, tenant, (client) => replayExecute(client, tenant, dead.rows[0].id));
    assert.equal(reopened.state, "pending");
    const attempts = await migrator.query<{ attempts: number }>(`SELECT attempts FROM maydo.outbox WHERE id = $1`, [
      dead.rows[0].outbox_id,
    ]);
    assert.equal(attempts.rows[0].attempts, 0);
    await assert.rejects(withTenant(apiPool, tenant, (client) => replayExecute(client, tenant, dead.rows[0].id)));
    const grants = await migrator.query(`SELECT count(*)::int AS n FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
    assert.equal(grants.rows[0].n, 0);
  });

  test("only expired grants use the expired reason", async () => {
    await truncate();
    const tenant = await insertTenant("expired");
    await migrator.query(
      `INSERT INTO maydo.grants (
         tenant_id, actor, action, source, binding_id, state, precedence_class, expires_at
       ) VALUES ($1, 'org_old', 'export.pdf', 'local', 'local_old', 'active', 'allow', now() - interval '1 day')`,
      [tenant],
    );
    const decision = await loadDecision(tenant, "org_old", "export.pdf");
    assert.equal(decision.reason, "expired");
    assert.equal(decision.allow, false);
  });

  test("runtime roles cannot be superuser or BYPASSRLS", async () => {
    await assert.rejects(() => assertRuntimeRole(migrator), /BYPASSRLS|superuser/);
    await assertRuntimeRole(apiPool);
    await assertRuntimeRole(workerPool);
  });

  test("idempotency keys do not collide across tenants", async () => {
    await truncate();
    const tenantA = await insertTenant("idem-a");
    const tenantB = await insertTenant("idem-b");
    const key = "stripe|evt_shared|grant:export.pdf|org_shared";
    const sql = `INSERT INTO maydo.outbox (
      tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
    ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_shared', 'grant', $2, 'pending', '{"intent":"grant"}'::jsonb)`;
    await migrator.query(sql, [tenantA, key]);
    await migrator.query(sql, [tenantB, key]);
    const count = await migrator.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM maydo.outbox WHERE idempotency_key = $1`,
      [key],
    );
    assert.equal(count.rows[0].n, 2);
  });

  test("one refund expands two actors that share an action", async () => {
    await truncate();
    const tenant = await insertTenant("two-actors");
    await insertGrant(tenant, "actor_one", "export.pdf", "polar", "sub_shared");
    await insertGrant(tenant, "actor_two", "export.pdf", "polar", "sub_shared");
    const { token, secret } = await polarEndpoint(tenant);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await postPolar(port, token, secret, "wh_two_actors", {
        type: "order.refunded",
        data: {
          id: "ord_shared",
          status: "refunded",
          subscription_id: "sub_shared",
          metadata: {},
        },
      });
      assert.equal(response.status, 200, JSON.stringify(response.json));
      assert.equal(response.json.status, "ok");
      const rows = await migrator.query<{ actor: string }>(
        `SELECT payload->>'actor' AS actor FROM maydo.outbox WHERE tenant_id = $1 ORDER BY payload->>'actor'`,
        [tenant],
      );
      assert.deepEqual(rows.rows.map((row) => row.actor), ["actor_one", "actor_two"]);
    } finally {
      server.close();
    }
  });

  test("operator revoke survives a later grant webhook until grants create", async () => {
    await truncate();
    const tenant = await insertTenant("op-lock");
    const grantId = await insertGrant(tenant, "org_lock", "export.pdf", "stripe", "sub_lock");
    await withTenant(apiPool, tenant, (client) => revokeGrant(client, tenant, grantId, "cr1"));
    const locked = await migrator.query<{ operator_lock: boolean; state: string }>(
      `SELECT operator_lock, state FROM maydo.grants WHERE id = $1`,
      [grantId],
    );
    assert.equal(locked.rows[0].operator_lock, true);
    assert.equal(locked.rows[0].state, "revoked");
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_relock', 'grant', 'stripe|evt_relock|grant:export.pdf|org_lock', 'pending', $2::jsonb)`,
      [
        tenant,
        JSON.stringify({
          intent: "grant",
          actor: "org_lock",
          action: "export.pdf",
          source: "stripe",
          binding_id: "sub_lock",
          source_event_id: "evt_relock",
          event_ts: new Date(Date.now() + 60_000).toISOString(),
        }),
      ],
    );
    assert.equal(await drainOnce(workerPool), true);
    const still = await migrator.query<{ operator_lock: boolean; state: string; last_error: string | null }>(
      `SELECT g.operator_lock, g.state, o.last_error
       FROM maydo.grants g
       JOIN maydo.outbox o ON o.tenant_id = g.tenant_id
       WHERE g.id = $1`,
      [grantId],
    );
    assert.equal(still.rows[0].state, "revoked");
    assert.equal(still.rows[0].operator_lock, true);
    assert.equal(still.rows[0].last_error, "skipped: operator_lock");
    const dead = await migrator.query(`SELECT count(*)::int AS n FROM maydo.dead_letters WHERE tenant_id = $1`, [tenant]);
    assert.equal(dead.rows[0].n, 0);
    const denied = await loadDecision(tenant, "org_lock", "export.pdf");
    assert.equal(denied.allow, false);
    assert.equal(denied.reason, "explicit_revoke");

    await withTenant(apiPool, tenant, (client) =>
      createLocalGrant(client, {
        tenantId: tenant,
        actor: "org_lock",
        action: "export.pdf",
        bindingId: "local_relock",
        sticky: false,
        expiresAt: null,
        note: "restore",
        createdBy: "cr1",
      }),
    );
    const restored = await loadDecision(tenant, "org_lock", "export.pdf");
    assert.equal(restored.allow, true);
    assert.equal(restored.reason, "grant_active");
    const lockKept = await migrator.query<{ operator_lock: boolean; state: string }>(
      `SELECT operator_lock, state FROM maydo.grants WHERE id = $1`,
      [grantId],
    );
    assert.equal(lockKept.rows[0].operator_lock, true);
    assert.equal(lockKept.rows[0].state, "revoked");

    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_relock_2', 'grant', 'stripe|evt_relock_2|grant:export.pdf|org_lock', 'pending', $2::jsonb)`,
      [
        tenant,
        JSON.stringify({
          intent: "grant",
          actor: "org_lock",
          action: "export.pdf",
          source: "stripe",
          binding_id: "sub_lock",
          source_event_id: "evt_relock_2",
          event_ts: new Date(Date.now() + 120_000).toISOString(),
        }),
      ],
    );
    assert.equal(await drainOnce(workerPool), true);
    const afterCreate = await migrator.query<{ operator_lock: boolean; state: string }>(
      `SELECT operator_lock, state FROM maydo.grants WHERE id = $1`,
      [grantId],
    );
    assert.equal(afterCreate.rows[0].operator_lock, true);
    assert.equal(afterCreate.rows[0].state, "revoked");
    const stillLocal = await loadDecision(tenant, "org_lock", "export.pdf");
    assert.equal(stillLocal.allow, true);
  });

  test("decision-key IP allowlist ignores client X-Forwarded-For", async () => {
    await truncate();
    const tenant = await insertTenant("allowlist");
    const decision = mintKey("md_test_");
    await migrator.query(
      `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, ip_allowlist, last_four)
       VALUES ($1, 'md_test_', $2, '{allow}', $3::cidr[], $4)`,
      [tenant, hashApiKey(decision.token, PEPPER), ["10.9.8.7/32"], decision.lastFour],
    );
    const body = JSON.stringify({ actor: "a", action: "b" });
    const server = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000 });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    const trusted = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000, trustProxy: true });
    await listen(trusted, 0);
    const trustedPort = (trusted.address() as { port: number }).port;
    try {
      const spoofed = await request(port, "POST", "/v1/allow", body, {
        authorization: `Bearer ${decision.token}`,
        "content-type": "application/json",
        "x-forwarded-for": "10.9.8.7",
      });
      assert.equal(spoofed.status, 401);
      assert.equal(spoofed.json.reason, "auth_failed");

      const viaProxy = await request(trustedPort, "POST", "/v1/allow", body, {
        authorization: `Bearer ${decision.token}`,
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1, 10.9.8.7",
      });
      assert.equal(viaProxy.status, 200);
      assert.equal(viaProxy.json.allow, false);
      assert.equal(viaProxy.json.reason, "no_grant");

      const prepended = await request(trustedPort, "POST", "/v1/allow", body, {
        authorization: `Bearer ${decision.token}`,
        "content-type": "application/json",
        "x-forwarded-for": "10.9.8.7, 127.0.0.1",
      });
      assert.equal(prepended.status, 401);
    } finally {
      server.close();
      trusted.close();
    }
  });

  test("console session is tenant-bound, revocable, and cannot execute replay", async () => {
    await truncate();
    const tenant = await insertTenant("console");
    await insertGrant(tenant, "org_console", "export.pdf", "local", "local_console");
    const op = mintKey("md_op_");
    const secret = "cr1-console-session-secret-not-default";
    await migrator.query(
      `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, last_four)
       VALUES ($1, 'md_op_', $2, '{grants,replay}', $3)`,
      [tenant, hashApiKey(op.token, PEPPER), op.lastFour],
    );
    const server = createConsoleServer({ pool: apiPool, pepper: PEPPER, sessionSecret: secret });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const forged = await request(port, "GET", "/grants", undefined, { cookie: "maydo_session=aaaa.bbbb" });
      assert.equal(forged.status, 302);
      const replay = await request(port, "POST", "/replay/execute", "");
      assert.equal(replay.status, 404);
      assert.match(replay.text, /CLI-only/);

      const signedIn = await request(port, "POST", "/login", `api_key=${encodeURIComponent(op.token)}`, {
        "content-type": "application/x-www-form-urlencoded",
      });
      assert.equal(signedIn.status, 302);
      const cookie = cookieValue(signedIn.headers["set-cookie"]);
      assert.ok(cookie);
      const grants = await request(port, "GET", "/grants", undefined, { cookie: `maydo_session=${cookie}` });
      assert.equal(grants.status, 200);
      assert.match(grants.text, /org_console/);
      const authedReplay = await request(port, "POST", "/replay/execute", "id=1", {
        cookie: `maydo_session=${cookie}`,
        "content-type": "application/x-www-form-urlencoded",
      });
      assert.equal(authedReplay.status, 404);
      assert.match(authedReplay.text, /CLI-only/);

      await migrator.query(`UPDATE maydo.api_keys SET revoked_at = now() WHERE tenant_id = $1 AND prefix = 'md_op_'`, [tenant]);
      const after = await request(port, "GET", "/grants", undefined, { cookie: `maydo_session=${cookie}` });
      assert.equal(after.status, 401);
      assert.doesNotMatch(after.text, /org_console/);
    } finally {
      server.close();
    }
  });

  test("production console session cookie is Secure", async () => {
    await truncate();
    const tenant = await insertTenant("secure-cookie");
    const op = mintKey("md_op_");
    const secret = "cr2-console-session-secret-not-default";
    await migrator.query(
      `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, last_four)
       VALUES ($1, 'md_op_', $2, '{grants}', $3)`,
      [tenant, hashApiKey(op.token, PEPPER), op.lastFour],
    );
    const server = createConsoleServer({
      pool: apiPool,
      pepper: PEPPER,
      sessionSecret: secret,
      production: true,
    });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const signedIn = await request(port, "POST", "/login", `api_key=${encodeURIComponent(op.token)}`, {
        "content-type": "application/x-www-form-urlencoded",
      });
      const header = signedIn.headers["set-cookie"];
      const line = Array.isArray(header) ? header[0] : header;
      assert.match(line ?? "", /Secure/);
      assert.match(line ?? "", /HttpOnly/);
      assert.match(line ?? "", /SameSite=Lax/);
    } finally {
      server.close();
    }
  });

  test("a missing event timestamp does not clobber a newer revoke", async () => {
    await truncate();
    const tenant = await insertTenant("ts-null");
    await withTenant(workerPool, tenant, async (client) => {
      await applyPayload(client, tenant, {
        intent: "revoke",
        actor: "org_ts",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_ts",
        source_event_id: "evt_newer",
        event_ts: new Date().toISOString(),
      });
      await applyPayload(client, tenant, {
        intent: "grant",
        actor: "org_ts",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_ts",
        source_event_id: "evt_missing_ts",
        event_ts: null,
      });
    });
    const row = await migrator.query<{ state: string; source_event_id: string }>(
      `SELECT state, source_event_id FROM maydo.grants WHERE tenant_id = $1`,
      [tenant],
    );
    assert.equal(row.rows[0].state, "revoked");
    assert.equal(row.rows[0].source_event_id, "evt_newer");
  });

  test("concurrent drain keeps the newer provider event", async () => {
    await truncate();
    const tenant = await insertTenant("race");
    const older = new Date(Date.now() - 60_000).toISOString();
    const newer = new Date().toISOString();
    const insert = `INSERT INTO maydo.outbox (
      tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
    ) VALUES ($1, gen_random_uuid(), 'stripe', $2, $3, $4, 'pending', $5::jsonb)`;
    await migrator.query(insert, [
      tenant,
      "evt_race_grant",
      "grant",
      "stripe|evt_race_grant|grant:export.pdf|org_race",
      JSON.stringify({
        intent: "grant",
        actor: "org_race",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_race",
        source_event_id: "evt_race_grant",
        event_ts: older,
      }),
    ]);
    await migrator.query(insert, [
      tenant,
      "evt_race_revoke",
      "revoke",
      "stripe|evt_race_revoke|revoke:export.pdf|org_race",
      JSON.stringify({
        intent: "revoke",
        actor: "org_race",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_race",
        source_event_id: "evt_race_revoke",
        event_ts: newer,
      }),
    ]);
    await Promise.all([drainOnce(workerPool), drainOnce(workerPool)]);
    const row = await migrator.query<{ state: string }>(`SELECT state FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].state, "revoked");
    const decision = await loadDecision(tenant, "org_race", "export.pdf");
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "explicit_revoke");
  });

  test("replay execute cannot reopen another tenant's dead letter", async () => {
    await truncate();
    const tenantA = await insertTenant("replay-a");
    const tenantB = await insertTenant("replay-b");
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'polar', 'evt_iso', 'grant', 'polar|evt_iso|grant:export.pdf', 'pending', '{"intent":"grant"}'::jsonb)`,
      [tenantA],
    );
    assert.equal(await drainOnce(workerPool), true);
    const dead = await migrator.query<{ id: string; outbox_id: string }>(
      `SELECT id, outbox_id FROM maydo.dead_letters WHERE tenant_id = $1`,
      [tenantA],
    );
    assert.equal(dead.rowCount, 1);
    await assert.rejects(withTenant(apiPool, tenantB, (client) => replayExecute(client, tenantB, dead.rows[0].id)));
    const state = await migrator.query<{ state: string }>(`SELECT state FROM maydo.outbox WHERE id = $1`, [
      dead.rows[0].outbox_id,
    ]);
    assert.equal(state.rows[0].state, "dead");
    const replayed = await migrator.query<{ replayed_at: Date | null }>(
      `SELECT replayed_at FROM maydo.dead_letters WHERE id = $1`,
      [dead.rows[0].id],
    );
    assert.equal(replayed.rows[0].replayed_at, null);
  });

  test("mapping seed does not overwrite a database row", async () => {
    await truncate();
    const tenant = await insertTenant("seed-wins");
    const yaml = parseMappingSeed(readFileSync("config/mapping.seed.yaml", "utf8"));
    await withTenant(apiPool, tenant, async (client) => {
      const first = await seedMappings(client, tenant, yaml);
      assert.ok(first >= 1);
      await client.query(
        `UPDATE maydo.mapping_config SET actions = '{kept.action}'
         WHERE tenant_id = $1 AND provider = 'polar' AND event_type = 'order.paid'`,
        [tenant],
      );
      const second = await seedMappings(client, tenant, yaml);
      assert.equal(second, 0);
      const row = await client.query<{ actions: string[] }>(
        `SELECT actions FROM maydo.mapping_config
         WHERE tenant_id = $1 AND provider = 'polar' AND event_type = 'order.paid'`,
        [tenant],
      );
      assert.deepEqual(row.rows[0].actions, ["kept.action"]);
    });
  });

  test("sticky without expires_at is rejected by the database", async () => {
    await truncate();
    const tenant = await insertTenant("sticky-check");
    await assert.rejects(
      migrator.query(
        `INSERT INTO maydo.grants (
           tenant_id, actor, action, source, binding_id, state, precedence_class, sticky
         ) VALUES ($1, 'org', 'export.pdf', 'local', 'local_sticky', 'active', 'allow', true)`,
        [tenant],
      ),
    );
  });

  test("allow rejects oversized actor strings", async () => {
    await truncate();
    const tenant = await insertTenant("long-actor");
    const decision = mintKey("md_test_");
    await insertKey(tenant, decision.token);
    const server = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000 });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const response = await request(
        port,
        "POST",
        "/v1/allow",
        JSON.stringify({ actor: "a".repeat(300), action: "export.pdf" }),
        { authorization: `Bearer ${decision.token}`, "content-type": "application/json" },
      );
      assert.equal(response.status, 400);
      assert.equal(response.json.error, "bad_request");
      assert.equal(response.json.allow, false);
      assert.equal(response.json.reason, "bad_request");
      const queued = await migrator.query(`SELECT count(*)::int AS n FROM maydo.audit_queue WHERE tenant_id = $1`, [tenant]);
      assert.equal(queued.rows[0].n, 0);
    } finally {
      server.close();
    }
  });

  test("a future provider timestamp cannot outrank a later revoke", async () => {
    await truncate();
    const tenant = await insertTenant("future-ts");
    const secret = "whsec_future";
    const token = "futuretoken";
    await migrator.query(
      `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
       VALUES ($1, 'stripe', $2, $3, false)`,
      [tenant, token, secret],
    );
    const server = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000 });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const grantBody = Buffer.from(
        JSON.stringify({
          id: "evt_future_grant",
          object: "event",
          type: "checkout.session.completed",
          livemode: false,
          created: 2_000_000_000,
          data: {
            object: {
              id: "cs_future",
              object: "checkout.session",
              customer: "cus_future",
              subscription: "sub_future",
              metadata: { maydo_actor: "org_future", maydo_action: "export.pdf" },
            },
          },
        }),
      );
      const grantSig = signStripe(grantBody, secret, Math.floor(Date.now() / 1000));
      const granted = await request(port, "POST", `/v1/webhooks/stripe/${token}`, grantBody, {
        "stripe-signature": grantSig,
      });
      assert.equal(granted.status, 200, JSON.stringify(granted.json));
      const stored = await migrator.query<{ event_ts: string }>(
        `SELECT payload->>'event_ts' AS event_ts FROM maydo.outbox WHERE tenant_id = $1`,
        [tenant],
      );
      const eventTs = Date.parse(stored.rows[0].event_ts);
      assert.ok(Math.abs(eventTs - Date.now()) < 10 * 60 * 1000, stored.rows[0].event_ts);
      await drainAll();

      const revokeBody = Buffer.from(
        JSON.stringify({
          id: "evt_future_revoke",
          object: "event",
          type: "customer.subscription.deleted",
          livemode: false,
          created: Math.floor(Date.now() / 1000),
          data: { object: { id: "sub_future", object: "subscription", status: "canceled" } },
        }),
      );
      const revokeSig = signStripe(revokeBody, secret, Math.floor(Date.now() / 1000));
      const revoked = await request(port, "POST", `/v1/webhooks/stripe/${token}`, revokeBody, {
        "stripe-signature": revokeSig,
      });
      assert.equal(revoked.status, 200, JSON.stringify(revoked.json));
      await drainAll();
      const row = await migrator.query<{ state: string }>(
        `SELECT state FROM maydo.grants WHERE tenant_id = $1 AND binding_id = 'sub_future'`,
        [tenant],
      );
      assert.equal(row.rows[0].state, "revoked");
    } finally {
      server.close();
    }
  });

  test("an equal event timestamp lets the revoke win", async () => {
    await truncate();
    const tenant = await insertTenant("tie-ts");
    const ts = new Date().toISOString();
    await withTenant(workerPool, tenant, async (client) => {
      await applyPayload(client, tenant, {
        intent: "revoke",
        actor: "org_tie",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_tie",
        source_event_id: "evt_tie_revoke",
        event_ts: ts,
      });
      await applyPayload(client, tenant, {
        intent: "grant",
        actor: "org_tie",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_tie",
        source_event_id: "evt_tie_grant",
        event_ts: ts,
      });
    });
    const afterGrant = await migrator.query<{ state: string; source_event_id: string }>(
      `SELECT state, source_event_id FROM maydo.grants WHERE tenant_id = $1`,
      [tenant],
    );
    assert.equal(afterGrant.rows[0].state, "revoked");
    assert.equal(afterGrant.rows[0].source_event_id, "evt_tie_revoke");

    await withTenant(workerPool, tenant, async (client) => {
      await applyPayload(client, tenant, {
        intent: "grant",
        actor: "org_tie2",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_tie2",
        source_event_id: "evt_tie2_grant",
        event_ts: ts,
      });
      await applyPayload(client, tenant, {
        intent: "revoke",
        actor: "org_tie2",
        action: "export.pdf",
        source: "stripe",
        binding_id: "sub_tie2",
        source_event_id: "evt_tie2_revoke",
        event_ts: ts,
      });
    });
    const afterRevoke = await migrator.query<{ state: string }>(
      `SELECT state FROM maydo.grants WHERE tenant_id = $1 AND binding_id = 'sub_tie2'`,
      [tenant],
    );
    assert.equal(afterRevoke.rows[0].state, "revoked");
  });

  test("a leased in-flight row is not applied twice", async () => {
    await truncate();
    const tenant = await insertTenant("lease");
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_lease', 'grant', 'stripe|evt_lease|grant:export.pdf|org_lease', 'pending', $2::jsonb)`,
      [
        tenant,
        JSON.stringify({
          intent: "grant",
          actor: "org_lease",
          action: "export.pdf",
          source: "stripe",
          binding_id: "sub_lease",
          source_event_id: "evt_lease",
          event_ts: new Date().toISOString(),
        }),
      ],
    );
    const holder = await workerPool.connect();
    try {
      await holder.query("BEGIN");
      const locked = await holder.query(`SELECT id FROM maydo.outbox WHERE tenant_id = $1 FOR UPDATE`, [tenant]);
      assert.equal(locked.rowCount, 1);
      assert.equal(await drainOnce(workerPool), false);
      await holder.query("ROLLBACK");
    } finally {
      holder.release();
    }
    assert.equal(await drainOnce(workerPool), true);
    assert.equal(await drainOnce(workerPool), false);
    const grants = await migrator.query(`SELECT count(*)::int AS n FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
    assert.equal(grants.rows[0].n, 1);
  });

  test("cli drain stays on MAYDO_TENANT_ID when the worker URL is set", async () => {
    await truncate();
    const tenantA = await insertTenant("drain-cli-a");
    const tenantB = await insertTenant("drain-cli-b");
    const payload = JSON.stringify({
      intent: "grant",
      actor: "org_cli",
      action: "export.pdf",
      source: "stripe",
      binding_id: "sub_cli",
      source_event_id: "evt_cli",
      event_ts: new Date().toISOString(),
    });
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload, created_at
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_cli_b', 'grant', 'stripe|evt_cli_b|grant:export.pdf|org_cli', 'pending', $2::jsonb, now() - interval '1 minute')`,
      [tenantB, payload],
    );
    await migrator.query(
      `INSERT INTO maydo.outbox (
         tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
       ) VALUES ($1, gen_random_uuid(), 'stripe', 'evt_cli_a', 'grant', 'stripe|evt_cli_a|grant:export.pdf|org_cli', 'pending', $2::jsonb)`,
      [tenantA, payload],
    );
    const result = spawnSync(
      process.execPath,
      ["dist/packages/cli/src/main.js", "outbox", "drain", "--once"],
      {
        env: {
          ...process.env,
          DATABASE_URL_WORKER: WORKER_URL,
          DATABASE_URL_API: API_URL,
          MAYDO_TENANT_ID: tenantA,
          MAYDO_KEY_PEPPER: PEPPER,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const states = await migrator.query<{ tenant_id: string; state: string }>(
      `SELECT tenant_id, state FROM maydo.outbox ORDER BY created_at`,
    );
    const byTenant = new Map(states.rows.map((row) => [row.tenant_id, row.state]));
    assert.equal(byTenant.get(tenantA), "done");
    assert.equal(byTenant.get(tenantB), "pending");
  });

  test("purge refuses a short retention window and runtime roles cannot delete audit", async () => {
    await truncate();
    await assert.rejects(workerPool.query(`SELECT maydo.purge_allow_audit(1)`), /retention days/);
    const purged = await workerPool.query<{ purge_allow_audit: string }>(`SELECT maydo.purge_allow_audit(30)`);
    assert.equal(Number(purged.rows[0].purge_allow_audit), 0);
    const tenant = await insertTenant("audit-del");
    await migrator.query(
      `INSERT INTO maydo.allow_audit (tenant_id, actor, action, decision, reason, latency_bucket)
       VALUES ($1, 'org', 'export.pdf', 'deny', 'no_grant', 'lt5ms')`,
      [tenant],
    );
    const client = await workerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('maydo.tenant_id', $1, true)`, [tenant]);
      await assert.rejects(client.query(`DELETE FROM maydo.allow_audit WHERE tenant_id = $1`, [tenant]));
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const left = await migrator.query(`SELECT count(*)::int AS n FROM maydo.allow_audit WHERE tenant_id = $1`, [tenant]);
    assert.equal(left.rows[0].n, 1);
  });

  test("worker audit drain and tenant GUC do not cross mappings, keys, or dead letters", async () => {
    await truncate();
    const tenantA = await insertTenant("iso-a");
    const tenantB = await insertTenant("iso-b");
    await migrator.query(
      `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, last_four)
       VALUES ($1, 'md_test_', 'hash-b', '{allow}', 'bbbb')`,
      [tenantB],
    );
    await migrator.query(
      `INSERT INTO maydo.mapping_config (tenant_id, provider, event_type, actions)
       VALUES ($1, 'stripe', 'checkout.session.completed', '{export.pdf}')`,
      [tenantB],
    );
    await migrator.query(
      `INSERT INTO maydo.dead_letters (tenant_id, provider, provider_event_id, reason, payload)
       VALUES ($1, 'stripe', 'evt_b', 'actor_unresolved', '{}'::jsonb)`,
      [tenantB],
    );
    await migrator.query(
      `INSERT INTO maydo.audit_queue (tenant_id, actor, action, decision, reason, latency_bucket)
       VALUES ($1, 'org_a', 'export.pdf', 'deny', 'no_grant', 'lt5ms'),
              ($2, 'org_b', 'export.pdf', 'deny', 'explicit_revoke', 'lt5ms')`,
      [tenantA, tenantB],
    );
    assert.equal(await drainAuditBatch(workerPool), 2);
    const audits = await migrator.query<{ tenant_id: string; actor: string }>(
      `SELECT tenant_id, actor FROM maydo.allow_audit ORDER BY actor`,
    );
    assert.deepEqual(
      audits.rows.map((row) => `${row.tenant_id}:${row.actor}`),
      [`${tenantA}:org_a`, `${tenantB}:org_b`],
    );
    const client = await workerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('maydo.tenant_id', $1, true)`, [tenantA]);
      const keys = await client.query(`SELECT id FROM maydo.api_keys WHERE tenant_id = $1`, [tenantB]);
      const maps = await client.query(`SELECT id FROM maydo.mapping_config WHERE tenant_id = $1`, [tenantB]);
      const letters = await client.query(`SELECT id FROM maydo.dead_letters WHERE tenant_id = $1`, [tenantB]);
      assert.equal(keys.rowCount, 0);
      assert.equal(maps.rowCount, 0);
      assert.equal(letters.rowCount, 0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  test("demo path grants, revokes, and denies in under 60 seconds", async () => {
    await truncate();
    const started = Date.now();
    const tenant = await insertTenant("demo");
    const secret = "whsec_demo";
    const token = "demotoken";
    const decision = mintKey("md_test_");
    await insertKey(tenant, decision.token);
    await migrator.query(
      `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
       VALUES ($1, 'stripe', $2, $3, false)`,
      [tenant, token, secret],
    );
    const server = createApiServer({ pool: apiPool, pepper: PEPPER, ratePerMin: 10_000 });
    await listen(server, 0);
    const port = (server.address() as { port: number }).port;
    try {
      const body = Buffer.from(
        JSON.stringify({
          id: "evt_demo_1",
          object: "event",
          type: "checkout.session.completed",
          livemode: false,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: "cs_demo",
              object: "checkout.session",
              customer: "cus_demo",
              subscription: "sub_demo",
              metadata: { maydo_actor: "org_demo", maydo_action: "export.pdf" },
            },
          },
        }),
      );
      const sig = signStripe(body, secret, Math.floor(Date.now() / 1000));
      const posted = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, { "stripe-signature": sig });
      assert.equal(posted.json.status, "ok");
      await drainAll();
      const allowed = await request(port, "POST", "/v1/allow", JSON.stringify({ actor: "org_demo", action: "export.pdf" }), {
        authorization: `Bearer ${decision.token}`,
        "content-type": "application/json",
      });
      assert.equal(allowed.json.allow, true);
      assert.equal(allowed.json.reason, "grant_active");
      const grant = await migrator.query<{ id: string }>(`SELECT id FROM maydo.grants WHERE tenant_id = $1`, [tenant]);
      await withTenant(apiPool, tenant, (client) => revokeGrant(client, tenant, grant.rows[0].id, "demo"));
      const denied = await request(port, "POST", "/v1/allow", JSON.stringify({ actor: "org_demo", action: "export.pdf" }), {
        authorization: `Bearer ${decision.token}`,
        "content-type": "application/json",
      });
      assert.equal(denied.json.allow, false);
      assert.equal(denied.json.reason, "explicit_revoke");
      const duplicate = await request(port, "POST", `/v1/webhooks/stripe/${token}`, body, { "stripe-signature": sig });
      assert.equal(duplicate.json.status, "duplicate");
      assert.ok(Date.now() - started < 60_000);
    } finally {
      server.close();
    }
  });
});

async function truncate(): Promise<void> {
  await migrator.query(`
    TRUNCATE
      maydo.operator_audit,
      maydo.allow_audit,
      maydo.audit_queue,
      maydo.dead_letters,
      maydo.outbox,
      maydo.grants,
      maydo.provider_events,
      maydo.webhook_http_log,
      maydo.mapping_config,
      maydo.actor_maps,
      maydo.product_action_maps,
      maydo.api_keys,
      maydo.webhook_endpoints,
      maydo.tenants
    RESTART IDENTITY CASCADE
  `);
}

async function insertTenant(name: string): Promise<string> {
  const result = await migrator.query<{ id: string }>(
    `INSERT INTO maydo.tenants (name, status) VALUES ($1, 'active') RETURNING id`,
    [name],
  );
  return result.rows[0].id;
}

async function insertGrant(tenantId: string, actor: string, action: string, source: string, binding: string): Promise<string> {
  const result = await migrator.query<{ id: string }>(
    `INSERT INTO maydo.grants (tenant_id, actor, action, source, binding_id, state, precedence_class)
     VALUES ($1, $2, $3, $4, $5, 'active', 'allow') RETURNING id`,
    [tenantId, actor, action, source, binding],
  );
  return result.rows[0].id;
}

async function insertKey(tenantId: string, token: string): Promise<void> {
  const minted = token.startsWith("md_test_") ? token : token;
  await migrator.query(
    `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, last_four)
     VALUES ($1, 'md_test_', $2, '{allow}', $3)`,
    [tenantId, hashApiKey(minted, PEPPER), minted.slice(-4)],
  );
}

async function polarEndpoint(tenantId: string): Promise<{ token: string; secret: string }> {
  const raw = Buffer.from(`polar-secret-${tenantId}`);
  const secret = `whsec_${raw.toString("base64")}`;
  const token = `polar${tenantId.replaceAll("-", "").slice(0, 20)}`;
  await migrator.query(
    `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
     VALUES ($1, 'polar', $2, $3, false)`,
    [tenantId, token, secret],
  );
  return { token, secret };
}

function polarHeaders(body: Buffer, secret: string, id: string, timestamp: number): Record<string, string> {
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": signPolar(body, secret, id, timestamp),
    "content-type": "application/json",
  };
}

async function postPolar(
  port: number,
  token: string,
  secret: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; json: { status?: string; reason?: string; error?: string; allow?: boolean } }> {
  const body = Buffer.from(JSON.stringify({ timestamp: new Date().toISOString(), ...payload }));
  return request(port, "POST", `/v1/webhooks/polar/${token}`, body, polarHeaders(body, secret, id, Math.floor(Date.now() / 1000)));
}

async function drainAll(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const drained = await drainOnce(workerPool);
    if (!drained) return;
  }
  throw new Error("outbox did not drain");
}

async function loadDecision(tenantId: string, actor: string, action: string) {
  return withTenant(apiPool, tenantId, async (client) => {
    const clock = await client.query<{ now: Date }>(`SELECT now() AS now`);
    const grants = await listGrantsForAllow(client, tenantId, actor, action);
    return evaluateGrants(grants, clock.rows[0].now);
  });
}

function request(
  port: number,
  method: string,
  path: string,
  body?: Buffer | string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  text: string;
  headers: http.IncomingHttpHeaders;
  json: { status?: string; reason?: string; error?: string; allow?: boolean };
}> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: { ...headers, ...(payload ? { "content-length": String(payload.length) } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: { status?: string; reason?: string; error?: string; allow?: boolean } = {};
          if (text) {
            try {
              json = JSON.parse(text) as { status?: string; reason?: string; error?: string; allow?: boolean };
            } catch {
              json = {};
            }
          }
          resolve({ status: res.statusCode ?? 0, text, headers: res.headers, json });
        });
      },
    );
    req.on("error", reject);
    req.end(payload ?? undefined);
  });
}

function cookieValue(header: string | string[] | undefined): string {
  const line = Array.isArray(header) ? header[0] : header;
  return /maydo_session=([^;]+)/.exec(line ?? "")?.[1] ?? "";
}

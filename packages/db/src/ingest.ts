import { randomUUID } from "node:crypto";
import type pg from "pg";
import { idempotencyKey } from "../../core/src/index.js";
import {
  normalizePolar,
  normalizeStripe,
  planEvent,
  type MappingView,
  type NormalizedEvent,
  type Plan,
} from "../../adapters/src/index.js";
import {
  verifyPolarSignature,
  verifyStripeSignature,
  type VerifyFailure,
} from "../../core/src/signatures.js";
import { setTenant } from "./pool.js";

export type IngestResult =
  | { status: 200; body: { status: "ok" | "duplicate" | "ignored" | "dead"; reason?: string } }
  | { status: 400; body: { error: "invalid_signature" | "livemode_mismatch" | "bad_payload" | "unknown_endpoint" } }
  | { status: 500; body: { error: "ingest_failed" } };

type Endpoint = {
  tenant_id: string;
  provider: "stripe" | "polar";
  secret: string;
  livemode: boolean;
  tenant_status: string;
};

export async function ingestStripe(
  pool: pg.Pool,
  token: string,
  rawBody: Buffer,
  signature: string | undefined,
  nowMs = Date.now(),
): Promise<IngestResult> {
  return ingest(pool, "stripe", token, rawBody, nowMs, (endpoint) => {
    const verified = verifyStripeSignature(rawBody, signature, endpoint.secret, nowMs);
    if (!verified.ok) return verified;
    return { ok: true as const, event: normalizeStripe(verified.body, "missing") };
  });
}

export async function ingestPolar(
  pool: pg.Pool,
  token: string,
  rawBody: Buffer,
  headers: { id?: string; timestamp?: string; signature?: string },
  nowMs = Date.now(),
): Promise<IngestResult> {
  return ingest(pool, "polar", token, rawBody, nowMs, (endpoint) => {
    const verified = verifyPolarSignature(rawBody, headers, endpoint.secret, nowMs);
    if (!verified.ok) return verified;
    if (!headers.id) return { ok: false as const, reason: "bad_signature" };
    return { ok: true as const, event: normalizePolar(verified.body, headers.id, headers.timestamp) };
  });
}

async function ingest(
  pool: pg.Pool,
  provider: "stripe" | "polar",
  token: string,
  rawBody: Buffer,
  nowMs: number,
  verify: (endpoint: Endpoint) => VerifyFailure | { ok: true; event: NormalizedEvent },
): Promise<IngestResult> {
  let endpoint: Endpoint | null;
  try {
    endpoint = await resolveEndpoint(pool, token);
  } catch {
    return { status: 500, body: { error: "ingest_failed" } };
  }
  if (!endpoint || endpoint.provider !== provider) {
    return { status: 400, body: { error: "unknown_endpoint" } };
  }
  const verified = verify(endpoint);
  if (!verified.ok) {
    await logHttp(pool, endpoint.tenant_id, provider, 400);
    const error = verified.reason === "bad_payload" ? "bad_payload" : "invalid_signature";
    return { status: 400, body: { error } };
  }
  const event = verified.event;
  if (event.livemode !== null && event.livemode !== endpoint.livemode) {
    await logHttp(pool, endpoint.tenant_id, provider, 400);
    return { status: 400, body: { error: "livemode_mismatch" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenant(client, endpoint.tenant_id);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO maydo.provider_events (
         tenant_id, provider, provider_event_id, event_type, livemode, binding_id, payload, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'received')
       ON CONFLICT (tenant_id, provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [
        endpoint.tenant_id,
        provider,
        event.providerEventId,
        event.eventType,
        event.livemode,
        event.bindingId,
        rawBody.toString("utf8"),
      ],
    );
    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      await logHttp(pool, endpoint.tenant_id, provider, 200);
      return { status: 200, body: { status: "duplicate" } };
    }

    const plan = await buildPlan(client, endpoint.tenant_id, event);
    if (plan.kind === "ignore") {
      await client.query(
        `UPDATE maydo.provider_events SET status = 'ignored', note = $3
         WHERE tenant_id = $1 AND id = $2`,
        [endpoint.tenant_id, inserted.rows[0].id, plan.reason],
      );
      await client.query("COMMIT");
      await logHttp(pool, endpoint.tenant_id, provider, 200);
      return { status: 200, body: { status: "ignored", reason: plan.reason } };
    }
    if (plan.kind === "dead") {
      const setId = randomUUID();
      await client.query(
        `INSERT INTO maydo.dead_letters (
           tenant_id, expansion_set_id, provider, provider_event_id, adapter, reason, payload
         ) VALUES ($1, $2, $3, $4, 'unresolved', $5, $6::jsonb)`,
        [
          endpoint.tenant_id,
          setId,
          provider,
          event.providerEventId,
          plan.reason,
          JSON.stringify({ event_type: event.eventType, binding_id: event.bindingId, reason: plan.reason }),
        ],
      );
      await client.query(
        `UPDATE maydo.provider_events SET status = 'dead', note = $3 WHERE tenant_id = $1 AND id = $2`,
        [endpoint.tenant_id, inserted.rows[0].id, plan.reason],
      );
      await client.query("COMMIT");
      await logHttp(pool, endpoint.tenant_id, provider, 200);
      return { status: 200, body: { status: "dead", reason: plan.reason } };
    }

    const setId = randomUUID();
    for (const row of plan.rows) {
      const payload = {
        intent: plan.intent,
        actor: row.actor,
        action: row.action,
        source: provider,
        binding_id: plan.bindingId,
        source_event_id: event.providerEventId,
        event_ts: event.eventTs,
      };
      await client.query(
        `INSERT INTO maydo.outbox (
           tenant_id, expansion_set_id, provider, provider_event_id, adapter, idempotency_key, state, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::jsonb)`,
        [
          endpoint.tenant_id,
          setId,
          provider,
          event.providerEventId,
          plan.intent,
          idempotencyKey(provider, event.providerEventId, plan.intent, row.action, row.actor),
          JSON.stringify(payload),
        ],
      );
    }
    await client.query(
      `UPDATE maydo.provider_events SET status = 'outboxed' WHERE tenant_id = $1 AND id = $2`,
      [endpoint.tenant_id, inserted.rows[0].id],
    );
    await client.query("COMMIT");
    await logHttp(pool, endpoint.tenant_id, provider, 200);
    return { status: 200, body: { status: "ok" } };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("maydo ingest failed", error instanceof Error ? error.message : error);
    await logHttp(pool, endpoint.tenant_id, provider, 500);
    return { status: 500, body: { error: "ingest_failed" } };
  } finally {
    client.release();
  }
}

async function buildPlan(client: pg.PoolClient, tenantId: string, event: NormalizedEvent): Promise<Plan> {
  const mapping = await loadMapping(client, tenantId, event);
  const actorFromMap = event.customerId
    ? await loadActor(client, tenantId, event.provider, event.customerId)
    : null;
  const actionsFromProduct = event.productOrPriceId
    ? await loadProductActions(client, tenantId, event.provider, event.productOrPriceId)
    : [];
  const existing = event.bindingId
    ? await loadExisting(client, tenantId, event.provider, event.bindingId)
    : [];
  return planEvent(event, mapping, actorFromMap, actionsFromProduct, existing);
}

async function loadMapping(
  client: pg.PoolClient,
  tenantId: string,
  event: NormalizedEvent,
): Promise<MappingView | null> {
  const result = await client.query<{
    actions: string[];
    enabled: boolean;
    revoke_on_past_due: boolean;
    product_or_price_id: string | null;
  }>(
    `SELECT actions, enabled, revoke_on_past_due, product_or_price_id
     FROM maydo.mapping_config
     WHERE tenant_id = $1 AND provider = $2 AND event_type = $3
       AND (product_or_price_id IS NULL OR product_or_price_id = '' OR product_or_price_id = $4)`,
    [tenantId, event.provider, event.eventType, event.productOrPriceId],
  );
  const specific = result.rows.find((row) => row.product_or_price_id && row.product_or_price_id === event.productOrPriceId);
  const generic = result.rows.find((row) => !row.product_or_price_id);
  return specific ?? generic ?? null;
}

async function loadActor(
  client: pg.PoolClient,
  tenantId: string,
  provider: string,
  customerId: string,
): Promise<string | null> {
  const result = await client.query<{ actor: string }>(
    `SELECT actor FROM maydo.actor_maps
     WHERE tenant_id = $1 AND provider = $2 AND provider_customer_id = $3`,
    [tenantId, provider, customerId],
  );
  return result.rows[0]?.actor ?? null;
}

async function loadProductActions(
  client: pg.PoolClient,
  tenantId: string,
  provider: string,
  productId: string,
): Promise<string[]> {
  const result = await client.query<{ actions: string[] }>(
    `SELECT actions FROM maydo.product_action_maps
     WHERE tenant_id = $1 AND provider = $2 AND provider_price_or_product_id = $3`,
    [tenantId, provider, productId],
  );
  return result.rows[0]?.actions ?? [];
}

async function loadExisting(
  client: pg.PoolClient,
  tenantId: string,
  provider: string,
  bindingId: string,
): Promise<{ actor: string; action: string }[]> {
  const result = await client.query<{ actor: string; action: string }>(
    `SELECT actor, action FROM maydo.grants
     WHERE tenant_id = $1 AND source = $2 AND binding_id = $3`,
    [tenantId, provider, bindingId],
  );
  return result.rows;
}

async function resolveEndpoint(pool: pg.Pool, token: string): Promise<Endpoint | null> {
  const result = await pool.query<Endpoint>(`SELECT * FROM maydo.resolve_webhook($1)`, [token]);
  return result.rows[0] ?? null;
}

async function logHttp(pool: pg.Pool, tenantId: string, provider: string, status: number): Promise<void> {
  try {
    await pool.query(`SELECT maydo.log_webhook_http($1, $2, $3)`, [tenantId, provider, status]);
  } catch {
    /* health log must not change the webhook status contract */
  }
}

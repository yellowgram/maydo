import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  KEY_OVERLAP_HOURS,
  MAPPING_ACTION_CAP,
  hashApiKey,
  mintKey,
  scopesForPrefix,
  type KeyPrefix,
  type MappingSeedRow,
} from "../../core/src/index.js";

export async function listMappings(client: pg.PoolClient, tenantId: string) {
  const result = await client.query(
    `SELECT id, provider, event_type, actions, enabled, product_or_price_id, revoke_on_past_due, updated_at
     FROM maydo.mapping_config WHERE tenant_id = $1 ORDER BY provider, event_type`,
    [tenantId],
  );
  return result.rows;
}

export async function setMappingEnabled(client: pg.PoolClient, tenantId: string, id: string, enabled: boolean) {
  const result = await client.query(
    `UPDATE maydo.mapping_config SET enabled = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, provider, event_type, enabled`,
    [tenantId, id, enabled],
  );
  return result.rows[0] ?? null;
}

export async function setMappingActions(client: pg.PoolClient, tenantId: string, id: string, actions: string[]) {
  if (actions.length < 1 || actions.length > MAPPING_ACTION_CAP) {
    throw new Error(`actions must be between 1 and ${MAPPING_ACTION_CAP}`);
  }
  const result = await client.query(
    `UPDATE maydo.mapping_config SET actions = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, actions`,
    [tenantId, id, actions],
  );
  return result.rows[0] ?? null;
}

export async function seedMappings(client: pg.PoolClient, tenantId: string, rows: MappingSeedRow[]): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    if (row.actions.length > MAPPING_ACTION_CAP) {
      throw new Error(`seed actions exceed ${MAPPING_ACTION_CAP}`);
    }
    const result = await client.query(
      `INSERT INTO maydo.mapping_config (
         tenant_id, provider, event_type, actions, enabled, product_or_price_id, revoke_on_past_due
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, provider, event_type, COALESCE(product_or_price_id, '')) DO NOTHING`,
      [tenantId, row.provider, row.event_type, row.actions, row.enabled, row.product_or_price_id, row.revoke_on_past_due],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

export async function listEvents(client: pg.PoolClient, tenantId: string) {
  const result = await client.query(
    `SELECT id, provider, provider_event_id, event_type, livemode, status, note, binding_id, received_at
     FROM maydo.provider_events WHERE tenant_id = $1 ORDER BY received_at DESC LIMIT 100`,
    [tenantId],
  );
  return result.rows;
}

export async function webhookHealth(client: pg.PoolClient, tenantId: string) {
  const counts = await client.query(
    `SELECT
       count(*) FILTER (WHERE http_status BETWEEN 200 AND 299 AND created_at > now() - interval '1 hour')::int AS ok_1h,
       count(*) FILTER (WHERE http_status = 400 AND created_at > now() - interval '1 hour')::int AS bad_1h,
       count(*) FILTER (WHERE http_status >= 500 AND created_at > now() - interval '1 hour')::int AS err_1h,
       count(*) FILTER (WHERE http_status BETWEEN 200 AND 299 AND created_at > now() - interval '24 hours')::int AS ok_24h,
       count(*) FILTER (WHERE http_status = 400 AND created_at > now() - interval '24 hours')::int AS bad_24h,
       count(*) FILTER (WHERE http_status >= 500 AND created_at > now() - interval '24 hours')::int AS err_24h
     FROM maydo.webhook_http_log WHERE tenant_id = $1`,
    [tenantId],
  );
  const depth = await client.query(
    `SELECT
       count(*) FILTER (WHERE state IN ('pending', 'leased'))::int AS outbox_pending,
       count(*) FILTER (WHERE state = 'dead')::int AS outbox_dead
     FROM maydo.outbox WHERE tenant_id = $1`,
    [tenantId],
  );
  const letters = await client.query(
    `SELECT count(*)::int AS open FROM maydo.dead_letters WHERE tenant_id = $1 AND replayed_at IS NULL`,
    [tenantId],
  );
  const beat = await client.query(`SELECT id, beat_at FROM maydo.worker_heartbeat WHERE id = 'worker'`);
  const incomplete = await listIncompleteSets(client, tenantId);
  return {
    http: counts.rows[0],
    outbox: depth.rows[0],
    open_dead_letters: letters.rows[0]?.open ?? 0,
    worker_heartbeat: beat.rows[0] ?? null,
    incomplete_sets: incomplete,
  };
}

export async function listIncompleteSets(client: pg.PoolClient, tenantId: string) {
  const result = await client.query(
    `SELECT expansion_set_id,
            count(*)::int AS total,
            count(*) FILTER (WHERE state = 'done')::int AS done,
            count(*) FILTER (WHERE state = 'dead')::int AS dead,
            min(created_at) AS oldest
     FROM maydo.outbox
     WHERE tenant_id = $1
     GROUP BY expansion_set_id
     HAVING count(*) FILTER (WHERE state = 'done') < count(*)
         OR count(*) FILTER (WHERE state = 'dead') > 0
     ORDER BY min(created_at)`,
    [tenantId],
  );
  return result.rows;
}

export async function listDeadLetters(client: pg.PoolClient, tenantId: string) {
  const result = await client.query(
    `SELECT id, outbox_id, expansion_set_id, provider, provider_event_id, adapter, reason, payload, created_at, replayed_at
     FROM maydo.dead_letters WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [tenantId],
  );
  return result.rows;
}

export async function replayDryRun(client: pg.PoolClient, tenantId: string, id: string) {
  const letter = await client.query(
    `SELECT * FROM maydo.dead_letters WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  const row = letter.rows[0];
  if (!row) return null;
  let outbox = null;
  if (row.outbox_id) {
    const found = await client.query(`SELECT id, state, idempotency_key, payload FROM maydo.outbox WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      row.outbox_id,
    ]);
    outbox = found.rows[0] ?? null;
  }
  return {
    dead_letter: row,
    would_reopen_outbox: outbox,
    writes: false,
    note: row.outbox_id
      ? "execute reopens this outbox row only; drain applies the grant mutation; replay is not a refund"
      : "no outbox row — fix actor/action mapping and re-send the webhook; execute will refuse",
  };
}

export async function replayExecute(client: pg.PoolClient, tenantId: string, id: string) {
  const existing = await client.query<{ outbox_id: string | null; replayed_at: Date | null }>(
    `SELECT outbox_id, replayed_at FROM maydo.dead_letters WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  const letter = existing.rows[0];
  if (!letter || letter.replayed_at) throw new Error("dead letter missing or already replayed");
  if (!letter.outbox_id) throw new Error("dead letter has no outbox row to reopen");
  // One statement so a failed reopen cannot leave the letter marked replayed.
  // attempts resets so a max-attempt row can actually be tried again.
  const outbox = await client.query(
    `WITH target AS (
       SELECT id AS letter_id, outbox_id
       FROM maydo.dead_letters
       WHERE tenant_id = $1 AND id = $2 AND replayed_at IS NULL AND outbox_id IS NOT NULL
       FOR UPDATE
     ),
     reopened AS (
       UPDATE maydo.outbox o
       SET state = 'pending',
           attempts = 0,
           lease_until = NULL,
           next_attempt_at = now(),
           last_error = NULL,
           updated_at = now()
       FROM target
       WHERE o.tenant_id = $1 AND o.id = target.outbox_id AND o.state = 'dead'
       RETURNING o.id, o.state, o.idempotency_key, target.letter_id
     ),
     marked AS (
       UPDATE maydo.dead_letters dl
       SET replayed_at = now()
       FROM reopened
       WHERE dl.tenant_id = $1 AND dl.id = reopened.letter_id
       RETURNING dl.id
     )
     SELECT reopened.id, reopened.state, reopened.idempotency_key
     FROM reopened
     JOIN marked ON marked.id = reopened.letter_id`,
    [tenantId, id],
  );
  if ((outbox.rowCount ?? 0) === 0) throw new Error("outbox row was not dead");
  return outbox.rows[0];
}

export async function listKeys(client: pg.PoolClient, tenantId: string) {
  const result = await client.query(
    `SELECT id, prefix, scopes, ip_allowlist, expires_at, revoked_at, last_four, created_at
     FROM maydo.api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows;
}

export async function createKey(
  client: pg.PoolClient,
  tenantId: string,
  prefix: KeyPrefix,
  pepper: string,
  allowlist: string[],
) {
  const minted = mintKey(prefix);
  const result = await client.query(
    `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, ip_allowlist, last_four)
     VALUES ($1, $2, $3, $4, $5::cidr[], $6)
     RETURNING id, prefix, last_four, expires_at`,
    [tenantId, prefix, hashApiKey(minted.token, pepper), scopesForPrefix(prefix), allowlist, minted.lastFour],
  );
  return { token: minted.token, key: result.rows[0] };
}

export async function rotateKey(client: pg.PoolClient, tenantId: string, keyId: string, pepper: string) {
  const existing = await client.query<{ prefix: KeyPrefix; ip_allowlist: string[] }>(
    `UPDATE maydo.api_keys
     SET expires_at = LEAST(COALESCE(expires_at, now() + ($3::text || ' hours')::interval), now() + ($3::text || ' hours')::interval)
     WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL
     RETURNING prefix, ip_allowlist`,
    [tenantId, keyId, String(KEY_OVERLAP_HOURS)],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("key not found");
  const allowlist = Array.isArray(row.ip_allowlist) ? row.ip_allowlist.map(String) : [];
  return createKey(client, tenantId, row.prefix, pepper, allowlist);
}

export async function upsertActorMap(
  client: pg.PoolClient,
  tenantId: string,
  provider: "stripe" | "polar",
  customerId: string,
  actor: string,
) {
  await client.query(
    `INSERT INTO maydo.actor_maps (tenant_id, provider, provider_customer_id, actor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, provider, provider_customer_id)
     DO UPDATE SET actor = EXCLUDED.actor`,
    [tenantId, provider, customerId, actor],
  );
}

export async function upsertProductMap(
  client: pg.PoolClient,
  tenantId: string,
  provider: "stripe" | "polar",
  productId: string,
  actions: string[],
) {
  if (actions.length < 1 || actions.length > MAPPING_ACTION_CAP) {
    throw new Error(`actions must be between 1 and ${MAPPING_ACTION_CAP}`);
  }
  await client.query(
    `INSERT INTO maydo.product_action_maps (tenant_id, provider, provider_price_or_product_id, actions)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, provider, provider_price_or_product_id)
     DO UPDATE SET actions = EXCLUDED.actions`,
    [tenantId, provider, productId, actions],
  );
}

export type BootstrapResult = {
  tenant_id: string;
  decision_key: string;
  operator_key: string;
  stripe: { ingest_token: string; secret: string };
  polar: { ingest_token: string; secret: string };
};

/** Superuser/migrator only. Creates a tenant, decision key, operator key, and webhook endpoints. */
export async function bootstrapTenant(
  pool: pg.Pool,
  name: string,
  pepper: string,
): Promise<BootstrapResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query<{ id: string }>(
      `INSERT INTO maydo.tenants (name, status) VALUES ($1, 'active') RETURNING id`,
      [name],
    );
    const tenantId = tenant.rows[0].id;
    const decision = mintKey("md_test_");
    const operator = mintKey("md_op_");
    for (const [prefix, minted] of [
      ["md_test_", decision],
      ["md_op_", operator],
    ] as const) {
      await client.query(
        `INSERT INTO maydo.api_keys (tenant_id, prefix, key_hash, scopes, last_four)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, prefix, hashApiKey(minted.token, pepper), scopesForPrefix(prefix), minted.lastFour],
      );
    }
    const stripe = { ingest_token: randomUUID().replaceAll("-", ""), secret: `whsec_${randomUUID().replaceAll("-", "")}` };
    const polarSecretRaw = Buffer.from(randomUUID()).toString("base64url");
    const polar = {
      ingest_token: randomUUID().replaceAll("-", ""),
      secret: `whsec_${Buffer.from(polarSecretRaw).toString("base64")}`,
    };
    await client.query(
      `INSERT INTO maydo.webhook_endpoints (tenant_id, provider, ingest_token, secret, livemode)
       VALUES ($1, 'stripe', $2, $3, false), ($1, 'polar', $4, $5, false)`,
      [tenantId, stripe.ingest_token, stripe.secret, polar.ingest_token, polar.secret],
    );
    await client.query("COMMIT");
    return { tenant_id: tenantId, decision_key: decision.token, operator_key: operator.token, stripe, polar };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

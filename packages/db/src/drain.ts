import type pg from "pg";
import { OUTBOX_LEASE_SECONDS, OUTBOX_MAX_ATTEMPTS } from "../../core/src/index.js";
import { setTenant } from "./pool.js";

export type OutboxRow = {
  id: string;
  tenant_id: string;
  expansion_set_id: string;
  provider: string;
  provider_event_id: string;
  adapter: string;
  idempotency_key: string;
  state: string;
  attempts: number;
  payload: OutboxPayload;
};

export type OutboxPayload = {
  intent?: "grant" | "revoke";
  actor?: string;
  action?: string;
  source?: "stripe" | "polar";
  binding_id?: string;
  source_event_id?: string;
  event_ts?: string | null;
  reason?: string;
};

/**
 * Claim one outbox row. When tenantId is omitted the caller must be the worker
 * role (global queue). The tenant GUC is set from the row before any mutation.
 */
export async function drainOnce(pool: pg.Pool, opts: { tenantId?: string } = {}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (opts.tenantId) await setTenant(client, opts.tenantId);
    const claimed = await claimRow(client, opts.tenantId);
    if (!claimed) {
      await client.query("COMMIT");
      return false;
    }
    await setTenant(client, claimed.tenant_id);
    const leased = await client.query<{ attempts: number }>(
      `UPDATE maydo.outbox
       SET state = 'leased',
           attempts = attempts + 1,
           lease_until = now() + ($3::text || ' seconds')::interval,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING attempts`,
      [claimed.id, claimed.tenant_id, String(OUTBOX_LEASE_SECONDS)],
    );
    const attempts = leased.rows[0]?.attempts ?? claimed.attempts + 1;
    await client.query("SAVEPOINT apply_outbox");
    try {
      const applied = await applyPayload(client, claimed.tenant_id, claimed.payload);
      const skipNote = applied.skippedOperatorLock ? "skipped: operator_lock" : null;
      await client.query(
        `UPDATE maydo.outbox
         SET state = 'done', lease_until = NULL, last_error = $3, updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [claimed.id, claimed.tenant_id, skipNote],
      );
      if (skipNote) await noteOperatorLockSkip(client, claimed);
      await markEventProcessed(client, claimed);
      await client.query("RELEASE SAVEPOINT apply_outbox");
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT apply_outbox");
      const message = error instanceof Error ? error.message : "apply failed";
      const poison = message.startsWith("poison:");
      if (poison || attempts >= OUTBOX_MAX_ATTEMPTS) {
        await deadLetter(client, claimed, poison ? message.slice("poison:".length) : "max_attempts", message);
      } else {
        const delay = Math.min(3600, 2 ** attempts);
        await client.query(
          `UPDATE maydo.outbox
           SET state = 'pending',
               lease_until = NULL,
               next_attempt_at = now() + ($3::text || ' seconds')::interval,
               last_error = $4,
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [claimed.id, claimed.tenant_id, String(delay), message],
        );
      }
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

async function claimRow(client: pg.PoolClient, tenantId?: string): Promise<OutboxRow | null> {
  const params: unknown[] = [];
  let tenantClause = "";
  if (tenantId) {
    params.push(tenantId);
    tenantClause = `AND tenant_id = $${params.length}`;
  }
  const result = await client.query<OutboxRow>(
    `SELECT id, tenant_id, expansion_set_id, provider, provider_event_id, adapter,
            idempotency_key, state, attempts, payload
     FROM maydo.outbox
     WHERE (
       (state = 'pending' AND next_attempt_at <= now())
       OR (state = 'leased' AND lease_until IS NOT NULL AND lease_until < now())
     )
     ${tenantClause}
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    params,
  );
  return result.rows[0] ?? null;
}

/**
 * A stored timestamp wins over an older one and over a missing one.
 * Two missing timestamps stay last-write-wins (known limit).
 * On an equal timestamp, a grant does not revive a revoke. A revoke still applies.
 */
const STORED_WINS_GRANT = `grants.source_event_ts IS NOT NULL AND (EXCLUDED.source_event_ts IS NULL OR grants.source_event_ts >= EXCLUDED.source_event_ts)`;
const STORED_WINS_REVOKE = `grants.source_event_ts IS NOT NULL AND (EXCLUDED.source_event_ts IS NULL OR grants.source_event_ts > EXCLUDED.source_event_ts)`;

export type ApplyResult = { skippedOperatorLock: boolean };

export async function applyPayload(
  client: pg.PoolClient,
  tenantId: string,
  payload: OutboxPayload,
): Promise<ApplyResult> {
  if (payload.intent !== "grant" && payload.intent !== "revoke") {
    throw new Error("poison:missing intent");
  }
  if (!payload.actor || !payload.action || !payload.binding_id || !payload.source) {
    throw new Error("poison:incomplete payload");
  }
  if (payload.intent === "grant") {
    const skippedOperatorLock = await upsertAllow(client, tenantId, payload);
    return { skippedOperatorLock };
  }
  await upsertRevoke(client, tenantId, payload);
  await suppressNonStickyLocal(client, tenantId, payload);
  return { skippedOperatorLock: false };
}

/** True when the row exists and operator_lock refused the grant. Not a dead letter. */
async function upsertAllow(client: pg.PoolClient, tenantId: string, payload: OutboxPayload): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO maydo.grants (
       tenant_id, actor, action, source, binding_id, state, precedence_class,
       sticky, source_event_id, source_event_ts, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'active', 'allow', false, $6, $7, now())
     ON CONFLICT (tenant_id, actor, action, source, binding_id)
     DO UPDATE SET
       state = CASE WHEN ${STORED_WINS_GRANT} THEN grants.state ELSE 'active' END,
       precedence_class = CASE WHEN ${STORED_WINS_GRANT} THEN grants.precedence_class ELSE 'allow' END,
       revoked_at = CASE WHEN ${STORED_WINS_GRANT} THEN grants.revoked_at ELSE NULL END,
       source_event_id = CASE WHEN ${STORED_WINS_GRANT} THEN grants.source_event_id ELSE EXCLUDED.source_event_id END,
       source_event_ts = CASE WHEN ${STORED_WINS_GRANT} THEN grants.source_event_ts ELSE EXCLUDED.source_event_ts END,
       updated_at = now()
     WHERE grants.tenant_id = $1
       AND grants.operator_lock = false
     RETURNING id`,
    [tenantId, payload.actor, payload.action, payload.source, payload.binding_id, payload.source_event_id ?? null, payload.event_ts ?? null],
  );
  return (result.rowCount ?? 0) === 0;
}

async function upsertRevoke(client: pg.PoolClient, tenantId: string, payload: OutboxPayload): Promise<void> {
  await client.query(
    `INSERT INTO maydo.grants (
       tenant_id, actor, action, source, binding_id, state, precedence_class,
       sticky, revoked_at, source_event_id, source_event_ts, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'revoked', 'deny', false, now(), $6, $7, now())
     ON CONFLICT (tenant_id, actor, action, source, binding_id)
     DO UPDATE SET
       state = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.state ELSE 'revoked' END,
       precedence_class = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.precedence_class ELSE 'deny' END,
       revoked_at = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.revoked_at ELSE now() END,
       sticky = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.sticky ELSE false END,
       source_event_id = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.source_event_id ELSE EXCLUDED.source_event_id END,
       source_event_ts = CASE WHEN ${STORED_WINS_REVOKE} THEN grants.source_event_ts ELSE EXCLUDED.source_event_ts END,
       updated_at = now()
     WHERE grants.tenant_id = $1
       AND NOT (grants.source = 'local' AND grants.sticky = true AND grants.state = 'active'
                AND grants.expires_at IS NOT NULL AND grants.expires_at > now())`,
    [tenantId, payload.actor, payload.action, payload.source, payload.binding_id, payload.source_event_id ?? null, payload.event_ts ?? null],
  );
}

async function suppressNonStickyLocal(client: pg.PoolClient, tenantId: string, payload: OutboxPayload): Promise<void> {
  await client.query(
    `UPDATE maydo.grants
     SET state = 'revoked',
         revoked_at = now(),
         precedence_class = 'allow',
         source_event_id = $4,
         source_event_ts = $5,
         updated_at = now()
     WHERE tenant_id = $1 AND actor = $2 AND action = $3
       AND source = 'local' AND sticky = false AND state = 'active' AND precedence_class = 'allow'`,
    [tenantId, payload.actor, payload.action, payload.source_event_id ?? null, payload.event_ts ?? null],
  );
}

async function noteOperatorLockSkip(client: pg.PoolClient, row: OutboxRow): Promise<void> {
  await client.query(
    `UPDATE maydo.provider_events
     SET note = CASE
       WHEN note IS NULL OR note = '' THEN 'skipped: operator_lock'
       WHEN strpos(note, 'skipped: operator_lock') > 0 THEN note
       ELSE note || '; skipped: operator_lock'
     END
     WHERE tenant_id = $1 AND provider = $2 AND provider_event_id = $3`,
    [row.tenant_id, row.provider, row.provider_event_id],
  );
}

async function deadLetter(client: pg.PoolClient, row: OutboxRow, reason: string, detail: string): Promise<void> {
  await client.query(
    `INSERT INTO maydo.dead_letters (
       tenant_id, outbox_id, expansion_set_id, provider, provider_event_id, adapter, reason, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      row.tenant_id,
      row.id,
      row.expansion_set_id,
      row.provider,
      row.provider_event_id,
      row.adapter,
      reason,
      JSON.stringify({ ...row.payload, detail }),
    ],
  );
  await client.query(
    `UPDATE maydo.outbox SET state = 'dead', lease_until = NULL, last_error = $3, updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [row.id, row.tenant_id, detail],
  );
}

async function markEventProcessed(client: pg.PoolClient, row: OutboxRow): Promise<void> {
  await client.query(
    `UPDATE maydo.provider_events
     SET status = 'processed'
     WHERE tenant_id = $1 AND provider = $2 AND provider_event_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM maydo.outbox o
         WHERE o.tenant_id = $1 AND o.provider = $2 AND o.provider_event_id = $3 AND o.state <> 'done'
       )`,
    [row.tenant_id, row.provider, row.provider_event_id],
  );
}

export async function outboxDepth(client: pg.PoolClient, tenantId: string): Promise<{ pending: number; dead: number }> {
  const result = await client.query<{ pending: string; dead: string }>(
    `SELECT
       count(*) FILTER (WHERE state IN ('pending', 'leased'))::text AS pending,
       count(*) FILTER (WHERE state = 'dead')::text AS dead
     FROM maydo.outbox
     WHERE tenant_id = $1`,
    [tenantId],
  );
  return { pending: Number(result.rows[0]?.pending ?? 0), dead: Number(result.rows[0]?.dead ?? 0) };
}

import type pg from "pg";
import { AUDIT_RETENTION_DAYS, shouldEnqueueAudit } from "../../core/src/index.js";
import { setTenant } from "./pool.js";

export async function pendingAuditDepth(client: pg.PoolClient, tenantId: string): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM maydo.audit_queue WHERE tenant_id = $1 AND state = 'pending'`,
    [tenantId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function enqueueAudit(
  client: pg.PoolClient,
  row: {
    tenantId: string;
    actor: string;
    action: string;
    decision: "allow" | "deny";
    reason: string;
    grantIds: string[];
    latencyBucket: string;
    depth: number;
    threshold: number;
    randomUnit: number;
  },
): Promise<boolean> {
  if (!shouldEnqueueAudit(row.decision, row.depth, row.threshold, row.randomUnit)) return false;
  await client.query(
    `INSERT INTO maydo.audit_queue (
       tenant_id, actor, action, decision, reason, grant_ids, latency_bucket
     ) VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7)`,
    [row.tenantId, row.actor, row.action, row.decision, row.reason, row.grantIds, row.latencyBucket],
  );
  return true;
}

export async function drainAuditBatch(pool: pg.Pool, limit = 100): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query<{
      id: string;
      tenant_id: string;
      actor: string;
      action: string;
      decision: string;
      reason: string;
      grant_ids: string[];
      latency_bucket: string;
    }>(
      `SELECT id, tenant_id, actor, action, decision, reason, grant_ids, latency_bucket
       FROM maydo.audit_queue
       WHERE state = 'pending'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [limit],
    );
    for (const row of rows.rows) {
      await setTenant(client, row.tenant_id);
      await client.query(
        `INSERT INTO maydo.allow_audit (tenant_id, actor, action, decision, reason, grant_ids, latency_bucket)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7)`,
        [row.tenant_id, row.actor, row.action, row.decision, row.reason, row.grant_ids ?? [], row.latency_bucket],
      );
      await client.query(
        `UPDATE maydo.audit_queue SET state = 'done' WHERE id = $1 AND tenant_id = $2`,
        [row.id, row.tenant_id],
      );
    }
    await client.query("COMMIT");
    return rows.rowCount ?? 0;
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

export async function purgeAudit(pool: pg.Pool, days = AUDIT_RETENTION_DAYS): Promise<number> {
  const result = await pool.query<{ purge_allow_audit: string }>(`SELECT maydo.purge_allow_audit($1)`, [days]);
  return Number(result.rows[0]?.purge_allow_audit ?? 0);
}

export async function searchAudit(
  client: pg.PoolClient,
  tenantId: string,
  filter: { actor?: string; action?: string; denyOnly?: boolean; since?: Date; until?: Date },
): Promise<Record<string, unknown>[]> {
  const clauses = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (filter.actor) {
    params.push(filter.actor);
    clauses.push(`actor = $${params.length}`);
  }
  if (filter.action) {
    params.push(filter.action);
    clauses.push(`action = $${params.length}`);
  }
  if (filter.denyOnly) clauses.push(`decision = 'deny'`);
  if (filter.since) {
    params.push(filter.since);
    clauses.push(`ts >= $${params.length}`);
  }
  if (filter.until) {
    params.push(filter.until);
    clauses.push(`ts <= $${params.length}`);
  }
  const result = await client.query(
    `SELECT id, ts, actor, action, decision, reason, grant_ids, latency_bucket
     FROM maydo.allow_audit
     WHERE ${clauses.join(" AND ")}
     ORDER BY ts DESC
     LIMIT 500`,
    params,
  );
  return result.rows;
}

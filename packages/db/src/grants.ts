import type pg from "pg";
import { STICKY_MAX_DAYS } from "../../core/src/index.js";
import type { GrantView } from "../../core/src/evaluate.js";

export class GrantWriteError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export type GrantRow = {
  id: string;
  tenant_id: string;
  actor: string;
  action: string;
  source: "stripe" | "polar" | "local";
  binding_id: string;
  state: "active" | "revoked" | "expired";
  precedence_class: "allow" | "deny";
  sticky: boolean;
  expires_at: Date | null;
  revoked_at: Date | null;
  source_event_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const GRANT_COLUMNS = `id, tenant_id, actor, action, source, binding_id, state, precedence_class,
  sticky, expires_at, revoked_at, source_event_id, note, created_by, created_at, updated_at`;

export async function listGrantsForAllow(
  client: pg.PoolClient,
  tenantId: string,
  actor: string,
  action: string,
): Promise<GrantView[]> {
  const result = await client.query<GrantView>(
    `SELECT id, source, state, precedence_class, sticky, expires_at
     FROM maydo.grants
     WHERE tenant_id = $1 AND actor = $2 AND action = $3`,
    [tenantId, actor, action],
  );
  return result.rows;
}

export async function listGrants(
  client: pg.PoolClient,
  tenantId: string,
  filter: { actor?: string; action?: string; bindingId?: string; q?: string },
): Promise<GrantRow[]> {
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
  if (filter.bindingId) {
    params.push(filter.bindingId);
    clauses.push(`binding_id = $${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    clauses.push(
      `(actor ILIKE $${params.length} OR action ILIKE $${params.length} OR binding_id ILIKE $${params.length} OR COALESCE(note, '') ILIKE $${params.length})`,
    );
  }
  const result = await client.query<GrantRow>(
    `SELECT ${GRANT_COLUMNS} FROM maydo.grants WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 200`,
    params,
  );
  return result.rows;
}

export async function getGrant(client: pg.PoolClient, tenantId: string, id: string): Promise<GrantRow | null> {
  const result = await client.query<GrantRow>(
    `SELECT ${GRANT_COLUMNS} FROM maydo.grants WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return result.rows[0] ?? null;
}

export async function createLocalGrant(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    actor: string;
    action: string;
    bindingId: string;
    sticky: boolean;
    expiresAt: Date | null;
    note: string | null;
    createdBy: string | null;
    now?: Date;
  },
): Promise<GrantRow> {
  const now = input.now ?? new Date();
  if (!input.actor || !input.action) throw new GrantWriteError("invalid", "actor and action are required");
  if (input.sticky && !input.expiresAt) {
    throw new GrantWriteError("sticky_expires_required", "sticky grants require expires_at");
  }
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw new GrantWriteError("expires_in_past", "expires_at must be in the future");
  }
  if (input.sticky && input.expiresAt) {
    const max = now.getTime() + STICKY_MAX_DAYS * 24 * 60 * 60 * 1000;
    if (input.expiresAt.getTime() > max) {
      throw new GrantWriteError("sticky_horizon", `sticky expires_at must be within ${STICKY_MAX_DAYS} days`);
    }
  }
  await client.query(
    `UPDATE maydo.grants
     SET precedence_class = 'allow', updated_at = now()
     WHERE tenant_id = $1 AND actor = $2 AND action = $3 AND source = 'local' AND precedence_class = 'deny'`,
    [input.tenantId, input.actor, input.action],
  );
  const inserted = await client.query<GrantRow>(
    `INSERT INTO maydo.grants (
       tenant_id, actor, action, source, binding_id, state, precedence_class,
       sticky, expires_at, note, created_by
     ) VALUES ($1, $2, $3, 'local', $4, 'active', 'allow', $5, $6, $7, $8)
     RETURNING ${GRANT_COLUMNS}`,
    [
      input.tenantId,
      input.actor,
      input.action,
      input.bindingId,
      input.sticky,
      input.expiresAt,
      input.note,
      input.createdBy,
    ],
  );
  await client.query(
    `INSERT INTO maydo.operator_audit (tenant_id, action, grant_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.tenantId, input.sticky ? "grant.sticky_create" : "grant.create", inserted.rows[0].id, input.note, input.createdBy],
  );
  return inserted.rows[0];
}

export async function revokeGrant(
  client: pg.PoolClient,
  tenantId: string,
  grantId: string,
  createdBy: string | null,
): Promise<GrantRow | null> {
  const result = await client.query<GrantRow>(
    `UPDATE maydo.grants
     SET state = 'revoked',
         precedence_class = 'deny',
         sticky = false,
         revoked_at = now(),
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING ${GRANT_COLUMNS}`,
    [tenantId, grantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  await client.query(
    `INSERT INTO maydo.operator_audit (tenant_id, action, grant_id, note, created_by)
     VALUES ($1, 'grant.revoke', $2, $3, $4)`,
    [tenantId, row.id, row.note, createdBy],
  );
  return row;
}

export async function countActiveSticky(client: pg.PoolClient, tenantId: string): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM maydo.grants
     WHERE tenant_id = $1 AND sticky = true AND state = 'active'
       AND expires_at IS NOT NULL AND expires_at > now()`,
    [tenantId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function listSticky(client: pg.PoolClient, tenantId: string): Promise<GrantRow[]> {
  const result = await client.query<GrantRow>(
    `SELECT ${GRANT_COLUMNS} FROM maydo.grants
     WHERE tenant_id = $1 AND sticky = true
     ORDER BY expires_at ASC`,
    [tenantId],
  );
  return result.rows;
}

export async function listOrphanCandidates(client: pg.PoolClient, tenantId: string): Promise<GrantRow[]> {
  const result = await client.query<GrantRow>(
    `SELECT ${GRANT_COLUMNS} FROM maydo.grants g
     WHERE g.tenant_id = $1
       AND g.source IN ('stripe', 'polar')
       AND g.state = 'active'
       AND g.updated_at < now() - interval '45 days'
       AND NOT EXISTS (
         SELECT 1 FROM maydo.provider_events e
         WHERE e.tenant_id = g.tenant_id
           AND e.binding_id = g.binding_id
           AND e.received_at > now() - interval '45 days'
       )
     ORDER BY g.updated_at ASC
     LIMIT 200`,
    [tenantId],
  );
  return result.rows;
}

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type pg from "pg";
import {
  DEFAULT_AUDIT_DEGRADE_DEPTH,
  evaluateGrants,
  hashApiKey,
  ipAllowed,
  keyPrefix,
  latencyBucket,
  parsePgTextArray,
  TokenBucket,
  unavailableDecision,
} from "../../../packages/core/src/index.js";
import { enqueueAudit, ingestPolar, ingestStripe, listGrantsForAllow, pendingAuditDepth, withTenant } from "../../../packages/db/src/index.js";

export type ApiOptions = {
  pool: pg.Pool;
  pepper: string;
  auditDegradeDepth?: number;
  ratePerMin?: number;
};

export function createApiServer(opts: ApiOptions): Server {
  const threshold = opts.auditDegradeDepth ?? DEFAULT_AUDIT_DEGRADE_DEPTH;
  const bucket = new TokenBucket(opts.ratePerMin ?? 600, 60_000);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/healthz") {
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/readyz") {
        try {
          await opts.pool.query("SELECT 1");
          return send(res, 200, { ok: true });
        } catch {
          return send(res, 503, { ok: false });
        }
      }
      if (req.method === "POST" && url.pathname === "/v1/allow") {
        return handleAllow(req, res, opts, threshold, bucket);
      }
      const stripe = url.pathname.match(/^\/v1\/webhooks\/stripe\/([^/]+)$/);
      if (req.method === "POST" && stripe) {
        const raw = await readBody(req);
        const result = await ingestStripe(opts.pool, decodeURIComponent(stripe[1]), raw, header(req, "stripe-signature"));
        return send(res, result.status, result.body);
      }
      const polar = url.pathname.match(/^\/v1\/webhooks\/polar\/([^/]+)$/);
      if (req.method === "POST" && polar) {
        const raw = await readBody(req);
        const result = await ingestPolar(opts.pool, decodeURIComponent(polar[1]), raw, {
          id: header(req, "webhook-id"),
          timestamp: header(req, "webhook-timestamp"),
          signature: header(req, "webhook-signature"),
        });
        return send(res, result.status, result.body);
      }
      send(res, 404, { error: "not_found" });
    } catch {
      send(res, 500, { error: "internal" });
    }
  });
}

async function handleAllow(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ApiOptions,
  threshold: number,
  bucket: TokenBucket,
): Promise<void> {
  const evaluatedAt = new Date();
  const token = bearer(req);
  if (!token || keyPrefix(token) !== "md_live_" && keyPrefix(token) !== "md_test_") {
    return send(res, 401, { allow: false, reason: "auth_failed", grant_ids: [], evaluated_at: evaluatedAt.toISOString() });
  }
  let body: { actor?: unknown; action?: unknown };
  try {
    body = JSON.parse((await readBody(req)).toString("utf8")) as { actor?: unknown; action?: unknown };
  } catch {
    return send(res, 400, { error: "bad_request" });
  }
  if (typeof body.actor !== "string" || typeof body.action !== "string" || !body.actor || !body.action) {
    return send(res, 400, { error: "bad_request" });
  }
  const started = Date.now();
  try {
    const auth = await opts.pool.query<{
      key_id: string;
      tenant_id: string;
      prefix: string;
      ip_allowlist: unknown;
      expires_at: Date | null;
      revoked_at: Date | null;
      tenant_status: string;
    }>(`SELECT * FROM maydo.authenticate_key($1)`, [hashApiKey(token, opts.pepper)]);
    const key = auth.rows[0];
    if (!key || key.revoked_at || (key.expires_at && key.expires_at.getTime() <= Date.now())) {
      return send(res, 401, { allow: false, reason: "auth_failed", grant_ids: [], evaluated_at: evaluatedAt.toISOString() });
    }
    if (key.prefix === "md_op_") {
      return send(res, 401, { allow: false, reason: "auth_failed", grant_ids: [], evaluated_at: evaluatedAt.toISOString() });
    }
    const allowlist = parsePgTextArray(key.ip_allowlist);
    if (!ipAllowed(clientIp(req), allowlist)) {
      return send(res, 401, { allow: false, reason: "auth_failed", grant_ids: [], evaluated_at: evaluatedAt.toISOString() });
    }
    if (!bucket.allow(key.key_id, Date.now())) {
      return send(res, 429, unavailableDecision());
    }
    if (key.tenant_status !== "active") {
      const decision = {
        allow: false as const,
        reason: "tenant_disabled" as const,
        grant_ids: [] as string[],
        evaluated_at: evaluatedAt.toISOString(),
      };
      await withTenant(opts.pool, key.tenant_id, async (client) => {
        const depth = await pendingAuditDepth(client, key.tenant_id);
        await enqueueAudit(client, {
          tenantId: key.tenant_id,
          actor: body.actor as string,
          action: body.action as string,
          decision: "deny",
          reason: "tenant_disabled",
          grantIds: [],
          latencyBucket: latencyBucket(Date.now() - started),
          depth,
          threshold,
          randomUnit: Math.random(),
        });
      }).catch(() => undefined);
      return send(res, 200, decision);
    }

    const decision = await withTenant(opts.pool, key.tenant_id, async (client) => {
      const grants = await listGrantsForAllow(client, key.tenant_id, body.actor as string, body.action as string);
      const evaluated = evaluateGrants(grants, evaluatedAt);
      const depth = await pendingAuditDepth(client, key.tenant_id);
      try {
        await enqueueAudit(client, {
          tenantId: key.tenant_id,
          actor: body.actor as string,
          action: body.action as string,
          decision: evaluated.allow ? "allow" : "deny",
          reason: evaluated.reason,
          grantIds: evaluated.grant_ids,
          latencyBucket: latencyBucket(Date.now() - started),
          depth,
          threshold,
          randomUnit: Math.random(),
        });
      } catch (error) {
        console.error("audit enqueue failed", error instanceof Error ? error.message : error);
      }
      return {
        allow: evaluated.allow,
        reason: evaluated.reason,
        grant_ids: evaluated.grant_ids,
        evaluated_at: evaluatedAt.toISOString(),
      };
    });
    send(res, 200, decision);
  } catch (error) {
    console.error("allow failed closed", error instanceof Error ? error.message : error);
    send(res, 503, unavailableDecision());
  }
}

function bearer(req: IncomingMessage): string | null {
  const value = header(req, "authorization");
  if (!value?.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim();
}

function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.socket.remoteAddress;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, resolve));
}

/** Read-mostly console. Replay execute is intentionally not a route. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type pg from "pg";
import {
  assertSessionSecret,
  clientIpFromRequest,
  hashApiKey,
  ipAllowed,
  keyPrefix,
  parsePgTextArray,
  STICKY_WARN_COUNT,
} from "../../../packages/core/src/index.js";
import {
  listDeadLetters,
  listEvents,
  listGrants,
  listIncompleteSets,
  listMappings,
  listOrphanCandidates,
  listSticky,
  searchAudit,
  setMappingEnabled,
  webhookHealth,
  withTenant,
} from "../../../packages/db/src/index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConsoleOptions = {
  pool: pg.Pool;
  pepper: string;
  sessionSecret: string;
  trustProxy?: boolean;
  statusUrl?: string;
  production?: boolean;
  allowInsecureDevSecrets?: boolean;
};

type Session = { tenantId: string; keyId: string };

export function createConsoleServer(opts: ConsoleOptions): Server {
  assertSessionSecret(opts.sessionSecret, {
    production: opts.production ?? false,
    allowInsecureDevSecrets: opts.allowInsecureDevSecrets ?? false,
  });
  const trustProxy = opts.trustProxy ?? false;
  const statusUrl = opts.statusUrl ?? "https://status.yellowgram.dev/maydo";
  const secureCookie = Boolean(opts.production);

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/") return sendHtml(res, loginPage());
      if (req.method === "POST" && url.pathname === "/login") return login(req, res, opts, trustProxy);
      if (req.method === "POST" && url.pathname === "/logout") {
        res.writeHead(302, { location: "/", "set-cookie": sessionCookie("", 0, secureCookie) });
        res.end();
        return;
      }
      if (req.method === "POST" && (url.pathname === "/replay" || url.pathname.startsWith("/replay/"))) {
        return sendHtml(res, layout("Replay", "<p>Replay execute is CLI-only.</p>", statusUrl), 404);
      }
      const session = await requireOperator(req, res, opts, trustProxy);
      if (!session) return;
      if (req.method === "GET" && url.pathname === "/grants") {
        const rows = await withTenant(opts.pool, session.tenantId, (client) =>
          listGrants(client, session.tenantId, { q: url.searchParams.get("q") ?? undefined }),
        );
        return sendHtml(
          res,
          layout(
            "Grants",
            table(rows as Record<string, unknown>[], [
              "actor",
              "action",
              "source",
              "state",
              "sticky",
              "binding_id",
              "expires_at",
              "source_event_id",
              "note",
            ]),
            statusUrl,
          ),
        );
      }
      if (req.method === "GET" && url.pathname === "/webhooks") {
        const [events, health] = await withTenant(opts.pool, session.tenantId, async (client) => {
          return [await listEvents(client, session.tenantId), await webhookHealth(client, session.tenantId)] as const;
        });
        const skipped = Number(health.outbox?.skipped_operator_lock ?? 0);
        const banner = [
          health.incomplete_sets.length
            ? `<p class="banner">incomplete expansion set — check siblings before assuming the product is fully entitled</p>`
            : "",
          skipped > 0
            ? `<p class="banner">skipped, operator lock — a paid event did not restore access (${skipped})</p>`
            : "",
        ].join("");
        return sendHtml(
          res,
          layout("Webhooks", `${banner}<pre>${esc(JSON.stringify(health, null, 2))}</pre>${table(events as Record<string, unknown>[])}`, statusUrl),
        );
      }
      if (req.method === "GET" && url.pathname === "/replay") {
        const rows = await withTenant(opts.pool, session.tenantId, (client) => listDeadLetters(client, session.tenantId));
        const note = `<p>Replay execute is CLI-only: <code>maydo replay dry-run &lt;id&gt;</code> then <code>maydo replay execute &lt;id&gt;</code>. Replay is not a refund.</p>`;
        return sendHtml(
          res,
          layout("Replay", note + table(rows as Record<string, unknown>[], ["id", "reason", "adapter", "provider_event_id", "replayed_at", "created_at"]), statusUrl),
        );
      }
      if (req.method === "GET" && url.pathname === "/audit") {
        const rows = await withTenant(opts.pool, session.tenantId, (client) =>
          searchAudit(client, session.tenantId, {
            actor: url.searchParams.get("actor") ?? undefined,
            action: url.searchParams.get("action") ?? undefined,
            denyOnly: url.searchParams.get("deny") === "1",
          }),
        );
        return sendHtml(res, layout("Allow audit", table(rows), statusUrl));
      }
      if (req.method === "GET" && url.pathname === "/mapping") {
        const [rows, incomplete] = await withTenant(opts.pool, session.tenantId, async (client) => {
          return [await listMappings(client, session.tenantId), await listIncompleteSets(client, session.tenantId)] as const;
        });
        const forms = (rows as { id: string; enabled: boolean }[])
          .map(
            (row) => `<form method="post" action="/mapping/toggle">
            <input type="hidden" name="id" value="${esc(row.id)}"/>
            <button type="submit">${row.enabled ? "Disable" : "Enable"}</button>
          </form>`,
          )
          .join("");
        return sendHtml(
          res,
          layout(
            "Mapping",
            `<p>Toggles only. Action lists are edited with the CLI.</p>${incomplete.length ? `<p class="banner">incomplete expansion set</p>` : ""}${table(rows as Record<string, unknown>[])}${forms}`,
            statusUrl,
          ),
        );
      }
      if (req.method === "POST" && url.pathname === "/mapping/toggle") {
        const form = parseForm(await readBody(req));
        const id = form.get("id");
        if (!id) return sendHtml(res, layout("Mapping", "<p>missing id</p>", statusUrl), 400);
        await withTenant(opts.pool, session.tenantId, async (client) => {
          const rows = await listMappings(client, session.tenantId);
          const current = (rows as { id: string; enabled: boolean }[]).find((row) => row.id === id);
          if (!current) return;
          await setMappingEnabled(client, session.tenantId, id, !current.enabled);
        });
        res.writeHead(302, { location: "/mapping" });
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/sticky") {
        const rows = await withTenant(opts.pool, session.tenantId, (client) => listSticky(client, session.tenantId));
        const active = (rows as { state: string; expires_at: string | Date | null }[]).filter(
          (row) => row.state === "active" && row.expires_at && new Date(row.expires_at) > new Date(),
        );
        const banner = active.length > STICKY_WARN_COUNT ? `<p class="banner">warning: ${active.length} active sticky grants</p>` : "";
        return sendHtml(res, layout("Sticky", banner + table(rows as Record<string, unknown>[]), statusUrl));
      }
      if (req.method === "GET" && url.pathname === "/orphans") {
        const rows = await withTenant(opts.pool, session.tenantId, (client) => listOrphanCandidates(client, session.tenantId));
        return sendHtml(
          res,
          layout("Orphan candidates", `<p>Candidates, not truth. MayDo does not auto-revoke.</p>${table(rows as Record<string, unknown>[])}`, statusUrl),
        );
      }
      sendHtml(res, layout("Not found", "<p>Unknown page.</p>", statusUrl), 404);
    } catch (error) {
      sendHtml(res, layout("Error", `<p>${esc(error instanceof Error ? error.message : "error")}</p>`, statusUrl), 500);
    }
  });
}

async function login(req: IncomingMessage, res: ServerResponse, opts: ConsoleOptions, trustProxy: boolean): Promise<void> {
  const form = parseForm(await readBody(req));
  const token = form.get("api_key") ?? "";
  if (keyPrefix(token) !== "md_op_") {
    sendHtml(res, loginPage("Operator keys (md_op_) only."), 401);
    return;
  }
  const auth = await opts.pool.query<{
    tenant_id: string;
    key_id: string;
    prefix: string;
    ip_allowlist: unknown;
    revoked_at: Date | null;
    expires_at: Date | null;
  }>(
    `SELECT tenant_id, key_id, prefix, ip_allowlist, revoked_at, expires_at FROM maydo.authenticate_key($1)`,
    [hashApiKey(token, opts.pepper)],
  );
  const key = auth.rows[0];
  const ip = clientIpFromRequest({
    socketIp: req.socket.remoteAddress,
    forwardedFor: header(req, "x-forwarded-for"),
    trustProxy,
  });
  if (
    !key ||
    key.prefix !== "md_op_" ||
    key.revoked_at ||
    (key.expires_at && key.expires_at.getTime() <= Date.now()) ||
    !ipAllowed(ip, parsePgTextArray(key.ip_allowlist))
  ) {
    sendHtml(res, loginPage("Key rejected."), 401);
    return;
  }
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const cookie = signSession(`${key.tenant_id}|${exp}|${key.key_id}`, opts.sessionSecret);
  res.writeHead(302, {
    location: "/grants",
    "set-cookie": sessionCookie(cookie, 12 * 60 * 60, Boolean(opts.production)),
  });
  res.end();
}

async function requireOperator(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ConsoleOptions,
  trustProxy: boolean,
): Promise<Session | null> {
  const session = readSession(req, opts.sessionSecret);
  if (!session) {
    res.writeHead(302, { location: "/" });
    res.end();
    return null;
  }
  const key = await withTenant(opts.pool, session.tenantId, async (client) => {
    const result = await client.query<{
      prefix: string;
      ip_allowlist: unknown;
      expires_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT prefix, ip_allowlist, expires_at, revoked_at
       FROM maydo.api_keys WHERE tenant_id = $1 AND id = $2`,
      [session.tenantId, session.keyId],
    );
    return result.rows[0] ?? null;
  });
  const ip = clientIpFromRequest({
    socketIp: req.socket.remoteAddress,
    forwardedFor: header(req, "x-forwarded-for"),
    trustProxy,
  });
  const expired = Boolean(key?.expires_at && key.expires_at.getTime() <= Date.now());
  if (!key || key.revoked_at || expired || key.prefix !== "md_op_" || !ipAllowed(ip, parsePgTextArray(key?.ip_allowlist))) {
    res.writeHead(401, {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": sessionCookie("", 0, Boolean(opts.production)),
    });
    res.end(loginPage("Operator session rejected."));
    return null;
  }
  return session;
}

function readSession(req: IncomingMessage, secret: string): Session | null {
  const raw = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("maydo_session="));
  if (!raw) return null;
  const token = raw.slice("maydo_session=".length);
  const payload = verifySession(token, secret);
  if (!payload) return null;
  const [tenantId, exp, keyId] = payload.split("|");
  if (!tenantId || !keyId || !UUID_RE.test(tenantId) || !UUID_RE.test(keyId)) return null;
  if (Number(exp) < Date.now()) return null;
  return { tenantId, keyId };
}

function signSession(payload: string, secret: string): string {
  const body = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token: string, secret: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}

function sessionCookie(value: string, maxAge = 12 * 60 * 60, secure = false): string {
  const secureAttr = secure ? "; Secure" : "";
  return `maydo_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureAttr}`;
}

function loginPage(error?: string): string {
  return layout(
    "Sign in",
    `${error ? `<p class="banner">${esc(error)}</p>` : ""}
    <form method="post" action="/login">
      <label>Operator key <input name="api_key" type="password" autocomplete="off" required /></label>
      <button type="submit">Sign in</button>
    </form>
    <p>Decision keys cannot sign in. Replay execute is not available here.</p>`,
  );
}

function layout(title: string, body: string, statusUrl = "https://status.yellowgram.dev/maydo"): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${esc(title)} — MayDo</title>
<style>
body{font:15px/1.4 ui-sans-serif,system-ui,sans-serif;margin:24px;color:#1c1917;background:#fafaf9}
a{color:#9a3412} table{border-collapse:collapse;width:100%;background:#fff}
th,td{border:1px solid #e7e5e4;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f5f5f4} .banner{background:#fee2e2;border:1px solid #dc2626;padding:8px}
nav a{margin-right:12px} tr.sticky td{background:#fee2e2}
code{font-family:ui-monospace,monospace}
</style></head><body>
<nav><strong>MayDo</strong>
<a href="/grants">Grants</a><a href="/webhooks">Webhooks</a><a href="/replay">Replay</a>
<a href="/audit">Audit</a><a href="/mapping">Mapping</a><a href="/sticky">Sticky</a><a href="/orphans">Orphans</a>
<form method="post" action="/logout" style="display:inline"><button type="submit">Sign out</button></form>
</nav>
<h1>${esc(title)}</h1>
${body}
<footer><p>Status: <a href="${esc(statusUrl)}">${esc(statusUrl)}</a>. Polar listing is dark. No invoicing.</p></footer>
</body></html>`;
}

function table(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "<p>None.</p>";
  const cols = columns ?? Object.keys(rows[0]);
  const head = cols.map((col) => `<th>${esc(col)}</th>`).join("");
  const body = rows
    .map((row) => {
      const sticky = row.sticky === true ? " class=\"sticky\"" : "";
      const cells = cols.map((col) => `<td>${esc(format(row[col]))}</td>`).join("");
      return `<tr${sticky}>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseForm(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    map.set(decodeURIComponent(k), decodeURIComponent(v.replaceAll("+", " ")));
  }
  return map;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

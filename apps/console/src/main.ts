import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hashApiKey, keyPrefix, STICKY_WARN_COUNT } from "../../../packages/core/src/index.js";
import {
  listDeadLetters,
  listEvents,
  listGrants,
  listIncompleteSets,
  listMappings,
  listOrphanCandidates,
  listSticky,
  makePool,
  searchAudit,
  setMappingEnabled,
  webhookHealth,
  withTenant,
} from "../../../packages/db/src/index.js";
import { CONSOLE_ROUTES } from "./routes.js";

export { CONSOLE_ROUTES };

const port = Number(process.env.CONSOLE_PORT ?? 3041);
const databaseUrl = process.env.DATABASE_URL_API ?? process.env.DATABASE_URL;
const pepper = process.env.MAYDO_KEY_PEPPER ?? "dev-pepper-change-me";
const sessionSecret = process.env.MAYDO_SESSION_SECRET ?? "dev-session-change-me";
const statusUrl = process.env.MAYDO_STATUS_URL ?? "https://status.yellowgram.dev/maydo";

if (!databaseUrl) {
  console.error("DATABASE_URL_API is required");
  process.exit(1);
}

const pool = makePool(databaseUrl, "maydo-console");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/") return sendHtml(res, loginPage());
    if (req.method === "POST" && url.pathname === "/login") return login(req, res);
    if (req.method === "POST" && url.pathname === "/logout") {
      res.writeHead(302, { location: "/", "set-cookie": "maydo_session=; HttpOnly; Path=/; Max-Age=0" });
      res.end();
      return;
    }
    const session = readSession(req);
    if (!session) {
      res.writeHead(302, { location: "/" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/grants") {
      const rows = await withTenant(pool, session.tenantId, (client) =>
        listGrants(client, session.tenantId, { q: url.searchParams.get("q") ?? undefined }),
      );
      return sendHtml(res, layout("Grants", table(rows as Record<string, unknown>[], ["actor", "action", "source", "state", "sticky", "binding_id", "expires_at", "source_event_id", "note"])));
    }
    if (req.method === "GET" && url.pathname === "/webhooks") {
      const [events, health] = await withTenant(pool, session.tenantId, async (client) => {
        return [await listEvents(client, session.tenantId), await webhookHealth(client, session.tenantId)] as const;
      });
      const banner = health.incomplete_sets.length
        ? `<p class="banner">incomplete expansion set — check siblings before assuming the product is fully entitled</p>`
        : "";
      return sendHtml(res, layout("Webhooks", `${banner}<pre>${esc(JSON.stringify(health, null, 2))}</pre>${table(events as Record<string, unknown>[])}`));
    }
    if (req.method === "GET" && url.pathname === "/replay") {
      const rows = await withTenant(pool, session.tenantId, (client) => listDeadLetters(client, session.tenantId));
      const note = `<p>Replay execute is CLI-only: <code>maydo replay dry-run &lt;id&gt;</code> then <code>maydo replay execute &lt;id&gt;</code>. Replay is not a refund.</p>`;
      return sendHtml(res, layout("Replay", note + table(rows as Record<string, unknown>[], ["id", "reason", "adapter", "provider_event_id", "replayed_at", "created_at"])));
    }
    if (req.method === "GET" && url.pathname === "/audit") {
      const rows = await withTenant(pool, session.tenantId, (client) =>
        searchAudit(client, session.tenantId, {
          actor: url.searchParams.get("actor") ?? undefined,
          action: url.searchParams.get("action") ?? undefined,
          denyOnly: url.searchParams.get("deny") === "1",
        }),
      );
      return sendHtml(res, layout("Allow audit", table(rows)));
    }
    if (req.method === "GET" && url.pathname === "/mapping") {
      const [rows, incomplete] = await withTenant(pool, session.tenantId, async (client) => {
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
      return sendHtml(res, layout("Mapping", `<p>Toggles only. Action lists are edited with the CLI.</p>${incomplete.length ? `<p class="banner">incomplete expansion set</p>` : ""}${table(rows as Record<string, unknown>[])}${forms}`));
    }
    if (req.method === "POST" && url.pathname === "/mapping/toggle") {
      const form = parseForm(await readBody(req));
      const id = form.get("id");
      if (!id) return sendHtml(res, layout("Mapping", "<p>missing id</p>"), 400);
      await withTenant(pool, session.tenantId, async (client) => {
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
      const rows = await withTenant(pool, session.tenantId, (client) => listSticky(client, session.tenantId));
      const active = (rows as { state: string; expires_at: string | Date | null }[]).filter((row) => row.state === "active" && row.expires_at && new Date(row.expires_at) > new Date());
      const banner = active.length > STICKY_WARN_COUNT ? `<p class="banner">warning: ${active.length} active sticky grants</p>` : "";
      return sendHtml(res, layout("Sticky", banner + table(rows as Record<string, unknown>[])));
    }
    if (req.method === "GET" && url.pathname === "/orphans") {
      const rows = await withTenant(pool, session.tenantId, (client) => listOrphanCandidates(client, session.tenantId));
      return sendHtml(res, layout("Orphan candidates", `<p>Candidates, not truth. MayDo does not auto-revoke.</p>${table(rows as Record<string, unknown>[])}`));
    }
    sendHtml(res, layout("Not found", "<p>Unknown page.</p>"), 404);
  } catch (error) {
    sendHtml(res, layout("Error", `<p>${esc(error instanceof Error ? error.message : "error")}</p>`), 500);
  }
});

server.listen(port, () => {
  console.log(`maydo console listening on :${port}`);
});

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const form = parseForm(await readBody(req));
  const token = form.get("api_key") ?? "";
  if (keyPrefix(token) !== "md_op_") {
    sendHtml(res, loginPage("Operator keys (md_op_) only."), 401);
    return;
  }
  const auth = await pool.query<{ tenant_id: string; key_id: string; revoked_at: Date | null; expires_at: Date | null }>(
    `SELECT tenant_id, key_id, revoked_at, expires_at FROM maydo.authenticate_key($1)`,
    [hashApiKey(token, pepper)],
  );
  const key = auth.rows[0];
  if (!key || key.revoked_at || (key.expires_at && key.expires_at.getTime() <= Date.now())) {
    sendHtml(res, loginPage("Key rejected."), 401);
    return;
  }
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const cookie = signSession(`${key.tenant_id}|${exp}|${key.key_id}`);
  res.writeHead(302, {
    location: "/grants",
    "set-cookie": `maydo_session=${cookie}; HttpOnly; SameSite=Lax; Path=/`,
  });
  res.end();
}

function readSession(req: IncomingMessage): { tenantId: string } | null {
  const raw = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("maydo_session="));
  if (!raw) return null;
  const token = raw.slice("maydo_session=".length);
  const payload = verifySession(token);
  if (!payload) return null;
  const [tenantId, exp] = payload.split("|");
  if (!tenantId || Number(exp) < Date.now()) return null;
  return { tenantId };
}

function signSession(payload: string): string {
  const body = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", sessionSecret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
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

function layout(title: string, body: string): string {
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
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

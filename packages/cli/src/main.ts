#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  allowInsecureDevSecrets,
  assertKeyPepper,
  DEFAULT_PUBLIC_STATUS_URL,
  DEV_KEY_PEPPER,
  isProductionRuntime,
  STICKY_WARN_COUNT,
  parseMappingSeed,
  type KeyPrefix,
} from "../../../packages/core/src/index.js";
import {
  assertRuntimeRole,
  bootstrapTenant,
  countActiveSticky,
  createKey,
  createLocalGrant,
  drainOnce,
  getGrant,
  GrantWriteError,
  listDeadLetters,
  listEvents,
  listGrants,
  listKeys,
  listMappings,
  revokeGrant,
  listOrphanCandidates,
  listSticky,
  makePool,
  outboxDepth,
  replayDryRun,
  replayExecute,
  rotateKey,
  searchAudit,
  seedMappings,
  setMappingActions,
  setMappingEnabled,
  webhookHealth,
  withTenant,
} from "../../../packages/db/src/index.js";

type Flags = Record<string, string | boolean>;

const argv = parseArgs(process.argv.slice(2));
const [group, action, ...rest] = argv.positional;

try {
  await main(group, action, rest, argv.flags);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

async function main(group: string | undefined, action: string | undefined, rest: string[], flags: Flags): Promise<void> {
  if (!group || group === "help" || flags.help) {
    console.log(usage());
    return;
  }
  if (group === "admin" && action === "bootstrap") {
    const name = stringFlag(flags, "name") ?? "MayDo";
    const pool = makePool(requiredEnv("DATABASE_URL"), "maydo-cli-bootstrap");
    try {
      const result = await bootstrapTenant(pool, name, pepper());
      console.log(JSON.stringify(result, null, 2));
      console.error("Save these secrets now. They are not shown again.");
    } finally {
      await pool.end();
    }
    return;
  }
  if (group === "status") {
    const url = process.env.MAYDO_STATUS_URL ?? DEFAULT_PUBLIC_STATUS_URL;
    const base = process.env.API_BASE_URL;
    let health: unknown = null;
    if (base) {
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}/healthz`);
        health = { status: response.status, body: await response.json() };
      } catch (error) {
        health = { error: error instanceof Error ? error.message : "unreachable" };
      }
    }
    console.log(JSON.stringify({ status_url: url, local: health }, null, 2));
    return;
  }

  const tenantId = requiredEnv("MAYDO_TENANT_ID");
  const databaseUrl =
    group === "outbox" && action === "drain" && process.env.DATABASE_URL_WORKER
      ? process.env.DATABASE_URL_WORKER
      : (process.env.DATABASE_URL_API ?? requiredEnv("DATABASE_URL"));
  const pool = makePool(databaseUrl, "maydo-cli");
  try {
    await assertRuntimeRole(pool);
    if (group === "outbox" && action === "drain") {
      if (flags["all-tenants"]) {
        if (!process.env.DATABASE_URL_WORKER) {
          throw new Error("outbox drain --all-tenants requires DATABASE_URL_WORKER");
        }
        console.error("warning: draining every tenant outbox; this applies other tenants' pending grants and revokes");
        const drained = await drainOnce(pool, {});
        console.log(JSON.stringify({ drained, tenant: "all" }));
        return;
      }
      const drained = await drainOnce(pool, { tenantId });
      console.log(JSON.stringify({ drained, tenant_id: tenantId }));
      return;
    }
    await withTenant(pool, tenantId, async (client) => {
      if (group === "grants" && action === "list") {
        console.log(JSON.stringify(await listGrants(client, tenantId, {
          actor: stringFlag(flags, "actor"),
          action: stringFlag(flags, "action"),
          q: stringFlag(flags, "q"),
        }), null, 2));
        return;
      }
      if (group === "grants" && action === "get") {
        console.log(JSON.stringify(await getGrant(client, tenantId, requiredPos(rest, 0, "grant id")), null, 2));
        return;
      }
      if (group === "grants" && action === "create") {
        const sticky = Boolean(flags.sticky);
        const expires = stringFlag(flags, "expires");
        try {
          const row = await createLocalGrant(client, {
            tenantId,
            actor: requiredFlag(flags, "actor"),
            action: requiredFlag(flags, "action"),
            bindingId: stringFlag(flags, "binding") ?? `local_${randomUUID()}`,
            sticky,
            expiresAt: expires ? new Date(expires) : null,
            note: stringFlag(flags, "note") ?? null,
            createdBy: stringFlag(flags, "by") ?? process.env.MAYDO_OPERATOR ?? "cli",
          });
          const stickyCount = await countActiveSticky(client, tenantId);
          if (stickyCount > STICKY_WARN_COUNT) {
            console.error(`warning: active sticky grants (${stickyCount}) exceed ${STICKY_WARN_COUNT}`);
          }
          console.log(JSON.stringify(row, null, 2));
        } catch (error) {
          if (error instanceof GrantWriteError) throw new Error(`${error.code}: ${error.message}`);
          throw error;
        }
        return;
      }
      if (group === "grants" && action === "revoke") {
        const row = await revokeGrant(
          client,
          tenantId,
          requiredPos(rest, 0, "grant id"),
          stringFlag(flags, "by") ?? process.env.MAYDO_OPERATOR ?? "cli",
        );
        if (!row) throw new Error("grant not found");
        console.log(JSON.stringify(row, null, 2));
        return;
      }
      if (group === "grants" && (action === "sticky:report" || action === "sticky-report")) {
        const rows = await listSticky(client, tenantId);
        const active = rows.filter((row) => row.state === "active" && row.expires_at && row.expires_at > new Date());
        if (active.length > STICKY_WARN_COUNT) {
          console.error(`warning: active sticky grants (${active.length}) exceed ${STICKY_WARN_COUNT}`);
        }
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (group === "grants" && (action === "orphan-candidates" || action === "orphans")) {
        console.error("candidates, not truth — MayDo does not auto-revoke");
        console.log(JSON.stringify(await listOrphanCandidates(client, tenantId), null, 2));
        return;
      }
      if (group === "mapping" && action === "list") {
        console.log(JSON.stringify(await listMappings(client, tenantId), null, 2));
        return;
      }
      if (group === "mapping" && (action === "enable" || action === "disable")) {
        const row = await setMappingEnabled(client, tenantId, requiredPos(rest, 0, "mapping id"), action === "enable");
        console.log(JSON.stringify(row, null, 2));
        return;
      }
      if (group === "mapping" && action === "set-actions") {
        const actions = requiredFlag(flags, "actions").split(",").map((item) => item.trim()).filter(Boolean);
        console.log(JSON.stringify(await setMappingActions(client, tenantId, requiredPos(rest, 0, "mapping id"), actions), null, 2));
        return;
      }
      if (group === "mapping" && action === "seed") {
        const file = stringFlag(flags, "file") ?? "config/mapping.seed.yaml";
        const rows = parseMappingSeed(readFileSync(file, "utf8"));
        console.log(JSON.stringify({ inserted: await seedMappings(client, tenantId, rows) }));
        return;
      }
      if (group === "webhooks" && action === "events") {
        console.log(JSON.stringify(await listEvents(client, tenantId), null, 2));
        return;
      }
      if (group === "webhooks" && action === "health") {
        const health = await webhookHealth(client, tenantId);
        if (health.incomplete_sets.length > 0) console.error("incomplete expansion set");
        const skipped = Number(health.outbox?.skipped_operator_lock ?? 0);
        if (skipped > 0) console.error("skipped, operator lock — a paid event did not restore access");
        console.log(JSON.stringify(health, null, 2));
        return;
      }
      if (group === "replay" && action === "list") {
        console.log(JSON.stringify(await listDeadLetters(client, tenantId), null, 2));
        return;
      }
      if (group === "replay" && action === "dry-run") {
        console.log(JSON.stringify(await replayDryRun(client, tenantId, requiredPos(rest, 0, "dead letter id")), null, 2));
        return;
      }
      if (group === "replay" && action === "execute") {
        console.error("replay reopens one outbox row; it does not call the adapter and it is not a refund");
        console.log(JSON.stringify(await replayExecute(client, tenantId, requiredPos(rest, 0, "dead letter id")), null, 2));
        return;
      }
      if (group === "outbox" && action === "depth") {
        console.log(JSON.stringify(await outboxDepth(client, tenantId)));
        return;
      }
      if (group === "audit" && (action === "search" || action === "export")) {
        const rows = await searchAudit(client, tenantId, {
          actor: stringFlag(flags, "actor"),
          action: stringFlag(flags, "action"),
          denyOnly: Boolean(flags["deny-only"]),
          since: stringFlag(flags, "since") ? new Date(stringFlag(flags, "since")!) : undefined,
          until: stringFlag(flags, "until") ? new Date(stringFlag(flags, "until")!) : undefined,
        });
        if (action === "export" && flags.format === "csv") {
          console.log(toCsv(rows));
          return;
        }
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (group === "keys" && action === "list") {
        console.log(JSON.stringify(await listKeys(client, tenantId), null, 2));
        return;
      }
      if (group === "keys" && action === "create") {
        const prefix = prefixFromFlags(flags);
        const allowlist = stringFlag(flags, "allowlist")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
        if (prefix === "md_op_" && allowlist.length === 0) {
          console.error("warning: md_op_ key created with an empty IP allowlist");
        }
        const created = await createKey(client, tenantId, prefix, pepper(), allowlist);
        console.log(JSON.stringify({ token: created.token, ...created.key }, null, 2));
        console.error("Save this key now. It is not shown again.");
        return;
      }
      if (group === "keys" && action === "rotate") {
        const rotated = await rotateKey(client, tenantId, requiredPos(rest, 0, "key id"), pepper());
        console.log(JSON.stringify({ token: rotated.token, ...rotated.key }, null, 2));
        return;
      }
      throw new Error(`unknown command ${group} ${action ?? ""}`.trim());
    });
  } finally {
    await pool.end();
  }
}

function prefixFromFlags(flags: Flags): KeyPrefix {
  if (flags.op || flags.prefix === "md_op_") return "md_op_";
  if (flags.live || flags.prefix === "md_live_") return "md_live_";
  if (flags.test || flags.prefix === "md_test_" || !flags.prefix) return "md_test_";
  throw new Error("prefix must be md_live_, md_test_, or md_op_");
}

function usage(): string {
  return `maydo — entitlement kernel operator CLI

  grants list|get|create|revoke|sticky:report|orphan-candidates
  mapping list|enable|disable|set-actions|seed
  webhooks events|health
  replay list|dry-run|execute
  outbox drain --once [--all-tenants] | outbox depth
  audit search|export
  keys create|rotate|list
  status
  admin bootstrap --name <tenant>

Replay execute reopens one dead-lettered outbox row. It does not move money.
The web console cannot execute replay.`;
}

function parseArgs(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function requiredFlag(flags: Flags, name: string): string {
  const value = stringFlag(flags, name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function requiredPos(rest: string[], index: number, label: string): string {
  const value = rest[index];
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function pepper(): string {
  const value = process.env.MAYDO_KEY_PEPPER ?? DEV_KEY_PEPPER;
  assertKeyPepper(value, {
    production: isProductionRuntime(),
    allowInsecureDevSecrets: allowInsecureDevSecrets(),
  });
  return value;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => JSON.stringify(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

import { SDK_CACHE_TTL_MAX_MS } from "./reasons.js";

export const ALLOW_REASONS = [
  "grant_active",
  "explicit_revoke",
  "expired",
  "no_grant",
  "tenant_disabled",
  "auth_failed",
  "maydo_unavailable",
] as const;

export type AllowReason = (typeof ALLOW_REASONS)[number];

export type AllowResult = {
  allow: boolean;
  reason: AllowReason;
  grant_ids: string[];
  evaluated_at: string;
};

export type MaydoClient = {
  allow(input: { actor: string; action: string; bypassCache?: boolean }): Promise<AllowResult>;
};

export type CreateClientOptions = {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  cache?: { ttlMs: number };
};

/**
 * Decision client. Cache is off unless `cache.ttlMs` is set (hard cap 5000).
 * `md_op_` keys are refused — this package has no operator methods.
 */
export function createClient(options: CreateClientOptions): MaydoClient {
  if (options.apiKey.startsWith("md_op_") || (!options.apiKey.startsWith("md_live_") && !options.apiKey.startsWith("md_test_"))) {
    throw new Error("MayDo SDK accepts only md_live_ or md_test_ decision keys");
  }
  if (options.cache && (options.cache.ttlMs <= 0 || options.cache.ttlMs > SDK_CACHE_TTL_MAX_MS)) {
    throw new Error(`cache.ttlMs must be between 1 and ${SDK_CACHE_TTL_MAX_MS}`);
  }
  const timeoutMs = options.timeoutMs ?? 3000;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const cache = new Map<string, { expires: number; value: AllowResult }>();

  return {
    async allow(input) {
      const key = `${input.actor}\u0000${input.action}`;
      const now = Date.now();
      if (options.cache && !input.bypassCache) {
        const hit = cache.get(key);
        if (hit && hit.expires > now) return hit.value;
      }
      const result = await requestAllow(baseUrl, options.apiKey, timeoutMs, input.actor, input.action);
      if (options.cache) cache.set(key, { expires: now + options.cache.ttlMs, value: result });
      return result;
    },
  };
}

async function requestAllow(
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
  actor: string,
  action: string,
): Promise<AllowResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/v1/allow`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ actor, action }),
      signal: controller.signal,
    });
    if (response.status >= 500 || response.status === 429) return unavailable();
    const body = (await response.json().catch(() => null)) as Partial<AllowResult> | null;
    if (body && body.allow === false && isReason(body.reason)) {
      return {
        allow: false,
        reason: body.reason,
        grant_ids: Array.isArray(body.grant_ids) ? body.grant_ids : [],
        evaluated_at: typeof body.evaluated_at === "string" ? body.evaluated_at : new Date().toISOString(),
      };
    }
    if (response.ok && body && typeof body.allow === "boolean" && isReason(body.reason)) {
      return {
        allow: body.allow,
        reason: body.reason,
        grant_ids: Array.isArray(body.grant_ids) ? body.grant_ids : [],
        evaluated_at: typeof body.evaluated_at === "string" ? body.evaluated_at : new Date().toISOString(),
      };
    }
    return unavailable();
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(): AllowResult {
  return {
    allow: false,
    reason: "maydo_unavailable",
    grant_ids: [],
    evaluated_at: new Date().toISOString(),
  };
}

function isReason(value: unknown): value is AllowReason {
  return typeof value === "string" && (ALLOW_REASONS as readonly string[]).includes(value);
}

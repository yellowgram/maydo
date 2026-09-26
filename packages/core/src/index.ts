export * from "./constants.js";
export * from "./evaluate.js";
export * from "./keys.js";
export * from "./signatures.js";
export * from "./net.js";
export * from "./seed.js";

export function idempotencyKey(
  provider: string,
  providerEventId: string,
  intent: "grant" | "revoke",
  action: string,
): string {
  return `${provider}|${providerEventId}|${intent}:${action}`;
}

export function unavailableDecision(now = new Date()): {
  allow: false;
  reason: "maydo_unavailable";
  grant_ids: [];
  evaluated_at: string;
} {
  return {
    allow: false,
    reason: "maydo_unavailable",
    grant_ids: [],
    evaluated_at: now.toISOString(),
  };
}

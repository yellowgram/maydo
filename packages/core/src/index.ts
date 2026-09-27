export * from "./constants.js";
export * from "./evaluate.js";
export * from "./keys.js";
export * from "./signatures.js";
export * from "./net.js";
export * from "./seed.js";
export * from "./secrets.js";

/**
 * One outbox row per actor+action. Actor is part of the key so two actors
 * sharing an action do not collide and roll the ingest transaction back.
 * Components are percent-encoded so a `|` inside metadata cannot merge rows.
 */
export function idempotencyKey(
  provider: string,
  providerEventId: string,
  intent: "grant" | "revoke",
  action: string,
  actor: string,
): string {
  return `${provider}|${encodeURIComponent(providerEventId)}|${intent}:${encodeURIComponent(action)}|${encodeURIComponent(actor)}`;
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

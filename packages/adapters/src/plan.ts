import { ACTION_MAX_LEN, ACTOR_MAX_LEN, MAPPING_ACTION_CAP } from "../../core/src/index.js";
import { polarDisposition, stripeDisposition, type Disposition } from "./eventMap.js";
import type { NormalizedEvent } from "./normalize.js";

export type MappingView = {
  actions: string[];
  enabled: boolean;
  revoke_on_past_due: boolean;
};

export type ExistingGrantRef = { actor: string; action: string };

export type Plan =
  | { kind: "ignore"; reason: string }
  | {
      kind: "dead";
      reason:
        | "actor_unresolved"
        | "action_unresolved"
        | "action_cap_exceeded"
        | "binding_unresolved"
        | "actor_metadata_mismatch"
        | "field_too_long";
    }
  | {
      kind: "expand";
      intent: "grant" | "revoke";
      bindingId: string;
      rows: { actor: string; action: string }[];
      /** Operator-visible note. Does not change the grant rows. */
      note?: string;
    };

/**
 * Expand one verified provider event into N grant/revoke intents.
 * Refunds are all-or-nothing: partially_refunded still revokes every action
 * on the binding plus every resolved action. No quantity math.
 */
export function planEvent(
  event: NormalizedEvent,
  mapping: MappingView | null,
  actorFromMap: string | null,
  actionsFromProduct: string[],
  existing: ExistingGrantRef[],
): Plan {
  let disposition: Disposition =
    event.provider === "stripe"
      ? stripeDisposition(event.eventType, event.status)
      : polarDisposition(event.eventType, { revokeOnPastDue: false });

  if (
    event.provider === "polar" &&
    event.eventType === "subscription.past_due" &&
    mapping?.enabled &&
    mapping.revoke_on_past_due
  ) {
    disposition = "revoke";
  }

  if (mapping && mapping.enabled === false) {
    return { kind: "ignore", reason: "mapping_disabled" };
  }
  if (disposition === "noop") {
    return { kind: "ignore", reason: "unmapped_or_noop" };
  }

  if (overLong(event.actorFromMetadata) || overLong(actorFromMap)) {
    return { kind: "dead", reason: "field_too_long" };
  }
  // Operator actor map is the fallback, not a silent override. A Checkout
  // metadata actor that disagrees with the map is the buyer's metadata swap.
  // Grants fail closed. Revokes still clear stored rows for the mapped actor
  // so a spoofed refund actor cannot keep the paid grants active.
  const metadataMismatch = Boolean(
    event.actorFromMetadata && actorFromMap && event.actorFromMetadata !== actorFromMap,
  );
  if (metadataMismatch && disposition === "grant") {
    return { kind: "dead", reason: "actor_metadata_mismatch" };
  }

  const actor = metadataMismatch ? actorFromMap : (event.actorFromMetadata ?? actorFromMap);
  const mappedActions = mapping?.enabled ? mapping.actions : [];
  const resolvedActions =
    event.actionsFromMetadata.length > 0
      ? event.actionsFromMetadata
      : actionsFromProduct.length > 0
        ? actionsFromProduct
        : mappedActions;

  if (resolvedActions.some((action) => action.length > ACTION_MAX_LEN)) {
    return { kind: "dead", reason: "field_too_long" };
  }
  if (!event.bindingId) return { kind: "dead", reason: "binding_unresolved" };

  if (disposition === "revoke") {
    const rows = revokeRows(existing, actor, resolvedActions);
    if (rows.length === 0) {
      return { kind: "dead", reason: actor ? "action_unresolved" : "actor_unresolved" };
    }
    // The cap limits new fan-out. It must not drop a refund of grants we already stored.
    if (rows.length > MAPPING_ACTION_CAP && existing.length === 0) {
      return { kind: "dead", reason: "action_cap_exceeded" };
    }
    return {
      kind: "expand",
      intent: "revoke",
      bindingId: event.bindingId,
      rows,
      note: metadataMismatch ? "actor_metadata_mismatch" : undefined,
    };
  }

  if (!actor) return { kind: "dead", reason: "actor_unresolved" };
  if (actor.length > ACTOR_MAX_LEN) return { kind: "dead", reason: "field_too_long" };
  const actions = [...new Set(resolvedActions)];
  if (actions.length === 0) return { kind: "dead", reason: "action_unresolved" };
  if (actions.length > MAPPING_ACTION_CAP) return { kind: "dead", reason: "action_cap_exceeded" };
  return {
    kind: "expand",
    intent: "grant",
    bindingId: event.bindingId,
    rows: actions.map((action) => ({ actor, action })),
  };
}

function overLong(value: string | null): boolean {
  return Boolean(value && value.length > ACTOR_MAX_LEN);
}

/**
 * Existing grant rows are always revoked, even when that exceeds the mapping cap.
 * Extra action names from metadata fill only the remaining room under the cap.
 */
function revokeRows(
  existing: ExistingGrantRef[],
  revokeActor: string | null,
  resolvedActions: string[],
): { actor: string; action: string }[] {
  const pairs = new Map<string, { actor: string; action: string }>();
  for (const row of existing) {
    pairs.set(pairKey(row.actor, row.action), row);
  }
  const actor = revokeActor ?? actorFromUnique(existing);
  const extras: { actor: string; action: string }[] = [];
  const extraKeys = new Set<string>();
  if (actor) {
    for (const action of resolvedActions) {
      const key = pairKey(actor, action);
      if (pairs.has(key) || extraKeys.has(key)) continue;
      extraKeys.add(key);
      extras.push({ actor, action });
    }
  }
  const stored = [...pairs.values()];
  if (stored.length === 0) return extras;
  if (stored.length >= MAPPING_ACTION_CAP) return stored;
  const room = MAPPING_ACTION_CAP - stored.length;
  return stored.concat(extras.slice(0, room));
}

function pairKey(actor: string, action: string): string {
  return `${actor}\u0000${action}`;
}

function actorFromUnique(existing: ExistingGrantRef[]): string | null {
  const actors = new Set(existing.map((row) => row.actor));
  if (actors.size === 1) return existing[0]?.actor ?? null;
  return null;
}

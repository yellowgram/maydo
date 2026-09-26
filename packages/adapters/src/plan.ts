import { MAPPING_ACTION_CAP } from "../../core/src/index.js";
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
      reason: "actor_unresolved" | "action_unresolved" | "action_cap_exceeded" | "binding_unresolved";
    }
  | {
      kind: "expand";
      intent: "grant" | "revoke";
      bindingId: string;
      rows: { actor: string; action: string }[];
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

  const actor = event.actorFromMetadata ?? actorFromMap;
  const mappedActions = mapping?.enabled ? mapping.actions : [];
  const resolvedActions =
    event.actionsFromMetadata.length > 0
      ? event.actionsFromMetadata
      : actionsFromProduct.length > 0
        ? actionsFromProduct
        : mappedActions;

  if (!event.bindingId) return { kind: "dead", reason: "binding_unresolved" };

  if (disposition === "revoke") {
    const pairs = new Map<string, { actor: string; action: string }>();
    for (const row of existing) {
      pairs.set(`${row.actor}\u0000${row.action}`, row);
    }
    const revokeActor = actor ?? (existing.length === 1 ? existing[0].actor : actorFromUnique(existing));
    if (revokeActor) {
      for (const action of resolvedActions) {
        pairs.set(`${revokeActor}\u0000${action}`, { actor: revokeActor, action });
      }
    }
    if (pairs.size === 0) {
      return { kind: "dead", reason: actor ? "action_unresolved" : "actor_unresolved" };
    }
    const rows = [...pairs.values()];
    if (rows.length > MAPPING_ACTION_CAP) return { kind: "dead", reason: "action_cap_exceeded" };
    return { kind: "expand", intent: "revoke", bindingId: event.bindingId, rows };
  }

  if (!actor) return { kind: "dead", reason: "actor_unresolved" };
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

function actorFromUnique(existing: ExistingGrantRef[]): string | null {
  const actors = new Set(existing.map((row) => row.actor));
  if (actors.size === 1) return existing[0]?.actor ?? null;
  return null;
}

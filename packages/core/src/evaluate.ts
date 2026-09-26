import type { AllowReason } from "./constants.js";

export type GrantSource = "stripe" | "polar" | "local";
export type GrantState = "active" | "revoked" | "expired";
export type PrecedenceClass = "allow" | "deny";

/** Row shape used by allow(). Source is audit metadata, not a packaging ladder. */
export type GrantView = {
  id: string;
  source: GrantSource;
  state: GrantState;
  precedence_class: PrecedenceClass;
  sticky: boolean;
  expires_at: Date | null;
};

export type Evaluation = {
  allow: boolean;
  reason: Extract<AllowReason, "grant_active" | "explicit_revoke" | "expired" | "no_grant">;
  grant_ids: string[];
};

function activeAllow(g: GrantView, now: Date): boolean {
  if (g.state !== "active" || g.precedence_class !== "allow") return false;
  if (g.expires_at && g.expires_at.getTime() <= now.getTime()) return false;
  return true;
}

function expiredAllow(g: GrantView, now: Date): boolean {
  if (g.precedence_class !== "allow" || g.state === "revoked") return false;
  if (g.state === "expired") return true;
  return Boolean(g.expires_at && g.expires_at.getTime() <= now.getTime());
}

/**
 * Day-1 precedence (DR2 D3 + DR3 sticky):
 * 1. Operator local deny always wins, including over sticky and webhook allows.
 * 2. An active provider binding still allows, even if a different binding is revoked.
 * 3. A provider revoke suppresses non-sticky local allows. Sticky local allows survive.
 * 4. Otherwise any active unexpired allow wins.
 * 5. Only expired allows → `expired` (distinct from `no_grant`).
 * 6. Else a revoked row → `explicit_revoke`, else `no_grant`.
 */
export function evaluateGrants(grants: GrantView[], now: Date): Evaluation {
  const localDenies = grants.filter(
    (g) => g.source === "local" && g.precedence_class === "deny" && g.state === "revoked",
  );
  if (localDenies.length > 0) {
    return { allow: false, reason: "explicit_revoke", grant_ids: ids(localDenies) };
  }

  // precedence allow + revoked is an operator-released row (grants create lifted
  // the lock). It must not keep suppressing a new local allow. Webhook revokes
  // stay precedence deny and still suppress non-sticky local allows.
  const providerRevokes = grants.filter(
    (g) => g.source !== "local" && g.state === "revoked" && g.precedence_class === "deny",
  );
  const active = grants.filter((g) => activeAllow(g, now));
  const stickyActive = active.filter((g) => g.source === "local" && g.sticky);

  const effective = providerRevokes.length
    ? active.filter((g) => {
        if (g.source === "local" && !g.sticky) return false;
        return true;
      })
    : active;

  if (effective.length > 0) {
    return { allow: true, reason: "grant_active", grant_ids: ids(effective) };
  }

  if (providerRevokes.length > 0 || grants.some((g) => g.state === "revoked")) {
    const revoked = grants.filter((g) => g.state === "revoked");
    return { allow: false, reason: "explicit_revoke", grant_ids: ids(revoked) };
  }

  const expired = grants.filter((g) => expiredAllow(g, now));
  if (expired.length > 0) {
    return { allow: false, reason: "expired", grant_ids: ids(expired) };
  }

  // stickyActive is unused except to make the survival rule obvious to readers of tests.
  void stickyActive;
  return { allow: false, reason: "no_grant", grant_ids: [] };
}

function ids(rows: GrantView[]): string[] {
  return rows.map((g) => g.id).sort();
}

/** Under backlog, keep every deny and sample allows at 1%. Never drop denies. */
export function shouldEnqueueAudit(
  decision: "allow" | "deny",
  pendingDepth: number,
  threshold: number,
  randomUnit: number,
): boolean {
  if (decision === "deny") return true;
  if (pendingDepth <= threshold) return true;
  return randomUnit < 0.01;
}

export function latencyBucket(ms: number): string {
  if (ms < 5) return "lt5ms";
  if (ms < 25) return "lt25ms";
  if (ms < 100) return "lt100ms";
  if (ms < 250) return "lt250ms";
  return "gte250ms";
}

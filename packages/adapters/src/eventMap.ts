export type ProviderName = "stripe" | "polar";
export type Disposition = "grant" | "revoke" | "noop";

const STRIPE_GRANT = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const STRIPE_REVOKE = new Set(["customer.subscription.deleted"]);

const STRIPE_REVOKE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

const POLAR_GRANT = new Set(["order.paid"]);
const POLAR_REVOKE = new Set(["order.refunded", "subscription.revoked"]);

/** Pinned no-op types. subscription.updated is intentionally not a grant/revoke. */
export const POLAR_NOOP = [
  "subscription.canceled",
  "subscription.past_due",
  "subscription.updated",
  "subscription.active",
  "subscription.created",
  "subscription.uncanceled",
  "order.created",
  "order.updated",
  "checkout.created",
  "checkout.updated",
  "benefit_grant.created",
  "benefit_grant.updated",
  "refund.created",
  "refund.updated",
  "customer_seat.assigned",
] as const;

export function stripeDisposition(eventType: string, status: string | null | undefined): Disposition {
  if (STRIPE_GRANT.has(eventType)) return "grant";
  if (STRIPE_REVOKE.has(eventType)) return "revoke";
  if (eventType === "customer.subscription.updated" && status && STRIPE_REVOKE_STATUSES.has(status)) {
    return "revoke";
  }
  return "noop";
}

export function polarDisposition(
  eventType: string,
  opts: { revokeOnPastDue?: boolean } = {},
): Disposition {
  if (POLAR_GRANT.has(eventType)) return "grant";
  if (POLAR_REVOKE.has(eventType)) return "revoke";
  if (eventType === "subscription.past_due" && opts.revokeOnPastDue) return "revoke";
  return "noop";
}

export function isHandledGrant(provider: ProviderName, eventType: string): boolean {
  return provider === "stripe" ? STRIPE_GRANT.has(eventType) : POLAR_GRANT.has(eventType);
}

export function isHandledRevoke(provider: ProviderName, eventType: string): boolean {
  return provider === "stripe" ? STRIPE_REVOKE.has(eventType) : POLAR_REVOKE.has(eventType);
}

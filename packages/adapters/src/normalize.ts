import type { ProviderName } from "./eventMap.js";

export type NormalizedEvent = {
  provider: ProviderName;
  providerEventId: string;
  eventType: string;
  livemode: boolean | null;
  eventTs: string | null;
  bindingId: string | null;
  actorFromMetadata: string | null;
  actionsFromMetadata: string[];
  customerId: string | null;
  productOrPriceId: string | null;
  status: string | null;
};

export function normalizeStripe(body: Record<string, unknown>, fallbackEventId: string): NormalizedEvent {
  const data = asRecord(body.data);
  const object = asRecord(data?.object);
  const metadata = asRecord(object?.metadata) ?? {};
  const eventType = str(body.type) ?? "unknown";
  const objectId = str(object?.id);
  const subscription = idOf(object?.subscription);
  const paymentIntent = idOf(object?.payment_intent);
  let bindingId: string | null = null;
  if (eventType.startsWith("customer.subscription.")) bindingId = objectId;
  else bindingId = subscription ?? objectId ?? paymentIntent;

  const lineItems = asRecord(object?.line_items);
  const first = Array.isArray(lineItems?.data) ? asRecord(lineItems?.data[0]) : null;
  const price = asRecord(first?.price);
  const product =
    str(metadata.maydo_product) ??
    str(price?.id) ??
    str(price?.product) ??
    null;

  return {
    provider: "stripe",
    providerEventId: str(body.id) ?? fallbackEventId,
    eventType,
    livemode: typeof body.livemode === "boolean" ? body.livemode : null,
    eventTs: unixToIso(body.created),
    bindingId,
    actorFromMetadata: str(metadata.maydo_actor),
    actionsFromMetadata: actionsFromMetadata(metadata),
    customerId: idOf(object?.customer),
    productOrPriceId: product,
    status: str(object?.status),
  };
}

export function normalizePolar(
  body: Record<string, unknown>,
  webhookId: string,
  webhookTimestamp: string | undefined,
): NormalizedEvent {
  const data = asRecord(body.data) ?? {};
  const metadata = asRecord(data.metadata) ?? asRecord(data.custom_field_data) ?? {};
  const eventType = str(body.type) ?? "unknown";
  const subscription = str(data.subscription_id) ?? idOf(data.subscription);
  const orderId = str(data.id);
  const bindingId = eventType.startsWith("subscription.") ? (subscription ?? orderId) : (subscription ?? orderId);
  const product = asRecord(data.product);
  return {
    provider: "polar",
    providerEventId: webhookId,
    eventType,
    livemode: typeof data.livemode === "boolean" ? data.livemode : null,
    eventTs: str(body.timestamp) ?? unixToIso(webhookTimestamp),
    bindingId,
    actorFromMetadata: str(metadata.maydo_actor),
    actionsFromMetadata: actionsFromMetadata(metadata),
    customerId: str(data.customer_id) ?? idOf(data.customer),
    productOrPriceId: str(data.product_id) ?? str(product?.id) ?? str(metadata.maydo_product),
    status: str(data.status),
  };
}

function actionsFromMetadata(metadata: Record<string, unknown>): string[] {
  const many = metadata.maydo_actions;
  if (Array.isArray(many)) {
    return many.map((item) => str(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof many === "string" && many.trim()) {
    try {
      const parsed = JSON.parse(many) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => str(item)).filter((item): item is string => Boolean(item));
      }
    } catch {
      return many
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  const one = str(metadata.maydo_action);
  return one ? [one] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return str(value);
  const rec = asRecord(value);
  return rec ? str(rec.id) : null;
}

function unixToIso(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 10_000_000_000 ? n : n * 1000;
  return new Date(ms).toISOString();
}

import { createHmac } from "node:crypto";
import { safeEqual } from "./keys.js";

const TOLERANCE_SEC = 300;

export type VerifyFailure = { ok: false; reason: "bad_signature" | "bad_timestamp" | "bad_payload" };
export type VerifyOk<T> = { ok: true; body: T };

function withinTolerance(timestampSec: number, nowMs: number): boolean {
  if (!Number.isFinite(timestampSec)) return false;
  return Math.abs(nowMs / 1000 - timestampSec) <= TOLERANCE_SEC;
}

/** Stripe-Signature: t=unix,v1=hex. HMAC key is the webhook secret as UTF-8. */
export function verifyStripeSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
  nowMs = Date.now(),
): VerifyOk<Record<string, unknown>> | VerifyFailure {
  if (!signatureHeader || !secret) return { ok: false, reason: "bad_signature" };
  let timestamp: string | undefined;
  const v1s: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") timestamp = v;
    if (k === "v1") v1s.push(v);
  }
  if (!timestamp || v1s.length === 0) return { ok: false, reason: "bad_signature" };
  const ts = Number(timestamp);
  if (!withinTolerance(ts, nowMs)) return { ok: false, reason: "bad_timestamp" };
  const signed = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  if (!v1s.some((sig) => safeEqual(sig, expected))) return { ok: false, reason: "bad_signature" };
  try {
    const body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    if (!body || typeof body !== "object") return { ok: false, reason: "bad_payload" };
    return { ok: true, body };
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
}

function polarKeyMaterial(secret: string): Buffer[] {
  const stripped = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const keys: Buffer[] = [];
  if (stripped.length > 0 && /^[A-Za-z0-9+/=]+$/.test(stripped) && stripped.length % 4 === 0) {
    const decoded = Buffer.from(stripped, "base64");
    if (decoded.length > 0) keys.push(decoded);
  }
  keys.push(Buffer.from(secret, "utf8"));
  if (stripped !== secret) keys.push(Buffer.from(stripped, "utf8"));
  return keys;
}

/**
 * Polar uses Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature).
 * Two key eras: base64 material after whsec_, and the raw secret string.
 */
export function verifyPolarSignature(
  rawBody: Buffer,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowMs = Date.now(),
): VerifyOk<Record<string, unknown>> | VerifyFailure {
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signature = headers.signature?.trim();
  if (!id || !timestamp || !signature || !secret) return { ok: false, reason: "bad_signature" };
  const ts = Number(timestamp);
  if (!withinTolerance(ts, nowMs)) return { ok: false, reason: "bad_timestamp" };
  const presented = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));
  if (presented.length === 0) return { ok: false, reason: "bad_signature" };
  const signed = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
  const matched = polarKeyMaterial(secret).some((key) => {
    const mac = createHmac("sha256", key).update(signed).digest("base64");
    return presented.some((sig) => safeEqual(sig, mac));
  });
  if (!matched) return { ok: false, reason: "bad_signature" };
  try {
    const body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    if (!body || typeof body !== "object") return { ok: false, reason: "bad_payload" };
    return { ok: true, body };
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
}

export function signStripe(rawBody: Buffer, secret: string, timestampSec: number): string {
  const mac = createHmac("sha256", secret).update(`${timestampSec}.${rawBody.toString("utf8")}`).digest("hex");
  return `t=${timestampSec},v1=${mac}`;
}

export function signPolar(
  rawBody: Buffer,
  secret: string,
  webhookId: string,
  timestampSec: number,
): string {
  const stripped = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(stripped, "base64");
  const mac = createHmac("sha256", key)
    .update(`${webhookId}.${timestampSec}.${rawBody.toString("utf8")}`)
    .digest("base64");
  return `v1,${mac}`;
}

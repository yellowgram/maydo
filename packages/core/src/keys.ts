import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DECISION_PREFIXES, OPERATOR_PREFIX, type KeyPrefix } from "./constants.js";

export function hashApiKey(key: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${key}`).digest("hex");
}

export function keyPrefix(key: string): KeyPrefix | null {
  if (key.startsWith(OPERATOR_PREFIX)) return OPERATOR_PREFIX;
  for (const prefix of DECISION_PREFIXES) {
    if (key.startsWith(prefix)) return prefix;
  }
  return null;
}

export function isDecisionKey(key: string): boolean {
  const prefix = keyPrefix(key);
  return prefix === "md_live_" || prefix === "md_test_";
}

/** SDK and decision routes refuse operator keys. There is no admin helper in the SDK. */
export function assertDecisionKey(key: string): void {
  if (!isDecisionKey(key)) {
    throw new Error("MayDo SDK accepts only md_live_ or md_test_ decision keys");
  }
}

export function mintKey(prefix: KeyPrefix): { token: string; lastFour: string } {
  const token = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { token, lastFour: token.slice(-4) };
}

export function scopesForPrefix(prefix: KeyPrefix): string[] {
  if (prefix === OPERATOR_PREFIX) return ["grants", "mapping", "replay", "audit", "keys"];
  return ["allow"];
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Frozen product constants from DR3. Not an SLA and not a fail-open switch. */
export const STICKY_MAX_DAYS = 90;
export const STICKY_WARN_COUNT = 10;
export const MAPPING_ACTION_CAP = 20;
/** Actor and action strings. Checkout metadata and allow() both use these caps. */
export const ACTOR_MAX_LEN = 256;
export const ACTION_MAX_LEN = 256;
export const ORPHAN_DAYS = 45;
export const AUDIT_RETENTION_DAYS = 30;
export const AUDIT_ALLOW_SAMPLE = 0.01;
export const DEFAULT_AUDIT_DEGRADE_DEPTH = 1000;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_SECONDS = 30;
export const KEY_OVERLAP_HOURS = 24;
export const SDK_CACHE_TTL_MAX_MS = 5000;
/** Signature window and the cap on how far event_ts may sit ahead of that signature. */
export const SIGNATURE_TOLERANCE_SEC = 300;
export const DEFAULT_PUBLIC_STATUS_URL = "https://status.yellowgram.dev/maydo";

/** Local defaults. Production startup refuses these. They are not secret. */
export const DEV_KEY_PEPPER = "dev-pepper-change-me";
export const DEV_SESSION_SECRET = "dev-session-change-me";

export const DECISION_PREFIXES = ["md_live_", "md_test_"] as const;
export const OPERATOR_PREFIX = "md_op_";

export type DecisionPrefix = (typeof DECISION_PREFIXES)[number];
export type KeyPrefix = DecisionPrefix | typeof OPERATOR_PREFIX;

export const ALLOW_REASONS = [
  "grant_active",
  "explicit_revoke",
  "expired",
  "no_grant",
  "tenant_disabled",
  "auth_failed",
  "bad_request",
  "maydo_unavailable",
] as const;

export type AllowReason = (typeof ALLOW_REASONS)[number];

export type AllowDecision = {
  allow: boolean;
  reason: AllowReason;
  grant_ids: string[];
  evaluated_at: string;
};

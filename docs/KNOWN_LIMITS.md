# Known limits (P2)

Deferred at CR1. These are real, and they are not day-1 product features. Do not “fix” them by enabling Soft-WTP, invoicing, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

## Isolation and secrets

- Webhook signing secrets are stored in plaintext. `maydo.resolve_webhook` and `maydo.authenticate_key` are `SECURITY DEFINER` and can see every tenant. `maydo.purge_allow_audit` deletes audit rows for every tenant. The worker role does not have `BYPASSRLS`, but these functions are a narrow bypass. A compromised worker can wipe audit evidence.
- The global outbox claim lets `maydo_worker` read **pending and leased** payloads for every tenant when the tenant GUC is unset (DR3 R1). Done rows stay tenant-scoped. Grant writes still require the row’s tenant.
- A compromised migrator role bypasses RLS. Keep that role off the request path. API, worker, console, and the non-bootstrap CLI refuse superuser and `BYPASSRLS` at startup.
- `MAYDO_KEY_PEPPER` still defaults to a public dev value outside `NODE_ENV=production`. Decision keys are 32 random bytes, so this is not a practical preimage, but production must set its own pepper (startup enforces that).
- Session cookies are `HttpOnly` and `SameSite=Lax`. They are not `Secure`. There is no CSRF token beyond `SameSite`. Terminate TLS in front of the console before exposing it.

## Network and abuse

- `/v1/allow` rate limits live in process memory. A second API process does not share the bucket.
- IP allowlists are IPv4 only. When a list is set, non-IPv4 addresses are denied. `MAYDO_TRUST_PROXY=1` trusts the **rightmost** `X-Forwarded-For` hop. Leave it off unless a reverse proxy is the only way to reach the process. A client who can connect directly while the flag is on can still append an allowed address.
- Webhook bodies are capped at 1MB. Actor and action strings inside that body are not separately length-capped.

## Grants

- `maydo grants revoke` locks **that row** against a later grant webhook. It does not delete a different sticky grant or a different active binding for the same action. Revoke those rows themselves. `grants create` for the same actor and action clears operator locks and local denies for that pair so access can be restored on purpose.
- Provider revoke still suppresses non-sticky local allows with **no event-time comparison**. A delayed older revoke can clear a newer local allow.
- When both timestamps are missing, grant versus revoke is last-write-wins.
- Idempotency keys are `provider|encodedEvent|intent:encodedAction|encodedActor`. A `|` inside metadata is percent-encoded so two rows cannot merge. The frozen prose key did not include the actor; without it, two actors sharing an action failed the whole ingest.

## LaunchGate leftovers (not implemented here)

- Status copy, the incident template, and the founding goodwill credit policy are docs. This repo does not deploy the status host.
- `docs/DEMO_60S.md` is the demo script. CI does not time a ≤60s run.
- The orphan report stays read-only. Nothing auto-revokes from it.
- Replay execute stays on the CLI. The console can list dead letters and toggle mapping enabled. It cannot execute replay.

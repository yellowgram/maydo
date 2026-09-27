# Known limits (P2)

Deferred at CR1, CR2, and CR3. These are real, and they are not day-1 product features. Do not “fix” them by enabling Soft-WTP, invoicing, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

## CR3 decisions

- **`suppressNonStickyLocal` does not compare `source_event_ts`.** A replayed or delayed provider revoke still clears a newer non-sticky local allow. That is provider-revoke-wins (DR2 D3). Sticky, with an expiry, is how a pilot survives it. CR3 did not add a timestamp compare.
- **Founding deploy is one API process.** The allow rate limit is in memory and does not cross processes. Audit depth is in Postgres, so a second node does not split degrade. Do not run a second API until the rate limit moves.
- **`MAYDO_TRUST_PROXY=1` stays one rightmost hop.** CR3 did not guess a hop count. Set it only when a single appending proxy is the only path to the process.
- **A refund of more than 20 stored actions enqueues all of them.** That is acceptable at founding volume. The cap still dead-letters a new grant list over 20. No extra warning is required.
- **Plaintext webhook secrets stay P2 on a shared founding database.** Verification needs the secret in the API process. `resolve_webhook` returns it only for the presented ingest token. It is not an HTTP response. Encrypting secrets would be a new key-management feature, not a cross-tenant grant fix. `purge_allow_audit` remains the retention job: it refuses `p_days < 30`, and runtime roles cannot `DELETE` audit rows themselves.

## Isolation and secrets

- Webhook signing secrets are stored in plaintext. `maydo.resolve_webhook` and `maydo.authenticate_key` are `SECURITY DEFINER` and can see every tenant. `maydo.purge_allow_audit` deletes audit rows older than the retention window for every tenant. It refuses a window under 30 days. `maydo_api` and `maydo_worker` cannot `DELETE` from `allow_audit` or `audit_queue`; the function runs as the table owner. A compromised worker can still call `purge_allow_audit(30)` and drop evidence older than 30 days. Column-level revoke of `secret` and `key_hash` does not close the lookup functions, because those functions run as the owner. This is not reachable from HTTP. CR3 kept it as P2.
- API keys are SHA-256 of `pepper:token`. Tokens are 32 random bytes. That is not a practical preimage, including when the pepper is known. Do not switch the hash in a way that invalidates founding keys without a rotation plan.
- The global outbox claim lets `maydo_worker` read **pending and leased** payloads for every tenant when the tenant GUC is unset (DR3 R1). Done rows stay tenant-scoped. Grant writes still require the row’s tenant.
- A compromised migrator role bypasses RLS. Keep that role off the request path. API, worker, console, and the non-bootstrap CLI refuse superuser and `BYPASSRLS` at startup.
- Session cookies are `HttpOnly` and `SameSite=Lax`. Production also sets `Secure`. There is no CSRF token beyond `SameSite`. `SameSite=Lax` does not send the cookie on cross-site POST. Terminate TLS in front of the console before exposing it.

## Network and abuse

- `/v1/allow` rate limits live in process memory. A second API process does not share the bucket.
- IP allowlists are IPv4 only. When a list is set, non-IPv4 addresses are denied. `MAYDO_TRUST_PROXY=1` trusts the **rightmost** `X-Forwarded-For` hop. Leave it off unless a reverse proxy is the only way to reach the process. A client who can connect directly while the flag is on can still append an allowed address.
- Webhook bodies are capped at 1MB. Actor and action strings are capped at 256 characters (`field_too_long` / HTTP 400).

## Grants

- `maydo grants revoke` locks **that row**. It does not delete a different binding or an unexpired sticky grant. A **local** deny row still makes `allow()` deny the whole `(actor, action)` until `grants create`, because that is the deny-class row (DR2 D3). A revoked provider row does not. Revoke the sticky row, or each binding, on purpose. CR2 froze this: one operator revoke does not blank every binding.
- `grants create` releases deny precedence for that actor and action so the new local allow is visible. It does **not** clear `operator_lock`. A later paid webhook for a locked binding is marked done with `skipped: operator_lock` and does not restore that binding.
- Provider revoke still suppresses non-sticky local allows with **no event-time comparison**. A delayed older revoke can clear a newer local allow. That is “provider revoke wins,” not a stuck-pilot bug. Sticky is the escape hatch. CR2 did not add a timestamp compare on that path.
- A missing incoming timestamp does not overwrite a stored timestamp. When **both** timestamps are missing, grant versus revoke is last-write-wins. When both timestamps are present and equal, the revoke wins: a grant does not revive that row. A `created` or body timestamp more than five minutes ahead of the verified signature is stored as the signature time, so a far-future value cannot block a later refund. `allow` expiry and API-key expiry use the database clock, not the Node process clock.
- Idempotency keys are `provider|encodedEvent|intent:encodedAction|encodedActor`. Percent-encoding is frozen: a `|` inside metadata must not merge two rows, and the actor suffix is required so two actors can share an action. The DR2 prose key did not include the actor.
- Sticky requires `expires_at` (database check and CLI). Max horizon is 90 days. There is no hard cap on how many stickies a tenant holds; the CLI and console warn above 10. A hard cap is not day-1. Webhooks cannot create or extend sticky. Re-create a sticky with a new binding id; the same binding id conflicts.
- A refund revokes every grant already stored on that binding, even when that is more than 20 actions. A **new** grant list over 20 actions dead-letters the whole event. Mapping YAML does not overwrite a database row.
- Checkout `maydo_actor` is the buyer’s metadata. If it disagrees with an operator actor map, the grant dead-letters (`actor_metadata_mismatch`) and a revoke still clears the mapped actor’s stored rows. There is no signed actor assertion.

## LaunchGate leftovers (not implemented here)

- Status copy, the incident template, and the goodwill policy are written. `status/index.html` is the page to publish. This repo does not deploy https://status.yellowgram.dev/maydo. A **live** status URL is still required before a Polar listing, including after `release/maydo-0.1.0.zip` exists. CR3 did not build a status host.
- `scripts/demo-60s.sh` is the demo, and CI runs the same sequence and asserts it finishes in under 60 seconds. A founder screenshare of that script against a booted stack is the remaining human check. The script refuses to pass if the wall clock exceeds 60 seconds.
- The orphan report stays read-only. Nothing auto-revokes from it.
- Replay execute stays on the CLI. The console can list dead letters and toggle mapping enabled. It cannot execute replay. Replay reopens the stored outbox payload for that tenant only. It does not re-verify the provider signature and it does not apply another tenant’s letter.
- `/v1/allow` rate limits and the audit degrade counter: the rate limit is in-process. Audit depth is in Postgres, so a second API node does not split the degrade threshold. It does double the allow budget. Founding deploy is one API process until that is revisited.
- `MAYDO_TRUST_PROXY=1` trusts the rightmost `X-Forwarded-For` hop (one appending proxy). A second proxy or a CDN that replaces the header needs an explicit hop count. Do not guess one in code.

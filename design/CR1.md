# MayDo — Code Review 1 (CR1)

**Product:** MayDo entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial review **1 of 3** (do not collapse CR×3)  
**Target:** implement PR #2, branch `cursor/implement-mvp-kernel-2963`  
**Freeze:** `design/DR3.md` + `design/LAUNCHGATE_DR4_PACK.md` (D1–D12 and R1–R7 stand)  
**Date:** 2026-09-26  
**Result:** P0 none found. P1s below are fixed on this branch. P2s are only in `docs/KNOWN_LIMITS.md`.

This pass did not squash-merge, and it did not enable Soft-WTP, invoicing, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

## Attack focus

Cross-tenant drain and RLS, webhook verify plus same-transaction outbox, grant precedence, fail-closed `allow`, CLI-only replay, LaunchGate test gaps, secrets, and auth on `/v1/allow` and the console.

## What already held

- `maydo_api` and `maydo_worker` are `NOSUPERUSER NOBYPASSRLS`, with `FORCE ROW LEVEL SECURITY`. Grant policies have no cross-tenant exception. Drain sets `maydo.tenant_id` from the claimed outbox row with a bound `set_config`. Repository writes pass `tenant_id` as `$1`. A forgotten GUC updates 0 rows; `applyPayload` for another tenant errors. Covered by the existing drain fixture and still true after this pass.
- Adapters use bound parameters. A `decoy_tenant_id` inside the payload does not choose the grant tenant.
- Stripe and Polar signatures are checked before insert. Duplicates return **200** and do not enqueue a second grant. Bad signatures and livemode mismatch return **400**. Database failure on insert returns **500**. Outbox rows are written in the ingest transaction.
- `allow` returns **503** `maydo_unavailable` when the database is down. The SDK cache is off unless `cache.ttlMs` is set, capped at 5000, and `md_op_` is refused. HTTP 5xx is not trusted even if the body says `allow: true`. Audit degrade keeps every deny.
- Console route list has `GET /replay` and no execute route. Orphan candidates are read-only. `invoice.paid` is a no-op. `revoke_on_past_due` defaults false. Polar `subscription.updated` is not a grant or revoke. Refunds stay all-or-nothing, including `partially_refunded`.
- Pin files and the RLS drain fixture, status/incident/goodwill docs, and `docs/DEMO_60S.md` are present. LaunchGate can still block later on a **live** status URL and a **timed** demo; this pass did not pretend those exist.

## P0

None.

## P1 fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | `grants revoke` on a provider row set `state=revoked`, and the next grant webhook upserted it back to `active`. FAQ and DR2 say a local revoke wins over a later paid event until `grants create`. | `operator_lock` on revoke. `upsertAllow` will not clear a locked row. `grants create` for that actor+action clears the lock and the deny precedence so a deliberate re-grant works. A released row (`revoked` + precedence `allow`) no longer suppresses the new local allow. |
| 2 | Idempotency key was `provider\|event\|intent:action` with a **global** UNIQUE. Two actors sharing an action on one refund collided, rolled the ingest transaction back, and returned 500 forever. The same key in another tenant did the same. | Key is per actor, percent-encoded, and unique on `(tenant_id, idempotency_key)`. |
| 3 | Replay marked the dead letter, then updated the outbox, and it did not reset `attempts`. A `max_attempts` row reopened and immediately dead-lettered again. A crash between the two statements could mark the letter replayed while the outbox stayed dead. | One statement reopens the outbox (`attempts = 0`) and marks the letter. |
| 4 | Console session MAC key fell back to the public string `dev-session-change-me`, so anyone could forge `tenant\|exp` for any tenant. The cookie was not checked against key revocation or the operator IP allowlist after login. | Console refuses the dev secret unless `MAYDO_ALLOW_INSECURE_DEV_SECRETS=1`. `NODE_ENV=production` refuses that flag, a short secret, and the dev pepper. Each request reloads the `md_op_` row (revoked, expired, prefix, allowlist). |
| 5 | `/v1/allow` treated client `X-Forwarded-For` as the client IP, so an allowlist was bypassable by a header. | Socket address is the default. `MAYDO_TRUST_PROXY=1` uses the rightmost hop. |
| 6 | API, worker, and console would run as the migrator superuser if `DATABASE_URL` was the only URL, which skips RLS. | Startup calls `assertRuntimeRole` and exits if `rolsuper` or `rolbypassrls`. The non-bootstrap CLI does the same. Bootstrap still uses the migrator, which is the role that inserts tenants. |
| 7 | `/v1/allow` accepted a decision key only by a precedence-sensitive prefix check, and nothing locked `md_op_` at the HTTP boundary in tests. | `isDecisionKey` rejects `md_op_` before the database. Test covers 401 `auth_failed`. |

## P2 deferred

See `docs/KNOWN_LIMITS.md`. Not fixed in this pass: plaintext webhook secrets, `SECURITY DEFINER` purge across tenants, in-memory rate limit, IPv6 allowlists, cookie `Secure` / CSRF beyond `SameSite=Lax`, stale provider revoke with no timestamp versus a newer local allow, null `event_ts` last-write-wins, dev pepper outside production, and LaunchGate’s live status host plus a clocked 60s demo.

## Tests added

- Operator lock survives a newer grant drain; `grants create` allows again.
- Two actors, one action, one refund → HTTP 200 and two outbox rows.
- Same idempotency key inserts for two tenants.
- Replay resets `attempts` to 0.
- Runtime role guard rejects the migrator and accepts `maydo_api` / `maydo_worker`.
- `X-Forwarded-For` does not satisfy an allowlist unless the proxy flag is on, and a prepended allowed address does not win.
- Console: forged cookie is not a session, revoked `md_op_` loses access, `POST /replay/execute` is 404.
- `md_op_` on `POST /v1/allow` is 401.
- Idempotency delimiter and dev-session refusal (no database).

## Adversarial notes for CR2

Do not re-litigate the fixes above unless a regression shows up. Attack these instead:

1. **Whole-action deny versus per-row lock.** DR2 D3 says an explicit revoke for `(tenant, actor, action)` always wins. CR1 locks the revoked **row** so a later webhook cannot revive it. A different active binding, and a sticky row that was not the one revoked, can still allow. Is that the founding rule, or should one operator revoke blank the whole action including sticky?
2. **`suppressNonStickyLocal` has no `source_event_ts`.** Replay or a late refund can revoke a local allow that was created after the provider event. Confirm whether that is “provider revoke wins” or a stuck pilot.
3. **Grant webhook that loses to `operator_lock` is marked done**, not dead-lettered. The operator sees a 200 and a processed event while `allow` stays deny. Should health show “skipped, operator lock”?
4. **`SECURITY DEFINER` functions** (`authenticate_key`, `resolve_webhook`, `purge_allow_audit`) are the remaining cross-tenant primitives on runtime roles. Is column-level revoke of `webhook_endpoints.secret` and `api_keys.key_hash` required before the first founding tenant, or is RLS plus the startup role check enough?
5. **Null timestamps.** Two provider events with no `event_ts` still last-write-wins. Can Polar or Stripe omit the field we map?
6. **Trust-proxy hop count.** Rightmost hop is correct for one appending proxy. Two proxies, or a CDN that replaces the header, need a hop count. CR2 should try the actual deploy topology, not another default.
7. **Console mapping toggle** is an authenticated POST with `SameSite=Lax` and no CSRF token. Confirm the cookie will not be sent cross-site from the founding browser set. Also confirm a revoked key cannot toggle during the request that races the revoke.
8. **In-memory rate limit and per-tenant audit depth** on one process. A second API node doubles the allow budget and splits the degrade threshold. Is founding deploy single-process on purpose?
9. **Actor metadata is still the buyer’s Checkout.** No signed actor assertion (DR3 residual). CR2 should not add one unless LaunchGate says the metadata swap is now in scope.
10. **Stripe `customer.subscription.updated` revokes on `canceled` / `unpaid` / `incomplete_expired`.** Polar `subscription.updated` does not. Re-read both pins against the docs the week of CR2; do not “helpfully” map Polar `updated`.
11. **Demo and status.** Docs exist. CR2 should say whether a stub URL and an untimed script are still a LaunchGate block, without building a status SaaS or a marketing site in the review.
12. **Kill creep.** Search the diff for invoice, quantity, seat reconcile, fail-open, cache default on, and `md_op_` helpers in `packages/sdk-ts`. CR1 did not find them. CR2 should look at anything added after this commit, not only the original PR.

## Open questions

- Should `grants create` clear operator locks only for the binding it names, instead of every lock on that actor+action?
- Is percent-encoding the idempotency key acceptable against the DR2 string `provider|provider_event_id|grant:{action}`, given the actor suffix is required for correctness?
- Does founding deploy set `NODE_ENV=production`? The pepper and session guards key off that. If the host never sets it, the dev pepper stays legal and only the console secret is forced.

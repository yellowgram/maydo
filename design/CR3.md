# MayDo — Code Review 3 (CR3)

**Product:** MayDo entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial review **3 of 3** (FINAL before LaunchGate 4th CR)  
**Target:** implement PR #2, branch `cursor/implement-mvp-kernel-2963`  
**Builds on:** `design/CR1.md` and `design/CR2.md` (do not re-break those locks unless a regression shows)  
**Freeze:** `design/DR3.md` + `design/LAUNCHGATE_DR4_PACK.md` (D1–D12 and R1–R7 stand)  
**Date:** 2026-09-27  
**Result:** P0 none found. P1s below are fixed on this branch. P2s are only in `docs/KNOWN_LIMITS.md`.

> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-27 review of the design draft, not the price to charge.

This pass did not squash-merge, and it did not enable Soft-WTP, invoicing, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

## Decisions on CR2 opens

1. **`suppressNonStickyLocal` does not learn `source_event_ts`.** A replayed older refund still clears a newer non-sticky local allow. That is provider-revoke-wins (DR2 D3). Sticky with an expiry is the pilot escape. Adding a compare would leave access on after a refund when clocks disagree. Frozen as P2.
2. **Founding deploy is one API process.** The allow bucket is in-process. Audit depth is in Postgres and already shared. Do not add a second API node until the rate limit moves. Documented, not coded as a cluster.
3. **Do not guess a second proxy hop.** `MAYDO_TRUST_PROXY=1` stays the rightmost hop for one appending proxy. A CDN that replaces the header waits until that host exists.
4. **Enqueue every stored action on a refund, including past 20.** Acceptable at founding volume. The cap still dead-letters a new grant list over 20. No extra warning.
5. **Plaintext webhook secrets stay P2 on a shared founding database.** The API must hold the secret to verify HMAC. `resolve_webhook` returns it only for the ingest token presented. It is not an HTTP body. Encryption-at-rest is a new key-management feature. The cross-tenant purge footgun is narrowed below (P1) without removing the retention job.

CR1 locks (operator lock, per-tenant idempotency, replay `attempts = 0`, console MAC, socket IP, runtime role guard, `md_op_` rejected on `/v1/allow`) and CR2 locks (`grants create` does not clear `operator_lock`, `skipped: operator_lock`, missing timestamp does not clobber, refund-over-cap, metadata mismatch, 256-char cap, production pepper) still hold.

## Attack focus

Residual cross-tenant paths, clock skew on `expires_at` and `event_ts`, worker crash and double-apply, SDK/HTTP reasons, doc honesty, CI fixtures, supply chain, and CLI footguns. Assume the attacker read CR1 and CR2.

## What already held

- Forgotten GUC still updates 0 grant rows. A worker with tenant A’s GUC cannot read tenant B’s keys, mappings, or dead letters. Audit drain writes each row under that row’s tenant. Console sessions stay MAC’d to one tenant. Replay of another tenant’s letter still does not reopen the outbox.
- Drain is one transaction. A second worker skips a row locked by an in-flight drain (`FOR UPDATE SKIP LOCKED`). Rollback releases it. The next drain applies the grant once. The lease update is not committed separately from the grant, so a crash mid-apply does not leave a stolen lease or a second apply.
- Adapters still use bound parameters. `invoice.paid` is a no-op. Polar `subscription.updated` is not a grant or revoke. Refunds stay all-or-nothing. Orphan candidates stay read-only. The console still has no replay execute route. The SDK still refuses `md_op_` and still treats HTTP 5xx as deny.
- Direct dependencies are `pg` plus TypeScript types. The lockfile resolves to `registry.npmjs.org` only. There are no install scripts. No kill-criteria creep showed up in this diff.

## P0

None.

## P1 fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | A signed webhook can set `created` or a body timestamp years ahead of the signature. Later real refunds then lose the timestamp compare, so access stays on. | `event_ts` more than the signature tolerance (300s) ahead of the verified signature is stored as the signature time. Older timestamps are kept. Missing timestamps stay missing. |
| 2 | Stripe timestamps are whole seconds. An equal `event_ts` was last-write-wins, so a grant drained after a same-second revoke restored access. | On a tie, the revoke wins. A grant does not revive the row. A revoke at the same timestamp still applies. |
| 3 | `allow` expiry and API-key expiry used the Node clock. Sticky protection in SQL uses `now()`. A lagging API kept expired grants and expired keys alive. | Grant evaluation and key expiry compare against Postgres `now()`. Local grant horizon uses that clock too. An unparseable `expires_at` is rejected. |
| 4 | `START_HERE` exports `DATABASE_URL_WORKER`. `maydo outbox drain` then claimed the global queue, so one tenant’s shell applied another tenant’s pending grants and revokes. | CLI drain is `MAYDO_TENANT_ID` unless `--all-tenants`, which requires the worker URL and prints a warning. The worker process still drains every tenant. |
| 5 | `purge_allow_audit(1)` on the worker role deleted every tenant’s recent audit. Runtime roles also had table `DELETE`. | The function refuses `p_days < 30`. `DELETE` on `allow_audit` and `audit_queue` is revoked from `maydo_api` and `maydo_worker`. |
| 6 | HTTP 400 `{ "error": "bad_request" }` did not match the SDK reason list, so a bad actor looked like `maydo_unavailable`. With cache on, an outage was stored for the TTL. | 400 is `{ "allow": false, "reason": "bad_request" }`. SDK and core reason lists match, including `bad_request`. `maydo_unavailable` is not cached. |

## P2 deferred

See `docs/KNOWN_LIMITS.md`, including the five CR2 decisions above. Still deferred: plaintext webhook secrets, `SECURITY DEFINER` lookup of a presented token, in-memory rate limit, IPv6 allowlists, CSRF beyond `SameSite=Lax`, provider revoke with no timestamp versus a newer local allow, both-null last-write-wins, sticky count hard cap, replay that does not re-verify the provider signature, and a hop count for a second proxy.

## Tests added

- Future Stripe `created` is clamped; the following `customer.subscription.deleted` revokes.
- Equal timestamps: revoke-then-grant stays revoked; grant-then-revoke ends revoked.
- A worker that holds the outbox row blocks the other drain; after rollback the grant is applied once.
- CLI drain with `DATABASE_URL_WORKER` set does not drain the other tenant.
- `purge_allow_audit(1)` errors; worker `DELETE` on `allow_audit` errors.
- Audit drain keeps each tenant’s actor; tenant A’s GUC cannot see tenant B’s key, mapping, or dead letter.
- Demo sequence (paid webhook, drain, allow, local revoke, deny, duplicate) finishes in under 60 seconds.
- SDK preserves `bad_request` and does not cache `maydo_unavailable`. Reason lists match.

## LaunchGate pre-check

| Check | State |
| --- | --- |
| RLS cross-tenant drain fixture | Present (`forgotten GUC` plus CR3 key/mapping/dead-letter and CLI drain tests) and part of `npm test` |
| Polar and Stripe pin fixtures | Present under `fixtures/polar` and `fixtures/stripe`; `test/event-map.test.ts` pins the adapters |
| Incident template | `docs/INCIDENT_TEMPLATE.md` — real buyer note, fail-closed, no fail-open step |
| Founding goodwill credit, before charge | **Superseded / not sold / not buyer-facing.** Archived at `design/archive/FOUNDING_GOODWILL_CREDIT.md`. The 2026-09-26 draft’s pro-rated `$79` after a hosted outage is not the offer. Purchase refund stays 14 days. yellowgram does not operate the decision API. |
| ≤60s demo | `docs/START_HERE.md`, `docs/DEMO_60S.md`, `scripts/demo-60s.sh` (exits non-zero over 60s). CI asserts the same sequence in under 60s |
| No kill creep | No invoicing, Soft-WTP, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` SDK helper, or packaging studio |
| **Live status URL** | **Superseded as a listing block.** Live Polar already delivers `maydo-0.1.1.zip`. `status/index.html` is kit guidance, not a yellowgram-operated decision API. This repo does not serve https://status.yellowgram.dev/maydo. Do not treat `maydo-0.1.0.zip` as the live download. |

Code review itself is ready for LaunchGate’s 4th pass. The live status host is an ops publish, not an unimplemented policy.

## Supply chain

`package-lock.json` pins `pg@8.23.0` and its npm dependencies, plus TypeScript toolchain devDependencies. No git URLs, no `preinstall` / `postinstall`. `pgpass` only matters when the connection string omits a password; the documented URLs include one. Do not add a second HTTP client or a billing SDK in this package.

## Operator CLI

`grants revoke` is one id. `replay execute` is one dead letter and refuses a letter with no outbox row. `mapping seed` does not overwrite a database row. There is no command that deletes every grant. The cross-tenant drain footgun above was the one that could change another tenant’s grants from a normal shell.

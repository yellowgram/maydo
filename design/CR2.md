# MayDo — Code Review 2 (CR2)

**Product:** MayDo entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial review **2 of 3** (do not collapse CR×3)  
**Target:** implement PR #2, branch `cursor/implement-mvp-kernel-2963`  
**Builds on:** `design/CR1.md` (do not re-litigate those fixes unless a regression shows)  
**Freeze:** `design/DR3.md` + `design/LAUNCHGATE_DR4_PACK.md` (D1–D12 and R1–R7 stand)  
**Date:** 2026-09-26  
**Result:** P0 none found. P1s below are fixed on this branch. P2s are only in `docs/KNOWN_LIMITS.md`.

This pass did not squash-merge, and it did not enable Soft-WTP, invoicing, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

## Decisions on CR1 opens

1. **One operator revoke does not blank every binding or sticky grant.** `grants revoke <id>` locks that row. A local deny row still denies the whole `(actor, action)` at `allow()` time (DR2 D3 deny-class). A revoked provider row does not take sticky or a second paid binding with it. Blanking those would revoke a product the operator did not name. Sticky stays opt-in and is revoked only on its own row.
2. **A grant that loses to `operator_lock` is not a dead letter.** Dead-letter plus replay would loop on the same lock. The outbox row is `done` with `last_error = skipped: operator_lock`. Health and the console say so. `allow` stays deny for that binding.
3. **`grants create` does not clear `operator_lock`.** It only releases deny precedence so the new local allow is visible. CR1 cleared every lock on the actor+action, so the next paid webhook revived a binding the operator had revoked. That was a hole in the CR1 lock. Access returns through the new local row. The locked binding stays locked.
4. **Percent-encoding of the idempotency key stays.** The actor suffix is required for correctness. Encoding stops a `|` in metadata from merging two keys. The DR2 prose string is the logical identity, not the stored bytes.
5. **Founding deploy must set `NODE_ENV=production`.** `MAYDO_REQUIRE_PRODUCTION=1` turns on the same guards when a host forgets `NODE_ENV`. The dev pepper is refused unless `MAYDO_ALLOW_INSECURE_DEV_SECRETS=1`, and that flag is refused in production. The worker refuses the flag in production too.

`suppressNonStickyLocal` still has no event-time compare. That is provider-revoke-wins (D3), frozen as P2. Sticky is how a pilot survives it.

## Attack focus

Concurrent drain versus `allow()`, multi-action expansion, sticky expiry, audit degrade, Checkout metadata, dead-letter replay, the 20-action cap, key hashing, and LaunchGate leftovers.

## What already held

- CR1 operator lock, per-tenant idempotency, replay `attempts = 0` in one statement, console session MAC, socket IP, runtime role guard, and `md_op_` rejected on `/v1/allow` are still true. This pass did not reopen them as new findings.
- Drain is one transaction per outbox row. `allow()` sees committed rows only. Two workers draining a grant and a revoke for the same binding keep the newer `source_event_ts`. A half-applied expansion set is visible as one action allowed and its sibling not, and health still shows the incomplete set (DR3 R2). That is not a torn row.
- Audit degrade enqueues every deny. Sampling applies only to allows, at 1%, and only after the per-tenant pending depth crosses the threshold. The worker does not sample again on the way into `allow_audit`.
- Sticky without `expires_at` is rejected by `createLocalGrant` and by `CHECK (sticky = false OR expires_at IS NOT NULL)`. Webhook upserts set `sticky = false`. Horizon stays 90 days. Warn-above-10 stays a warning. A hard cap would be a new product rule, not a CR2 fix.
- Replay execute is still absent from the console, including an authenticated POST. SQL filters `tenant_id`. Another tenant’s letter does not reopen the outbox row and does not mark the letter replayed.
- Mapping seed is `ON CONFLICT DO NOTHING`. A changed database row survives a second seed. The 20-action check is in the planner, the CLI, and the table checks.
- RLS forgotten-GUC fixture, Polar/Stripe pin fixtures, incident template, goodwill credit policy (later archived at `design/archive/FOUNDING_GOODWILL_CREDIT.md`; **not sold / not buyer-facing**), status stub, and `docs/DEMO_60S.md` are present. No invoice path, quantity math, fail-open flag, SeatTruth revoke, or `md_op_` helper in the SDK showed up after CR1.
- SHA-256 of a 32-byte key is not a practical preimage. Plaintext webhook secrets and the `SECURITY DEFINER` lookup functions are not reachable from HTTP. Column revoke would not stop those functions. Left as P2.

## P0

None.

## P1 fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | `grants create` set `operator_lock = false` on every locked row for that actor and action. The next paid webhook revived a binding the operator had revoked. | Precedence is released so the new local allow works. The lock stays. A later grant webhook does not reactivate the row. |
| 2 | A grant that lost to `operator_lock` was marked done with an empty error. Health looked clean while `allow` stayed deny. | Done, with `last_error = skipped: operator_lock`. Not a dead letter. Health, CLI stderr, and the console banner count it. |
| 3 | A provider event with no `event_ts` overwrote a stored timestamp, so an older or malformed grant could undo a newer revoke under concurrent drain. | A stored timestamp wins over a missing one and over an older one. Both-null stays last-write-wins (P2). |
| 4 | A revoke whose actor+action set exceeded 20 dead-lettered the entire refund, including grants already stored. Access stayed on. | Stored grants are always revoked. The cap still dead-letters a new grant list over 20, and a revoke that names over 20 actions when nothing is stored. |
| 5 | Checkout `maydo_actor` silently beat an operator actor map, so metadata could grant a different actor. A spoofed actor on a refund could also attach revoke rows to that actor. | Grant + mismatch → dead letter `actor_metadata_mismatch`. Revoke + mismatch → revoke the mapped actor’s stored rows, ignore the metadata actor, note the event. No signed assertion (out of scope). |
| 6 | Actor and action strings were bounded only by the 1MB body. A decision key could enqueue a huge deny into the audit queue, which is kept at 100%. | Cap 256. `allow` returns 400 and does not audit. Webhooks dead-letter `field_too_long`. |
| 7 | Pepper and session guards ran only when `NODE_ENV=production`. An unset `NODE_ENV` left the public dev pepper legal on the API. | Dev pepper requires `MAYDO_ALLOW_INSECURE_DEV_SECRETS=1`. Production, including `MAYDO_REQUIRE_PRODUCTION=1`, refuses that flag, the dev pepper, and a short session secret. Production console cookies are `Secure`. |

## P2 deferred

See `docs/KNOWN_LIMITS.md`. Still deferred: plaintext webhook secrets, `SECURITY DEFINER` purge, in-memory rate limit, IPv6 allowlists, CSRF beyond `SameSite=Lax`, provider revoke with no timestamp versus a newer local allow, both-null last-write-wins, sticky count hard cap, replay that does not re-verify the provider signature, hop count for a second proxy, and LaunchGate’s live status host plus a clocked 60s demo.

## Tests added

- `grants create` keeps `operator_lock`; a later grant webhook stays revoked and is `skipped: operator_lock`; the local allow remains.
- Missing `event_ts` does not revive a newer revoke.
- Concurrent drain of grant + newer revoke ends revoked.
- Replay from another tenant does not reopen the outbox or mark the letter.
- Mapping seed does not overwrite a database row.
- Sticky without `expires_at` fails the database check.
- `allow` rejects a 300-character actor and does not enqueue audit.
- Production session cookie is `Secure`. Authenticated `POST /replay/execute` is 404.
- Metadata mismatch, refund-over-cap, field length, dev-pepper refusal, and deny sampling (no database).

## LaunchGate

Not new code blockers. Still blocks before a Polar listing, and still not built here: a **live** status URL (the stub and the policy docs exist) and a **timed** ≤60s demo (the script exists; CI does not clock it). RLS cross-tenant drain fixture and provider pin fixtures are in tree and still match the adapters.

## Questions for CR3

- Should `suppressNonStickyLocal` learn `source_event_ts`, or does founding support accept that a replayed older refund clears a newer non-sticky local allow?
- Is one API process actually the founding deploy? The allow rate limit does not cross processes. Audit depth does.
- When a second proxy is in front, what hop count should `MAYDO_TRUST_PROXY` use? Do not guess it before the host exists.
- Does a refund of more than 20 **stored** actions need an operator warning, or is enqueueing all of them acceptable for founding volume?
- Plaintext webhook secrets stay P2 until a founding tenant is real. CR3 should say if that flips to P1 once the database is on a shared host.

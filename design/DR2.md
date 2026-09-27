# MayDo — Design Review 2 (DR2)

**Product:** MayDo — entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial design #2 of 3  
**Builds on:** `design/DR1.md` (do not ignore; do not collapse DR×3)  
**Shape (locked):** hosted decision API + thin SDK  
**Pricing (USD):** ~$199 founding setup + ~$79/mo  
> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-26 design draft, not the price to charge.  
**Contact:** hello@yellowgram.dev  
**Date:** 2026-09-26 ET  
**Status:** design only — no product code; DR3 still required before LaunchGate

Standing fences (unchanged): Soft-WTP OFF · cold invoices FORBIDDEN · not Chargebee / Schematic-upmarket · SeatTruth daily reconcile **LATER** · Polar listing **dark** until zip/SHA/deliverables · HookSteel patterns only (do not modify that repo).

---

## 0. What DR1 got right — and what it left dangerous

### Got right (carry forward)

| Carry | Why it stays |
| --- | --- |
| Hosted API + thin SDK shape | Founder-locked; critical-path honesty belongs in SLO, not shape flip |
| HookSteel pipeline: verify → unique event → same-txn outbox → drain → grant store | Reliability without inventing a new ingest product |
| Read-only `allow`; no money path | Competitive kill line |
| Stripe + Polar only; grant-oriented maps; ignore `invoice.paid` by default | Avoids double-grant and Chargebee creep |
| Four operator surfaces (grants / webhook health / replay / allow audit) | Matches `OPERATOR_NEEDS.md` |
| Explicit revoke wins; else any active grant; else deny | Simple precedence skeleton |
| Deny-class vs allow-class; sources as audit metadata | Enough for day-1 without packaging studio |
| Kill criteria / one-line kill test | Keep as standing abort signals |

### Left dangerous or vague (DR2 attack surface)

| Gap | Why dangerous |
| --- | --- |
| Tenancy / auth “TBD” | One missing `WHERE tenant_id` = cross-tenant breach at founding price |
| Grant upsert vs extend / period-end | Ignoring `invoice.paid` without a renewal story leaves expiry wrong **or** invents SeatTruth |
| Local allow vs provider revoke | DR1 leaned provider-wins but flagged CSM surprise — undecided = support chaos |
| Audit sync vs async | Sync can break latency; async can lose the only support evidence |
| SDK cache | Default-on would ship Stigg lore at $79 and stale allows after revoke |
| Polar lifecycle types hand-waved | Wrong revoke signal (`canceled` vs `revoked`) = paid period denied early or forever open |
| Actor resolution | Spoofable / missing metadata → silent wrong grants or silent no-grants |
| Fail-open temptation on hosted outage | Buyer critical path; wrong default = free access during MayDo downtime |
| CLI vs console | Scope balloon risk for operator MVP |
| Multi-action + partial refund | Split-brain grants; quantity math = kernel death |
| `expired` reason code | Support “why denied?” vs minimal API surface |

DR2 resolves each DR1 §8 open decision below. Unresolved items are deferred to **DR3 only** with kill-risk named.

---

## 1. DR1 open decisions — locked recommendations

### D1. Tenancy / auth model

**Lock:** Shared PostgreSQL schema + mandatory `tenant_id` on every row that can leak. **No** schema-per-tenant day-1.

| Layer | Day-1 rule |
| --- | --- |
| **Data** | Every grant / event / outbox / audit / mapping row carries `tenant_id`. Unique keys include `tenant_id`. |
| **Access path** | Repository / query helpers **require** `tenant_id` as a non-optional first argument — no “optional filter.” Code review gate: bare table scans without tenant predicate = blocker. |
| **RLS** | Enable Postgres RLS policies `tenant_id = current_setting('maydo.tenant_id')` as **defense-in-depth** for the grant store + allow_audit + provider_events. App still sets the GUC per request. Missing RLS is a CR blocker, not a “be careful” note. |
| **Decision auth** | `Authorization: Bearer md_live_…` / `md_test_…` API keys. Store **hash only** (pepper + SHA-256 or equivalent). Keys belong to exactly one tenant. Rotate = mint new + expire-at on old (overlap window ≤24h). |
| **Operator auth** | Separate key prefix `md_op_…` (or session for console) with grant CRUD + replay scopes. Decision keys **cannot** create/revoke grants or replay. |
| **Ingest auth** | Provider signature only (Stripe / Polar). No shared API key on webhook URLs beyond unguessable path token optional. Livemode mismatch → **400**. |
| **mTLS** | **Out of MVP.** Ops burden at founding price; revisit only if a founding buyer’s compliance blocks Bearer. |

**Rationale:** Isolation bugs are existential; shared schema is operable at $79/mo; RLS + required-tenant APIs beat “hope.” mTLS can wait.

**Kill-risk if wrong:** Cross-tenant allow read is a product-ending incident — treat as launch-gate security criterion.

---

### D2. Grant upsert semantics (renewal without SeatTruth)

**Lock:** **Boolean grant identity**, not billing-period SoR.

**Identity key (logical):**  
`(tenant_id, actor, action, source, binding_id)`

| `source` | `binding_id` |
| --- | --- |
| `stripe` | Stripe `subscription` id if present; else `checkout.session` / payment intent id |
| `polar` | Polar `subscription` id if present; else `order` id |
| `local` | MayDo-generated grant id (or operator-supplied idempotency key) |

**Mutations:**

| Event intent | Behavior |
| --- | --- |
| Paid / grant adapter | **Upsert** row → `state=active`, clear `revoked_at`, set `source_event_id`, optional `expires_at` only if mapping supplies one. Renewals that re-fire paid for same binding → **no-op upsert** (touch `source_event_id` / `updated_at`). **Do not** append a new grant row per renewal. |
| Revoke adapter | Set matching binding’s grant(s) to `revoked` (or insert deny-class row — see D3). |
| Local create | Insert local binding; optional `expires_at`. |

**Period-end / SeatTruth fence:**

- **Do not** store Stripe/Polar `current_period_end` as entitlement truth day-1.
- Access ends when a **revoke-class webhook** (or local revoke / local expiry) says so — not when a nightly job notices period math.
- Keep ignoring Stripe `invoice.paid` by default (DR1). Polar renewals: see D6 — `order.paid` upserts same subscription binding; no extend-by-period.
- Optional `expires_at` is for **local comps / explicit time-boxed maps only**, evaluated with **MayDo server time**.

**Rationale:** Extending `expires_at` from every renewal recreates SeatTruth. Ignoring renewals while storing period-end creates silent expiry bugs. Boolean upsert until revoke is the honest kernel.

---

### D3. Local allow vs provider revoke

**Lock (founding default):**

1. **Explicit revoke / deny-class** for `(tenant, actor, action)` always wins (local or provider-derived).  
2. Else any **active** allow-class grant → allow.  
3. Else deny.

**Provider revoke vs prior local allow:**

| Situation | Result |
| --- | --- |
| Local allow (default), then Stripe/Polar revoke for same `(actor, action)` | Provider revoke **wins** → deny. Operator must **re-grant** (or set sticky) if pilot should continue. |
| Local grant with `sticky=true` | Survives provider revoke for that `(actor, action)` until sticky revoked/expired. **Opt-in only**; operator UI/CLI shows sticky in red/diff. |
| Local revoke | Always wins over webhook allows. |

**No** separate “source precedence ladder” beyond deny > allow and sticky exception.

**Rationale:** Finance/correctness default (cancel means cancel) over CSM convenience; sticky is the escape hatch so pilots are explicit, auditable, and rare. Document in onboarding: “comps that must survive cancel → sticky.”

**Support implication:** Ticket FAQ entry #1 for “pilot lost access after cancel.”

---

### D4. Allow-audit durability

**Lock:**

| Path | Policy |
| --- | --- |
| Decision response | Return after grant evaluate; **do not** block on audit durability. |
| Audit write | **Async** enqueue (same process queue or outbox-style) of `{ts, tenant_id, actor, action, decision, reason, grant_ids, latency_bucket}`. |
| Failure mode | If audit queue backs up: keep serving `allow`; alert operator; **never** fail-open the decision because audit failed. |
| Volume guard | Day-1: attempt to enqueue **all** decisions. If sustained enqueue depth > threshold, auto-degrade to **100% deny + 1% allow sample** (config flag + health banner). Document. |
| Retention (hosted) | **30 days** default; delete-on-request; export window for support. |
| Contents | No raw webhook JSONB / cardholder PII (DR1). |

**Rationale:** Sync audit will break the p99 promise under page-view spam. Async + degrade-sample preserves support for denies (the #1 ask) without making MayDo an analytics product.

---

### D5. SDK cache policy

**Lock:** **Cache off by default.**

| Rule | Day-1 |
| --- | --- |
| Default | Every `allow` = HTTPS round-trip. |
| Opt-in | `cache: { ttlMs }` with **hard cap ttlMs ≤ 5000**. Document staleness. |
| Bypass | `bypassCache: true` / header for revoke-critical paths. |
| Languages | **TypeScript first only.** Other languages = raw HTTP contract until demand. |
| Forbidden | Local grant DB in SDK; offline SoR; “edge sidecar” claims. |

**Rationale:** DR1 critique #7 is correct — cache-on demos well and production-lies. At $79/mo we sell correctness, not Stigg edge lore.

---

### D6. Polar lifecycle event map (docs-confirmed 2026-09-26)

Sources: [Polar webhook events](https://polar.sh/docs/integrate/webhooks/events), orders/subscriptions docs. Re-confirm type enum at implement-prep (DR3/CR); day-1 map below is the design lock.

| Event | Adapter | Notes |
| --- | --- | --- |
| `order.paid` | **Grant** upsert for mapped action(s); `binding_id` = subscription id if present else order id | Primary fulfillment signal |
| `order.refunded` | **Revoke** all grants for that order’s binding / mapped actions | All-or-nothing (D9). Includes full and partial (`partially_refunded` in payload → still full revoke day-1) |
| `subscription.revoked` | **Revoke** mapped actions for subscription binding | **Access-removal signal** — use this, not `canceled` |
| `subscription.canceled` | **No-op** (ignore / `ignored`) | Period-end cancel: customer often keeps access until revoke; flipping deny here is a product bug |
| `subscription.uncanceled` | **No-op** | Grant still active |
| `subscription.past_due` | **No-op** day-1 | Polar owns retries/grace; optional later revoke-on-past_due is a **mapping flag**, default off |
| `subscription.active` / `subscription.created` | **No-op** | Avoid double-grant with `order.paid` |
| `subscription.updated` | **No-op** | Catch-all; too noisy for grant truth |
| `order.created` / `order.updated` | **No-op** | Not paid yet / status churn |
| `checkout.*` | **No-op** | |
| `benefit_grant.*` | **No-op** day-1 | Polar benefits are not MayDo SoR; mapping them = packaging creep |
| `refund.created` / `refund.updated` | **No-op** if `order.refunded` handled | Prefer order-level revoke |
| `customer_seat.*` | **No-op** | SeatTruth-adjacent; later |

**Idempotency:** `provider_event_id` = Polar **webhook-id header** (HookSteel), not `data.id`.

**Stripe map (unchanged intent, clarified renewals):**

| Event | Adapter |
| --- | --- |
| `checkout.session.completed` / `async_payment_succeeded` | Grant upsert |
| `customer.subscription.deleted` | Revoke |
| `customer.subscription.updated` → status in (`canceled`, `unpaid`, `incomplete_expired`) | Revoke (narrow map) |
| `invoice.paid` | **Ignore** (renewals = no-op if grant already active on subscription binding) |
| Unmapped | `ignored` |

---

### D7. Actor-resolution contract

**Lock — ordered resolution:**

1. **Required primary (server-set metadata on paid object):**  
   - `maydo_actor` (string)  
   - `maydo_action` (string) **or** `maydo_actions` (JSON array of strings)  
   Present on Stripe Checkout Session metadata / Subscription metadata; Polar order/product custom field or metadata equivalent as documented in onboarding.

2. **Fallback (operator tables, minimal):**  
   - `provider_customer_id → actor`  
   - `provider_price_or_product_id → action` (single action; multi-action via mapping row list)  
   Used only when metadata missing.

3. **Failure:** If still unresolved → **do not grant**. Mark event `ignored` or dead-letter with reason `actor_unresolved` / `action_unresolved`. Operator-visible.

**Trust note:** Webhook bodies are signed, but **metadata is only as trustworthy as who wrote it**. Onboarding must state: buyer **server** sets `maydo_*` when creating Checkout/Polar checkout — never the end-user browser alone.

**Not in MVP:** CRM sync, email→actor inference, SeatTruth seat assignment from `customer_seat.*`.

---

### D8. Operator MVP: CLI vs console

**Lock:** **CLI-complete + read-mostly web.**

| Surface | CLI | Web console |
| --- | --- | --- |
| Grants list / search / diff | Yes | Yes (tables) |
| Local grant create / revoke / sticky | **Yes (primary)** | Optional thin form if cheap; not blocking |
| Mapping enable/disable | Yes | Yes (toggle only — not a studio) |
| Webhook health / counters | Yes | Yes |
| Replay list / dry-run / execute | **Yes only** | Read-only dead-letter list; execute stays CLI |
| Allow audit search / export | Yes | Yes |
| Secret rotate runbook | Docs + CLI | Link to docs |

**Rationale:** Replay execute and grant writes are foot-guns; CLI preserves HookSteel discipline. Read UI covers “who has what / why denied” without shipping Schematic chrome. Full console CRUD can be DR3 polish only if CLI demos ≤60s already.

---

### D9. Multi-action expansion & refund policy (no invoicing)

**Multi-action:**

- At enqueue time (same txn as `provider_events` insert win): expand to **N outbox rows**, one per action.  
- Idempotency key: `provider|provider_event_id|grant:{action}` (and `revoke:{action}`).  
- Drain applies independently; mid-expand crash → remaining rows retry; **no** single adapter that expands non-transactionally after commit.

**Refund / partial:**

| Case | Day-1 policy |
| --- | --- |
| Full refund / `order.refunded` | Revoke **all** actions granted from that order/subscription binding |
| Partial refund | **Same as full revoke** for entitlement purposes; document honesty: “MayDo does not do quantity math” |
| Stripe charge.refunded (if mapped later) | Same all-or-nothing; default map **off** until operator enables |
| Quantity / seats | **Out** — SeatTruth later; no prorated entitlements |

**Rationale:** Partial-credit entitlement is how kernels become billing engines. All-or-nothing is supportable and fence-aligned.

---

### D10. Hosted SLO / fail-closed

**Lock:**

| Item | Day-1 |
| --- | --- |
| Region | Single region |
| Allow latency | Target p99 ≤ **100 ms** in-region for evaluate + enqueue-audit (not counting buyer↔MayDo network) |
| Availability intent | Best-effort; **no paid SLA** (`MINIMUM_SUPPORT`) |
| Status | Public status URL (even a static page + manual updates) before Polar list |
| Decision on MayDo errors / timeouts | **Fail closed → deny** (SDK returns `allow: false`, reason `maydo_unavailable` / transport error). **Never fail open.** |
| Drain down | Webhooks may 200 while grants lag — health shows outbox depth; not an excuse to fail open on `allow` |
| Degraded mode | Prefer deny + status banner over stale SDK cache |

**Rationale:** Hosted on the critical path means wrong allows during outage are worse than temporary denies. Buyers who cannot accept that need a later embed path — not a day-1 roadmap split (MVP_SCOPE Later).

---

### D11. Mapping config UX (not a packaging studio)

**Lock:** Boring **mapping table** (DB) + optional boot-time YAML seed.

| Fields | `provider`, `event_type`, `actions[]`, `enabled`, optional `product_or_price_id` filter |
| --- | --- |
| UX | Admin table: enable/disable, edit action list (strings). No plan versioning, no price editor, no GTM catalog. |
| Disable | Operator can disable a row without redeploy (OPERATOR_NEEDS). |

YAML is a seed/override for founding setup, not a second SoR — DB wins at runtime.

---

### D12. `expired` reason code

**Lock:** Keep **`expired` as a distinct reason code** when the only matching grants are past `expires_at` (local time-box). Do not fold into `no_grant`.

**Rationale:** Support’s #1 question is “why can’t they?” — expired comps vs never-granted are different runbooks. Still no plan names / invoice ids in reasons.

---

## 2. Deepened architecture (revised from DR1)

```
┌─────────────┐  signed webhooks   ┌─────────────────────────────────┐
│ Stripe /    │ ─────────────────► │ Ingest (per provider)           │
│ Polar       │                    │ verify → UNIQUE event →         │
└─────────────┘                    │ same-txn expand N outbox rows   │
                                   └──────────────┬──────────────────┘
                                                  │ commit
                                   ┌──────────────▼──────────────────┐
                                   │ Drain (SKIP LOCKED)             │
                                   │ upsert/revoke grants by binding │
                                   └──────────────┬──────────────────┘
                                                  │
┌─────────────┐  Bearer md_live_   ┌──────────────▼──────────────────┐
│ Buyer app   │ ─────────────────► │ Decision API (read-only)        │
│ + thin SDK  │  allow / deny      │ evaluate → enqueue audit async  │
│ cache OFF   │ ◄───────────────── │ fail-closed on error            │
└─────────────┘                    └─────────────────────────────────┘
        ▲                                        ▲
        │ CLI (writes) + read console            │ RLS + tenant_id GUC
┌───────┴────────────────────────────────────────┴──────────────────┐
│ Grants · Webhook health · Replay (CLI execute) · Allow audit      │
│ Mapping table (enable/disable only)                               │
└───────────────────────────────────────────────────────────────────┘
```

### Evaluation algorithm (DR2-final day-1)

```
given (tenant_id, actor, action) at server_now:
  1. authn → resolve tenant; else auth_failed
  2. if tenant disabled → tenant_disabled
  3. load grants for (tenant, actor, action) where state in (active, revoked)
     and (expires_at is null or expires_at > server_now OR state=revoked)
  4. if any deny-class / revoked-wins row applicable → deny explicit_revoke
     (sticky local allow does not apply when evaluating deny-class)
  5. if any active allow-class (including sticky) with valid expiry → allow grant_active
  6. if only expired allow rows existed → deny expired
  7. else → deny no_grant
  8. enqueue audit async; return
```

**Sticky interaction:** Sticky only protects an **allow** from being cleared by provider revoke adapters (adapters skip deleting/revoking sticky locals; they still revoke non-sticky locals and provider bindings). An **explicit local revoke** still denies.

### Grant row sketch (delta from DR1)

| Column | DR2 note |
| --- | --- |
| `binding_id` | Required for webhook sources; upsert key component |
| `sticky` | Boolean, local grants only; default false |
| `expires_at` | Local / explicit maps only; not Stripe period-end |
| Unique | `(tenant_id, actor, action, source, binding_id)` where active/revoked history may soft-version — implement detail for DR3/CR if history needed; day-1 may overwrite state in place |

---

## 3. Contract deltas (reason codes)

| Code | When |
| --- | --- |
| `grant_active` | Active allow; no winning revoke |
| `explicit_revoke` | Deny-class / revoke wins |
| `expired` | Only expired grants matched |
| `no_grant` | Nothing matched |
| `tenant_disabled` / `auth_failed` | Transport / tenancy |
| `maydo_unavailable` | SDK/client-side when host errors/timeouts (fail closed) — not necessarily a server body |

Still **not** reason codes: plan names, invoice ids, price ids, credits, packaging metadata.

---

## 4. Adversarial critique (DR2 choices — harder than DR1)

Aimed at **this pass’s locks**, not rehash of “should we be Chargebee.”

1. **RLS + shared schema theater:** If the app sets `maydo.tenant_id` from the API key but a worker drain runs without GUC (or with a global superuser bypass), revoke/grant adapters can cross tenants while HTTP looks safe. Is “RLS on API paths only” an illusion? Drain must set tenant from the outbox row and still enforce predicates.

2. **Boolean grant + ignored `invoice.paid`:** A Stripe sub that goes `past_due` then recovers without `subscription.updated` hitting our narrow revoke map leaves access open unpaid — or a missed `deleted` leaves zombies. Without SeatTruth, how do founding buyers detect orphan grants besides weekly checklist vibes?

3. **Sticky local allow:** CSM will sticky everything “just in case,” recreating uncontrolled comps. Without expiry-required-on-sticky or audit report “sticky grants > N,” finance never notices. Did we invent Soft-WTP comps?

4. **Async audit degrade-to-sample:** The one time you need an allow=true trail is after an incident (“did we open the barn?”). Sampling at 1% during the exact overload window destroys evidence. Is degrade policy attacker-controllable via allow spam?

5. **Fail closed + single region:** First multi-hour outage trains buyers to **cache forever** or fork an embed. Support hours explode; roadmap splits. Is status page + deny enough, or did we lock a shape that cannot survive its own SLO honesty?

6. **Polar `canceled` no-op / `revoked` revoke:** If docs drift or a merchant uses immediate revoke paths differently, or `subscription.updated` alone carries status `canceled` without `revoked` in some API version, we either deny early (chargeback bait) or leave access open. Enum drift is an implement-time landmine — who owns the drift test?

7. **All-or-nothing partial refund:** Buyer refunds one seat of a five-seat mental model; MayDo strips all actions. Founding customer calls that a bug and demands quantity — kill criteria say refuse, but will founder refuse under churn pressure?

8. **Actor metadata trust:** Server-set metadata is guidance, not enforcement. A compromised or lazy buyer app that lets the browser pass `maydo_actor` into Checkout lets attacker A pay and grant actor B (or themselves onto a victim org). Do we need a signed buyer assertion, or is “your Checkout, your breach” the honest boundary?

9. **N outbox rows per multi-action:** One `order.paid` with 20 actions = 20 drain jobs. Poison on action #19 dead-letters one key while 1–18 granted — operator replay fixes one action; product looks “half entitled.” Is there a mandatory “expansion set id” so health shows incomplete sets?

10. **Operator web read + CLI write:** Humans will scrape the console and then paste CLI commands wrong; or demand web execute for replay. Split brain UX increases MINIMUM_SUPPORT hours past 2 h/week kill clock.

11. **API key Bearer only:** Key in browser = game over for allow reads (information leak of entitlement posture) and, if someone mistakenly ships `md_op_` to a client, grant writes. Should decision keys be restricted by referrer/IP (fragile) or accept that allow answers are not secret?

12. **`maydo_unavailable` deny:** Buyers wrap SDK with their own fail-open. We documented fail-closed; they ship fail-open; outage becomes free-for-all and they blame MayDo marketing. Contractual/docs control only — is that acceptable kill acceptance?

---

## 5. Open decisions for DR3 only

Fewer, sharper — anything here blocks LaunchGate or implementation honesty. Do **not** re-litigate D1–D12 defaults without new evidence.

1. **Drain tenancy enforcement:** Exact pattern for worker GUC / per-row tenant binding + RLS so adapters cannot cross tenants (critique #1). Accept or reject “service role bypass with mandatory WHERE” as CR-level control.

2. **Incomplete multi-action sets:** Whether to add `expansion_set_id` + operator health for partial grant application (critique #9), or accept per-action dead letters as MVP honesty.

3. **Sticky guardrails:** Require `expires_at` on sticky? Max sticky count / weekly audit report? Or pure operator discipline + FAQ (critique #3).

4. **Orphan / unpaid detection without SeatTruth:** Day-1 = docs checklist only, or a single read-only “grants with no recent provider event” report (not nightly auto-revoke)? Any auto-revoke = SeatTruth creep — kill check.

5. **Polar enum drift tests:** Pin webhook type list + contract tests against Polar docs/changelog before implement; decide `past_due` mapping flag default and whether `order.refunded` payload field names need a fixture pack.

6. **Public status + incident runbook:** Minimum status page automation vs manual; buyer communication template for fail-closed periods; founding refund policy if MayDo downtime exceeds X (money policy, not product feature).

7. **Decision key abuse / browser exposure:** Docs-only vs optional IP allowlist on tenant; confirm `md_op_` never in SDK.

DR3 must also run **LaunchGate checklist draft** (still design-only) against kill criteria — not implement.

---

## 6. Updated kill criteria check

| Signal | DR2 status |
| --- | --- |
| Roadmap item to make money without `allow()` | **Clear** — still refuse |
| Invoicing / Net / payment links / dunning / tax | **Clear** |
| Credit wallet / usage → invoice | **Clear** |
| Plan packaging studio / GTM catalog | **Clear** — mapping table only (D11) |
| `attach`-style create subscription/checkout | **Clear** |
| Customer portal / billing widgets | **Clear** |
| SeatTruth **daily** reconcile day-1 | **Clear** — boolean grants + optional later report (DR3 #4 must not become auto-revoke) |
| Soft-WTP / cold invoices | **Clear** — sticky comps watched (DR3 #3) |
| Support >2 h/week sustained | **Watch** — CLI/console split + sticky FAQ + partial-refund honesty are support load risks |
| Cannot demo allow + webhook grant + local override ≤60s | **Watch** — CLI path must hit this before Polar list |
| Marketing “monetization platform” / “replace Chargebee” | **Clear** |
| Fail-open default on hosted outage | **Clear** — locked fail-closed (D10) |
| SDK cache-on default | **Clear** — locked off (D5) |
| Quantity / seat prorated entitlements | **Clear** — all-or-nothing refunds (D9); refuse under churn pressure |

**One-line kill test (unchanged):**  
> If the roadmap item exists to make money *without* answering `allow()`, cut it. If it exists to invoice, meter-for-invoice, or reconcile seats nightly — cut it from MVP.

**New DR2 kill accents:** Auto-revoke orphan jobs · sticky-without-expiry as default · fail-open “availability mode” · partial-quantity entitlement math · benefit_grant / seat webhooks as SoR.

---

## DR2 outcome

- **Progressive on DR1:** shape, pipeline, fences, four surfaces retained; open §8 decisions closed with concrete defaults.  
- **Locked for DR3:** tenancy+RLS+Bearer keys; boolean binding upsert; provider-revoke wins + opt-in sticky; async audit; SDK cache-off; Polar map (`order.paid` / `order.refunded` / `subscription.revoked`; `canceled` no-op); actor metadata contract; CLI-complete + read console; N-outbox multi-action; all-or-nothing refunds; fail-closed SLO; mapping table; distinct `expired`.  
- **Next:** DR3 attacks DR2 critiques #1–12 and the seven open items — still **no** product code; then 4th DR LaunchGate.

*Last updated: 2026-09-26 ET — design pack only; no product code.*

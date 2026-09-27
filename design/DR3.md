# MayDo — Design Review 3 (DR3)

> **SKU shape (current):** self-host decision API process + thin TypeScript SDK (cache off by default) — the buyer runs Postgres, the API, and the worker. Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. The “hosted decision API” label and the founding goodwill credit in this file are a superseded 2026-09-26 draft. They are not sold. There is no seller hosted SLO.

**Product:** MayDo — entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial design #3 of 3 (FINAL adversarial design pass)  
**Builds on:** `design/DR2.md` (honor locked D1–D12 unless fatal; do not collapse DR×3)  
**Next gate:** 4th DR = LaunchGate (`LAUNCHGATE_DR4_PACK.md`) — this pass does **not** contact LaunchGate  
**Shape (current):** self-host decision API process + thin TypeScript SDK (cache off by default) — buyer runs Postgres/API/worker. Superseded draft, not the SKU: yellowgram-hosted decision API.  
**Pricing (USD):** ~$199 founding setup + ~$79/mo  
> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-26 design draft, not the price to charge.  
**Contact:** hello@yellowgram.dev  
**Date:** 2026-09-26 ET  
**Status:** design only — **no product code**; freeze for implement PR after LaunchGate go

Standing fences (unchanged): Soft-WTP OFF · cold invoices FORBIDDEN · not Chargebee / Schematic-upmarket · SeatTruth daily reconcile **LATER** · live Polar delivers `maydo-0.1.1.zip` (the 2026-09-26 “listing dark until zip/SHA” fence is superseded) · HookSteel patterns only (do not modify that repo).

---

## 0. DR2 lock inheritance (fatal-flaw scan)

DR3 re-read DR2 D1–D12 against kill criteria. **No fatal flaw found.** All twelve locks stand. DR3 only closes the seven §5 open items and hardens implementable specs.

| Lock | Fatal? | Note |
| --- | --- | --- |
| D1 Shared schema + RLS + Bearer `md_live_` / `md_op_` | No | Drain tenancy pattern closed in R1 below |
| D2 Boolean upsert by binding | No | Orphan report is read-only (R4) — not SeatTruth |
| D3 Provider revoke > local allow; sticky opt-in; local revoke always wins | No | Sticky guardrails in R3 |
| D4 Async audit; degrade deny-full + allow-sample; 30d | No | Degrade thresholds specified in checklist |
| D5 SDK cache off; TTL≤5s; TS only | No | |
| D6 Polar `order.paid` / `order.refunded` / `subscription.revoked`; canceled/past_due no-op | No | Enum pin + fixtures in R5 (docs re-confirmed 2026-09-26) |
| D7 Actor `maydo_*` → fallback → dead-letter | No | |
| D8 CLI writes + replay execute; read-mostly web | No | |
| D9 N outbox multi-action; refunds all-or-nothing | No | `expansion_set_id` in R2 |
| D10 Fail-closed; single-region; p99 ≤100ms in-region | No | Status + incident in R6 |
| D11 Mapping table + YAML seed | No | |
| D12 Distinct `expired` reason | No | |

**LaunchGate-block candidates from this pass:** none that overturn a DR2 lock. Residual risks are P2 / support-load / ops honesty — listed in §4 and the LaunchGate brief.

---

## 1. Resolution of DR2’s seven remaining items

### R1. Drain tenancy enforcement

**Lock:** Workers **never** use a DB role that bypasses RLS. Drain sets `maydo.tenant_id` **from the leased outbox row** before any grant mutation; predicates remain mandatory in application SQL.

| Rule | Spec |
| --- | --- |
| **DB roles** | App/API role and worker role are **non-superuser**, subject to RLS. No `BYPASSRLS` in production connection strings. Migrations run as a separate migrator role (not the runtime worker). |
| **GUC set** | On lease claim, worker runs `SELECT set_config('maydo.tenant_id', $tenant_id, true)` (transaction-local) using `outbox.tenant_id` from the claimed row. |
| **RLS policies** | `grants`, `provider_events`, `outbox`, `dead_letters`, `allow_audit`, `mapping_config`, `actor_maps`, `api_keys` (hash store): `USING (tenant_id = current_setting('maydo.tenant_id', true))` (+ WITH CHECK same). |
| **App SQL** | Repository helpers still require `tenant_id` as first argument and include `WHERE tenant_id = $1` even with RLS — belt and suspenders. Code review: bare table scan without tenant predicate = **CR blocker**. |
| **Reject** | “Service role bypass + mandatory WHERE only” as day-1 control. Bypass is a LaunchGate-kill if proposed as the sole isolation. |
| **Cross-tenant lease** | Outbox claim query is `WHERE state='pending' … FOR UPDATE SKIP LOCKED` **without** tenant filter (global drain queue is OK), but **all subsequent reads/writes** in that txn must run under the row’s `tenant_id` GUC. Claiming a row does not authorize other tenants’ data. |
| **Test** | Integration: seed two tenants; poison worker that “forgets” GUC must fail RLS (0 rows / error), not mutate tenant B. Explicit CR fixture. |

**Kill-risk if wrong:** Cross-tenant grant write = product-ending. Treat R1 tests as launch security criteria.

---

### R2. Incomplete multi-action sets

**Lock:** Add `expansion_set_id` (UUID) on every outbox/dead_letter row produced from one provider event expansion. Per-action idempotency stays; health surfaces incomplete sets.

| Field / behavior | Spec |
| --- | --- |
| **`expansion_set_id`** | Generated once when insert-won expands N actions in the same ingest txn; copied to all N outbox rows. Single-action events still get a set id (N=1). |
| **Idempotency key** | Unchanged: `provider\|provider_event_id\|grant:{action}` / `revoke:{action}`. |
| **Drain** | Still applies rows independently (no distributed saga). Mid-crash → remaining pending rows retry. |
| **Health** | Operator view / CLI: list sets where `count(done) < count(total)` OR any sibling `dead`, with age. Banner: “incomplete expansion set.” |
| **Replay** | Replay one dead letter id (HookSteel discipline). After fix+drain, health clears when all siblings `done`. No mandatory “replay whole set” day-1 — document that operator should check siblings of the same `expansion_set_id`. |
| **Accept** | Temporary half-entitled product state until drain finishes or operator replays. Honesty > fake atomicity across N adapters. |

**Not day-1:** Compensating “revoke siblings if one grant fails” (creates revoke storms). Optional later under LaunchGate only if support load demands.

---

### R3. Sticky guardrails

**Lock:** Sticky remains **opt-in**. Soft product guardrails — not Soft-WTP comps by default.

| Guardrail | Day-1 |
| --- | --- |
| **`expires_at` on sticky** | **Required.** CLI/API reject `sticky=true` without `expires_at`. Max sticky horizon: **90 days** from create (config constant). Renew sticky = explicit re-create / extend CLI with new expiry. |
| **Count soft-cap** | Warn (CLI stderr + web banner) when active sticky grants for tenant **> 10**. Hard block **not** day-1 (founding pilots may spike). |
| **Weekly report** | CLI `maydo sticky:report` (+ web read table): actor, action, expires_at, note, created_by. Email to tenant ops contact is **out** (support surface creep); operator runs report. |
| **Audit** | Sticky create/revoke always in operator audit / grant history; sticky shown in red/diff (DR2). |
| **FAQ** | Ticket FAQ #1: “pilot lost access after cancel” → sticky was not set / sticky expired / re-grant. |

**Refuse:** Sticky without expiry; sticky as mapping default; sticky auto-renew from webhooks.

---

### R4. Orphan / unpaid detection (no SeatTruth)

**Lock:** **Read-only** operator report only. **No** nightly auto-revoke. Auto-revoke of orphans = SeatTruth creep = **kill**.

| Item | Spec |
| --- | --- |
| **Report** | CLI `maydo grants:orphan-candidates` (+ web read table): active grants where `source ∈ {stripe,polar}` and `updated_at` / `source_event_id` age **> 45 days** with no newer provider_event touching that `binding_id`. Heuristic only — labeled “candidates, not truth.” |
| **Action** | Operator inspects Stripe/Polar dashboard; may **local revoke** or wait. MayDo never auto-revokes from this report. |
| **Docs checklist** | Weekly OPERATOR_NEEDS checklist: run orphan-candidates; paste into support only if investigating. |
| **Forbidden** | Cron that sets `state=revoked` from orphan heuristic; “sync subscription status” jobs; `invoice.paid` reactivation paths that reintroduce period math. |

---

### R5. Polar enum drift tests

**Lock (docs re-confirmed 2026-09-26 against [Polar webhook events](https://polar.sh/docs/integrate/webhooks/events) + OpenAPI `WebhookEventType`):**

**Day-1 grant/revoke map (frozen):**

| Type | Adapter |
| --- | --- |
| `order.paid` | Grant upsert |
| `order.refunded` | Revoke all-or-nothing (payload may show `partially_refunded` status → still full revoke) |
| `subscription.revoked` | Revoke |
| `subscription.canceled` | No-op |
| `subscription.past_due` | No-op; mapping flag `revoke_on_past_due` default **false** |
| `subscription.updated` / `active` / `created` / `uncanceled` | No-op |
| `order.created` / `order.updated` / `checkout.*` / `benefit_grant.*` / `refund.*` / `customer_seat.*` | No-op |

**Implement-prep artifacts (design-required files, not product runtime):**

| Artifact | Purpose |
| --- | --- |
| `fixtures/polar/event_types.pin.json` | Exact string enum subset MayDo handles + ignored list; CI fails if adapter switch misses a pinned grant/revoke type |
| `fixtures/polar/order.paid.json` / `order.refunded.json` / `subscription.revoked.json` | Minimal signed-shape bodies (headers: webhook-id, webhook-timestamp, webhook-signature) |
| `fixtures/polar/order.partially_refunded.json` | Status `partially_refunded` still triggers revoke adapter |
| Contract test | `describe('polar event map')` asserts grant/revoke/no-op matrix; changelog note: re-fetch Polar OpenAPI enum before merge of map PRs |
| Stripe fixtures | Parallel pin for checkout.session.completed, subscription.deleted, narrow subscription.updated statuses |

**Owner:** Implement PR author re-confirms Polar docs/changelog on the week of coding; LaunchGate may block if pin file absent from design PR checklist.

---

### R6. Public status + incident runbook

**Lock:** Fail-closed communication is documented for the decision API process the buyer runs. Money policy that is sold is the 14-day purchase refund, not a product feature and not a seller SLO. A yellowgram-operated status probe is superseded and not sold.

| Item | Day-1 |
| --- | --- |
| **Status URL** | Kit page (`status/index.html`) for release health and the process the buyer runs. Not a multi-tenant board for a decision API operated by yellowgram. |
| **Probe** | **Superseded / not sold** as a yellowgram cron against a hosted API. The buyer may check `/healthz` on the process they run. |
| **Buyer template** | When the process the buyer runs is down, `allow` returns deny / `maydo_unavailable`. Do not wrap the SDK with fail-open. That outage is the buyer’s process. |
| **Founding refund policy** | **Superseded / not sold.** The 2026-09-26 draft described a goodwill credit after a yellowgram-hosted outage. That credit is not buyer-facing and is not part of this purchase. The money policy that is sold is the 14-day purchase refund. When the decision API process the buyer runs is down, `allow` fails closed. That is not a seller outage and not a credit. |
| **Internal runbook** | For the process the buyer runs: do not enable a fail-open flag (one must not exist); prefer deny. Do not page buyers as if yellowgram operates the API. |

---

### R7. Decision key abuse / browser exposure

**Lock:** Docs-first; optional IP allowlist; `md_op_` never in SDK.

| Rule | Spec |
| --- | --- |
| **Key classes** | `md_live_` / `md_test_` = decision `allow` only. `md_op_` = grants CRUD, mapping, replay execute, audit export. SDK package accepts **only** decision keys; TypeScript types omit op key constructors. |
| **Browser** | Document: decision keys in browser expose entitlement posture (allow/deny for guessed actors). Prefer server-side `allow` proxy. Not secret in the cryptographic sense — treat as **sensitive configuration**. |
| **IP allowlist** | Optional per-tenant CIDR list on decision keys (empty = allow all). Op keys: strongly recommend allowlist; default empty with warning in CLI `keys:create --op`. |
| **Rotate** | Mint new + `expires_at` on old ≤24h overlap (DR2). Compromised browser key → rotate decision key; grants unchanged. |
| **Refuse day-1** | Referrer checks (fragile); mTLS (DR2 out); bundling op key in SDK “admin helpers.” |

---

## 2. Final adversarial pass (≥8) — attacker has read DR1+DR2

1. **Drain GUC race:** Attacker who can enqueue a forged outbox row (compromised worker creds) with `tenant_id=A` but payload pointing at tenant B’s actor strings still only mutates A’s grant namespace under RLS — unless payload carries raw SQL. Confirm adapters never interpolate identifiers into dynamic SQL; use bound params only. Residual: malicious operator with `md_op_` for tenant A cannot touch B — good. Compromised migrator role = game over — keep migrator offline.

2. **Expansion set half-state as feature:** Attacker triggers `order.paid` with 50 mapped actions to amplify drain lag and create “sometimes entitled” UX. Mitigate: mapping action list soft-cap (e.g. ≤20 actions per mapping row) + outbox depth alerts. Soft-cap is implement detail; document in mapping UX.

3. **Sticky expiry floor abuse:** Operator sets sticky `expires_at` = now+90d on every cancel-risk pilot → Soft-WTP comps. Mitigate: sticky:report weekly + warn >10; founder support FAQ refuses “make sticky default.” Kill clock if support hours spent managing comps.

4. **Orphan report as SeatTruth lobby:** Founding buyer demands “just auto-revoke candidates older than 45d.” Refuse — written kill. Residual: founder under churn may cave; LaunchGate must treat auto-revoke PR as no-go.

5. **Polar `subscription.updated` catch-all:** Polar docs state `subscription.updated` also fires on revoke paths alongside `subscription.revoked`. If an implementer “helpfully” maps `updated`+status parsing, we double-revoke or deny-early on cancel-without-revoke. Mitigate: pin file forbids grant/revoke on `subscription.updated`; contract test.

6. **Audit degrade as evidence eraser:** Attacker floods `allow` to trip degrade (100% deny logged + 1% allow sample) then probes allow=true paths that are undersampled. Mitigate: degrade thresholds high; alert before degrade; retain **all denies** even in degrade mode (tighten DR2: degrade = sample **allows** only, **never sample away denies**). **DR3 amendment to D4:** under degrade, enqueue **100% of deny decisions** + 1% of allows. Deny evidence preserved.

7. **Fail-closed training fail-open:** Buyer wraps SDK. Docs + onboarding checkbox “I will not fail-open” is weak. Accept as residual; support template blames buyer wrapper; MayDo does not add “availability mode.”

8. **Metadata actor swap:** Compromised buyer storefront passes victim `maydo_actor` into Checkout. Honest boundary: buyer’s Checkout, buyer’s breach. Onboarding: server-only metadata. Residual: no signed MayDo assertion day-1 — LaunchGate P2, not MVP block.

9. **Browser `md_live_` scraping:** Entitlement oracle for account enumeration. Mitigate: rate limit `allow` per key (e.g. token bucket); optional IP allowlist; docs say proxy via buyer backend. Rate limit is day-1 **should**; numbers in implement checklist.

10. **Refund all-or-nothing rage-quit:** Partial refund → full revoke. Document + refuse quantity. Residual: churn pressure — kill criteria say refuse; LaunchGate watches founder resolve.

11. **Status page theater:** Manual status stays green during real outage. Mitigate: external synthetic check ownership on founder calendar; LaunchGate can block Polar list if no status URL exists.

12. **CLI/web split support burn:** Operators paste wrong grant ids. Mitigate: dry-run everywhere writes exist; web never execute replay; START_HERE ≤60s demo path mandatory before Polar list.

**DR3 amendments to prior locks (non-fatal, additive):**
- **D4 degrade:** 100% deny enqueue + 1% allow sample (not 1% of all).
- **R3 sticky:** `expires_at` required; max 90d.
- **R2:** `expansion_set_id` required on expanded outbox rows.
- Mapping actions soft-cap ≤20 (implement constant).

No DR2 lock overturned.

---

## 3. IMPLEMENTATION CHECKLIST (design PR — still not code)

Suitable as the body of a design PR that LaunchGate go/no-go’s. Paths are proposed module layout for the future implement repo (names normative for design; code lands only after LaunchGate).

### 3.1 Tables / schema

| Table | Key columns / constraints |
| --- | --- |
| `tenants` | `id`, `status` (active/disabled), `name`, created_at |
| `api_keys` | `id`, `tenant_id`, `prefix` (`md_live_`/`md_test_`/`md_op_`), `key_hash`, `scopes`, `ip_allowlist` cidr[], `expires_at`, `revoked_at`; UNIQUE hash |
| `provider_events` | DR1 + `tenant_id`; UNIQUE `(tenant_id, provider, provider_event_id)` |
| `outbox` | DR1 + `tenant_id`, `expansion_set_id`, `idempotency_key` UNIQUE, lease fields |
| `dead_letters` | DR1 + `tenant_id`, `expansion_set_id`, `reason`, `replayed_at` |
| `grants` | `id`, `tenant_id`, `actor`, `action`, `source`, `binding_id`, `state`, `precedence_class` (allow/deny), `sticky`, `expires_at`, `revoked_at`, `source_event_id`, `note`, `updated_at`; UNIQUE `(tenant_id, actor, action, source, binding_id)` |
| `allow_audit` | DR1 + async; retention 30d job |
| `mapping_config` | `provider`, `event_type`, `actions[]` (≤20), `enabled`, optional `product_or_price_id`, optional `revoke_on_past_due` |
| `actor_maps` | `tenant_id`, `provider`, `provider_customer_id` → `actor` |
| `product_action_maps` | `tenant_id`, `provider`, `provider_price_or_product_id` → `actions[]` |
| RLS | All above except possibly `tenants`; GUC `maydo.tenant_id` |

### 3.2 Modules (proposed)

```
apps/api/          # HTTP: /v1/allow, webhooks, health
apps/worker/       # outbox drain, audit writer, retention job
packages/sdk-ts/   # thin SDK, cache off default, decision keys only
packages/db/       # migrations, RLS policies, repository helpers (tenant_id required)
packages/adapters/ # stripe + polar verify + map + grant/revoke adapters
packages/cli/      # operator CLI
apps/console/      # read-mostly web
fixtures/polar/    # pin + bodies
fixtures/stripe/
docs/              # START_HERE, status, runbooks, FAQ
```

### 3.3 HTTP endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/v1/allow` | `md_live_` / `md_test_` | Read-only evaluate + async audit enqueue; fail-closed |
| `POST` | `/v1/webhooks/stripe` | Stripe signature | HookSteel HTTP contract |
| `POST` | `/v1/webhooks/polar` | Polar HMAC + webhook-id | provider_event_id = webhook-id header |
| `GET` | `/healthz` | none | Process up |
| `GET` | `/readyz` | none | DB reachable; not grant correctness |
| Console APIs (read) | `/op/...` | session or `md_op_` | grants list, events, audit search, dead-letter list, mapping toggles; **no** replay execute |

### 3.4 CLI commands (`maydo …`)

| Command | Writes? |
| --- | --- |
| `grants list \| get \| create \| revoke \| sticky:report` | create/revoke write |
| `grants orphan-candidates` | read |
| `mapping list \| enable \| disable \| set-actions` | write |
| `webhooks events \| health` | read |
| `replay list \| dry-run \| execute` | execute write (reopen only) |
| `outbox drain --once` / `outbox depth` | drain write / read |
| `audit search \| export` | read |
| `keys create \| rotate \| list` | write |
| `status` (prints public status URL + local health) | read |

### 3.5 SDK (`@yellowgram/maydo` TS)

- `createClient({ apiKey, baseUrl, timeoutMs, cache?: { ttlMs ≤ 5000 } })`
- `allow({ actor, action, bypassCache?: boolean })` → `{ allow, reason, grant_ids, evaluated_at }`
- Reasons: `grant_active` \| `explicit_revoke` \| `expired` \| `no_grant` \| `tenant_disabled` \| `auth_failed` \| client `maydo_unavailable`
- Default cache **off**; refuse `md_op_` keys

### 3.6 Config / ops

- YAML seed → DB mapping (DB wins)
- Audit degrade: depth threshold config; **100% denies + 1% allows**
- Retention cron: allow_audit 30d
- Rate limit on `/v1/allow` per key
- Public status URL env/docs
- Single region deploy target documented

### 3.7 Tests (design-required before Polar list)

- RLS cross-tenant drain fixture (R1)
- Polar/Stripe map matrix + pin file (R5)
- Idempotent duplicate webhook → one grant
- Multi-action N outbox + incomplete set health
- Sticky requires expires_at; provider revoke skips sticky; local revoke wins
- Fail-closed SDK on 5xx/timeout
- Refund all-or-nothing including partially_refunded
- Actor unresolved → dead-letter, no grant
- Demo script ≤60s: paid → allow → revoke → deny

### 3.8 Docs deliverables

START_HERE · Webhook status contract · Troubleshooting top 8 · Glossary · Sticky / partial-refund / fail-closed FAQ · Incident template · Founding refund money policy · Out-of-scope auto-reply

---

## 4. LaunchGate 4th-DR brief (≤1 page)

**Hand pack:** `design/LAUNCHGATE_DR4_PACK.md`.

### What to attack

1. Cross-tenant isolation under drain (R1) — can any adapter path skip GUC/RLS?  
2. SeatTruth creep — orphan report, sticky, past_due flags, benefit_grant, seats.  
3. Fail-open temptation — any flag, SDK default, or status “availability mode”?  
4. Billing SoR creep — attach/checkout create, invoice.paid grants, quantity math, packaging studio.  
5. Support-load honesty — CLI/web split, sticky comps, partial-refund docs, ≤2 h/week.  
6. Polar enum pin + fixtures present and matched to live docs.  
7. Demo ≤60s path real in design (not vapor).  
8. Decision vs op key separation; SDK cannot take `md_op_`.  
9. Degrade policy preserves deny evidence (DR3 D4 amendment).  
10. Status URL + incident + founding refund money policy written before charge.

### Kill criteria (abort / no-go design PR)

| Kill | Signal |
| --- | --- |
| Money without `allow()` | Roadmap item |
| Invoicing / Net / links / dunning / tax | Any |
| Credit wallet / usage → invoice | Any |
| Packaging studio / GTM catalog | Beyond mapping table |
| `attach`-style create subscription/checkout | Any |
| Customer portal / billing widgets | Any |
| SeatTruth **daily** reconcile or **auto-revoke orphans** | Day-1 |
| Soft-WTP / cold invoices | Any |
| Fail-open default / “availability mode” | Any |
| SDK cache-on default | Any |
| Quantity / seat prorated entitlements | Any |
| RLS bypass as sole isolation | Any |
| Support >2 h/week sustained with no doc gap plan | Watch → pause sales |
| Cannot demo allow + webhook grant + local override ≤60s | No Polar list |
| Marketing “monetization platform” / “replace Chargebee” | Fence |

**One-line kill test:** If it makes money without answering `allow()`, or invoices / meters-for-invoice / nightly seat reconcile — cut it.

### Known limits (P2 candidates — not day-1)

- Embed/offline library SoR (only if running the buyer’s decision API process on the critical path forces it post-founding)  
- mTLS / compliance auth  
- Signed buyer actor assertions beyond Checkout metadata  
- Auto-revoke / SeatTruth daily reconcile  
- Web replay execute / full console CRUD  
- Multi-region / paid SLA  
- Additional PSPs  
- Numeric limits / credits **only** if still decision-kernel (never invoicing)  
- `revoke_on_past_due` mapping flag enabled by default  
- benefit_grant / customer_seat as SoR  
- Rate-limit / IP allowlist sophistication beyond day-1 basics  

### Ask of LaunchGate

**Go / no-go on opening the implement (design→code) PR** against this freeze. Do not implement in the LaunchGate pass. Do not contact other agents beyond the pack handoff by parent.

---

## 5. Freeze statement

### Frozen for implement PR (after LaunchGate **go** only)

- Shape: self-host decision API process + thin TypeScript SDK (cache off; TTL≤5s opt-in) — buyer runs Postgres/API/worker. The “hosted decision API” wording is superseded and is not the SKU.  
- Tenancy: shared Postgres + mandatory `tenant_id` + RLS + worker GUC-from-row (R1); Bearer `md_live_`/`md_test_`/`md_op_`  
- Grants: boolean upsert `(tenant, actor, action, source, binding_id)`; no period-end SoR  
- Precedence: explicit revoke wins; else active allow; else deny; provider revoke > non-sticky local allow; sticky opt-in with **required expires_at ≤90d**; local revoke always wins  
- Audit: async; degrade = 100% denies + 1% allows; 30d retention  
- Polar/Stripe maps per D6/R5; canceled/past_due no-op; `expansion_set_id` + N outbox; refunds all-or-nothing  
- Actor: `maydo_actor` / `maydo_action(s)` → fallback maps → dead-letter  
- Operator: CLI writes + replay execute; read-mostly web; mapping table + YAML seed  
- Fail-closed deny on the process the buyer runs; the 2026-09-26 p99 / single-region figure is a draft target, not a yellowgram-operated SLO; distinct `expired`  
- Orphan: read-only report only (R4)  
- Status + incident template for the process the buyer runs (R6). The founding goodwill credit is superseded and not sold.  
- Key abuse: docs + optional IP allowlist; no `md_op_` in SDK (R7)  
- Fences: Soft-WTP OFF, no cold invoices, no Chargebee/Schematic-upmarket, SeatTruth later, Polar dark until deliverables, HookSteel patterns only  

### LaunchGate may still **block** (not silently change)

- Missing RLS/drain tests or pin fixtures in the implement plan  
- Any kill-criteria creep discovered in design PR text  
- Absent status URL / money refund policy / ≤60s demo path  
- Support-surface balloon (web replay execute, packaging UX, SLA SKU at launch)  
- Security isolation gaps (cross-tenant)  

### LaunchGate must **not** do in the 4th pass

- Implement product code  
- Collapse or rewrite DR1–DR3 history  
- Relitigate wedge to monetization suite without an explicit kill  
- Contact founding buyers / send Soft-WTP  

### DR×3 closure

DR1 (architecture) → DR2 (D1–D12 locks) → DR3 (R1–R7 + checklist + freeze). Progressive passes preserved. Ready for parent to hand `LAUNCHGATE_DR4_PACK.md` to LaunchGate.

---

## DR3 outcome

- **7/7 DR2 open items resolved** with implementable specs (R1–R7).  
- **Additive amendments:** deny-preserving audit degrade; sticky expiry required; `expansion_set_id`; mapping ≤20 actions.  
- **No DR2 lock fatal-flaw overturn.**  
- **Implementation checklist** ready for design PR.  
- **LaunchGate brief + pack** ready; kill criteria restated; P2 limits listed.  
- **Freeze** drawn: implement-after-go vs LaunchGate block rights.

*Last updated: 2026-09-26 ET — design pack only; no product code; do not contact LaunchGate from this pass.*

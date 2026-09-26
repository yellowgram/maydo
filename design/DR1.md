# MayDo — Design Review 1 (DR1)

**Product:** MayDo — entitlement kernel (`allow(actor, action)`)  
**Pass:** progressive adversarial design #1 of 3  
**Shape (locked for DR1):** hosted decision API + thin SDK (default after founder skipped shape widget 2026-09-26)  
**Pricing (USD):** ~$199 founding setup + ~$79/mo  
**Contact:** hello@yellowgram.dev  
**Date:** 2026-09-26 ET  
**Status:** design only — no product code; do not collapse DR×3  

Standing fences: Soft-WTP OFF · cold invoices FORBIDDEN · not Chargebee / Schematic-upmarket · SeatTruth daily reconcile **LATER** · Polar listing **dark** until zip/SHA/deliverables · HookSteel patterns only (do not modify that repo).

---

## 1. Problem & non-goals

### Problem

Buyers need one answer on the request path: **may this actor do this action right now?** Billing state lives in Stripe and/or Polar; product code must not re-parse invoices or invent a packaging studio. MayDo materializes **grant truth** from signed webhooks plus operator-owned local grants, and answers `allow` as a read-only hot path.

### Non-goals (cite MVP OUT)

| Non-goal | Why (MVP_SCOPE Out) |
| --- | --- |
| Invoicing / Net terms / payment links / dunning / tax | Chargebee-style; Soft-WTP / cold invoices forbidden |
| Usage metering → end-of-period invoices | Autumn / Orb / Metronome / Lago |
| Plan packaging studio / GTM catalog UI | Schematic / Stigg EMS upmarket |
| Credit wallets / auto top-up / ASC 606 ledger product | Monetization suite, not kernel |
| SeatTruth daily reconcile | Explicitly **later** |
| Customer portal / billing widgets | Schematic / Stigg surface |
| Feature-flag platform (experiments, % rollouts) | Wrong category |
| Chargebee / Zuora replacement | Standing fence |
| Soft-WTP / cold invoices / waitlist monetization | Forbidden |
| Polar public listing at day-1 | Dark until deliverables |
| Unbounded multi-PSP | Stripe + Polar only at MVP |
| Implementation / Lock / Audit SKUs as primary offer | Product = decision kernel |

### Day-1 in (reminder)

Decision API · Stripe + Polar webhook ingest → grant materialization · local grants · operator minimum (grants / webhook health / replay / allow audit) · delivery honesty on shape.

---

## 2. Recommended architecture (hosted API + thin SDK)

### Components

```
┌─────────────┐   signed webhooks    ┌──────────────────────────────┐
│ Stripe /    │ ───────────────────► │ MayDo Hosted Ingest          │
│ Polar       │                      │  verify → unique event →     │
└─────────────┘                      │  same-txn outbox enqueue     │
                                     └───────────┬──────────────────┘
                                                 │ commit
                                     ┌───────────▼──────────────────┐
                                     │ Drain / worker               │
                                     │  FOR UPDATE SKIP LOCKED      │
                                     │  materialize / revoke grants │
                                     └───────────┬──────────────────┘
                                                 │
┌─────────────┐   allow(actor,action) ┌──────────▼──────────────────┐
│ Buyer app   │ ◄──────────────────── │ Decision API (read-only)    │
│ + thin SDK  │   API key / mTLS TBD  │  evaluate grants + audit    │
└─────────────┘                      └──────────────────────────────┘
        ▲                                        ▲
        │ operator CLI / console                 │
┌───────┴────────────────────────────────────────┴──────────────────┐
│ Operator surfaces: Grants · Webhook health · Replay · Allow audit │
└───────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
| --- | --- |
| **Ingest (Stripe + Polar)** | Raw-body verify, HTTP status contract (400 / 500 / 200-duplicate), persist provider events idempotently, enqueue grant adapters in **same transaction** (HookSteel pattern). Adapters never run inside the webhook request. |
| **Outbox + drain** | Same-txn enqueue; drain after commit with lease reclaim, exponential backoff, dead_letters on max attempts / poison. Idempotency key: `provider\|provider_event_id\|adapter`. |
| **Grant store** | Source of truth for active / revoked / expired grants; sources `stripe` \| `polar` \| `local`. |
| **Decision API** | Hot-path `allow` — read-only against grant store; append allow-audit row (async or same txn with care for latency). |
| **Thin SDK** | Client wrapper: auth header, timeout, optional short TTL cache (documented staleness), typed request/response. **No** local grant DB in SDK day-1; SDK is not an offline SoR. |
| **Operator console / CLI** | Four surfaces from `OPERATOR_NEEDS.md` (see §5). Boring tables; no GTM chrome. |
| **Config** | Per-tenant webhook secrets, event→action maps, mapping disable flags, livemode declaration. |

### Data model sketch

**`provider_events`** (idempotent ingest)

| Column (sketch) | Notes |
| --- | --- |
| `id` | Internal UUID |
| `tenant_id` | Hosted tenancy |
| `provider` | `stripe` \| `polar` |
| `provider_event_id` | Stripe `event.id`; Polar = **webhook-id header** (not `data.id`) |
| `event_type` | e.g. `checkout.session.completed`, `order.paid` |
| `livemode` | Boolean / declared |
| `payload_ref` | Stored raw or redacted blob pointer — keep PII out of allow audit |
| `status` | `received` → `outboxed` → `processed` \| `ignored` |
| `received_at` | Server clock |
| UNIQUE `(tenant_id, provider, provider_event_id)` | ON CONFLICT DO NOTHING |

**`outbox` / `dead_letters`**

| Column (sketch) | Notes |
| --- | --- |
| `idempotency_key` | `provider\|provider_event_id\|adapter` |
| `adapter` | e.g. `grant_from_paid`, `revoke_from_cancel` |
| `state` | pending / leased / done / dead |
| `attempts`, `next_attempt_at`, `lease_until` | Drain discipline |
| `payload` | Minimal grant mutation intent (actor, action, source_event_id) |
| Dead letter: `reason`, `replayed_at` | Replay CLI: list → dry-run → execute → drain |

**`grants`**

| Column (sketch) | Notes |
| --- | --- |
| `id` | Grant id returned in allow audit |
| `tenant_id`, `actor`, `action` | Opaque buyer strings |
| `source` | `stripe` \| `polar` \| `local` |
| `state` | `active` \| `revoked` \| `expired` |
| `precedence_class` | Day-1: `deny` (explicit revoke) vs `allow` (grant) |
| `created_at`, `expires_at`, `revoked_at` | Expiry checked at evaluate time |
| `source_event_id` | Last webhook event id (nullable for local) |
| `provider_customer_or_order_id` | Search aid |
| `note` | Operator comps / pilots |
| Index `(tenant_id, actor, action, state)` | Hot-path allow |

**`allow_audit`** (append-only or time-bounded)

| Column (sketch) | Notes |
| --- | --- |
| `ts`, `tenant_id`, `actor`, `action` | |
| `decision` | `allow` \| `deny` |
| `reason_code` | Minimal set (§3) |
| `grant_ids` | Consulted grant id(s) |
| `latency_ms` or bucket | |
| **No** raw webhook JSONB / cardholder PII | |

**`mapping_config`** (operator-editable)

| Column (sketch) | Notes |
| --- | --- |
| `provider`, `event_type` → `action`(s) | Grant-oriented maps |
| `enabled` | Disable without redeploy (OPERATOR_NEEDS) |

---

## 3. `allow(actor, action)` contract

### Request (hosted HTTP sketch)

```
POST /v1/allow
Authorization: Bearer <tenant_api_key>
Content-Type: application/json

{
  "actor": "org_123",      // opaque buyer id
  "action": "export.pdf"   // opaque buyer vocabulary
}
```

Optional day-1: `Idempotency-Key` **not** required (read-only; no side effects beyond audit).

### Response

```
{
  "allow": true,
  "reason": "grant_active",
  "grant_ids": ["grt_…"],
  "evaluated_at": "2026-09-26T23:00:00Z"
}
```

Deny example:

```
{
  "allow": false,
  "reason": "explicit_revoke",
  "grant_ids": ["grt_…"],
  "evaluated_at": "…"
}
```

### Reason codes (minimal)

| Code | Meaning |
| --- | --- |
| `grant_active` | At least one active non-expired grant; no winning revoke |
| `explicit_revoke` | Active revoke / deny grant wins |
| `no_grant` | No matching grant |
| `expired` | Only expired grants matched (optional collapse into `no_grant` in DR2) |
| `tenant_disabled` / `auth_failed` | Transport / tenancy — not product entitlement |

**Not** reason codes: plan names, invoice ids, price ids, credit balances, packaging metadata.

### Evaluation (day-1 precedence — OPERATOR_NEEDS / MVP_SCOPE)

1. Explicit revoke / deny for `(actor, action)` wins → deny (`explicit_revoke`).
2. Else any **active** grant for `(actor, action)` with `expires_at` null or > now → allow (`grant_active`).
3. Else deny (`no_grant` / `expired`).

Local and webhook grants compose under the same rules; source is audit metadata, not a separate precedence ladder day-1.

### Latency / trust assumptions

| Assumption | Day-1 stance |
| --- | --- |
| **Latency** | Target p99 ≤ ~50–100 ms within region for grant lookup + audit write (or async audit if write threatens SLO — open for DR2). Not edge/CDN sidecar (Stigg-class) at founding. |
| **Trust** | Buyer app trusts MayDo over HTTPS + API key. MayDo trusts Stripe/Polar **signatures** only — never unsigned forged bodies. |
| **Clock** | Evaluate expiry with **MayDo server time**; document skew vs provider event timestamps (§6). |
| **Consistency** | Allow reads grant store **after** drain applies mutations. Webhook ACK ≠ grant applied if drain down (HookSteel lesson). |
| **SDK cache** | If enabled, default TTL ≤ few seconds; stale allow is a known failure mode; bust on local revoke is **not** guaranteed cross-instance day-1. |
| **No money path** | `allow` never calls Stripe/Polar charge or invoice APIs. |

---

## 4. Webhook → grant materialization

### Shared pipeline (HookSteel patterns — do not modify HookSteel)

1. Receive raw body + signature headers.  
2. Verify (Stripe `constructEvent`; Polar stdlib HMAC, two key eras).  
3. `INSERT provider_events … ON CONFLICT DO NOTHING`.  
4. If insert won: enqueue outbox adapter row(s) in **same transaction**.  
5. Commit → drain applies grant mutations.  
6. HTTP: bad sig / bad secret / livemode mismatch → **400**; DB/txn fail → **500**; duplicate → **200** (no second grant).

### Stripe event map (day-1 grant-oriented)

| Event | Adapter intent | Notes |
| --- | --- | --- |
| `checkout.session.completed` | Grant `(actor, action)` from session metadata / configured map | Prefer metadata keys buyer owns (`maydo_actor`, `maydo_action`) |
| `checkout.session.async_payment_succeeded` | Same grant path | |
| `customer.subscription.deleted` | Revoke mapped actions for actor | |
| `customer.subscription.updated` (status → canceled / unpaid) | Revoke or no-op per map | Keep map **narrow**; ignore invoice noise |
| `invoice.paid` | **Ignore by default** | Avoid invoice-driven double grants; money stays in Stripe |
| Unmapped types | `ignored` status | Operator can pause/enable rows |

### Polar event map (day-1)

| Event | Adapter intent | Notes |
| --- | --- | --- |
| `order.paid` | Grant from order / product → action map | `provider_event_id` = webhook-id header |
| `order.refunded` | Revoke mapped grants for that order’s actor/actions | Replay ≠ refund glossary |
| Subscription cancel / revoke equivalents (Polar types as documented at implement time) | Revoke | Confirm exact type names in DR2 against Polar docs |
| Checkout variants not paid | Ignore | |

No Polar SDK required in buyer core (pattern keep).

### Actor / action extraction

- **Primary:** buyer-supplied metadata on Checkout / Polar product or order custom fields.  
- **Fallback:** mapping table `provider_price_or_product_id → action` + `customer_id → actor` join table maintained by operator (minimal; **not** a packaging studio).  
- Missing actor/action → dead-letter / ignored with operator-visible reason — do not invent silent grants.

### Grant precedence with local grants

| Rule | Behavior |
| --- | --- |
| Explicit local **revoke** | Wins over webhook-derived active grants for that `(actor, action)` |
| Local **allow** grant | Same class as webhook allow; any active allow suffices if no revoke |
| Webhook revoke after local allow | Webhook revoke creates deny-class grant (or sets state revoked on matching source rows) — **open:** whether local allow survives provider revoke (DR2 must pick; DR1 default: **explicit local revoke is the only local that beats provider**; local allow does **not** outrank a later provider revoke unless operator re-grants) |
| Double paid events | Idempotent event + idempotent outbox key → one grant row (or upsert active) |
| Mapping disable | Skip enqueue for that event type without redeploy |

---

## 5. Operator surfaces (map to OPERATOR_NEEDS)

| Need | Hosted day-1 surface | Must see / do |
| --- | --- | --- |
| **1. Grants** | Console table + CLI `grants list/create/revoke` | Per actor: active grants, source, action, created/expires, last event id; search by actor / action / provider customer|order; create local grant; revoke immediately; disable mapping row |
| **2. Webhook health** | Event list + counters | Last N events: type, provider_event_id, status, HTTP class; 2xx/400/500 1h/24h; outbox depth; dead letters; livemode vs traffic; secret rotate runbook |
| **3. Replay** | CLI (+ thin UI list) | `replay:list` → `dry-run` → `execute` → `outbox:drain`; one id; no `--force`; execute reopens work, does not call adapter; glossary: replay ≠ refund |
| **4. Allow audit** | Search + export | Filter actor / action / deny-only; export window CSV/JSON; grant ids + reason only; retention documented; **not** product analytics |

**Health = green when:** signatures verify; duplicates ACK 200 with one grant truth; drain heartbeat fresh; dead-letter count stable or down.

**Deflect:** invoices, credit wallets, SeatTruth nightly dashboards, flag % rollouts, editing Stripe/Polar catalog prices inside MayDo.

Support boundary stays thin (`MINIMUM_SUPPORT.md`): email hello@yellowgram.dev, best-effort, ticket requires failing `allow` example + webhook event id — no live secrets.

---

## 6. Threats / failure modes

| Threat | Failure mode | Day-1 mitigation |
| --- | --- | --- |
| **Duplicate webhooks** | Double grant / double revoke | UNIQUE `(provider, provider_event_id)`; outbox idempotency key; HTTP 200 on duplicate |
| **Revoke races** | Paid and cancel reorder; allow flaps | Drain serializes per idempotency; evaluate uses current grant state; document eventual consistency window; prefer revoke-wins precedence |
| **Clock skew** | `expires_at` vs provider `created` vs buyer clock | Server-side evaluate; reject Polar timestamps outside tolerance at verify (HookSteel-style); document skew SLA |
| **SDK cache staleness** | Allow true after revoke | Short TTL; document “read-after-revoke may lag TTL”; optional `Cache-Control` / SDK `bypass_cache` flag for critical paths |
| **Drain down** | Webhook 200 but grant missing | Operator health: outbox depth + heartbeat; runbook: events ACK’d ≠ grants applied |
| **Bad signature / livemode mismatch** | Replay attacks / test→live bleed | 400; never 200-on-bad-sig (Polar disable risk) |
| **Poison adapter** | Infinite retry | Max attempts → dead_letter; replay only after fix |
| **Mapping misconfig** | Wrong action granted | Operator disable mapping; dry-run replay; allow audit deny/allow spot check |
| **Audit PII leak** | Raw webhook in allow stream | Audit stores grant ids + decision metadata only |
| **API key leak** | Unauthorized allow reads / grant CRUD | Tenant keys rotatable; separate ingest endpoints (provider sig) from decision auth |
| **Local vs webhook conflict** | Comp grant vs cancel | Documented precedence (§4); operator diff view |

---

## 7. Adversarial critique (expert attack vectors)

Hard questions DR1 does **not** pretend to have finished answering — fuel for DR2/DR3:

1. **Actor binding:** If Checkout metadata is missing or spoofable by the buyer’s customer, who is the actor? Do we trust client-supplied metadata at payment time, or only server-side Stripe Customer id maps — and who maintains that map without becoming a CRM?

2. **Subscription renewals:** Does `invoice.paid` / renewal create a **new** grant row or extend `expires_at`? Ignoring `invoice.paid` avoids double-grant but may leave expiry wrong if we keyed grants to period end. Are we accidentally designing SeatTruth?

3. **Partial refunds / quantity:** Polar `order.refunded` and Stripe charge refunds — revoke all actions or none? Entitlement kernels die in quantity math; is “all-or-nothing revoke” honest enough for founding buyers?

4. **Multi-action products:** One paid event → N actions. Is the outbox one row per action (N idempotency keys) or one adapter that expands? Failure mid-expand = split brain.

5. **Hosted multi-tenant isolation:** Shared DB with `tenant_id` vs schema-per-tenant. One missing WHERE clause on `allow` is a cross-tenant data breach — is row-level security in scope day-1 or “be careful”?

6. **Allow-audit write amplification:** Every page view calling `allow` could 10–100× webhook volume. Sync audit insert vs sampled audit vs async queue — which breaks the latency promise first?

7. **SDK as foot-gun:** Shipping a cache makes demos fast and production wrong. Is “thin SDK” actually `fetch` + types with **cache off by default**, or are we re-implementing Stigg edge lore at $79/mo?

8. **Provider revoke vs local pilot:** Founder comps a pilot (`local` allow); customer cancels Stripe. DR1 default says provider revoke wins over local allow — that surprises every CSM. Opposite default surprises every finance lead. Which founding customer do we anger first?

9. **Polar webhook-id uniqueness:** HookSteel uses webhook-id header as `provider_event_id`. If Polar ever reuses or if operators replay from dashboard differently than Stripe retries, do we silently no-op a real grant?

10. **Shape honesty:** Hosted API implies MayDo uptime is on the buyer’s critical path. At founding price, is single-region + status page enough, or will the first outage force an “embed the library” fork that splits the roadmap (and support hours)?

11. **Kill-path temptation:** “Just add usage counters so allow can do rate limits” is how kernels become Schematic. What concrete API shape do we refuse even if a founding buyer asks in week two?

---

## 8. Open decisions for DR2

Explicitly unresolved in DR1 — DR2 must attack these, not re-litigate the wedge:

1. **Tenancy model:** shared schema + `tenant_id` (+ RLS?) vs stronger isolation; API key / auth scheme (Bearer vs mTLS).  
2. **Grant upsert semantics:** new row vs extend `expires_at` on renewal; whether period-end is stored at all without SeatTruth.  
3. **Local allow vs provider revoke:** pick and document one founding default; operator override flag?  
4. **Allow-audit durability:** sync vs async vs sample; retention defaults for hosted.  
5. **SDK cache policy:** off-by-default vs opt-in TTL; bypass flag; language SDKs (TS first only?).  
6. **Exact Polar event type names** and subscription lifecycle map (confirm against current Polar docs at implement-prep).  
7. **Actor resolution contract:** required metadata keys vs customer-id mapping table MVP.  
8. **Operator UI vs CLI balance:** CLI-complete + read-only web vs full console for grants CRUD.  
9. **Multi-action expansion** and refund/partial revoke policy (all-or-nothing).  
10. **SLO / region / status page** minimum for hosted critical path; backup “degraded deny” vs “fail open” policy (almost certainly fail closed).  
11. **Mapping config UX** without becoming a packaging studio (file/YAML vs three-row admin table).  
12. **Whether `expired` is a distinct reason code** or folded into `no_grant`.

---

## 9. Kill criteria (Schematic / Stigg / Autumn billing lookalikes)

Abort or cut scope if any of these appear as “MVP must”:

| Signal | Interpretation |
| --- | --- |
| Roadmap item exists to **make money without answering `allow()`** | Left of the competitive line — cut |
| Invoice send, Net terms, payment links, dunning, tax | Chargebee / Soft-WTP — refuse |
| Credit wallet, auto top-up, usage → Stripe invoice pipeline | Autumn / Schematic — refuse |
| Plan packaging studio / GTM catalog as primary surface | Stigg / Schematic EMS — refuse |
| `attach`-style APIs that **create** Stripe subscriptions/checkouts | Becoming billing SoR — refuse |
| Customer portal / branded billing widgets | Schematic/Stigg surface — refuse |
| SeatTruth **daily** reconcile as day-1 | Explicitly later — slip is a kill for MVP scope |
| Soft-WTP / cold invoices / waitlist monetization theater | Forbidden |
| Support >2 h/week sustained with no doc gap closed | Pause sales (`MINIMUM_SUPPORT`) |
| Cannot demo `allow` + webhook grant + local override in ≤60s | Do not list on Polar |
| Marketing language: “monetization platform” / “replace Chargebee” | Standing fence |

**One-line kill test (COMPETITIVE_SKIM):**  
> If the roadmap item exists to make money *without* answering `allow()`, cut it. If it exists to invoice, meter-for-invoice, or reconcile seats nightly — cut it from MVP.

---

## DR1 outcome

- **Shape locked for subsequent passes:** hosted decision API + thin SDK.  
- **Architecture recommended:** HookSteel-style verify → unique event → same-txn outbox → drain → grant store; read-only `allow`; four operator surfaces.  
- **Next:** DR2 adversarial pass on open decisions (§8) and the hardest critiques (§7), still **no** product code and **no** collapsing DR×3.

*Last updated: 2026-09-26 ET — design pack only; no product code.*

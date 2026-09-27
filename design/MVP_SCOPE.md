# MayDo — MVP Scope (day-1)

> **SKU shape (current):** self-host decision API process + thin TypeScript SDK (cache off by default) — the buyer runs Postgres, the API, and the worker. Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. A 2026-09-26 draft in this file locked a yellowgram-hosted decision API. That shape is superseded and is not sold.

**Product:** MayDo — entitlement kernel  
**Promise:** one read API `allow(actor, action)` → “what may this actor do right now?”  
**Feed:** Stripe and/or Polar webhooks + local grants  
**Shape:** self-host decision API process + thin TypeScript SDK (cache off by default) — buyer runs Postgres/API/worker. Superseded draft, not the SKU: yellowgram-hosted decision API (2026-09-26).
**Pricing (USD):** ~$199 founding setup + ~$79/mo  
> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-26 design draft, not the price to charge.  
**Contact:** hello@yellowgram.dev  
**Polar:** listing stays **dark** until Polar-listable (zip / SHA / deliverables)  
**Date:** 2026-09-26 ET — design pack only; no product code  

Standing fences: Soft-WTP OFF · cold invoices FORBIDDEN · not Chargebee/Schematic-upmarket · SeatTruth daily reconcile is **LATER** · decision kernel only.

---

## In (day-1)

### 1. Decision API
- `allow(actor, action)` (or equivalent) returns an explicit allow/deny (and, if needed, a minimal reason code — not a pricing catalog).
- Actor and action are opaque strings/ids owned by the buyer’s domain (e.g. `org_123`, `export.pdf`).
- Hot path is **read-only** against MayDo grant state; no side effects, no invoice calls, no Stripe charge.

### 2. Webhook ingest (Stripe + Polar)
- Signed webhook handlers for **Stripe** and **Polar** that verify raw body, persist provider events idempotently, and materialize/revoke grants.
- Reuse HookSteel reliability patterns (see HookSteel notes below): unique `(provider, provider_event_id)`, same-txn outbox for grant side effects, 400/500/200-duplicate HTTP contract.
- Default event maps are **grant-oriented** (checkout/order paid → grant; cancel/revoke → revoke) — not invoice generation.

### 3. Local grants
- Operator (or API) can create/expire/revoke grants independent of billing webhooks (comps, pilots, enterprise exceptions).
- Local grants compose with webhook-derived grants under a documented precedence (day-1: deny if any active revoke; else allow if any active grant for that action — refine later without inventing a packaging studio).

### 4. Operator minimum
- See grants for an actor; webhook health; dead-letter / replay; allow audit log (who asked, what answer, when).
- Details in `OPERATOR_NEEDS.md` and `MINIMUM_SUPPORT.md`.

### 5. Delivery honesty
- Shape locked: self-host decision API process + thin SDK (buyer runs Postgres/API/worker); do not oversell embed/library SoR before DR×3 settles packaging. The earlier “hosted decision API” label is superseded.
- Polar public listing **out** until deliverables + checksum exist.

---

## Out (explicit — do not scope creep)

| Out | Why |
| --- | --- |
| **Invoicing / Net terms / payment links / dunning / tax** | Chargebee-style; Soft-WTP/cold invoices forbidden |
| **Usage metering → end-of-period invoices** | Autumn/Orb/Metronome/Lago territory |
| **Plan packaging studio / GTM catalog UI** | Schematic/Stigg EMS upmarket |
| **Credit wallets / auto top-up / ASC 606 ledger product** | Monetization suite, not kernel |
| **SeatTruth daily reconcile** | Explicitly **later**; not day-1 |
| **Customer portal / billing widgets** | Schematic/Stigg surface |
| **Feature-flag platform (experiments, % rollouts)** | Wrong category |
| **Chargebee / Zuora replacement** | Standing fence |
| **Soft-WTP / cold invoices / waitlist monetization** | Forbidden |
| **Polar public listing** | Dark until zip/SHA/deliverables |
| **Unbounded multi-PSP** | Stripe + Polar only at MVP |
| **Implementation services / Lock / Audit SKUs as primary offer** | Keep product = decision kernel |

---

## Later (not MVP)

- SeatTruth-style daily reconcile of seats/entitlements vs billing truth.
- Richer entitlement types (numeric limits, credits) **only** if still decision-kernel — never if they become invoicing.
- Offline/embed library packaging only if running the decision API process on the buyer’s critical path forces it post-founding (do not split roadmap day-1).
- Additional providers only if kill criteria stay green.
- Polar listing after ready gate (deliverable integrity).

---

## HookSteel reuse (patterns only — do not modify that repo)

Grounded in `yellowgram/hooksteel` @ `main` (`8dc6e10…`, inspected 2026-09-26 via GitHub MCP).

### Stripe path
- `handle({ rawBody, signature })` → verify with Stripe `constructEvent` → `INSERT billing_events … ON CONFLICT DO NOTHING` → enqueue outbox adapters in **same transaction** → adapters **never** run in the webhook handler (`src/webhooks/stripe/handler.ts`).
- Default map: `checkout.session.completed` / `async_payment_succeeded` → `grant_credit`, `send_email`; `invoice.paid` / `subscription.deleted` → ignored empty map (`mapAdapters.ts`).
- HTTP: bad sig / bad secret / livemode mismatch → **400**; DB/txn fail → **500**; duplicate → **200**.

### Polar path
- `handlePolar({ rawBody, webhookId, webhookTimestamp, webhookSignature })` → stdlib HMAC verify (two key eras) → same insert/outbox pattern; `provider_event_id` = **webhook-id header**, not `data.id` (`src/webhooks/polar/handler.ts`).
- Default map: `order.paid` → grant adapters; `order.refunded` / cancel / checkout variants → ignored (`mapPolarAdapters.ts`).
- No Polar SDK required in buyer core — pattern MayDo should keep.

### Outbox
- Same-txn enqueue; drain after commit with `FOR UPDATE SKIP LOCKED`, lease reclaim, exponential backoff, `dead_letters` on max attempts / poison (`src/outbox/drain.ts`).
- Idempotency key: `provider|provider_event_id|adapter`.

### Replay CLI
- `replay:list` → `replay:dry-run <dead_letter_id>` → `replay:execute <dead_letter_id>` → `outbox:drain -- --once`.
- Execute reopens one outbox row and sets `replayed_at`; **does not** call the adapter; drain does (`scripts/replay-cli.ts`, `docs/DESIGN_REPLAY_CLI.md`).
- Replay ≠ purchase refund (glossary MayDo must copy).

### What MayDo should reuse vs invent
| Reuse as pattern | Invent for MayDo |
| --- | --- |
| Verify → unique event → same-txn outbox → drain | Grant store + `allow()` evaluation |
| Stripe + Polar dual path, raw body | Action vocabulary / precedence |
| Dead letter + replay CLI discipline | Operator allow-audit |
| Chaos-minded HTTP status contract | Buyer-operated tenancy + thin SDK packaging |

HookSteel remains a **billing event reliability kit** (side effects after commit). MayDo is a **decision kernel**. Share patterns; do not conflate products or modify HookSteel in this pass.

---

## Kill criteria (draft)

1. Roadmap cannot stay decision-only for 90 days without inventing invoices → kill scope, not “add Chargebee features.”
2. Founding buyers demand packaging studio / credit wallet as must-have → walk away or defer; do not pivot Soft-WTP.
3. Cannot demo `allow()` + webhook grant + local override in ≤60s → do not list on Polar.
4. Support load > agreed thin band (`MINIMUM_SUPPORT.md`) without productized docs → pause sales.

---

## Differentiation one-liner

> Same question every competitor buries under billing UI: **may this actor do this right now?** MayDo answers it. Stripe/Polar keep the money. Invoices stay out.

*Last updated: 2026-09-26 ET — design pack only.*

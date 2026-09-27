# MayDo — Competitive Skim

**Product:** MayDo — entitlement kernel (`allow(actor, action)` → what may this actor do right now?)  
**Owner:** yellowgram / MayDo  
**Pricing (product, USD):** ~$199 founding setup + ~$79/mo  
> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-26 design draft, not the price to charge.  
**Contact:** hello@yellowgram.dev  
**Date:** 2026-09-26 ET  
**Sources:** public product/docs pages cited below. Third-party price aggregates noted where vendor pages are gated.

---

## Thesis (decision-only wedge)

MayDo answers one question in the request path: **may this actor do this action right now?** State is fed by Stripe and/or Polar webhooks plus local grants. Shape locked: hosted decision API + thin TypeScript SDK (cache off by default).

**We are not** Chargebee, Schematic-upmarket monetization, Autumn-style billing SoR, Orb/Metronome/Lago invoicing, or SeatTruth daily reconcile. Soft-WTP and cold invoices are forbidden.

The wedge is **downmarket of Stigg/Schematic and sideways from Autumn**: a thin decision kernel with reliable webhook ingest and operator-owned grants — not a monetization suite.

---

## Schematic ([schematichq.com](https://schematichq.com/))

### How they position
- Full **monetization platform**: meter usage, bill it, enforce limits at runtime; “runtime entitlements, metering, and billing in one platform.”
- Decouples pricing from code so GTM can change plans/credits/add-ons/trials without deploys.
- Stripe-synced catalog, customer wallet/ledger UI, plan versioning, overrides, ASC 606-oriented credit ledger language, agent/MCP tooling.
- Blog framing: feature flags alone fail for monetization; entitlements are billing-aware runtime rules ([Feature Flag Management](https://schematichq.com/blog/feature-flag-management)).

### What they sell that we must NOT copy
- Invoicing / payment-term UX (“Finalize Plan and Send Invoice,” Net terms, grace periods).
- Usage metering as a product core, credit wallets, auto top-up, customer-facing billing components.
- Plan catalog + packaging UI as system of record for revenue.
- Growth toward replacing feature-flag tools *and* homegrown billing infra *and* product analytics ([pricing change post](https://schematichq.com/blog/how-schematic-changed-its-pricing-in-spring-2025)).

### Price signal (third-party)
- Toolradar (checked Sep 2026): Free → **Growth ~$200/mo** → Enterprise custom ([toolradar.com/tools/schematic](https://toolradar.com/tools/schematic)). Treat vendor site as authority.

### Differentiation for MayDo
- Schematic owns **monetize + meter + invoice-adjacent UX**. MayDo owns **allow/deny decision + grant truth** after Stripe/Polar already charged.
- No MayDo customer portal, no invoice send, no credit ledger product, no GTM packaging studio.

---

## Stigg ([stigg.io/product/entitlements](https://www.stigg.io/product/entitlements))

### How they position
- Closest conceptual cousin: **“entitlements as a real-time access layer”** — one API: does this customer have access, on what terms?
- Boolean / configuration / metered / credit entitlements; edge + sidecar latency story; versioned plans; works *alongside* Stripe, Zuora, Chargebee (explicitly not a billing replacement).
- Separates commercial feature gating from engineering feature flags ([Feature Gating](https://www.stigg.io/blog-posts/feature-gating)).

### What they sell that we must NOT copy
- Full EMS: plan catalog, add-ons, prices, credits engine, promotional entitlements packaging UI, branded widgets.
- High-scale metering/event volumes as the commercial center of gravity.
- Enterprise ladder (BYOC VPC, FedRAMP path, named CSM) — upmarket motion MayDo refuses at founding.

### Price signal (third-party)
- Softwr aggregate (Aug 2026): Build free → **Pro ~$399/mo** → BYOC ~$40k/yr → Scale on request ([softwr.com/pricing/stigg](https://www.softwr.com/pricing/stigg)). Vendor site is authority.

### Differentiation for MayDo
- Stigg is the **upmarket entitlements platform** with packaging + metering + edge infra.
- MayDo is the **downmarket decision kernel**: `allow(actor, action)`, webhook-fed grants, local overrides — priced for indie/early SaaS (~$79/mo), not Pro EMS budgets.
- Steal the *language* of “billing tracks sold; entitlements track fulfilled” — do **not** steal the catalog/credits/widgets surface.

---

## Autumn ([useautumn.com](https://www.useautumn.com/), [docs](https://docs.useautumn.com/welcome))

### How they position
- Open-source **pricing & billing control layer on Stripe**: SoR for subscriptions, credits, entitlements, usage enforcement.
- Core API triad: `attach` / `check` / `track` — checkout+plan changes, access check, usage record.
- Explicitly creates Stripe subscriptions/invoices as needed; handles edge cases teams usually bury in webhooks ([docs welcome](https://docs.useautumn.com/welcome), [Stripe concepts](https://docs.useautumn.com/documentation/concepts/stripe)).
- Positions against Orb/Metronome: those meter for end-of-period invoices; Autumn owns real-time balances + gating too.

### What they sell that we must NOT copy
- Owning Stripe subscription lifecycle (`attach` creating Checkout/subscriptions).
- Credit ledgers, usage posting to Stripe at cycle end, overage invoicing.
- “No webhooks required” product story that absorbs billing state away from the buyer’s app.
- Becoming the billing SoR between app and Stripe.

### Differentiation for MayDo
- Autumn’s `check()` looks similar to MayDo’s `allow()` — **do not confuse buyers**.
- MayDo: Stripe/Polar remain SoR for money; MayDo only materializes **decision state** from webhooks + local grants.
- MayDo does **not** create invoices, attach plans, or track usage for billing. Polar is first-class (Autumn is Stripe-centric).

---

## Close peers (note, do not chase)

| Peer | Why they appear | Kill / continue |
| --- | --- | --- |
| **Stripe Entitlements API** ([docs.stripe.com/billing/entitlements](https://docs.stripe.com/billing/entitlements)) | Boolean product→feature mapping + webhooks; app still enforces | Continue: MayDo can sit *above* Stripe entitlements as richer local grants + Polar parity |
| **Lago** | Open-source usage billing + plan-coupled entitlements | Kill as competitor copy: invoicing/metering suite |
| **Orb / Metronome** | Usage metering → invoices (now PSP-aligned) | Kill: pure billing/metering upmarket |
| **Chargebee (+ Entitlements APIs)** | Subscription billing suite; enforcement left to app | Kill: “do not become Chargebee” is standing fence |
| **Hookdeck** | Hosted webhook ingress | Adjacent for HookSteel reliability patterns; MayDo is not an ingress product |
| **LaunchDarkly / flag vendors** | Engineering flags, not commercial grants | Different category; MayDo must not market as a flag platform |

---

## Kill / continue vs invoicing temptation

### KILL (standing fence)
- Invoice generation, Net terms, dunning, tax, payment links as product features.
- Soft-WTP / cold invoices / waitlist monetization theater.
- SeatTruth **daily reconcile** as MVP (explicitly later).
- Credit wallet / usage → Stripe invoice pipeline.
- Plan packaging studio for GTM as primary surface.
- Chargebee/Schematic-upmarket “monetization platform” language on landing/Polar.

### CONTINUE (own the wedge)
- `allow(actor, action)` as the only hot-path API promise.
- Stripe **and** Polar webhook ingest → grant materialization (HookSteel patterns).
- Local / operator grants and overrides with audit.
- Operator views: grants, webhook health, replay, allow audit.
- Price honesty (2026-09-26 draft): **$199 founding setup + $79/mo**. Superseded by the commercial lock at the top of this file ($149 once, launch $99 for the first 20 on the same SKU). INR stays founder cost accounting only.
- Polar listing **dark** until zip/SHA/deliverables ready.

### One-line kill test
> If the roadmap item exists to make money *without* answering `allow()`, cut it. If it exists to invoice, meter-for-invoice, or reconcile seats nightly — cut it from MVP.

---

## Competitive map (founder slide)

```
Billing SoR / invoices          Decision / allow
─────────────────────────       ─────────────────────────
Chargebee, Lago, Orb            ←—— MayDo (kernel) ——→
Autumn (attach+invoice)         Stigg (EMS, upmarket)
Schematic (meter+bill+UI)       Stripe Entitlements (thin)
```

MayDo sits on the **right**: decision-only, downmarket price, dual Stripe+Polar feed, local grants. Everything left of the line is temptation.

---

## Citations (primary)

1. https://schematichq.com/  
2. https://schematichq.com/blog/feature-flag-management  
3. https://schematichq.com/blog/how-schematic-changed-its-pricing-in-spring-2025  
4. https://www.stigg.io/product/entitlements  
5. https://www.stigg.io/blog-posts/feature-gating  
6. https://www.useautumn.com/  
7. https://docs.useautumn.com/welcome  
8. https://docs.useautumn.com/documentation/concepts/stripe  
9. https://docs.stripe.com/billing/entitlements  
10. https://toolradar.com/tools/schematic (price aggregate)  
11. https://www.softwr.com/pricing/stigg (price aggregate)  

*Last updated: 2026-09-26 ET — research + design pack only; no product code.*

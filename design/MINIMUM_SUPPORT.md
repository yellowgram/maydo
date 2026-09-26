# MayDo — Minimum Support Surface (founding customers)

**Product:** MayDo — entitlement kernel  
**Pricing (USD):** ~$199 founding setup + ~$79/mo  
**Contact:** hello@yellowgram.dev  
**Goal:** Keep founder support thin and predictable; strangers self-serve before opening a ticket.  
**Date:** 2026-09-26 ET  

Modeled loosely on HookSteel’s `MINIMUM_SUPPORT_CHECKLIST.md` discipline (docs replace the founder; boundary written once) — adapted for a **hosted/library decision product**, not a Polar zip kit.

---

## Support boundary (write once, link everywhere)

- **Channel:** email `hello@yellowgram.dev` (and Issues only if a private founding space exists).
- **Scope:** MayDo decision API, webhook ingest config, grant/operator tooling shipped with the product.
- **Best-effort** founding support; **no SLA** until an explicit paid SLA SKU exists (do not invent one at launch).
- **Time box (draft):** ≤2 h/week aggregate for founding cohort; if exceeded, pause new founders or productize the FAQ — do not Soft-WTP.
- **Require for any ticket:** environment (hosted vs embed), MayDo version/tag, provider (Stripe/Polar/test), failing `allow` example (`actor`, `action`, expected vs actual), webhook event id (test mode), redacted env booleans only — **no live secrets**.

---

## What founding customers get (least surface)

### Included
1. **Onboarding pack** — connect Stripe and/or Polar webhook endpoints; map paid → grant; cancel → revoke; verify with test-mode events.
2. **Decision contract** — documented `allow(actor, action)` request/response + reason codes.
3. **Operator runbook** — grants CRUD, webhook health, replay, allow audit (`OPERATOR_NEEDS.md`).
4. **Known limits** — no invoicing, no SeatTruth reconcile, no Polar public listing yet, Stripe+Polar only.
5. **Founding setup** — one-time ~$199 covers assisted connect + first grant map (async email), not custom billing redesign.

### Explicitly not included
- Building the buyer’s product paywalls / UI.
- Debugging buyer production live keys or PCI questions.
- Invoice/tax/dunning/Chargebee migrations.
- Daily seat reconcile (SeatTruth later).
- Soft-WTP outreach, cold invoices, or “free forever upgrades.”
- Becoming on-call for buyer dead-letter queues (buyer owns `DATABASE_URL` / operator access).
- Feature-flag experimentation programs.

---

## Docs that replace the founder

| Doc / surface | Job |
| --- | --- |
| **START_HERE** (when shipped) | Connect provider → first grant → first `allow` green in ≤15 min |
| **Webhook status contract** | 400 vs 500 vs 200-duplicate frozen (HookSteel pattern) |
| **Troubleshooting top 8** | Wrong whsec; Polar raw body reparsed; worker/drain down; local grant vs webhook race; livemode mismatch; replay ≠ refund; allow cache stale; empty adapter map |
| **Out-of-scope auto-reply** | Invoicing / Chargebee / Soft-WTP / SeatTruth / hosted-ingress-as-product / live-key dump |
| **Glossary** | Grant ≠ invoice; replay ≠ refund; allow ≠ feature flag experiment |

---

## Happy path strangers must complete without email

1. Register webhook (Stripe CLI or Polar test) with documented secrets.
2. Fire a test paid event → grant appears in operator view.
3. `allow(actor, action)` returns allow.
4. Fire cancel/revoke (or local revoke) → `allow` returns deny.
5. Duplicate event → still one grant row / one decision truth (idempotent).

If this path needs a founder screenshare, the product is not founding-ready.

---

## Ops babysitting (buyer-owned)

- Keep ingest + drain/worker healthy (events ACK’d ≠ grants applied if drain is down — HookSteel lesson).
- Triage dead letters: fix adapter/mapper → dry-run → execute → drain.
- Monitor: webhook status counts, outbox/dead-letter depth, `allow` latency/error rate.
- MayDo day-1 need not ship Grafana; document the metrics buyers should watch.

---

## Money & listing hygiene

- Product prices stay **USD** ($199 / $79). Founder may track costs in INR privately; do not India-localize the product wedge.
- Polar listing **dark** until zip/SHA/deliverables (or hosted tenancy) are real — no vapor listing.
- Refund / cancel policy for founding setup must be written before charging; do not conflate with webhook replay language.

---

## Kill clocks

1. Support >2 h/week sustained with no doc gap closed → pause sales.
2. Buyers demand invoicing as “minimum support” → refuse; point to Stripe/Polar/Autumn/Chargebee — do not build it.
3. Secret-in-ticket culture → close with template; do not debug live keys.

*Last updated: 2026-09-26 ET — design pack only.*

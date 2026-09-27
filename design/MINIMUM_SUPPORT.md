# MayDo — Minimum Support Surface (founding customers)

> **SKU shape (current):** self-host decision API process + thin TypeScript SDK (cache off by default) — the buyer runs Postgres, the API, and the worker. Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. There is no hosted / managed SKU.

**Product:** MayDo — entitlement kernel  
**Pricing (USD):** $149 once (one organization, perpetual self-host). Launch $99 for the first 20 buyers on the same SKU.  
**Contact:** hello@yellowgram.dev  
**Goal:** Keep founder support thin and predictable; strangers self-serve before opening a ticket.  
**Date:** 2026-09-26 ET  

> **Commercial lock (post-MVP):** the 2026-09-26 draft of this file assumed ~$199 founding setup + ~$79/mo. Charge **$149 USD once**. Launch **$99** for the first **20** buyers on the **same SKU**. No second product. No coupons. Refund **14 days**. Support is GitHub Issues for **60 days**, best effort, no SLA. Public license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Paid commercial use: Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP off. Buyer path: `SUPPORT.md` and `docs/MINIMUM_SUPPORT_CHECKLIST.md`.

Modeled loosely on HookSteel’s `MINIMUM_SUPPORT_CHECKLIST.md` discipline (docs replace the founder; boundary written once). The buyer-facing path is now the self-host zip, not an assisted monthly setup.

---

## Support boundary (write once, link everywhere)

- **Channel:** GitHub Issues on private `yellowgram/maydo` for 60 days from purchase. Email hello@yellowgram.dev is the contact, not a second support desk.
- **Scope:** MayDo decision API, webhook ingest config, grant/operator tooling shipped with the product.
- **Best-effort** support; **no SLA**. Do not invent a paid SLA SKU.
- **Time box:** ≤2 h/week aggregate; if exceeded, pause new buyers or productize the FAQ — do not Soft-WTP.
- **Require for any ticket:** environment (the decision API process the buyer runs, vs embed), MayDo version/tag, provider (Stripe/Polar/test), failing `allow` example (`actor`, `action`, expected vs actual), webhook event id (test mode), redacted env booleans only — **no live secrets**. yellowgram does not operate that process.

---

## What founding customers get (least surface)

### Included
1. **Onboarding pack** — connect Stripe and/or Polar webhook endpoints; map paid → grant; cancel → revoke; verify with test-mode events.
2. **Decision contract** — documented `allow(actor, action)` request/response + reason codes.
3. **Operator runbook** — grants CRUD, webhook health, replay, allow audit (`OPERATOR_NEEDS.md`).
4. **Known limits** — no invoicing, no SeatTruth reconcile, no Polar public listing yet, Stripe+Polar only.
5. **Purchase** — $149 once (launch $99 for the first 20 on the same SKU) is the self-host zip and 60 days of Issues, not a custom billing redesign.

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

- Product price stays **USD**: $149 once, launch $99 for the first 20 buyers on the same SKU. Founder may track costs in INR privately; do not India-localize the product wedge.
- Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). The earlier “listing stays dark until the zip is on main” line is superseded. `maydo-0.1.0.zip` stays sealed. Founder GO is already given via CoS.
- Purchase refund is **14 days**. Do not conflate it with webhook replay or provider `order.refunded`. See `docs/REFUND_GLOSSARY.md`.

---

## Kill clocks

1. Support >2 h/week sustained with no doc gap closed → pause sales.
2. Buyers demand invoicing as “minimum support” → refuse; point to Stripe/Polar/Autumn/Chargebee — do not build it.
3. Secret-in-ticket culture → close with template; do not debug live keys.

*Last updated: 2026-09-27 ET — license fence note on the commercial lock. Design pack otherwise unchanged.*

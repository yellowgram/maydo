# Out-of-scope auto-reply

Use this when a ticket asks MayDo to become a billing suite. Do not build the feature while answering.

---

Thanks for writing. MayDo only answers `allow(actor, action)`.

We don't do invoicing, net terms, payment links, dunning, tax, credit wallets, usage-to-invoice, plan packaging studios, customer billing portals, or Checkout/subscription creation. Stripe or Polar should keep that. Chargebee, Schematic, Stigg, and Autumn are different products; we are not replacing them.

We also don't run a daily seat reconcile, and we don't auto-revoke grants from the orphan-candidate report. That report is a hint for a human.

We won't turn on a fail-open or "availability mode." If you need `allow` to succeed while MayDo is down, that wrapper is yours to own — we recommend you don't.

Soft-waitlist pricing and cold invoices are outside what we sell.

If your question is about a decision (`allow` reason, a webhook id, a dead letter), reply with: hosted vs self-hosted, MayDo version, provider (Stripe/Polar/test), the actor, the action, expected vs actual, and the webhook event id. No live secrets.

hello@yellowgram.dev
---

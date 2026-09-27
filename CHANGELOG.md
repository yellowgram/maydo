# Changelog

## 0.1.0

MVP on `main`, lineage `e933cd9`.

- Entitlement kernel. The hot path is `allow(actor, action)` only.
- Hosted decision API, worker, read-mostly console, CLI, and a thin TypeScript SDK. SDK cache is off by default.
- Stripe and Polar signed webhooks, plus local grants.
- Buyer zip: `release/maydo-0.1.0.zip`.

Not in this version: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, or Soft-WTP.

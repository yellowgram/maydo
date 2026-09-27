# Changelog

## 0.1.1

License fence only. Entitlement kernel, webhook, and SDK behavior are unchanged.

- Public license is PolyForm Noncommercial 1.0.0 (`LICENSE`).
- Paid commercial use is the Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`).
- Claims: source-available = true. OSI open source = false.
- Soft-WTP stays off.
- Buyer zip: `release/maydo-0.1.1.zip`.
- `release/maydo-0.1.0.zip` and tag `v0.1.0` stay sealed. That distribution keeps the grant text buyers already received.

## 0.1.0

MVP on `main`, lineage `e933cd9`.

- Entitlement kernel. The hot path is `allow(actor, action)` only.
- Hosted decision API, worker, read-mostly console, CLI, and a thin TypeScript SDK. SDK cache is off by default.
- Stripe and Polar signed webhooks, plus local grants.
- Buyer zip: `release/maydo-0.1.0.zip`.

Not in this version: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, or Soft-WTP.

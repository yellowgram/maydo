# Support

**Window:** GitHub Issues on private `yellowgram/maydo`, for **60 days** from purchase.  
**Effort:** best effort, about **2 hours a week** across buyers. **No SLA.**  
**Contact:** hello@yellowgram.dev · https://www.yellowgram.dev  
**Seller:** Suthirth solutions  
**Public license:** PolyForm Noncommercial 1.0.0 (`LICENSE`)  
**Commercial grant:** Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`) — one organization, perpetual for the named tag  
**Claims:** source-available = true. OSI open source = false.  
**Soft-WTP:** off

The Chief of Staff invites your GitHub login with **Read** so you can open Issues. You cannot push. When the 60 days end, answers stop. You keep the zip and the Suthirth Commercial Grant for that named tag.

## What a ticket must include

One of these:

- a failing test, or
- a **test-mode** Stripe or Polar event id, or
- an `allow` repro: `actor`, `action`, expected result, actual result, MayDo version

Also say self-host vs a hosted process you run, and the provider (Stripe, Polar, or test).

**No live secrets.** No live webhook signing keys, no live API keys, no production `DATABASE_URL`. Redacted booleans only.

## What we will not do

Invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, Soft-WTP, coupons, and cold invoices are out of scope. The reply for those asks is [`docs/OUT_OF_SCOPE_AUTOREPLY.md`](docs/OUT_OF_SCOPE_AUTOREPLY.md).

A webhook replay is not a purchase refund. A provider `order.refunded` is not a refund of MayDo. See [`docs/REFUND_GLOSSARY.md`](docs/REFUND_GLOSSARY.md).

The stranger path, before you write, is [`docs/MINIMUM_SUPPORT_CHECKLIST.md`](docs/MINIMUM_SUPPORT_CHECKLIST.md).

## Actor / Checkout metadata

Put `maydo_actor` and `maydo_action` (or `maydo_actions`) on Checkout or the Polar order from **your server**, not from the browser alone.

Browser-set metadata is a buyer footgun. If an operator actor map disagrees, the grant dead-letters with `actor_metadata_mismatch`.

Verifying the webhook signature proves the event came from Stripe or Polar. It does **not** prove the metadata names the billed subject.

MayDo does not add a signed actor assertion in this release.

Contract: [`docs/WEBHOOK_CONTRACT.md`](docs/WEBHOOK_CONTRACT.md). Setup: [`docs/START_HERE.md`](docs/START_HERE.md).

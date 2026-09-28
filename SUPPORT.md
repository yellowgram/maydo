# Support

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase.

Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). Price $99 for the first 20 buyers, then $149, same SKU. Refund 14 days. `maydo-0.1.0.zip` on tag `v0.1.0` stays sealed as the historical grandfather.

**Window:** GitHub Issues on the public source-available repository `yellowgram/maydo`, for **60 days** from purchase.  
**Effort:** best effort, about **2 hours a week** across buyers. **No SLA.**  
**Contact:** hello@yellowgram.dev · https://www.yellowgram.dev  
**Legal seller:** Suthirth Solutions, operating as yellowgram  
**Public license:** PolyForm Noncommercial 1.0.0 (`LICENSE`)  
**Commercial grant:** MayDo commercial grant (`docs/COMMERCIAL_GRANT.md`) — one organization, perpetual for the named tag  
**Claims:** source-available = true. OSI open source = false.  
**Soft-WTP:** off

Anyone with a GitHub login can open Issues on the public source-available repository. Support answers only within 60 days of purchase for buyers. When the 60 days end, answers stop. You keep the zip and the MayDo commercial grant for that named tag.

## What a ticket must include

One of these:

- a failing test, or
- a **test-mode** Stripe or Polar event id, or
- an `allow` repro: `actor`, `action`, expected result, actual result, MayDo version

Also say whether the decision API process is one you run on your own machines or a process you host yourself. Both are yours. yellowgram does not run that process for this purchase. Name the provider (Stripe, Polar, or test).

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

## Is this a hosted / managed service?

No. This purchase is a self-host kit. You operate Postgres / the worker / the Action.

Contract: [`docs/WEBHOOK_CONTRACT.md`](docs/WEBHOOK_CONTRACT.md). Setup: [`docs/START_HERE.md`](docs/START_HERE.md). FAQ: [`docs/FAQ.md`](docs/FAQ.md).

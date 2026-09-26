# Founding goodwill credit

This is an operations policy. It is **not** an SLA, not an availability mode, and not a reason to fail open.

Prices stay USD: about $199 founding setup and about $79 per month. Contact hello@yellowgram.dev.

## If hosted MayDo is down

If a MayDo-hosted outage lasts **more than 4 continuous hours** in a calendar month, yellowgram may issue a goodwill credit of the pro-rated `$79` month. That decision is manual, by email to hello@yellowgram.dev. It is not automatic, it is not monitored by the product, and it does not change `allow` behavior during the outage.

Buyer-side fail-open wrappers, buyer webhook misconfiguration, and buyer drain neglect are not MayDo-hosted outages.

## Setup fee

The `$199` founding setup is non-refundable after assisted connect completes (webhook endpoint verified and the first grant map confirmed). Write that down before charging.

Canceling MayDo does not refund a completed setup. Monthly goodwill credits never refund the setup fee.

## What this policy refuses

- A paid SLA SKU at launch
- Credits that depend on failing open
- Invoice, tax, or dunning changes inside MayDo
- Automatic refunds triggered by orphan-candidate reports

# Founding goodwill credit

**Not sold / not buyer-facing.**

This file is archived design history. It is not a product feature, not a credit on the MayDo purchase, and not a seller SLO. The commercial SKU is a self-host kit only. yellowgram does not operate a hosted endpoint for this SKU.

This is an operations note from an earlier draft. It is **not** an SLA, not an availability mode, and not a reason to fail open.

**Commercial lock:** $149 USD once for one organization, perpetual for the named tag. Launch price $99 USD for the first 20 buyers on the same SKU. No second product. No coupons. Seller: Suthirth solutions. Contact hello@yellowgram.dev. Source of record: PolyForm Noncommercial 1.0.0 (`LICENSE`) and the Suthirth Commercial Grant (`COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

There is no monthly fee. The 2026-09-26 draft that credited a pro-rated $79 month, and the $199 setup fee in that draft, are not the price to charge.

## Purchase refund

The purchase refund window is **14 days**. That is the money policy for the MayDo order. It is not a webhook replay and it is not a provider `order.refunded`. See [`REFUND_GLOSSARY.md`](REFUND_GLOSSARY.md).

## If the process you host is down

An outage does not fail open. The SDK returns `maydo_unavailable`. Anything beyond the 14-day purchase refund is a manual email decision at hello@yellowgram.dev. It is not automatic, it is not a priced credit, it is not monitored by the product, and it does not change `allow`.

Buyer-side fail-open wrappers, buyer webhook misconfiguration, and buyer drain neglect are not outages of the decision kernel.

## What this policy refuses

- A paid SLA SKU
- Credits that depend on failing open
- Invoice, tax, or dunning changes inside MayDo
- Automatic refunds triggered by orphan-candidate reports
- A second SKU, a coupon, or a monthly price

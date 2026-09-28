# Polar deliverables — MayDo 0.1.1


Polar product id  (do not rename). Legal seller: Suthirth Solutions, operating as yellowgram. Polar organization dashboard **Suthirth solutions** (not renamed this week).
Paste packet for the Chief of Staff. Do not open a second Polar product. Do not invent a coupon. Do not put a buy link in the README or inside the zip.

Live Polar already delivers `maydo-0.1.1.zip`. SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`. Same SKU. Price $99 for the first 20 organizations, then $149. Refund 14 days.

Tag `v0.1.1` is already shipped (GitHub Release `v0.1.1`). This file does not edit Polar, move tags, or regenerate zips. Never reseal tag `v0.1.0` or `release/maydo-0.1.0.zip`. That zip is the sealed historical grandfather, not the live download.

Soft-WTP stays off. The README has no Checkout and no Polar buy link.

## License (source of record)

| Field | Value |
| --- | --- |
| Public license | PolyForm Noncommercial 1.0.0 (`LICENSE`) |
| Commercial grant | MayDo commercial grant (`docs/COMMERCIAL_GRANT.md`) |
| Claims | source-available = true. OSI open source = false. |
| Legal seller | Suthirth Solutions, operating as yellowgram |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |

Tag `v0.1.0` keeps the grant text already shipped in that sealed zip. New tags use this fence. Rights already granted for `v0.1.0` stay on that artifact.

## Product

| Field | Value |
| --- | --- |
| Product | MayDo — entitlement kernel |
| Legal seller | Suthirth Solutions, operating as yellowgram |
| Repo | public source-available `yellowgram/maydo` |
| Shape | Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. Self-host decision API process + thin TypeScript SDK (cache **off** by default) — buyer runs Postgres/API/worker. Stripe and Polar signed webhooks + local grants. |
| Decision | `allow(actor, action)` only |
| Price | **$149 USD once** — one organization, perpetual for the named tag |
| Launch | **$99 USD** for the first **20** buyers on **this same SKU** |
| Refund | **14 days** |
| Support | GitHub Issues on the public source-available repository `yellowgram/maydo`, **60 days** from purchase, best effort, **no SLA**, ≤ ~2 h/week |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |
| Status (buyer-facing) | https://status.yellowgram.dev/maydo |
| Zip | Live Polar file: `release/maydo-0.1.1.zip` (prefix `maydo-0.1.1/`, comment `maydo-0.1.1`) |
| Sealed zip | `release/maydo-0.1.0.zip` (tag `v0.1.0`) — historical grandfather; do not regenerate |
| Checksum | Live SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587` (the 0.1.1 row in [`CHECKSUMS.md`](CHECKSUMS.md)). Do not regenerate either zip. |

Not this product: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, Soft-WTP, coupons, cold invoices.

## Paste-ready listing draft

Polar product id  (do not rename). Legal seller: Suthirth Solutions, operating as yellowgram. Polar organization dashboard **Suthirth solutions** (not renamed this week).

```text
Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

MayDo is an entitlement kernel for one organization. It answers a single question: allow(actor, action) — may this actor do this action right now?

Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase.

Live download: maydo-0.1.1.zip. SHA-256 6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587. maydo-0.1.0.zip (tag v0.1.0) is a sealed historical grandfather and is not this download.

You run Postgres, the decision API process, and the worker. Stripe and Polar stay the system of record for money. MayDo stores grants from signed Stripe and Polar webhooks, plus local grants, and serves the decision. The TypeScript SDK is thin and its cache is off by default.

Public license: PolyForm Noncommercial 1.0.0. Commercial production use requires a MayDo commercial grant for one organization and the named release tag (docs/COMMERCIAL_GRANT.md in the kit). Source-available = true. OSI open source = false.

Price: $149 USD once. Perpetual for that named tag, for the purchased organization.
Launch price: $99 USD for the first 20 organizations, on this same product. Then $149. There is no coupon and no second product.

Refund: 14 days.

Support: GitHub Issues on the public source-available repository yellowgram/maydo for 60 days from purchase. Best effort. No SLA. A ticket needs a failing test, a test-mode event id, or an allow repro. Do not send live secrets.

Actor / Checkout metadata. Put maydo_actor and maydo_action (or maydo_actions) on Checkout or the Polar order from your server, not from the browser alone.

Browser-set metadata is a buyer footgun. If an operator actor map disagrees, the grant dead-letters with actor_metadata_mismatch.

Verifying the webhook signature proves the event came from Stripe or Polar. It does not prove the metadata names the billed subject.

MayDo does not add a signed actor assertion in this release.

MayDo does not invoice, replace Chargebee, auto-revoke from a seat report, do quantity math, or ship a plan packaging studio. When the decision API process you run is down, allow fails closed (deny). The kit status page is manual guidance for that process. It is not an SLA, and yellowgram does not operate the process.

Status: https://status.yellowgram.dev/maydo
Contact: hello@yellowgram.dev
https://www.yellowgram.dev
Legal seller: Suthirth Solutions, operating as yellowgram
```

## How delivery works

Two artifacts, one product. GitHub Release `v0.1.1` already carries the 0.1.1 zip. Do not regenerate it.

1. **Zip.** Live Polar delivers `release/maydo-0.1.1.zip`. SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`, the same hex as the 0.1.1 row in `docs/CHECKSUMS.md`. The same bytes are on GitHub Release `v0.1.1`. Inside, paths start with `maydo-0.1.1/`. The zip comment is `maydo-0.1.1`. Entry times are pinned to `2026-09-26T00:00:00Z`. `docs/COMMERCIAL_GRANT.md` is in the zip. `release/maydo-0.1.0.zip` stays sealed as the historical grandfather and is not this download.
2. **Public source-available GitHub.** `yellowgram/maydo` is public. The zip for the named tag is the perpetual copy the MayDo commercial grant covers. Anyone with a GitHub login can open Issues. Support answers only within the 60-day window from purchase for buyers.

Do not regenerate `release/maydo-0.1.1.zip` or `release/maydo-0.1.0.zip`. If Polar's checksum field and that hex disagree, stop. Do not swap the live file back to 0.1.0.

## Issues access (public repo)

Anyone with a GitHub login can open Issues on the public source-available repository `yellowgram/maydo`. No collaborator invite.

1. The buyer opens an Issue on `yellowgram/maydo`. No live secrets, no webhook signing keys.
2. Support answers only within **60 days from purchase** for buyers. Best effort. No SLA. Aggregate cap about **2 hours a week**.
3. A ticket must include a failing test, a **test-mode** provider event id, or an `allow` repro (`actor`, `action`, expected, actual). Reject live secrets. Point out-of-scope asks at `docs/OUT_OF_SCOPE_AUTOREPLY.md` and `SUPPORT.md`.
4. When the 60 days end, stop answering Issues. Stopping answers is not a grant revoke. They keep the zip and the MayDo commercial grant for that named tag (`docs/COMMERCIAL_GRANT.md`). The public fence is PolyForm Noncommercial 1.0.0 (`LICENSE`).

## CoS flip checklist

Tag `v0.1.1` is already the live Polar download. This file does not edit Polar. Do not recreate the Release or the zips. The description block above is the buyer-facing copy for that same product.

- [x] Live Polar file is `release/maydo-0.1.1.zip`. SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`.
- [x] `main` contains `release/maydo-0.1.1.zip`, the unchanged `release/maydo-0.1.0.zip`, and both rows in `docs/CHECKSUMS.md`.
- [x] GitHub Release `v0.1.1` stays as shipped. Its asset is `release/maydo-0.1.1.zip`. Tag `v0.1.0` is untouched. Do not recreate it.
- [ ] Founder GO stays the standing go-live. Do not open a second product decision.
- [ ] **One** Polar product. Charge **$99** until **20** paid orders, then set **the same product** to **$149**. Do not create a second product. Do not create a coupon or a discount code.
- [ ] Refund window **14 days**.
- [ ] Seller organization: **Suthirth solutions**.
- [ ] Listing paste is the block above, including Actor / Checkout metadata (PolyForm Noncommercial + MayDo commercial grant; source-available = true; OSI open source = false).
- [ ] Cover image attached. **CoS supplies it.** This repo does not include one.
- [x] Live checksum is the 0.1.1 row of `docs/CHECKSUMS.md` (`6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). Do not replace it.
- [ ] Soft-WTP off. No cold invoice. No waitlist SKU. No Checkout link added to the README or the zip.

## Refund toggle

Set the Polar refund window to **14 days**.

That toggle is the purchase refund of MayDo. It is not a webhook replay, and it is not Stripe `charge.refunded` or Polar `order.refunded` / subscription cancel. Those provider events revoke grants inside the buyer's self-hosted MayDo. Words: `docs/REFUND_GLOSSARY.md`.

## Cover image

CoS supplies the cover image. Do not block the zip on it. Do not treat a generated stand-in as the commercial cover.

## Known limits (say these)

Honest limits, not a roadmap:

- Decision-only. Stripe and Polar keep the money. MayDo does not send invoices.
- A provider refund, including a Polar partial refund, revokes **every** mapped action on that binding. There is no quantity or seat proration.
- `grants orphan-candidates` is a report. Nothing auto-revokes from it. SeatTruth daily reconcile is not in this product.
- The SDK cache is off. HTTP 5xx, 429, and timeouts become `maydo_unavailable` (deny). There is no fail-open switch.
- `md_op_` keys are refused by the SDK. Operator actions stay on the CLI.
- The process you run is one API process at founding. The allow rate limit does not cross processes.
- Kit status notes are manual. Best effort. Not an SLA. yellowgram does not operate the decision API.
- One purchase is one organization, self-hosted, for the named tag, under the MayDo commercial grant. It is not a resale right for a competing boilerplate.

## Actor / Checkout metadata

Same four points as the paste block above and as `SUPPORT.md`:

- Put `maydo_actor` and `maydo_action` (or `maydo_actions`) on Checkout or the Polar order from your server, not from the browser alone.
- Browser-set metadata is a buyer footgun. If an operator actor map disagrees, the grant dead-letters with `actor_metadata_mismatch`.
- Verifying the webhook signature proves the event came from Stripe or Polar. It does not prove the metadata names the billed subject.
- MayDo does not add a signed actor assertion in this release.

## Soft-WTP

Off. Do not add a waitlist, a name-your-price amount, a coupon, or a cold invoice. The only prices are $99 for the first 20 buyers and $149 after that, on this SKU.

## GitHub Release

GitHub Release `v0.1.1` already exists. Live Polar already delivers that zip. Tag `v0.1.0` and `release/maydo-0.1.0.zip` stay sealed. This document does not create a Release, move a tag, or regenerate a zip. It does not edit Polar.

Polar product id  (do not rename). Legal seller: Suthirth Solutions, operating as yellowgram. Polar organization dashboard **Suthirth solutions** (not renamed this week).

# Polar deliverables — MayDo 0.1.1

Paste packet for the Chief of Staff. Do not open a second Polar product. Do not invent a coupon. Do not put a buy link in the README or inside the zip.

Tag `v0.1.1` is already shipped (GitHub Release `v0.1.1`). This file does not edit Polar, move tags, or regenerate zips. Paste the listing block below into the existing product. Never reseal tag `v0.1.0` or `release/maydo-0.1.0.zip`.

Same SKU. Same price rule: $99 for the first 20 organizations, then $149 on the same Polar product. The downloadable for this tag is `release/maydo-0.1.1.zip`.

Soft-WTP stays off. The README has no Checkout and no Polar buy link.

## License (source of record)

| Field | Value |
| --- | --- |
| Public license | PolyForm Noncommercial 1.0.0 (`LICENSE`) |
| Commercial grant | Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`) |
| Claims | source-available = true. OSI open source = false. |
| Seller | Suthirth solutions |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |

Tag `v0.1.0` keeps the grant text already shipped in that sealed zip. New tags use this fence. Rights already granted for `v0.1.0` stay on that artifact.

## Product

| Field | Value |
| --- | --- |
| Product | MayDo — entitlement kernel |
| Seller | Suthirth solutions |
| Repo | private `yellowgram/maydo` |
| Shape | Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. Self-host decision API process + thin TypeScript SDK (cache **off** by default) — buyer runs Postgres/API/worker. Stripe and Polar signed webhooks + local grants. |
| Decision | `allow(actor, action)` only |
| Price | **$149 USD once** — one organization, perpetual for the named tag |
| Launch | **$99 USD** for the first **20** buyers on **this same SKU** |
| Refund | **14 days** |
| Support | GitHub Issues on the private repository, **60 days** from purchase, best effort, **no SLA**, ≤ ~2 h/week |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |
| Status (buyer-facing) | https://status.yellowgram.dev/maydo |
| Zip | `release/maydo-0.1.1.zip` (prefix `maydo-0.1.1/`, comment `maydo-0.1.1`) |
| Sealed zip | `release/maydo-0.1.0.zip` (tag `v0.1.0`) — do not regenerate |
| Checksum | When the Polar file is `release/maydo-0.1.1.zip`, paste the 0.1.1 row from [`CHECKSUMS.md`](CHECKSUMS.md). Do not copy a hash from this file. Do not regenerate either zip. |

Not this product: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, Soft-WTP, coupons, cold invoices.

## Paste-ready listing draft

Paste the block below as the Polar description on the existing product. While the price charged is $99, leave both numbers in the text so buyer 21 is not surprised. Do not add a Checkout URL. Soft-WTP stays off.

```text
Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

MayDo is an entitlement kernel for one organization. It answers a single question: allow(actor, action) — may this actor do this action right now?

Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase.

You run Postgres, the decision API process, and the worker. Stripe and Polar stay the system of record for money. MayDo stores grants from signed Stripe and Polar webhooks, plus local grants, and serves the decision. The TypeScript SDK is thin and its cache is off by default.

Public license: PolyForm Noncommercial 1.0.0. Commercial production use requires a Suthirth Commercial Grant for one organization and the named release tag (docs/COMMERCIAL_GRANT.md in the kit). Source-available = true. OSI open source = false.

Price: $149 USD once. Perpetual for that named tag, for the purchased organization.
Launch price: $99 USD for the first 20 organizations, on this same product. Then $149. There is no coupon and no second product.

Refund: 14 days.

Support: GitHub Issues on the private repository for 60 days from purchase. Best effort. No SLA. A ticket needs a failing test, a test-mode event id, or an allow repro. Do not send live secrets.

Actor / Checkout metadata. Put maydo_actor and maydo_action (or maydo_actions) on Checkout or the Polar order from your server, not from the browser alone.

Browser-set metadata is a buyer footgun. If an operator actor map disagrees, the grant dead-letters with actor_metadata_mismatch.

Verifying the webhook signature proves the event came from Stripe or Polar. It does not prove the metadata names the billed subject.

MayDo does not add a signed actor assertion in this release.

MayDo does not invoice, replace Chargebee, auto-revoke from a seat report, do quantity math, or ship a plan packaging studio. When the decision API process you run is down, allow fails closed (deny). The kit status page is manual guidance for that process. It is not an SLA, and yellowgram does not operate the process.

Status: https://status.yellowgram.dev/maydo
Contact: hello@yellowgram.dev
https://www.yellowgram.dev
Seller: Suthirth solutions
```

## How delivery works

Two artifacts, one product. GitHub Release `v0.1.1` already carries the 0.1.1 zip. Do not regenerate it.

1. **Zip.** The downloadable for this tag is `release/maydo-0.1.1.zip`. The same bytes are on GitHub Release `v0.1.1`. Inside, paths start with `maydo-0.1.1/`. The zip comment is `maydo-0.1.1`. Entry times are pinned to `2026-09-26T00:00:00Z`. `docs/COMMERCIAL_GRANT.md` is in the zip. `release/maydo-0.1.0.zip` stays in the repo as the sealed historical artifact and is not this upload.
2. **Private GitHub.** `yellowgram/maydo` stays private. The zip for the named tag is the perpetual copy the Suthirth Commercial Grant covers. Repo access is how the buyer opens Issues during the 60-day window.

Checksum field: open `docs/CHECKSUMS.md` on `main` and paste the SHA-256 of `release/maydo-0.1.1.zip` into Polar's file checksum. This document does not contain the hex. If the field and the 0.1.1 row disagree, stop. Do not regenerate `release/maydo-0.1.0.zip`.

## Issues access (private repo)

Buyers cannot open Issues until they are invited.

1. Take the GitHub login from the buyer (email hello@yellowgram.dev is enough). No live secrets, no webhook signing keys.
2. Invite that login to `yellowgram/maydo` with the **Read** role so they can open Issues and cannot push.
3. The support window is **60 days from purchase**, not from the invite. Best effort. No SLA. Aggregate cap about **2 hours a week**.
4. A ticket must include a failing test, a **test-mode** provider event id, or an `allow` repro (`actor`, `action`, expected, actual). Reject live secrets. Point out-of-scope asks at `docs/OUT_OF_SCOPE_AUTOREPLY.md` and `SUPPORT.md`.
5. When the 60 days end, stop answering Issues. Removing the collaborator is not a grant revoke. They keep the zip and the Suthirth Commercial Grant for that named tag (`docs/COMMERCIAL_GRANT.md`). The public fence is PolyForm Noncommercial 1.0.0 (`LICENSE`).

## CoS flip checklist

Tag `v0.1.1` is already shipped. This file does not edit Polar. Do not recreate the Release or the zips. Paste the listing block on the existing product.

- [ ] https://status.yellowgram.dev/maydo returns the page in `status/index.html`.
- [ ] `main` contains `release/maydo-0.1.1.zip`, the unchanged `release/maydo-0.1.0.zip`, and both rows in `docs/CHECKSUMS.md`.
- [ ] GitHub Release `v0.1.1` stays as shipped. Its asset is `release/maydo-0.1.1.zip`. SHA-256 matches the 0.1.1 row. Tag `v0.1.0` is untouched. Do not recreate it.
- [ ] Founder GO stays the standing go-live. Do not open a second product decision.
- [ ] **One** Polar product. Charge **$99** until **20** paid orders, then set **the same product** to **$149**. Do not create a second product. Do not create a coupon or a discount code.
- [ ] Refund window **14 days**.
- [ ] Seller organization: **Suthirth solutions**.
- [ ] Listing paste is the block above, including Actor / Checkout metadata (PolyForm Noncommercial + Suthirth Commercial Grant; source-available = true; OSI open source = false).
- [ ] Cover image attached. **CoS supplies it.** This repo does not include one.
- [ ] Checksum pasted from the 0.1.1 row of `docs/CHECKSUMS.md`.
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
- One purchase is one organization, self-hosted, for the named tag, under the Suthirth Commercial Grant. It is not a resale right for a competing boilerplate.

## Actor / Checkout metadata

Same four points as the paste block above and as `SUPPORT.md`:

- Put `maydo_actor` and `maydo_action` (or `maydo_actions`) on Checkout or the Polar order from your server, not from the browser alone.
- Browser-set metadata is a buyer footgun. If an operator actor map disagrees, the grant dead-letters with `actor_metadata_mismatch`.
- Verifying the webhook signature proves the event came from Stripe or Polar. It does not prove the metadata names the billed subject.
- MayDo does not add a signed actor assertion in this release.

## Soft-WTP

Off. Do not add a waitlist, a name-your-price amount, a coupon, or a cold invoice. The only prices are $99 for the first 20 buyers and $149 after that, on this SKU.

## GitHub Release

GitHub Release `v0.1.1` already exists. Tag `v0.1.0` and `release/maydo-0.1.0.zip` stay sealed. This document does not create a Release, move a tag, or regenerate a zip. It does not edit Polar.

CoS pastes the listing block above into the existing Polar product. Same SKU. Same price rule. Soft-WTP stays off. Do not add a Checkout link to the README or the zip.

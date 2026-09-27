# Polar deliverables — MayDo 0.1.1

Paste packet for the Chief of Staff. Do not open a second Polar product. Do not invent a coupon. Do not put a buy link in the README or inside the zip.

**Hold still.** This draft does not change the live Polar listing. Freeze→land only after License Gate clears. LaunchGate CR is required before merge. Never reseal tag `v0.1.0` or `release/maydo-0.1.0.zip`.

The live kit stays the sealed 0.1.0 artifact until that land window. The next downloadable is `release/maydo-0.1.1.zip`. Same SKU. Same price rule: $99 for the first 20 organizations, then $149 on the same Polar product.

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
| Shape | Hosted decision API + thin TypeScript SDK (cache **off** by default). The buyer self-hosts the API process. Stripe and Polar signed webhooks + local grants. |
| Decision | `allow(actor, action)` only |
| Price | **$149 USD once** — one organization, perpetual for the named tag |
| Launch | **$99 USD** for the first **20** buyers on **this same SKU** |
| Refund | **14 days** |
| Support | GitHub Issues on the private repository, **60 days** from purchase, best effort, **no SLA**, ≤ ~2 h/week |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |
| Status (buyer-facing) | https://status.yellowgram.dev/maydo |
| Zip (after land) | `release/maydo-0.1.1.zip` (prefix `maydo-0.1.1/`, comment `maydo-0.1.1`) |
| Sealed zip | `release/maydo-0.1.0.zip` (tag `v0.1.0`) — do not regenerate |
| Checksum | Paste the 0.1.1 row from [`CHECKSUMS.md`](CHECKSUMS.md) in the land window. Do not copy a hash from this file. Leave the live Polar file on the 0.1.0 checksum until then. |

Not this product: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, Soft-WTP, coupons, cold invoices.

## Paste-ready listing draft

Paste the block below as the Polar description only in the License Gate freeze→land window, after LaunchGate CR and merge. While the price charged is $99, leave both numbers in the text so buyer 21 is not surprised.

```text
MayDo is an entitlement kernel for one organization. It answers a single question: allow(actor, action) — may this actor do this action right now?

You self-host it. Stripe and Polar stay the system of record for money. MayDo stores grants from signed Stripe and Polar webhooks, plus local grants, and serves the decision. The TypeScript SDK is thin and its cache is off by default.

Public license: PolyForm Noncommercial 1.0.0. Commercial production use requires a Suthirth Commercial Grant for one organization and the named release tag (docs/COMMERCIAL_GRANT.md in the kit). Source-available = true. OSI open source = false.

Price: $149 USD once. Perpetual for that named tag, for the purchased organization.
Launch price: $99 USD for the first 20 organizations, on this same product. Then $149. There is no coupon and no second product.

Refund: 14 days.

Support: GitHub Issues on the private repository for 60 days from purchase. Best effort. No SLA. A ticket needs a failing test, a test-mode event id, or an allow repro. Do not send live secrets.

MayDo does not invoice, replace Chargebee, auto-revoke from a seat report, do quantity math, or ship a plan packaging studio. If MayDo is down, allow fails closed. The status page is manual and is not an SLA.

Status: https://status.yellowgram.dev/maydo
Contact: hello@yellowgram.dev
https://www.yellowgram.dev
Seller: Suthirth solutions
```

## How delivery works

Two artifacts, one product. Swap them only after freeze→land:

1. **Zip.** Upload `release/maydo-0.1.1.zip` as the Polar file. The same bytes go on the GitHub Release `v0.1.1`. Inside, paths start with `maydo-0.1.1/`. The zip comment is `maydo-0.1.1`. Entry times are pinned to `2026-09-26T00:00:00Z`. `docs/COMMERCIAL_GRANT.md` is in the zip. `release/maydo-0.1.0.zip` stays in the repo as the sealed historical artifact and is not this upload.
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

Execute this list in the land window. This draft does not flip Polar.

- [ ] License Gate has cleared freeze→land. LaunchGate CR is recorded before merge.
- [ ] https://status.yellowgram.dev/maydo returns the page in `status/index.html`.
- [ ] `main` contains `release/maydo-0.1.1.zip`, the unchanged `release/maydo-0.1.0.zip`, and both rows in `docs/CHECKSUMS.md`.
- [ ] GitHub Release `v0.1.1` exists on `main` and its asset is `release/maydo-0.1.1.zip`. SHA-256 matches the 0.1.1 row. Tag `v0.1.0` is untouched.
- [ ] Founder GO stays the standing go-live. Do not open a second product decision.
- [ ] **One** Polar product. Charge **$99** until **20** paid orders, then set **the same product** to **$149**. Do not create a second product. Do not create a coupon or a discount code.
- [ ] Refund window **14 days**.
- [ ] Seller organization: **Suthirth solutions**.
- [ ] Listing paste is the block above (PolyForm Noncommercial + Suthirth Commercial Grant; source-available = true; OSI open source = false).
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
- Founding deploy is one API process. The allow rate limit does not cross processes.
- Status updates are manual. Single region. Best effort. Not an SLA.
- One purchase is one organization, self-hosted, for the named tag, under the Suthirth Commercial Grant. It is not a resale right for a competing boilerplate.

## Soft-WTP

Off. Do not add a waitlist, a name-your-price amount, a coupon, or a cold invoice. The only prices are $99 for the first 20 buyers and $149 after that, on this SKU.

## GitHub Release (after merge, not this draft)

This pull request does not create a GitHub Release and does not change Polar.

After License Gate clears, LaunchGate CR is done, and the branch is squash-merged to `main`:

1. Confirm `release/maydo-0.1.0.zip` still matches the sealed SHA-256 row in `docs/CHECKSUMS.md`.
2. Confirm `release/maydo-0.1.1.zip` matches the 0.1.1 row.
3. Create GitHub Release `v0.1.1` on that commit. Do not move, delete, or recreate tag `v0.1.0`.
4. Upload `release/maydo-0.1.1.zip` as the Release asset.
5. Send CoS the Release URL. CoS swaps the Polar downloadable and listing paste in the land window. Same SKU. Same price rule.

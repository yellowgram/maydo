# Polar deliverables — MayDo 0.1.0

Paste packet for the Chief of Staff. Do not open a second Polar product. Do not invent a coupon. Do not put a buy link in the README.

Founder GO is already given via the Chief of Staff. CoS publishes under that standing go-live **only after** all three of these are true:

1. This pack is on `main`: `release/maydo-0.1.0.zip` and `docs/CHECKSUMS.md`.
2. A GitHub Release on `main` has that same zip attached (steps at the bottom; not this PR).
3. https://status.yellowgram.dev/maydo is **actually live** (it serves `status/index.html`). Hosting is outside this repo. If the URL does not respond with that page, the listing stays dark.

Soft-WTP stays off. The README has no Checkout and no Polar buy link.

## Product

| Field | Value |
| --- | --- |
| Product | MayDo — entitlement kernel |
| Seller | Suthirth solutions |
| Repo | private `yellowgram/maydo` |
| Shape | Hosted decision API + thin TypeScript SDK (cache **off** by default). Stripe and Polar signed webhooks + local grants. |
| Decision | `allow(actor, action)` only |
| Price | **$149 USD once** — one organization, perpetual self-host |
| Launch | **$99 USD** for the first **20** buyers on **this same SKU** |
| Refund | **14 days** |
| Support | GitHub Issues, **60 days** from purchase, best effort, **no SLA**, ≤ ~2 h/week |
| Contact | hello@yellowgram.dev · https://www.yellowgram.dev |
| Status (buyer-facing) | https://status.yellowgram.dev/maydo |
| Zip | `release/maydo-0.1.0.zip` (prefix `maydo-0.1.0/`, comment `maydo-0.1.0`) |
| Checksum | Paste from [`CHECKSUMS.md`](CHECKSUMS.md). Do not copy a hash from this file. |

Not this product: invoicing, Chargebee, SeatTruth auto-revoke, quantity math, a packaging studio, fail-open, Soft-WTP, coupons, cold invoices.

## Paste-ready listing draft

Paste the block below as the Polar description **after** the status URL is live. While the price charged is $99, leave both numbers in the text so buyer 21 is not surprised.

```text
MayDo is an entitlement kernel for one organization. It answers a single question: allow(actor, action) — may this actor do this action right now?

You self-host it. Stripe and Polar stay the system of record for money. MayDo stores grants from signed Stripe and Polar webhooks, plus local grants, and serves the decision. The TypeScript SDK is thin and its cache is off by default.

Price: $149 USD once. Perpetual self-host for the purchased organization.
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

Two artifacts, one product:

1. **Zip.** Upload `release/maydo-0.1.0.zip` as the Polar file. The same bytes go on the GitHub Release. Inside, paths start with `maydo-0.1.0/`. The zip comment is `maydo-0.1.0`. Entry times are pinned to `2026-09-26T00:00:00Z`.
2. **Private GitHub.** `yellowgram/maydo` stays private. The zip is the perpetual copy the license covers. Repo access is how the buyer opens Issues during the 60-day window.

Checksum field: open `docs/CHECKSUMS.md` on `main` and paste the SHA-256 of `release/maydo-0.1.0.zip` into Polar's file checksum. This document does not contain the hex. If the field and `docs/CHECKSUMS.md` disagree, stop and re-run `npm run pack:release` on a clean `main`.

## Issues access (private repo)

Buyers cannot open Issues until they are invited.

1. Take the GitHub login from the buyer (email hello@yellowgram.dev is enough). No live secrets, no webhook signing keys.
2. Invite that login to `yellowgram/maydo` with the **Read** role so they can open Issues and cannot push.
3. The support window is **60 days from purchase**, not from the invite. Best effort. No SLA. Aggregate cap about **2 hours a week**.
4. A ticket must include a failing test, a **test-mode** provider event id, or an `allow` repro (`actor`, `action`, expected, actual). Reject live secrets. Point out-of-scope asks at `docs/OUT_OF_SCOPE_AUTOREPLY.md` and `SUPPORT.md`.
5. When the 60 days end, stop answering Issues. Removing the collaborator is not a license revoke. They keep the zip and the one-organization self-host license.

## CoS flip checklist

- [ ] https://status.yellowgram.dev/maydo returns the page in `status/index.html`. If it does not, **stop**. Do not list.
- [ ] `main` contains `release/maydo-0.1.0.zip` and `docs/CHECKSUMS.md`.
- [ ] GitHub Release `v0.1.0` exists on `main` and its asset is that zip. SHA-256 matches `docs/CHECKSUMS.md`.
- [ ] Founder GO: already given via CoS. Publish under that standing go-live once the three items above are true. Do not wait for a second product decision.
- [ ] **One** Polar product. Charge **$99** until **20** paid orders, then set **the same product** to **$149**. Do not create a second product. Do not create a coupon or a discount code.
- [ ] Refund window **14 days**.
- [ ] Seller organization: **Suthirth solutions**.
- [ ] Cover image attached. **CoS supplies it.** This repo does not include one.
- [ ] Checksum pasted from `docs/CHECKSUMS.md`.
- [ ] Soft-WTP off. No cold invoice. No waitlist SKU. No Checkout link added to the README.

## Refund toggle

Set the Polar refund window to **14 days**.

That toggle is the purchase refund of MayDo. It is not a webhook replay, and it is not Stripe `charge.refunded` or Polar `order.refunded` / subscription cancel. Those provider events revoke grants inside the buyer's self-hosted MayDo. Words: `docs/REFUND_GLOSSARY.md`.

## Cover image

CoS supplies the cover image before the listing goes light. Do not block the zip on it. Do not treat a generated stand-in as the commercial cover.

## Known limits (say these)

Honest limits, not a roadmap:

- Decision-only. Stripe and Polar keep the money. MayDo does not send invoices.
- A provider refund, including a Polar partial refund, revokes **every** mapped action on that binding. There is no quantity or seat proration.
- `grants orphan-candidates` is a report. Nothing auto-revokes from it. SeatTruth daily reconcile is not in this product.
- The SDK cache is off. HTTP 5xx, 429, and timeouts become `maydo_unavailable` (deny). There is no fail-open switch.
- `md_op_` keys are refused by the SDK. Operator actions stay on the CLI.
- Founding deploy is one API process. The allow rate limit does not cross processes.
- Status updates are manual. Single region. Best effort. Not an SLA.
- One purchase is one organization, self-hosted. It is not a resale license for a competing boilerplate.

## Soft-WTP

Off. Do not add a waitlist, a name-your-price amount, a coupon, or a cold invoice. The only prices are $99 for the first 20 buyers and $149 after that, on this SKU.

## GitHub Release (after squash-merge)

This pack PR does not create the Release. After it is squash-merged to `main`:

1. From `main`, confirm `npm run pack:release` succeeds on a clean tree and the SHA-256 still matches `docs/CHECKSUMS.md`.
2. Create GitHub Release `v0.1.0` on that commit.
3. Upload `release/maydo-0.1.0.zip` as the Release asset.
4. Send CoS the Release URL. CoS still waits on a live status URL before the Polar listing goes light.

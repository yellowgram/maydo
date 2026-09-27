# Minimum support checklist

Stranger path for one self-hosted organization. Docs are the proof. Do not add a product feature to make this list pass.

**Price:** $149 USD once. Launch $99 for the first 20 buyers on the same SKU.  
**Support:** GitHub Issues, 60 days from purchase, best effort, no SLA, ≤ ~2 h/week.  
**Contact:** hello@yellowgram.dev  
**License:** PolyForm Noncommercial 1.0.0 (`LICENSE`) plus the Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

## Before they are invited

- [ ] The zip they were sent is the live Polar file `release/maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`), or the sealed `release/maydo-0.1.0.zip` if that was the tag on the order.
- [ ] SHA-256 matches the row for that file in `docs/CHECKSUMS.md`. Do not regenerate either zip.
- [ ] Their GitHub login is invited to private `yellowgram/maydo` with **Read** (Issues, no push).

## Happy path they must finish without a screenshare

1. Unzip to `maydo-0.1.1/` (or `maydo-0.1.0/` for that sealed tag) and read `BUYER_START_HERE.md`.
2. `docker compose up -d`, copy `.env.example` to `.env`, `npm install`.
3. `npm test` passes. That run builds the tree and asserts the in-process demo (paid webhook, drain, allow, local revoke, deny) finishes in under 60 seconds.
4. Migrate, bootstrap, and start API + worker using `docs/START_HERE.md`.
5. `scripts/demo-60s.sh` passes against that stack. The narrative is `docs/DEMO_60S.md`. The script exits non-zero past 60 seconds.
6. The first `allow` in that script returns `grant_active`. The revoke returns `explicit_revoke`.

If step 3 or step 5 needs a founder on a call, the pack is not ready. Those two commands are the proof. This checklist does not add a third product surface.

## If they still open an Issue

- [ ] Inside 60 days of purchase.
- [ ] The ticket has a failing test, a test-mode event id, or an `allow` repro.
- [ ] No live secrets.
- [ ] Invoicing, Chargebee, seat auto-revoke, quantity math, packaging, fail-open, Soft-WTP, coupons, and cold invoices get `docs/OUT_OF_SCOPE_AUTOREPLY.md`.

## Ops they own

Webhook ACK is not a grant until the worker drains. Replay is not a refund of MayDo and not a provider refund (`docs/REFUND_GLOSSARY.md`). The orphan report does not revoke anything.

# Buyer start here

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

You unpacked `maydo-0.1.1.zip`. Paths below are inside `maydo-0.1.1/`. That is the live Polar download (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). `maydo-0.1.0.zip` is a sealed historical grandfather and is not this unpack.

Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase.

MayDo answers `allow(actor, action)` for **one organization**. You run Postgres, the decision API process, and the worker. The public license is PolyForm Noncommercial 1.0.0 (`LICENSE`). Paid commercial use of this named tag is the MayDo commercial grant (`docs/COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Support limits are `SUPPORT.md`.

## 1. Unzip

You should see `.env.example`, `LICENSE`, `docs/COMMERCIAL_GRANT.md`, `package.json`, `docs/START_HERE.md`, `docs/DEMO_60S.md`, and `scripts/demo-60s.sh`. There is no `.env` in the zip. Do not commit a real one.

## 2. Boot

Node.js 22+ and Postgres 16.

```bash
docker compose up -d
cp .env.example .env
npm install
npm test
```

`npm test` is the proof the tree builds. It includes the in-process paid → allow → revoke → deny path. The full boot, secrets, and process list are `docs/START_HERE.md`.

## 3. Migrate and the first allow

Follow `docs/START_HERE.md`: `npm run migrate`, then `admin bootstrap`, then start the API and the worker. Save the tenant id and the `md_test_` decision key. Do not put an `md_op_` key in the SDK.

The narrative for the 60-second path is `docs/DEMO_60S.md`. The runnable proof is:

```bash
scripts/demo-60s.sh
```

That script expects the API, worker, migrate, and bootstrap to be up already. It posts a signed Stripe **test** event, drains, checks `allow` is `grant_active`, revokes locally, and checks `allow` is `explicit_revoke`. It exits non-zero if that takes more than 60 seconds.

## 4. Support boundary

GitHub Issues on the public source-available repository `yellowgram/maydo`, **60 days** from purchase, best effort, **no SLA**. Anyone with a GitHub login can open Issues. Support answers only within 60 days of purchase for buyers. Read `SUPPORT.md` before opening one. Out of scope: `docs/OUT_OF_SCOPE_AUTOREPLY.md`.

Kit status page, once published: https://status.yellowgram.dev/maydo. The file in this tree is `status/index.html`. It is kit release health and self-host ops guidance. This zip does not host that URL, and yellowgram does not operate the decision API.

# Buyer start here

You unpacked `maydo-0.1.0.zip`. Paths below are inside `maydo-0.1.0/`.

MayDo answers `allow(actor, action)` for **one organization**. You self-host it. The license is `LICENSE`. Support limits are `SUPPORT.md`.

## 1. Unzip

You should see `.env.example`, `LICENSE`, `package.json`, `docs/START_HERE.md`, `docs/DEMO_60S.md`, and `scripts/demo-60s.sh`. There is no `.env` in the zip. Do not commit a real one.

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

GitHub Issues on the private repo, **60 days** from purchase, best effort, **no SLA**. Read `SUPPORT.md` before opening one. Out of scope: `docs/OUT_OF_SCOPE_AUTOREPLY.md`.

Status, once it is actually published: https://status.yellowgram.dev/maydo. The file in this tree is `status/index.html`. This zip does not host that URL.

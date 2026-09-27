# START_HERE

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

MayDo answers one question: **may this actor do this action right now?**

Stripe and Polar keep the money. MayDo stores grants and serves `allow(actor, action)`. There is no invoicing, no credit wallet, and no seat reconcile job.

Public license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Commercial production use of a named tag: Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

You run Postgres, the decision API process, and the worker. Polar delivers `maydo-x.y.z.zip`. There is no managed / always-on cloud service in this purchase. Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). `release/maydo-0.1.0.zip` on tag `v0.1.0` stays sealed as the historical grandfather. See [POLAR_DELIVERABLES.md](POLAR_DELIVERABLES.md) and [STATUS.md](STATUS.md). `status/index.html` is kit guidance, not a yellowgram-operated decision API. This repository is the kernel.

## What you need

- Node.js 22+
- Postgres 16 (`docker compose up -d` or a local cluster)
- Copy `.env.example` to `.env` and export it

```bash
npm install
npm run build
npm run migrate
node dist/packages/cli/src/main.js admin bootstrap --name "Founding"
```

Bootstrap prints a tenant id, an `md_test_` decision key, an `md_op_` operator key, and webhook secrets. Save them.

```bash
export MAYDO_TENANT_ID=<tenant id>
export DATABASE_URL_API=postgres://maydo_api:maydo_api_dev@127.0.0.1:5432/maydo
export DATABASE_URL_WORKER=postgres://maydo_worker:maydo_worker_dev@127.0.0.1:5432/maydo
export MAYDO_KEY_PEPPER=dev-pepper-change-me
export MAYDO_ALLOW_INSECURE_DEV_SECRETS=1
export MAYDO_SESSION_SECRET="$(openssl rand -hex 32)"
```

The API, worker, and console refuse to start if the database role is superuser or `BYPASSRLS`. Do not point runtime processes at the migrator.

The dev pepper and the dev session secret are public. Local boot must set `MAYDO_ALLOW_INSECURE_DEV_SECRETS=1` to use them. Never set that flag on a founding host.

## Founding deploy

Set every one of these. A missing or default secret fails closed (the process exits).

- `NODE_ENV=production`
- `MAYDO_REQUIRE_PRODUCTION=1` so the same guards run if the host forgets `NODE_ENV`
- `MAYDO_KEY_PEPPER` from `openssl rand -hex 32` (the value `dev-pepper-change-me` is refused)
- `MAYDO_SESSION_SECRET` at least 32 characters and not `dev-session-change-me`
- Do **not** set `MAYDO_ALLOW_INSECURE_DEV_SECRETS`
- `DATABASE_URL_API` is `maydo_api`. `DATABASE_URL_WORKER` is `maydo_worker`. Neither is the migrator.

The production console cookie is `Secure`. Terminate TLS in front of the console. Run **one** API process. The allow rate limit does not cross processes.

IP allowlists use the socket address. Leave `MAYDO_TRUST_PROXY` unset unless one reverse proxy is the only path to the process. That flag trusts the rightmost `X-Forwarded-For` hop. CR3 did not pick a hop count for a second proxy.

## Three processes

```bash
npm run start:api      # :3040  POST /v1/allow, webhooks, /healthz, /readyz
npm run start:worker   # outbox drain, audit writer, 30-day retention
npm run start:console  # :3041  read-mostly UI, md_op_ only, no replay execute
```

Webhook URLs:

- `POST /v1/webhooks/stripe/<ingest_token>`
- `POST /v1/webhooks/polar/<ingest_token>`

Put `maydo_actor` and `maydo_action` (or `maydo_actions`) on the Checkout or Polar order from **your server**, not from the browser alone. That metadata is trusted only as far as the code that wrote it. MayDo does not add a signed actor assertion. If an operator actor map is set and Checkout names a different actor, the grant is dead-lettered instead of applied.

## First allow

1. Point Stripe CLI or Polar test webhooks at the URLs above. Livemode on the endpoint must match the event (`false` for test).
2. Send a paid test event. The HTTP handler only verifies, stores the event, and enqueues outbox rows. It does not grant inside the request.
3. Confirm the worker is running (`maydo webhooks health` shows a fresh heartbeat and outbox depth moving to zero).
4. `allow` with the decision key returns `grant_active`.
5. Revoke from the provider, or `maydo grants revoke <id>`. The next `allow` is deny.

A duplicate delivery returns **200** and does not create a second grant. A bad signature returns **400**. A database failure returns **500** so the provider retries. Never ACK a bad signature with 200 — Polar disables endpoints after repeated non-2xx, but a false 200 is worse.

The 60-second path is [`DEMO_60S.md`](DEMO_60S.md). The runnable form is `scripts/demo-60s.sh`. `maydo outbox drain` applies only `MAYDO_TENANT_ID`. Draining every tenant requires `outbox drain --all-tenants` and `DATABASE_URL_WORKER`.

`allow` expiry uses the database clock. A far-future `created` on a signed webhook is clamped to the signature time so it cannot block a later refund.

## Operator commands

```bash
node dist/packages/cli/src/main.js grants list
node dist/packages/cli/src/main.js grants create --actor org_123 --action export.pdf --note "pilot"
node dist/packages/cli/src/main.js grants revoke <id>
node dist/packages/cli/src/main.js grants sticky:report
node dist/packages/cli/src/main.js grants orphan-candidates
node dist/packages/cli/src/main.js webhooks health
node dist/packages/cli/src/main.js replay list
node dist/packages/cli/src/main.js replay dry-run <dead_letter_id>
node dist/packages/cli/src/main.js replay execute <dead_letter_id>
node dist/packages/cli/src/main.js outbox drain --once
node dist/packages/cli/src/main.js audit search --actor org_123 --deny-only
```

Sticky grants require `expires_at` and cannot extend past 90 days. They are opt-in and shown in red in the console. Provider revoke does not clear an unexpired sticky grant. A local revoke always wins.

`grants orphan-candidates` is a heuristic labeled **candidates, not truth**. Nothing in MayDo auto-revokes from it.

Replay reopens one outbox row. Drain applies the mutation. Replay is not a refund.

## SDK

```ts
import { createClient } from "@yellowgram/maydo";

const maydo = createClient({
  apiKey: process.env.MAYDO_DECISION_KEY!,
  baseUrl: "http://127.0.0.1:3040",
});
const decision = await maydo.allow({ actor: "org_123", action: "export.pdf" });
```

Cache is off. `md_op_` keys throw. HTTP 5xx and timeouts become `{ allow: false, reason: "maydo_unavailable" }`. Do not catch that and allow anyway.

Decision keys in a browser reveal entitlement posture. Proxy `allow` through your backend. Operator keys stay on the CLI.

## Status

Kit page: [https://status.yellowgram.dev/maydo](https://status.yellowgram.dev/maydo) (`status/index.html` is the stub). It is release health and ops guidance for the process you run. It is not a seller SLO. See [`STATUS.md`](STATUS.md) and [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md).

## Support

GitHub Issues on the private repository, for 60 days from purchase. Best effort, no SLA. See [`../SUPPORT.md`](../SUPPORT.md). Contact hello@yellowgram.dev. The purchase refund is 14 days ([`REFUND_GLOSSARY.md`](REFUND_GLOSSARY.md)).

Out of scope mail gets [`OUT_OF_SCOPE_AUTOREPLY.md`](OUT_OF_SCOPE_AUTOREPLY.md).

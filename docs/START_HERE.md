# START_HERE

MayDo answers one question: **may this actor do this action right now?**

Stripe and Polar keep the money. MayDo stores grants and serves `allow(actor, action)`. There is no invoicing, no credit wallet, and no seat reconcile job.

Polar listing stays **dark** until a real deliverable exists. This repository is the kernel.

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
```

The API role and the worker role are **not** `BYPASSRLS`. Do not point runtime processes at the migrator superuser.

## Three processes

```bash
npm run start:api      # :3040  POST /v1/allow, webhooks, /healthz, /readyz
npm run start:worker   # outbox drain, audit writer, 30-day retention
npm run start:console  # :3041  read-mostly UI, md_op_ only, no replay execute
```

Webhook URLs:

- `POST /v1/webhooks/stripe/<ingest_token>`
- `POST /v1/webhooks/polar/<ingest_token>`

Put `maydo_actor` and `maydo_action` (or `maydo_actions`) on the Checkout or Polar order from **your server**, not from the browser alone.

## First allow

1. Point Stripe CLI or Polar test webhooks at the URLs above. Livemode on the endpoint must match the event (`false` for test).
2. Send a paid test event. The HTTP handler only verifies, stores the event, and enqueues outbox rows. It does not grant inside the request.
3. Confirm the worker is running (`maydo webhooks health` shows a fresh heartbeat and outbox depth moving to zero).
4. `allow` with the decision key returns `grant_active`.
5. Revoke from the provider, or `maydo grants revoke <id>`. The next `allow` is deny.

A duplicate delivery returns **200** and does not create a second grant. A bad signature returns **400**. A database failure returns **500** so the provider retries. Never ACK a bad signature with 200 — Polar disables endpoints after repeated non-2xx, but a false 200 is worse.

The 60-second path is [`DEMO_60S.md`](DEMO_60S.md).

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

Public stub: [https://status.yellowgram.dev/maydo](https://status.yellowgram.dev/maydo) (`status/index.html` is what you publish). Updates are manual. See [`STATUS.md`](STATUS.md) and [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md).

## Support

Email hello@yellowgram.dev. Best effort, no SLA. The founding goodwill credit is an ops policy, not a product feature: [`FOUNDING_GOODWILL_CREDIT.md`](FOUNDING_GOODWILL_CREDIT.md).

Out of scope mail gets [`OUT_OF_SCOPE_AUTOREPLY.md`](OUT_OF_SCOPE_AUTOREPLY.md).

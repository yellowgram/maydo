# MayDo

MayDo is an entitlement kernel. The only hot-path question is `allow(actor, action)`: may this actor do this action right now?

**Shape (locked):** Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. Self-host decision API process + thin TypeScript SDK (cache **off** by default) — you run Postgres, the API, and the worker.

**State:** Stripe and Polar signed webhooks, plus local grants. Decision-only — no invoicing, no Chargebee, no quantity math, no SeatTruth auto-revoke, no packaging studio.

## Commercial lock

Source of record: [PolyForm Noncommercial 1.0.0](LICENSE) for the public fence, and the [MayDo commercial grant](docs/COMMERCIAL_GRANT.md) for paid commercial use of a named tag. Legal seller: Suthirth Solutions, operating as yellowgram.

- **Claims:** source-available = true. OSI open source = false.
- **Price:** $149 USD once. One organization. Perpetual for the named tag.
- **Launch:** $99 USD for the first 20 buyers, on the same SKU. No second product. No coupons.
- **Legal seller:** Suthirth Solutions, operating as yellowgram
- **Refund:** 14 days. [`docs/REFUND_GLOSSARY.md`](docs/REFUND_GLOSSARY.md)
- **Support:** GitHub Issues for 60 days from purchase. Best effort. No SLA. [`SUPPORT.md`](SUPPORT.md)
- **Contact:** [hello@yellowgram.dev](mailto:hello@yellowgram.dev) · https://www.yellowgram.dev/maydo
- **coupons:** off. Cold invoices are not sold. This README has no Checkout and no buy link.
- **Polar:** Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). Same SKU: $99 for the first 20 buyers, then $149. Refund 14 days. `release/maydo-0.1.0.zip` on tag `v0.1.0` stays sealed as the historical grandfather. Packet: [`docs/POLAR_DELIVERABLES.md`](docs/POLAR_DELIVERABLES.md). Status page source is `status/index.html`. This repo does not host [https://status.yellowgram.dev/maydo](https://status.yellowgram.dev/maydo).

## Quick start

Purchasers start at [`BUYER_START_HERE.md`](BUYER_START_HERE.md). Migrate, bootstrap, the API, and the worker must already be up ([`docs/START_HERE.md`](docs/START_HERE.md)). The fixture narrative is [`docs/DEMO_60S.md`](docs/DEMO_60S.md). `npm run demo` aliases [`scripts/demo-60s.sh`](scripts/demo-60s.sh): a signed Stripe test body with `maydo_actor` and `maydo_action` in metadata.

```bash
docker compose up -d
npm install
npm test
npm run migrate
node dist/packages/cli/src/main.js admin bootstrap --name "Founding"
# API and worker already up — docs/START_HERE.md
export API=http://127.0.0.1:3040
export STRIPE_TOKEN=<bootstrap ingest token>
export STRIPE_WEBHOOK_SECRET=<bootstrap webhook secret>
export MAYDO_DECISION_KEY=<md_test_ or md_live_ key>
export MAYDO_TENANT_ID=<tenant id>
npm run demo
```

Actor comes from buyer-server Checkout or order metadata. MayDo does not add a signed actor assertion.

Runtime roles `maydo_api` and `maydo_worker` are not `BYPASSRLS`. The worker sets `maydo.tenant_id` from the outbox row it claimed.

| Path | Role |
| --- | --- |
| `apps/api` | `POST /v1/allow`, Stripe + Polar webhooks, `/healthz`, `/readyz` |
| `apps/worker` | outbox drain, async allow-audit, 30-day retention |
| `apps/console` | read-mostly operator UI; replay execute stays on the CLI |
| `packages/sdk-ts` | `@yellowgram/maydo` |
| `packages/cli` | grants, mapping, replay, audit, keys |
| `packages/adapters` | Stripe + Polar verify and grant/revoke map |
| `fixtures/` | pinned provider enums and bodies |

## Design

Product design lives in [`design/`](design/). Read order:

1. [`design/COMPETITIVE_SKIM.md`](design/COMPETITIVE_SKIM.md) — wedge vs Schematic / Stigg / Autumn
2. [`design/MVP_SCOPE.md`](design/MVP_SCOPE.md) — in / out / later
3. [`design/MINIMUM_SUPPORT.md`](design/MINIMUM_SUPPORT.md) — thin support boundary
4. [`design/OPERATOR_NEEDS.md`](design/OPERATOR_NEEDS.md) — grants, webhook health, replay, allow audit
5. [`design/DR1.md`](design/DR1.md) — architecture pass #1
6. [`design/DR2.md`](design/DR2.md) — locks D1–D12
7. [`design/DR3.md`](design/DR3.md) — freeze
8. [`design/LAUNCHGATE_DR4_PACK.md`](design/LAUNCHGATE_DR4_PACK.md) — go/no-go pack

**LaunchGate DR4: APPROVE.** Implementation follows the DR3 freeze. Design history stays in `design/`.


Security reports: [SECURITY.md](SECURITY.md).

# MayDo

MayDo is an entitlement kernel. The only hot-path question is `allow(actor, action)`: may this actor do this action right now?

**Shape (locked):** hosted decision API + thin TypeScript SDK. SDK cache is **off** by default.

**State:** Stripe and Polar signed webhooks, plus local grants. Decision-only — no invoicing, no Chargebee, no Soft-WTP, no cold invoices.

**Polar:** listing stays **dark** until zip / SHA / deliverables exist.

**Pricing (USD, context):** ~$199 founding setup + ~$79/mo  
**Contact:** [hello@yellowgram.dev](mailto:hello@yellowgram.dev)

## Run

Start here: [`docs/START_HERE.md`](docs/START_HERE.md). The 60-second path is [`docs/DEMO_60S.md`](docs/DEMO_60S.md).

```bash
docker compose up -d
npm install
npm test
npm run migrate
node dist/packages/cli/src/main.js admin bootstrap --name "Founding"
```

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

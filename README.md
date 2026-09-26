# MayDo

MayDo is an entitlement kernel. The only hot-path question is `allow(actor, action)`: may this actor do this action right now?

**Shape (locked):** hosted decision API + thin TypeScript SDK. SDK cache is **off** by default.

**State:** Stripe and Polar signed webhooks, plus local grants. Decision-only — no invoicing, no Chargebee, no Soft-WTP, no cold invoices.

**Polar:** listing stays **dark** until zip / SHA / deliverables exist.

**Pricing (USD, context):** ~$199 founding setup + ~$79/mo  
**Contact:** [hello@yellowgram.dev](mailto:hello@yellowgram.dev)

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

**LaunchGate DR4: APPROVE.** This pull request is design only. Implementation follows in a separate PR against the DR3 freeze (`design/DR3.md`).

# Landing honesty

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

MayDo is a decision kernel. It is not a monetization system of record. Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase. Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). `maydo-0.1.0.zip` stays sealed as the historical grandfather.

| | MayDo | Stigg, Schematic | Autumn |
| --- | --- | --- | --- |
| Question | `allow(actor, action)` | Entitlements plus a catalog, metering, and packaging | `check`, and also `attach` / `track` against Stripe billing |
| Money | Stripe and Polar stay the system of record | Monetization platform | Billing control layer that can create Stripe subscriptions and invoices |
| What you self-host | Decision API, thin TypeScript SDK (cache off), webhooks, local grants | Plan studio, credits, widgets | Pricing and billing |

Do not describe MayDo as Stigg, Schematic, Autumn, or Chargebee. A sentence about invoicing, metering-for-invoice, or a packaging studio is a different product.

Price and the Polar listing live in `docs/POLAR_DELIVERABLES.md`. The public license is PolyForm Noncommercial 1.0.0 (`LICENSE`). Commercial production use is the Suthirth Commercial Grant (`docs/COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

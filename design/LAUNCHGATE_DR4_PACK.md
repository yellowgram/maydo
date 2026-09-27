# MayDo — LaunchGate DR4 Pack

> **SKU shape (current):** self-host decision API process + thin TypeScript SDK (cache off by default) — the buyer runs Postgres, the API, and the worker. Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU. “Hosted decision API” and the founding goodwill credit below are a superseded 2026-09-26 draft. They are not sold.

**To:** LaunchGate (4th DR — go/no-go on design → implement PR)  
**From:** DR×3 design chain (DR1 → DR2 → DR3). Parent hands this pack; DR agents do not message you.  
**Product:** MayDo — yellowgram entitlement kernel (`allow(actor, action)`)  
**Date:** 2026-09-26 ET  
**Mode:** Design review only — **do not implement product code**; do not collapse DR×3; do not Soft-WTP.

> **Commercial lock (post-MVP):** $149 USD once — one organization, perpetual self-host. Launch $99 for the first 20 buyers on the same SKU (no second product, no coupons). Refund 14 days. Seller: Suthirth solutions. The ~$199 / ~$79 figures in this file are the 2026-09-26 design draft, not the price to charge.

---

## 1. Paths to read (in order)

| # | Path | Role |
| --- | --- | --- |
| 1 | `design/COMPETITIVE_SKIM.md` | Wedge vs Schematic / Stigg / Autumn; kill line |
| 2 | `design/MVP_SCOPE.md` | In / Out / Later; HookSteel pattern reuse |
| 3 | `design/MINIMUM_SUPPORT.md` | Thin support boundary; ≤2 h/week kill clock |
| 4 | `design/OPERATOR_NEEDS.md` | Four surfaces: grants / webhook health / replay / allow audit |
| 5 | `design/DR1.md` | Architecture pass #1 |
| 6 | `design/DR2.md` | Locks D1–D12 |
| 7 | `design/DR3.md` | Closes 7 opens; checklist; freeze; adversarial #3 |

Primary attack surface for this gate: **DR3 §4 brief + §5 freeze + DR2 kill table**. Skim 1–4 for fences; deep-read 5–7.

---

## 2. Shape (locked)

- **Self-host decision API process** + **thin TypeScript SDK** (cache **off** by default; opt-in TTL ≤5s). The buyer runs Postgres, the API, and the worker. Superseded draft, not the SKU: a yellowgram-hosted decision API.  
- Stripe + Polar signed webhooks → HookSteel-style verify → unique event → same-txn N-outbox → drain → grant store.  
- Read-only `allow(actor, action)`; **no money path**.  
- Operator: **CLI writes + replay execute**; **read-mostly web**.  
- Pricing context: ~$199 founding setup + ~$79/mo USD; contact hello@yellowgram.dev.  
- Polar listing **dark** until zip/SHA/deliverables.

---

## 3. Kill criteria (no-go if present as day-1 / MVP must)

| Kill | Signal |
| --- | --- |
| Money without `allow()` | Roadmap item to monetize without the decision API |
| Invoicing / Net / payment links / dunning / tax | Chargebee / Soft-WTP |
| Credit wallet / usage → invoice | Autumn / Schematic |
| Plan packaging studio / GTM catalog | Beyond boring mapping table |
| `attach`-style create subscription/checkout | Billing SoR |
| Customer portal / billing widgets | Schematic/Stigg surface |
| SeatTruth **daily** reconcile **or auto-revoke orphans** | Explicitly later / DR3 R4 forbid |
| Soft-WTP / cold invoices / waitlist monetization | Forbidden |
| Fail-open default / “availability mode” | When the buyer’s decision API process is down, `allow` must deny |
| SDK cache-on default | Stale allows after revoke |
| Quantity / seat prorated entitlements | All-or-nothing refunds only |
| RLS bypass as sole tenant isolation | DR3 R1 reject |
| Support >2 h/week sustained, no doc gap closed | Pause sales |
| Cannot demo allow + webhook grant + local override ≤60s | Do not Polar-list |
| “Monetization platform” / “replace Chargebee” marketing | Fence |

**One-line test:** If it makes money without answering `allow()`, or invoices / meters-for-invoice / nightly seat reconcile — cut it.

---

## 4. What to attack (DR3 brief summary)

1. Cross-tenant drain / GUC / RLS (R1)  
2. SeatTruth creep (orphan auto-revoke, sticky-as-default, seats, benefit_grant)  
3. Fail-open temptation  
4. Billing SoR creep (attach, invoice.paid grants, quantity, packaging studio)  
5. Support-load honesty (CLI/web, sticky, partial refund, 2 h/week)  
6. Polar enum pin + fixtures vs live docs  
7. ≤60s demo path honesty  
8. `md_live_` vs `md_op_` separation; SDK never takes op keys  
9. Audit degrade preserves **100% denies**  
10. Kit status page + incident template for the process the buyer runs. The founding goodwill credit is superseded and not sold.  

**Known limits (P2 — not day-1):** embed SoR, mTLS, signed actor assertions, SeatTruth, web replay execute, multi-region/SLA, more PSPs, numeric credits-as-invoice, default `revoke_on_past_due`.

---

## 5. Ask

**Go / no-go:** May the parent open an **implement design PR → code** against the DR3 freeze (`DR3.md` §5)?

- **Go** = freeze stands; implement may begin per checklist; LaunchGate may still block specific CR diffs that hit kill criteria.  
- **No-go** = name the kill criterion / fatal gap; do not rewrite DR history; return findings to parent.

Do **not** implement product code in this pass. Do **not** contact founding buyers. Do **not** enable Soft-WTP.

---

*Pack ready for parent → LaunchGate handoff. Last updated: 2026-09-26 ET.*

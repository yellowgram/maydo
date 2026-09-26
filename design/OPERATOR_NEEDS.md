# MayDo — Operator Needs

**Product:** MayDo — entitlement kernel  
**Audience:** founding-customer operator (founder-CTO or billing-adjacent eng)  
**Date:** 2026-09-26 ET  

Operators must answer four questions without pinging yellowgram: **Who has what? Are webhooks healthy? Can I recover a stuck grant? What did `allow` say?**

---

## 1. Grants (see / do)

### Must see
- Per **actor**: active grants, source (`stripe` | `polar` | `local`), action, created/expires, last webhook event id.
- Global search by actor id, action, provider customer/order id.
- Diff view: webhook-derived vs local overrides (comps, pilots).

### Must do
- **Create** local grant (actor, action, optional expiry, note).
- **Revoke** / expire grant immediately (local or mirrored provider revoke).
- **Disable** a webhook mapping row without redeploying (config flag) when a renewal would double-grant.
- Never: send invoices, edit Stripe prices, or open Net-term UI (out of product).

### Day-1 precedence (documented, simple)
1. Explicit revoke / deny grant wins.
2. Else any active grant for `(actor, action)` → allow.
3. Else deny.

Refine later; do not invent Schematic-style plan versioning UI in MVP.

---

## 2. Webhook health (see / do)

### Must see
- Last N events per provider: type, `provider_event_id`, status (`received` / `outboxed` / `ignored` / processed), HTTP outcome class.
- Counts: 2xx vs 400 vs 500 over 1h/24h; outbox depth; open dead letters.
- Livemode / sandbox declaration vs traffic (Stripe livemode mismatch; Polar operator-declared livemode — HookSteel pattern).
- Endpoint disabled warnings (Polar: 10 consecutive non-2xx — document; do not “fix” by returning 200 on bad sig).

### Must do
- Rotate webhook secret runbook (CLI `whsec_` ≠ Dashboard `whsec_`).
- Pause ingest mapping for a noisy event type.
- Re-drive only via **replay** of stored/dead-lettered work — not by forging unsigned bodies.

### Health = green when
- Signatures verify; duplicates ACK 200 with no second grant; drain/worker heartbeat fresh; dead-letter count stable or trending down.

---

## 3. Replay (see / do)

Reuse HookSteel operator discipline (`replay:list` → `dry-run` → `execute` → `drain`).

### Must see
- Dead-letter list: id, reason (`max_attempts` / `poison` / …), adapter/mapper, `replayed_at`.
- Dry-run intended mutation (no writes): which grant row would reopen.

### Must do
1. Inspect reason; fix mapper/adapter/payload **first**.
2. Dry-run one id.
3. Execute one id (reopen work item; do **not** call external effects in execute).
4. Drain / worker applies grant mutation once; idempotency key unchanged.
5. Confirm `allow` flips as expected; confirm no sibling adapters re-fired unexpectedly.

### Glossary (operator-facing)
- **Replay** = re-open failed grant work so drain runs again.
- **Replay ≠ refund** (Polar/Stripe money movement is outside MayDo).
- One operator, one id per command; no `--force`; second execute of same id refused.

Yellowgram is not on-call for the customer’s dead-letter queue.

---

## 4. Allow audit (see / do)

### Must see
- Append-only (or time-bounded) log of `allow` checks: timestamp, actor, action, decision, reason code, grant id(s) consulted, latency bucket.
- Filter by actor / action / deny-only (support’s #1 ask: “why can’t they export?”).
- Optional: sample of allow=true for regression (“did we open the barn door?”).

### Must do
- Export a window for a single actor (CSV/JSON) for customer support tickets **without** dumping full PII payloads from raw webhooks.
- Retention policy documented (buyer-owned if self-host; MayDo-hosted default + delete-on-request).

### Must not
- Turn audit into a product-analytics suite (Schematic temptation).
- Log raw webhook JSONB with cardholder PII into the allow stream — keep grant ids + decision metadata only.

---

## Operator daily / weekly checklist

| Cadence | Check |
| --- | --- |
| Daily | Outbox/dead-letter depth; 5xx spike; drain heartbeat |
| After pricing change | Mapping table: paid → grant actions still correct; renewals not double-granting |
| After incident | Replay runbook; allow audit for affected actors; confirm deny/allow |
| Weekly | Local grants nearing expiry; orphan grants (no matching subscription — note only; SeatTruth reconcile is **later**) |

---

## UI vs CLI (shape locked)

**Lock:** CLI writes + replay execute; **read-mostly web** (DR2 D8 / DR3). Product delivery shape is locked: hosted decision API + thin TypeScript SDK (cache off by default). Prefer boring tables over GTM packaging chrome.

| Surface | Minimum viable control |
| --- | --- |
| Grants | List / create / revoke |
| Webhooks | Event list + health counters |
| Replay | List / dry-run / execute (+ drain status) |
| Allow audit | Search + export |

---

## Non-goals for operators (deflect)

- Building invoices or credit wallets.
- SeatTruth nightly reconcile dashboards (later).
- Feature-flag percentage rollouts.
- Editing Polar/Stripe catalog prices inside MayDo.

*Last updated: 2026-09-26 ET — design pack only.*

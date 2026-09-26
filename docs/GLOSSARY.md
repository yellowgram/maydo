# Glossary

| Term | Meaning |
| --- | --- |
| `allow(actor, action)` | Read-only decision. Not a charge, not a feature-flag rollout. |
| Grant | Boolean entitlement row for one actor, action, source, and binding. |
| Binding | Stripe subscription or checkout id, Polar subscription or order id, or a local id. Renewals upsert the same binding. |
| Source | `stripe`, `polar`, or `local`. Audit metadata, not a plan catalog. |
| Sticky | Opt-in local allow that survives a provider revoke until `expires_at` (required, ≤ 90 days). |
| Local revoke | Operator deny. Always wins over webhook allows until you create a new local grant. |
| Replay | Re-open one failed outbox row so drain can apply it again. |
| Refund | Money movement in Stripe or Polar. MayDo does not perform it. Partial refunds still revoke every mapped action. |
| Dead letter | Work that will not retry until an operator replays it, or an unresolved actor/action with nothing to grant. |
| Expansion set | The N outbox rows produced from one provider event. Health shows sets that are not all `done`. |
| Decision key | `md_live_` / `md_test_`. `allow` only. |
| Operator key | `md_op_`. CLI and console. Refused by the SDK. |
| Orphan candidate | Active provider grant with no provider event for that binding in 45 days. A report, not a revoke. |

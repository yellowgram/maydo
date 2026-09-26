# Webhook status contract

Same discipline as a reliable event pipeline: verify the raw body, insert the provider event once, enqueue grant work in that same transaction, and leave adapters to the worker.

| Situation | HTTP | Body | Grant effect |
| --- | --- | --- | --- |
| Bad signature, bad timestamp, or missing secret | 400 | `invalid_signature` | none, event not stored |
| Livemode does not match the endpoint | 400 | `livemode_mismatch` | none |
| Unknown ingest token or wrong provider | 400 | `unknown_endpoint` | none |
| JSON that fails after a good signature | 400 | `bad_payload` | none |
| Database or transaction failure | 500 | `ingest_failed` | rolled back; provider should retry |
| First delivery, work enqueued | 200 | `{"status":"ok"}` | after drain, not inside this request |
| First delivery, event ignored (noop or mapping disabled) | 200 | `{"status":"ignored"}` | none |
| Actor or action unresolved | 200 | `{"status":"dead"}` | dead letter, no grant |
| Duplicate `(tenant, provider, provider_event_id)` | 200 | `{"status":"duplicate"}` | no second grant |

Polar `provider_event_id` is the `webhook-id` header, not `data.id`. Stripe uses `event.id`.

Do not return 200 for a bad signature. Polar disables an endpoint after repeated failures; papering over a bad signature hides attacks.

`invoice.paid` is ignored. `subscription.canceled` and `subscription.past_due` are no-ops unless an operator explicitly sets `revoke_on_past_due` (default false). `subscription.updated` is never a grant or revoke, including when Polar also emits it beside `subscription.revoked`.

A 200 means the event was accepted. It does not mean the grant is visible to `allow` yet. Watch outbox depth. Drain lag is not a reason to fail open.

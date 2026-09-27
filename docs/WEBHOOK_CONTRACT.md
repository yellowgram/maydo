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

A grant that loses to `operator_lock` is still **200** at ingest and **done** after drain, with outbox `last_error = skipped: operator_lock`. It is not a dead letter. Replay would only hit the same lock. `maydo webhooks health` counts those rows.

## Checkout metadata

`maydo_actor` / `maydo_action` / `maydo_actions` are whatever the buyer’s server wrote onto Checkout or the Polar order. A signed webhook does not make that metadata a MayDo assertion. Set it on the server. Do not copy it from the browser.

If `actor_maps` already names an actor for that provider customer and the metadata names a different one, a **grant** dead-letters with `actor_metadata_mismatch`. A **revoke** still revokes grants stored on the binding for the mapped actor, and records the same note. There is no signed actor token in this kernel.

Actor and action strings are capped at 256 characters. Longer values dead-letter (`field_too_long`). `POST /v1/allow` returns HTTP 400 `{ "allow": false, "reason": "bad_request" }` and does not audit.

Ordering uses the provider timestamp. If that timestamp is more than five minutes ahead of the verified signature, MayDo stores the signature time instead. A missing timestamp does not erase a stored one. Two missing timestamps are last-write-wins. An equal timestamp does not let a grant revive a revoke.

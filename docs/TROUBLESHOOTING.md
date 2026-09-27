# Troubleshooting top 8

1. **Wrong webhook secret.** Stripe signs with the endpoint secret as a UTF-8 string (`whsec_...` included). Polar Standard Webhooks use the base64 key after `whsec_`. A dashboard secret and a CLI secret are different values. Mismatch → 400 `invalid_signature`.

2. **Polar body reparsed.** Verify the raw bytes. Re-serializing JSON changes the signature. The API reads the raw body before parsing.

3. **Worker down.** Webhooks can return 200 while grants sit in the outbox. `maydo webhooks health` shows depth and `worker_heartbeat`. Run the worker, or `maydo outbox drain --once`.

4. **Local grant vs webhook.** A non-sticky local allow loses to a provider revoke. A sticky local allow survives until it expires or you revoke it. A local revoke beats a later paid webhook. `allow.reason` tells you which.

5. **Livemode mismatch.** Test events against a livemode endpoint return 400 and are not stored. Bootstrap creates test endpoints with `livemode=false`.

6. **Replay is not a refund.** `replay execute` reopens one dead-lettered outbox row. It does not call Stripe or Polar, and it does not move money. Fix the mapper first, dry-run, execute once, drain. A second execute of the same id is refused.

7. **Stale allow.** The SDK cache is off. If you opted into `cache.ttlMs`, staleness can last that long (max 5s). Pass `bypassCache: true` on revoke-critical paths. Do not add your own fail-open cache.

8. **Empty action map.** No `maydo_actor` / `maydo_action`, no actor map, and no product map → dead letter `actor_unresolved` or `action_unresolved`, and no grant. Fix metadata on the server that creates Checkout, then send a new event. The console lists the dead letter; it cannot execute replay.

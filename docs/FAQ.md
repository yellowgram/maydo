# FAQ

## Is this a hosted / managed service?

No. This purchase is a self-host kit. You operate Postgres / the worker / the Action.

Polar delivers maydo-x.y.z.zip. There is no managed / always-on cloud service in this purchase.

Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). `maydo-0.1.0.zip` on tag `v0.1.0` is a sealed historical grandfather and is not the live download.

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

## The pilot lost access after cancel

Three different cases:

- Sticky was not set. A provider revoke beats a normal local allow. Create a sticky grant if the pilot should outlive cancel, with an expiry within 90 days.
- Sticky expired. `allow.reason` is `expired` or `explicit_revoke` once the provider row is revoked. Sticky does not renew from webhooks. Run `maydo grants sticky:report` and create a new sticky grant if you still intend the comp.
- You revoked it locally. Local revoke always wins, including over a later paid event, until you `grants create` again.

Sticky is not the default and it is not a discount program.

## You partially refunded and everything turned off

MayDo revokes **all** actions on that order or subscription binding when it sees `order.refunded`, including when the payload status is `partially_refunded`. It does not do quantity or seat proration. If one seat of a mental model was refunded, Stripe or Polar still owns that money decision; MayDo will not invent a partial entitlement. Say so in the ticket. Do not add quantity math to make the ticket go away.

## `allow` failed closed during an outage

The SDK returns `{ "allow": false, "reason": "maydo_unavailable" }` on HTTP 5xx, HTTP 429, network errors, and timeouts. That is the contract. There is no availability mode and no fail-open flag. A malformed `allow` body is `{ "allow": false, "reason": "bad_request" }` with HTTP 400. That is the caller's request, not an outage. The SDK does not cache `maydo_unavailable`.

Do not wrap the SDK in `catch { return true }`. A buyer who does that owns the open door. When the decision API process you run is down, `allow` denies. Point them at this FAQ. The kit status page is ops guidance, not a yellowgram-operated service.

`tenant_disabled`, `auth_failed`, `bad_request`, `explicit_revoke`, `expired`, and `no_grant` are real decisions, not outages.

## Why is the webhook 200 but `allow` still denies?

The worker has not applied the outbox row yet, the event was ignored, it dead-lettered (`actor_unresolved`, `actor_metadata_mismatch`), or a paid grant lost to `operator_lock`. Health then says `skipped, operator lock`: the event is done, not a dead letter, and replay will not restore access. `grants create` adds a local allow without unlocking that binding. Check `maydo webhooks health` and `maydo replay list`.

## Can I turn `subscription.canceled` into an immediate revoke?

No. Polar `subscription.canceled` is a period-end signal. Access ends on `subscription.revoked` (or a local revoke). Mapping that event to a grant or revoke is not supported. `subscription.past_due` stays a no-op unless you explicitly set `revoke_on_past_due` on a mapping row.

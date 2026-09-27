# Incident template

Manual status first. Do not invent a fail-open switch while you write this.

## Internal (in order)

1. Set the status page (`status/index.html` / https://status.yellowgram.dev/maydo) to `degraded` or `outage`.
2. If the impact is longer than 15 minutes, send the buyer note below to known founding contacts.
3. Do not enable a fail-open flag. One must not exist. Do not tell buyers to cache `allow: true`.
4. Prefer deny plus the status banner. Drain lag is not an outage of `allow` unless the API itself is failing.
5. After recovery, set status back to `operational` and add a short note to the FAQ if the failure mode will recur.

## Buyer note

Subject: MayDo availability

MayDo is fail-closed: during this outage `allow` returns deny / `maydo_unavailable`. Do not wrap the SDK with a fail-open fallback.

Status: https://status.yellowgram.dev/maydo
ETA: <fill in>
What still works: <Stripe/Polar charges are unaffected / webhooks may queue>
What we need from you: nothing, unless you already wrapped the SDK.

## Postmortem stub

- Start / end (UTC):
- User-visible symptom (`maydo_unavailable`, webhook 500, drain lag):
- What we did not do: fail open, auto-revoke, replay refunds.
- Doc gap to close:

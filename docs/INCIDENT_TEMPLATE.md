# Incident template

For the decision API process you run. yellowgram does not operate that process, and this page is not a seller SLO. Manual notes first. Do not invent a fail-open switch while you write this.

Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

## When your process is down

1. If you publish a copy of `status/index.html`, set that copy to `degraded` or `outage`. https://status.yellowgram.dev/maydo is kit guidance, not a yellowgram-operated decision API.
2. Do not enable a fail-open flag. One must not exist. Do not tell callers to cache `allow: true`.
3. Prefer deny. Drain lag is not an outage of `allow` unless the API process itself is failing.
4. After recovery, set the note back to your normal kit state and add a short note to the FAQ if the failure mode will recur.

## Note you can send your own users

Subject: Decision API process unavailable

The MayDo process we run is fail-closed: during this outage `allow` returns deny / `maydo_unavailable`. Do not wrap the SDK with a fail-open fallback.

This is our self-hosted process. yellowgram does not operate it.

ETA: <fill in>
What still works: <Stripe/Polar charges are unaffected / webhooks may queue>
What we need from you: nothing, unless you already wrapped the SDK.

## Postmortem stub

- Start / end (UTC):
- User-visible symptom (`maydo_unavailable`, webhook 500, drain lag):
- What we did not do: fail open, auto-revoke, replay refunds.
- Doc gap to close:

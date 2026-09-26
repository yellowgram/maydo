# Public status

**URL:** https://status.yellowgram.dev/maydo

The page in this repo (`status/index.html`) is the stub to publish. Updates are manual. States are `operational`, `degraded`, and `outage`.

`maydo status` prints that URL and, when `API_BASE_URL` is set, the local `/healthz` result.

A synthetic `allow` check from outside the region (a founder cron is enough) should flip the page when the API stops answering. That probe is not a customer-facing SLA.

Single region. Target in-region p99 for evaluate-plus-audit-enqueue is 100ms, excluding the buyer network. Best effort only.

Incident words live in [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md). Money policy lives in [`FOUNDING_GOODWILL_CREDIT.md`](FOUNDING_GOODWILL_CREDIT.md).

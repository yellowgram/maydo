# Public status

**URL:** https://status.yellowgram.dev/maydo

**LaunchGate block:** this repository does not deploy that host. `status/index.html` is the page to publish (operational / degraded / outage, fail-closed wording). Until that file is actually served at the URL, do not tell a buyer the status page is live, and do not list on Polar.

`maydo status` prints that URL and, when `API_BASE_URL` is set, the local `/healthz` result.

A synthetic `allow` check from outside the region (a founder cron is enough) should flip the page when the API stops answering. That probe is not a customer-facing SLA.

Single region. Target in-region p99 for evaluate-plus-audit-enqueue is 100ms, excluding the buyer network. Best effort only.

Incident words live in [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md). Money policy lives in [`FOUNDING_GOODWILL_CREDIT.md`](FOUNDING_GOODWILL_CREDIT.md).

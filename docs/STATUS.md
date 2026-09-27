# Public status

**URL:** https://status.yellowgram.dev/maydo

**Polar-ready:** a listing may go light only after this URL is **actually live** (it serves `status/index.html`), `release/maydo-0.1.0.zip` is on `main`, and a GitHub Release has that zip attached. Founder go-live is already given via the Chief of Staff. CoS publishes under that standing go once those three are true. This repository does not deploy the status host. Until the URL responds with that page, do not tell a buyer the status page is live, and do not list on Polar. See [`POLAR_DELIVERABLES.md`](POLAR_DELIVERABLES.md).

`maydo status` prints that URL and, when `API_BASE_URL` is set, the local `/healthz` result.

A synthetic `allow` check from outside the region (a founder cron is enough) should flip the page when the API stops answering. That probe is not a customer-facing SLA.

Single region. Target in-region p99 for evaluate-plus-audit-enqueue is 100ms, excluding the buyer network. Best effort only.

Incident words live in [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md). Money policy lives in [`FOUNDING_GOODWILL_CREDIT.md`](FOUNDING_GOODWILL_CREDIT.md).

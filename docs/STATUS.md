# Public status

**URL:** https://status.yellowgram.dev/maydo

**Polar-ready:** the live kit is the sealed `release/maydo-0.1.0.zip` on tag `v0.1.0`. The next downloadable is `release/maydo-0.1.1.zip`, swapped only in the License Gate freeze→land window after LaunchGate CR and merge. This repository does not deploy the status host. See [`POLAR_DELIVERABLES.md`](POLAR_DELIVERABLES.md). Public license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Commercial use: Suthirth Commercial Grant (`COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

`maydo status` prints that URL and, when `API_BASE_URL` is set, the local `/healthz` result.

A synthetic `allow` check from outside the region (a founder cron is enough) should flip the page when the API stops answering. That probe is not a customer-facing SLA.

Single region. Target in-region p99 for evaluate-plus-audit-enqueue is 100ms, excluding the buyer network. Best effort only.

Incident words live in [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md). Money policy lives in [`FOUNDING_GOODWILL_CREDIT.md`](FOUNDING_GOODWILL_CREDIT.md).

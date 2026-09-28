# Kit status


Polar product id  (do not rename). Legal seller: Suthirth Solutions, operating as yellowgram. Polar organization dashboard **Suthirth solutions** (not renamed this week).
Source-available kit (zip + docs). You run this. yellowgram does not operate a hosted endpoint for this SKU.

**Page source:** `status/index.html`  
**Publish URL:** https://status.yellowgram.dev/maydo

That URL is kit release health and buyer self-host ops guidance. It is not a multi-tenant status board for a decision API operated by yellowgram. There is no seller SLO for this purchase.

Polar delivers `maydo-x.y.z.zip`. There is no managed / always-on cloud service in this purchase. Live Polar delivers `maydo-0.1.1.zip` (SHA-256 `6175707689f2f6a3a88c818e700e2ad72e3193c3b31cb573ed29055f8bf83587`). Price $99 for the first 20 buyers, then $149, same SKU. Refund 14 days. `release/maydo-0.1.0.zip` on tag `v0.1.0` stays sealed as the historical grandfather. This repository does not deploy the status URL. See [`POLAR_DELIVERABLES.md`](POLAR_DELIVERABLES.md). Public license: PolyForm Noncommercial 1.0.0 (`LICENSE`). Commercial use: MayDo commercial grant (`COMMERCIAL_GRANT.md`). Claims: source-available = true. OSI open source = false. Soft-WTP is off.

`maydo status` prints that URL and, when `API_BASE_URL` is set, the local `/healthz` of the process you run.

When your decision API process is down, `allow` fails closed (`maydo_unavailable`). That is your process. Best effort docs only. Not an SLA.

Incident words for the process you run live in [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md). The purchase refund is 14 days ([`REFUND_GLOSSARY.md`](REFUND_GLOSSARY.md)).

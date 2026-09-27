# @yellowgram/maydo

Thin TypeScript client for the MayDo decision API.

```ts
import { createClient } from "@yellowgram/maydo";

const maydo = createClient({
  apiKey: process.env.MAYDO_API_KEY!, // md_live_ or md_test_ only
  baseUrl: "https://api.example.com",
});

const decision = await maydo.allow({ actor: "org_123", action: "export.pdf" });
```

Cache is **off** by default. Opt in with `cache: { ttlMs: 5000 }` at most. Timeouts, HTTP 5xx, and HTTP 429 return `{ allow: false, reason: "maydo_unavailable" }` and are not cached. HTTP 400 with `reason: "bad_request"` is a client deny, not an outage. Do not wrap this client with a fail-open default.

`md_op_` keys are refused. Operator grants, replay, and mapping stay on the CLI.

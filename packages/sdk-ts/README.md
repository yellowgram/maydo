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

Cache is **off** by default. Opt in with `cache: { ttlMs: 5000 }` at most. Timeouts and HTTP 5xx return `{ allow: false, reason: "maydo_unavailable" }`. Do not wrap this client with a fail-open default.

`md_op_` keys are refused. Operator grants, replay, and mapping stay on the CLI.

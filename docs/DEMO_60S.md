# Demo in 60 seconds

Paid webhook → allow → local revoke → deny. No invoice, no portal, no fail-open.

Runnable script: [`scripts/demo-60s.sh`](../scripts/demo-60s.sh). It exits non-zero if the wall clock exceeds 60 seconds. CI runs the same sequence in-process and asserts the same bound. Assumes migrate, bootstrap, API, and worker are already up (see START_HERE). Replace the tokens from bootstrap. `outbox drain` applies only the tenant in `MAYDO_TENANT_ID`.

```bash
# 0s — sign a Stripe test event and post it
BODY='{"id":"evt_demo_1","object":"event","type":"checkout.session.completed","livemode":false,"created":1758900000,"data":{"object":{"id":"cs_demo","object":"checkout.session","customer":"cus_demo","subscription":"sub_demo","metadata":{"maydo_actor":"org_demo","maydo_action":"export.pdf"}}}}'
SIG=$(node -e '
const {createHmac}=require("node:crypto");
const body=process.argv[1]; const secret=process.argv[2]; const t=Math.floor(Date.now()/1000);
const mac=createHmac("sha256", secret).update(t+"."+body).digest("hex");
process.stdout.write("t="+t+",v1="+mac);
' "$BODY" "$STRIPE_WEBHOOK_SECRET")

curl -sS -X POST "$API/v1/webhooks/stripe/$STRIPE_TOKEN" \
  -H "stripe-signature: $SIG" -H "content-type: application/json" --data "$BODY"
# → {"status":"ok"}

# 15s — worker drain (or wait for the loop)
node dist/packages/cli/src/main.js outbox drain --once

# 25s — allow
curl -sS -X POST "$API/v1/allow" \
  -H "authorization: Bearer $MAYDO_DECISION_KEY" \
  -H "content-type: application/json" \
  -d '{"actor":"org_demo","action":"export.pdf"}'
# → {"allow":true,"reason":"grant_active",...}

# 40s — local override
GRANT=$(node dist/packages/cli/src/main.js grants list --actor org_demo | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s)[0].id))')
node dist/packages/cli/src/main.js grants revoke "$GRANT"

# 55s — deny
curl -sS -X POST "$API/v1/allow" \
  -H "authorization: Bearer $MAYDO_DECISION_KEY" \
  -H "content-type: application/json" \
  -d '{"actor":"org_demo","action":"export.pdf"}'
# → {"allow":false,"reason":"explicit_revoke",...}
```

Post the same body again and the webhook returns `{"status":"duplicate"}` with still one grant row.

If this path needs a screenshare, the deploy is not founding-ready.

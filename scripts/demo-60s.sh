#!/usr/bin/env bash
# Paid webhook → drain → allow → local revoke → deny.
# Assumes migrate, bootstrap, API, and worker are already up (docs/START_HERE.md).
# Required: API, STRIPE_TOKEN, STRIPE_WEBHOOK_SECRET, MAYDO_DECISION_KEY.
# Optional: DATABASE_URL_API or DATABASE_URL_WORKER (the CLI drain uses the worker URL when set).
set -euo pipefail

: "${API:?set API to the decision API origin, for example http://127.0.0.1:3040}"
: "${STRIPE_TOKEN:?set STRIPE_TOKEN to the bootstrap ingest token}"
: "${STRIPE_WEBHOOK_SECRET:?set STRIPE_WEBHOOK_SECRET to the bootstrap webhook secret}"
: "${MAYDO_DECISION_KEY:?set MAYDO_DECISION_KEY to the md_test_ or md_live_ key}"
: "${MAYDO_TENANT_ID:?set MAYDO_TENANT_ID so drain stays on this tenant}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI=(node "$ROOT/dist/packages/cli/src/main.js")
START=$(date +%s)

BODY='{"id":"evt_demo_1","object":"event","type":"checkout.session.completed","livemode":false,"created":1758900000,"data":{"object":{"id":"cs_demo","object":"checkout.session","customer":"cus_demo","subscription":"sub_demo","metadata":{"maydo_actor":"org_demo","maydo_action":"export.pdf"}}}}'
SIG=$(node -e '
const {createHmac}=require("node:crypto");
const body=process.argv[1]; const secret=process.argv[2]; const t=Math.floor(Date.now()/1000);
const mac=createHmac("sha256", secret).update(t+"."+body).digest("hex");
process.stdout.write("t="+t+",v1="+mac);
' "$BODY" "$STRIPE_WEBHOOK_SECRET")

curl -fsS -X POST "$API/v1/webhooks/stripe/$STRIPE_TOKEN" \
  -H "stripe-signature: $SIG" -H "content-type: application/json" --data "$BODY"
echo

"${CLI[@]}" outbox drain --once

ALLOW=$(curl -fsS -X POST "$API/v1/allow" \
  -H "authorization: Bearer $MAYDO_DECISION_KEY" \
  -H "content-type: application/json" \
  -d '{"actor":"org_demo","action":"export.pdf"}')
echo "$ALLOW"
node -e 'const d=JSON.parse(process.argv[1]); if(!d.allow||d.reason!=="grant_active") process.exit(1)' "$ALLOW"

GRANT=$("${CLI[@]}" grants list --actor org_demo | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const rows=JSON.parse(s); if(!rows[0]) process.exit(1); console.log(rows[0].id)})')
"${CLI[@]}" grants revoke "$GRANT"

DENY=$(curl -fsS -X POST "$API/v1/allow" \
  -H "authorization: Bearer $MAYDO_DECISION_KEY" \
  -H "content-type: application/json" \
  -d '{"actor":"org_demo","action":"export.pdf"}')
echo "$DENY"
node -e 'const d=JSON.parse(process.argv[1]); if(d.allow||d.reason!=="explicit_revoke") process.exit(1)' "$DENY"

ELAPSED=$(( $(date +%s) - START ))
echo "demo finished in ${ELAPSED}s"
if (( ELAPSED > 60 )); then
  echo "demo exceeded 60s" >&2
  exit 1
fi

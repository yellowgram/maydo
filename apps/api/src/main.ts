import { assertKeyPepper, DEV_KEY_PEPPER } from "../../../packages/core/src/index.js";
import { assertRuntimeRole, makePool } from "../../../packages/db/src/pool.js";
import { createApiServer, listen } from "./server.js";

const port = Number(process.env.API_PORT ?? 3040);
const databaseUrl = process.env.DATABASE_URL_API ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL_API is required");
  process.exit(1);
}

const production = process.env.NODE_ENV === "production";
const pepper = process.env.MAYDO_KEY_PEPPER ?? DEV_KEY_PEPPER;
assertKeyPepper(pepper, production);

const pool = makePool(databaseUrl, "maydo-api");
await assertRuntimeRole(pool);
const server = createApiServer({
  pool,
  pepper,
  auditDegradeDepth: Number(process.env.AUDIT_DEGRADE_DEPTH ?? 1000),
  ratePerMin: Number(process.env.ALLOW_RATE_PER_MIN ?? 600),
  trustProxy: process.env.MAYDO_TRUST_PROXY === "1",
});

await listen(server, port);
console.log(`maydo api listening on :${port}`);

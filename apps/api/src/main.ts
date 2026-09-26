import { makePool } from "../../../packages/db/src/pool.js";
import { createApiServer, listen } from "./server.js";

const port = Number(process.env.API_PORT ?? 3040);
const databaseUrl = process.env.DATABASE_URL_API ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL_API is required");
  process.exit(1);
}

const pool = makePool(databaseUrl, "maydo-api");
const server = createApiServer({
  pool,
  pepper: process.env.MAYDO_KEY_PEPPER ?? "dev-pepper-change-me",
  auditDegradeDepth: Number(process.env.AUDIT_DEGRADE_DEPTH ?? 1000),
  ratePerMin: Number(process.env.ALLOW_RATE_PER_MIN ?? 600),
});

await listen(server, port);
console.log(`maydo api listening on :${port}`);

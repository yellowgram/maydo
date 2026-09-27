import {
  allowInsecureDevSecrets,
  assertKeyPepper,
  assertSessionSecret,
  DEV_KEY_PEPPER,
  DEV_SESSION_SECRET,
  isProductionRuntime,
} from "../../../packages/core/src/index.js";
import { assertRuntimeRole, makePool } from "../../../packages/db/src/index.js";
import { createConsoleServer } from "./server.js";

const port = Number(process.env.CONSOLE_PORT ?? 3041);
const databaseUrl = process.env.DATABASE_URL_API ?? process.env.DATABASE_URL;
const production = isProductionRuntime();
const pepper = process.env.MAYDO_KEY_PEPPER ?? DEV_KEY_PEPPER;
const sessionSecret = process.env.MAYDO_SESSION_SECRET ?? DEV_SESSION_SECRET;
const insecureDev = allowInsecureDevSecrets();
const statusUrl = process.env.MAYDO_STATUS_URL ?? "https://status.yellowgram.dev/maydo";

if (!databaseUrl) {
  console.error("DATABASE_URL_API is required");
  process.exit(1);
}

assertKeyPepper(pepper, { production, allowInsecureDevSecrets: insecureDev });
assertSessionSecret(sessionSecret, {
  production,
  allowInsecureDevSecrets: insecureDev,
});

const pool = makePool(databaseUrl, "maydo-console");
await assertRuntimeRole(pool);

const server = createConsoleServer({
  pool,
  pepper,
  sessionSecret,
  trustProxy: process.env.MAYDO_TRUST_PROXY === "1",
  statusUrl,
  production,
  allowInsecureDevSecrets: insecureDev,
});

server.listen(port, () => {
  console.log(`maydo console listening on :${port}`);
});

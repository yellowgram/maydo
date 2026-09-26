import { AUDIT_RETENTION_DAYS } from "../../../packages/core/src/index.js";
import { drainAuditBatch, drainOnce, makePool, purgeAudit } from "../../../packages/db/src/index.js";

const once = process.argv.includes("--once");
const databaseUrl = process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL_WORKER is required");
  process.exit(1);
}

const pool = makePool(databaseUrl, "maydo-worker");
let lastPurge = 0;

async function tick(): Promise<boolean> {
  await pool.query(`SELECT maydo.touch_heartbeat($1, $2::jsonb)`, ["worker", JSON.stringify({ pid: process.pid })]);
  const drained = await drainOnce(pool);
  await drainAuditBatch(pool);
  if (Date.now() - lastPurge > 60 * 60 * 1000) {
    await purgeAudit(pool, AUDIT_RETENTION_DAYS);
    lastPurge = Date.now();
  }
  return drained;
}

if (once) {
  const drained = await tick();
  console.log(JSON.stringify({ drained }));
  await pool.end();
} else {
  console.log("maydo worker started");
  for (;;) {
    try {
      const drained = await tick();
      if (!drained) await sleep(500);
    } catch (error) {
      console.error("worker tick failed", error instanceof Error ? error.message : error);
      await sleep(1000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

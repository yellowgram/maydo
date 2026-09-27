import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "packages/db/migrations"),
    path.resolve(here, "../migrations"),
    path.resolve(here, "../../../../packages/db/migrations"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`migrations directory not found (tried ${candidates.join(", ")})`);
}

export async function migrate(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is required for migrations");
  const pool = new pg.Pool({ connectionString, max: 1, application_name: "maydo-migrate" });
  const client = await pool.connect();
  try {
    const dir = migrationsDir();
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const reg = await client.query<{ name: string | null }>(`SELECT to_regclass('maydo.schema_migrations') AS name`);
    const applied = new Set<string>();
    if (reg.rows[0]?.name) {
      const rows = await client.query<{ id: string }>(`SELECT id FROM maydo.schema_migrations`);
      for (const row of rows.rows) applied.add(row.id);
    }
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO maydo.schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
          [file],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const db = await client.query<{ current: string }>(`SELECT current_database() AS current`);
    const name = db.rows[0]?.current;
    if (name) {
      await client.query(`GRANT CONNECT ON DATABASE ${quoteIdent(name)} TO maydo_api, maydo_worker`);
    }
    const bypass = await client.query<{ rolname: string; rolbypassrls: boolean }>(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('maydo_api', 'maydo_worker')`,
    );
    for (const row of bypass.rows) {
      if (row.rolbypassrls) {
        throw new Error(`${row.rolname} must not be BYPASSRLS`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("unexpected database name");
  return `"${value}"`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

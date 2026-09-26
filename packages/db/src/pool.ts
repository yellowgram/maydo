import pg from "pg";

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function makePool(connectionString: string, applicationName: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 8,
    application_name: applicationName,
  });
}

/** Transaction-local GUC. Callers still pass tenant_id in SQL. */
export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('maydo.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already dead */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function setTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(`SELECT set_config('maydo.tenant_id', $1, true)`, [tenantId]);
}

/** Runtime pools must not be the migrator. Superuser and BYPASSRLS skip RLS. */
export async function assertRuntimeRole(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  const row = result.rows[0];
  if (!row || row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `${row?.rolname ?? "unknown"} must not be superuser or BYPASSRLS — point runtime at maydo_api or maydo_worker`,
    );
  }
}

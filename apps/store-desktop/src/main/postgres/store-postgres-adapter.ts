import pg from "pg";

export type StorePostgresProbeResult = {
  reachable: boolean;
  schemaReady: boolean;
  serverVersion: string | null;
  databaseName: string | null;
  schemaVersion: string | null;
  errorMessage: string | null;
};

const { Pool } = pg;

export async function probeStorePostgresDatabase(
  connectionString: string,
  timeoutMs = 3000
): Promise<StorePostgresProbeResult> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 1000,
    max: 1
  });

  try {
    const client = await pool.connect();

    try {
      const result = await client.query<{
        server_version: string;
        database_name: string;
        schema_version: string | null;
      }>(
        `SELECT
          current_setting('server_version') AS server_version,
          current_database() AS database_name,
          (
            SELECT value
            FROM store_node_metadata
            WHERE key = 'schema_version'
            LIMIT 1
          ) AS schema_version`
      );
      const row = result.rows[0] ?? null;
      const schemaVersion = row?.schema_version ?? null;

      return {
        reachable: true,
        schemaReady: schemaVersion === "flash-erp-store-postgres-v1",
        serverVersion: row?.server_version ?? null,
        databaseName: row?.database_name ?? null,
        schemaVersion,
        errorMessage: null
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostgreSQL store probe failed.";
    const missingSchema =
      message.includes('relation "store_node_metadata" does not exist') ||
      message.includes("store_node_metadata");

    return {
      reachable: missingSchema,
      schemaReady: false,
      serverVersion: null,
      databaseName: null,
      schemaVersion: null,
      errorMessage: missingSchema ? "Store PostgreSQL schema has not been provisioned." : message
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

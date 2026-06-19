import sql from "mssql";

export type StoreMssqlProbeResult = {
  reachable: boolean;
  schemaReady: boolean;
  serverVersion: string | null;
  databaseName: string | null;
  schemaVersion: string | null;
  errorMessage: string | null;
};

export const storeMssqlSchemaVersion = "flash-erp-store-mssql-v1";

const requiredStoreMssqlColumns = [
  {
    tableName: "inventory_location_snapshot",
    columnName: "is_sales_order_default"
  },
  {
    tableName: "pos_transaction_line",
    columnName: "inventory_location_code"
  },
  {
    tableName: "pos_transaction_line",
    columnName: "variant_size"
  },
  {
    tableName: "pos_transaction_line",
    columnName: "variant_color"
  },
  {
    tableName: "pos_transaction_line",
    columnName: "product_variant_code_snapshot"
  },
  {
    tableName: "pos_transaction_line",
    columnName: "variant_attributes_snapshot"
  },
  {
    tableName: "sales_order",
    columnName: "deposit_amount"
  },
  {
    tableName: "sales_order",
    columnName: "balance_amount"
  },
  {
    tableName: "product_snapshot",
    columnName: "track_size"
  },
  {
    tableName: "product_snapshot",
    columnName: "track_color"
  }
] as const;

export function parseStoreMssqlConnectionString(value: string) {
  const trimmed = value.trim().replace(/^"|"$/g, "");

  if (trimmed.startsWith("sqlserver://")) {
    const body = trimmed.slice("sqlserver://".length);
    const [server, ...parts] = body.split(";");
    const entries = new Map<string, string>();

    for (const part of parts) {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        continue;
      }

      entries.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
    }

    return {
      server,
      database: entries.get("database") ?? "",
      user: entries.get("user") ?? entries.get("user id") ?? entries.get("uid") ?? "",
      password: entries.get("password") ?? entries.get("pwd") ?? "",
      encrypt: entries.get("encrypt") ?? "false",
      trustServerCertificate:
        entries.get("trustservercertificate") ??
        entries.get("trust server certificate") ??
        "true"
    };
  }

  const entries = new Map<string, string>();
  for (const part of trimmed.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    entries.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
  }

  return {
    server: entries.get("server") ?? entries.get("data source") ?? "",
    database: entries.get("database") ?? entries.get("initial catalog") ?? "",
    user: entries.get("user id") ?? entries.get("uid") ?? entries.get("user") ?? "",
    password: entries.get("password") ?? entries.get("pwd") ?? "",
    encrypt: entries.get("encrypt") ?? "false",
    trustServerCertificate:
      entries.get("trustservercertificate") ?? entries.get("trust server certificate") ?? "true"
  };
}

export function normalizeStoreMssqlConnectionString(value: string) {
  const parsed = parseStoreMssqlConnectionString(value);

  return [
    `Server=${parsed.server}`,
    `Database=${parsed.database}`,
    parsed.user ? `User Id=${parsed.user}` : "",
    parsed.password ? `Password=${parsed.password}` : "",
    `Encrypt=${parsed.encrypt}`,
    `TrustServerCertificate=${parsed.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}

export async function probeStoreMssqlDatabase(
  connectionString: string,
  timeoutMs = 3000
): Promise<StoreMssqlProbeResult> {
  const pool = new sql.ConnectionPool(normalizeStoreMssqlConnectionString(connectionString));

  try {
    await pool.connect();
    const result = await pool.request().query<{
      server_version: string;
      database_name: string;
      schema_version: string | null;
    }>(`
      SELECT
        CONVERT(nvarchar(max), @@VERSION) AS server_version,
        DB_NAME() AS database_name,
        (
          SELECT TOP (1) [value]
          FROM [dbo].[store_node_metadata]
          WHERE [key] = N'schema_version'
        ) AS schema_version
    `);
    const row = result.recordset[0] ?? null;
    const schemaVersion = row?.schema_version ?? null;
    const missingColumns: string[] = [];

    for (const column of requiredStoreMssqlColumns) {
      const columnResult = await pool.request()
        .input("tableName", sql.NVarChar(128), column.tableName)
        .input("columnName", sql.NVarChar(128), column.columnName)
        .query<{ value: number }>(`
          SELECT CASE WHEN COL_LENGTH(N'[dbo].[' + @tableName + N']', @columnName) IS NULL
            THEN 0
            ELSE 1
          END AS [value]
        `);

      if (columnResult.recordset[0]?.value !== 1) {
        missingColumns.push(`${column.tableName}.${column.columnName}`);
      }
    }

    const schemaReady =
      schemaVersion === storeMssqlSchemaVersion && missingColumns.length === 0;

    return {
      reachable: true,
      schemaReady,
      serverVersion: row?.server_version ?? null,
      databaseName: row?.database_name ?? null,
      schemaVersion,
      errorMessage:
        missingColumns.length > 0
          ? `Store SQL Server schema is missing required column(s): ${missingColumns.join(", ")}.`
          : null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL Server store probe failed.";
    const missingSchema =
      message.includes("Invalid object name") ||
      message.includes("store_node_metadata");

    return {
      reachable: missingSchema,
      schemaReady: false,
      serverVersion: null,
      databaseName: null,
      schemaVersion: null,
      errorMessage: missingSchema ? "Store SQL Server schema has not been provisioned." : message
    };
  } finally {
    await pool.close().catch(() => undefined);
  }
}

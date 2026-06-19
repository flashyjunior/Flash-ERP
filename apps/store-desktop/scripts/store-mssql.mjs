#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import sql from "mssql";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const schemaPath = path.resolve(__dirname, "..", "src", "main", "mssql", "store-mssql-schema.sql");
const { Pool: PgPool } = pg;

const migrationTables = [
  "app_metadata",
  "store_node_metadata",
  "product_department_snapshot",
  "product_category_snapshot",
  "unit_of_measure_snapshot",
  "product_snapshot",
  "barcode_snapshot",
  "price_list_entry_snapshot",
  "tax_profile_snapshot",
  "gift_certificate_snapshot",
  "tender_method_snapshot",
  "bank_account_snapshot",
  "supplier_snapshot",
  "promotion_snapshot",
  "inventory_location_snapshot",
  "inventory_location_balance",
  "inter_store_transfer_request_target_snapshot",
  "serial_registry",
  "purchase_order_snapshot",
  "purchase_order_line_snapshot",
  "local_goods_receipt",
  "local_goods_receipt_line",
  "local_goods_receipt_exception",
  "local_supplier_return",
  "local_supplier_return_line",
  "inter_store_transfer_snapshot",
  "inter_store_transfer_request_draft",
  "stock_count_session",
  "permission_snapshot",
  "role_snapshot",
  "retail_user_snapshot",
  "operator_session",
  "customer",
  "pos_shift",
  "pos_transaction",
  "pos_transaction_line",
  "pos_payment",
  "customer_account_entry",
  "sales_order",
  "eod_reconciliation",
  "banking_deposit",
  "sync_checkpoint",
  "sync_inbox",
  "sync_outbox",
  "sync_recovery_task",
  "sync_run_log",
  "terminal_connection"
];

for (const candidate of [
  path.resolve(workspaceRoot, ".env"),
  path.resolve(process.cwd(), ".env")
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) ?? "help";

function readOption(name) {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) {
    return args[index + 1] ?? "";
  }

  return "";
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function errorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const value = String(error ?? "").trim();
  return value || fallback;
}

function formatCutoverError(error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED") {
    return "Flash ERP could not reach the PostgreSQL store database. Start the store PostgreSQL service or pass --postgres-url for the source database.";
  }

  if (error instanceof AggregateError) {
    const refused = error.errors?.some((entry) => entry?.code === "ECONNREFUSED");
    if (refused) {
      return "Flash ERP could not reach the PostgreSQL store database. Start the store PostgreSQL service or pass --postgres-url for the source database.";
    }
  }

  return errorMessage(error, "Flash ERP store SQL Server helper failed.");
}

function usage() {
  console.log(`Flash ERP SQL Server store database helper

Usage:
  npm --workspace @flash-erp/store-desktop run store:mssql -- schema --out <schema.sql>
  npm --workspace @flash-erp/store-desktop run store:mssql -- provision --url <sql-server-connection-string> [--create-database]
  npm --workspace @flash-erp/store-desktop run store:mssql -- probe --url <sql-server-connection-string>
  npm --workspace @flash-erp/store-desktop run store:mssql -- migrate-postgres --postgres-url <postgres-url> --url <sql-server-connection-string> [--create-database] [--dry-run] [--allow-partial]

Environment:
  FLASH_ERP_STORE_MSSQL_DATABASE_URL can be used instead of --url.
  FLASH_ERP_STORE_POSTGRES_URL can be used instead of --postgres-url.
`);
}

function configuredStoreProvider() {
  return process.env.FLASH_ERP_STORE_DATABASE_PROVIDER?.trim().toLowerCase() ?? "";
}

function isConfiguredSqlServerStore() {
  const provider = configuredStoreProvider();
  return provider === "mssql" || provider === "sqlserver";
}

function isConfiguredPostgresStore() {
  const provider = configuredStoreProvider();
  return provider === "postgres" || provider === "postgresql";
}

function connectionString() {
  return (
    readOption("mssql-url") ||
    readOption("url") ||
    process.env.FLASH_ERP_STORE_MSSQL_DATABASE_URL ||
    (isConfiguredSqlServerStore() ? process.env.FLASH_ERP_STORE_DATABASE_URL : "") ||
    ""
  );
}

function postgresConnectionString() {
  return (
    readOption("postgres-url") ||
    process.env.FLASH_ERP_STORE_POSTGRES_URL ||
    (isConfiguredPostgresStore() ? process.env.FLASH_ERP_STORE_DATABASE_URL : "") ||
    ""
  );
}

function parseSqlServerUrl(value) {
  const trimmed = value.trim().replace(/^"|"$/g, "");

  if (trimmed.startsWith("sqlserver://")) {
    const body = trimmed.slice("sqlserver://".length);
    const [server, ...parts] = body.split(";");
    const entries = new Map();

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

  const entries = new Map();
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

function buildSqlServerConnectionString(input) {
  return [
    `Server=${input.server}`,
    `Database=${input.database}`,
    input.user ? `User Id=${input.user}` : "",
    input.password ? `Password=${input.password}` : "",
    `Encrypt=${input.encrypt}`,
    `TrustServerCertificate=${input.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}

function normalizeSqlServerConnectionString(value) {
  return buildSqlServerConnectionString(parseSqlServerUrl(value));
}

function quoteDatabaseName(databaseName) {
  if (!databaseName.trim()) {
    fail("Store SQL Server database name cannot be empty.");
  }

  return `[${databaseName.replace(/]/g, "]]")}]`;
}

function createPool(url) {
  return new sql.ConnectionPool(normalizeSqlServerConnectionString(url));
}

async function ensureMssqlDatabaseExists(url) {
  const parsed = parseSqlServerUrl(url);
  const databaseName = parsed.database;

  if (!databaseName) {
    fail("Flash ERP needs a SQL Server database name before it can create/provision the store database.");
  }

  const masterUrl = buildSqlServerConnectionString({
    ...parsed,
    database: "master"
  });
  const pool = new sql.ConnectionPool(masterUrl);

  try {
    await pool.connect();
    const exists = await pool
      .request()
      .input("databaseName", sql.NVarChar(128), databaseName)
      .query("SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN 0 ELSE 1 END AS [value]");

    if (exists.recordset[0]?.value !== 1) {
      await pool.request().query(`CREATE DATABASE ${quoteDatabaseName(databaseName)}`);
    }
  } finally {
    await pool.close().catch(() => undefined);
  }
}

function pgIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    fail(`Unsafe PostgreSQL identifier: ${value}`);
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function msIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    fail(`Unsafe SQL Server identifier: ${value}`);
  }

  return `[${value.replace(/]/g, "]]")}]`;
}

async function withPostgresPool(url, work) {
  if (!url) {
    fail("Flash ERP needs --postgres-url or FLASH_ERP_STORE_POSTGRES_URL for PostgreSQL cutover.");
  }

  const pool = new PgPool({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    max: 1
  });

  try {
    return await work(pool);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function withMssqlPool(url, work) {
  if (!url) {
    fail("Flash ERP needs --url or FLASH_ERP_STORE_MSSQL_DATABASE_URL for SQL Server store cutover.");
  }

  if (hasFlag("create-database")) {
    await ensureMssqlDatabaseExists(url);
  }

  const pool = createPool(url);

  try {
    await pool.connect();
    return await work(pool);
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function provision() {
  const url = connectionString();
  if (!url) {
    fail("Flash ERP needs --url or FLASH_ERP_STORE_DATABASE_URL for SQL Server store provisioning.");
  }

  if (hasFlag("create-database")) {
    await ensureMssqlDatabaseExists(url);
  }

  const pool = createPool(url);
  try {
    await pool.connect();
    await pool.request().batch(readFileSync(schemaPath, "utf8"));
    console.log("Flash ERP provisioned the SQL Server store schema.");
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function probe() {
  const url = connectionString();
  if (!url) {
    fail("Flash ERP needs --url or FLASH_ERP_STORE_DATABASE_URL for SQL Server store probing.");
  }

  const pool = createPool(url);
  try {
    await pool.connect();
    const result = await pool.request().query(`
      SELECT
        DB_NAME() AS database_name,
        CONVERT(nvarchar(max), @@VERSION) AS server_version,
        (
          SELECT TOP (1) [value]
          FROM [dbo].[store_node_metadata]
          WHERE [key] = N'schema_version'
        ) AS schema_version
    `);
    const row = result.recordset[0] ?? {};
    console.log(JSON.stringify({
      databaseName: row.database_name ?? null,
      schemaVersion: row.schema_version ?? null,
      schemaReady: row.schema_version === "flash-erp-store-mssql-v1"
    }, null, 2));
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function listPostgresTables(pool) {
  const result = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name ASC`
  );

  return result.rows.map((row) => String(row.table_name));
}

async function listPostgresColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [tableName]
  );

  return result.rows.map((row) => String(row.column_name));
}

async function countPostgresRows(pool, tableName) {
  const result = await pool.query(`SELECT COUNT(*) AS row_count FROM ${pgIdentifier(tableName)}`);
  return Number(result.rows[0]?.row_count ?? 0);
}

async function listMssqlTables(pool) {
  const result = await pool.request().query(`
    SELECT TABLE_NAME AS table_name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = N'dbo'
      AND TABLE_TYPE = N'BASE TABLE'
    ORDER BY TABLE_NAME ASC
  `);

  return result.recordset.map((row) => String(row.table_name));
}

async function listMssqlColumns(pool, tableName) {
  const result = await pool
    .request()
    .input("tableName", sql.NVarChar(128), tableName)
    .query(`
      SELECT
        COLUMN_NAME AS column_name,
        DATA_TYPE AS data_type,
        CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
        NUMERIC_PRECISION AS numeric_precision,
        NUMERIC_SCALE AS numeric_scale,
        ORDINAL_POSITION AS ordinal_position
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = N'dbo'
        AND TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION ASC
    `);

  return result.recordset.map((row) => ({
    name: String(row.column_name),
    dataType: String(row.data_type),
    characterMaximumLength:
      row.character_maximum_length == null ? null : Number(row.character_maximum_length),
    numericPrecision: row.numeric_precision == null ? null : Number(row.numeric_precision),
    numericScale: row.numeric_scale == null ? null : Number(row.numeric_scale),
    ordinalPosition: Number(row.ordinal_position)
  }));
}

async function listMssqlPrimaryKeyColumns(pool, tableName) {
  const result = await pool
    .request()
    .input("tableName", sql.NVarChar(128), tableName)
    .query(`
      SELECT column_usage.COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS table_constraint
      INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS column_usage
        ON column_usage.CONSTRAINT_NAME = table_constraint.CONSTRAINT_NAME
       AND column_usage.TABLE_SCHEMA = table_constraint.TABLE_SCHEMA
       AND column_usage.TABLE_NAME = table_constraint.TABLE_NAME
      WHERE table_constraint.TABLE_SCHEMA = N'dbo'
        AND table_constraint.TABLE_NAME = @tableName
        AND table_constraint.CONSTRAINT_TYPE = N'PRIMARY KEY'
      ORDER BY column_usage.ORDINAL_POSITION ASC
    `);

  return result.recordset.map((row) => String(row.column_name));
}

function mssqlTypeForColumn(column) {
  if (column.dataType === "int") {
    return sql.Int;
  }

  if (column.dataType === "bigint") {
    return sql.BigInt;
  }

  if (column.dataType === "decimal" || column.dataType === "numeric") {
    return sql.Decimal(column.numericPrecision ?? 18, column.numericScale ?? 4);
  }

  if (column.dataType === "nvarchar" || column.dataType === "nchar") {
    const length =
      column.characterMaximumLength === -1 || column.characterMaximumLength == null
        ? sql.MAX
        : Math.max(1, column.characterMaximumLength);
    return sql.NVarChar(length);
  }

  if (column.dataType === "varchar" || column.dataType === "char") {
    const length =
      column.characterMaximumLength === -1 || column.characterMaximumLength == null
        ? sql.MAX
        : Math.max(1, column.characterMaximumLength);
    return sql.VarChar(length);
  }

  if (column.dataType === "datetime2") {
    return sql.DateTime2;
  }

  return undefined;
}

function normalizeForMssql(value, column) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "boolean") {
    return column.dataType === "bit" ? value : value ? 1 : 0;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

async function upsertMssqlRow(runner, tableName, columns, primaryKeyColumns, row) {
  const insertColumns = columns.map((column) => column.name);
  const updateColumns = insertColumns.filter((columnName) => !primaryKeyColumns.includes(columnName));
  const request = runner.request();

  insertColumns.forEach((columnName, index) => {
    const column = columns.find((entry) => entry.name === columnName);
    const type = column ? mssqlTypeForColumn(column) : undefined;
    const value = normalizeForMssql(row[columnName], column ?? { dataType: "" });

    if (type) {
      request.input(`p${index}`, type, value);
    } else {
      request.input(`p${index}`, value);
    }
  });

  const sourceColumns = insertColumns
    .map((columnName, index) => `@p${index} AS ${msIdentifier(columnName)}`)
    .join(", ");
  const targetName = `[dbo].${msIdentifier(tableName)}`;
  const onClause = primaryKeyColumns
    .map((columnName) => `target.${msIdentifier(columnName)} = source.${msIdentifier(columnName)}`)
    .join(" AND ");
  const updateClause = updateColumns.length
    ? `WHEN MATCHED THEN UPDATE SET ${updateColumns
        .map((columnName) => `target.${msIdentifier(columnName)} = source.${msIdentifier(columnName)}`)
        .join(", ")}`
    : "";
  const insertColumnList = insertColumns.map(msIdentifier).join(", ");
  const insertValueList = insertColumns
    .map((columnName) => `source.${msIdentifier(columnName)}`)
    .join(", ");

  await request.query(`
    MERGE ${targetName} AS target
    USING (SELECT ${sourceColumns}) AS source
      ON ${onClause}
    ${updateClause}
    WHEN NOT MATCHED THEN INSERT (${insertColumnList})
      VALUES (${insertValueList});
  `);
}

async function copyPostgresTableToMssql(input) {
  const {
    postgresPool,
    mssqlTransaction,
    tableName,
    sourceColumns,
    targetColumns,
    primaryKeyColumns,
    pageSize
  } = input;
  const targetColumnNames = new Set(targetColumns.map((column) => column.name));
  const copyColumnNames = sourceColumns.filter((columnName) => targetColumnNames.has(columnName));
  const copyColumns = targetColumns.filter((column) => copyColumnNames.includes(column.name));
  const missingPrimaryKeyColumns = primaryKeyColumns.filter(
    (columnName) => !copyColumnNames.includes(columnName)
  );

  if (missingPrimaryKeyColumns.length) {
    throw new Error(
      `Cannot migrate ${tableName}; source is missing target primary key column(s): ${missingPrimaryKeyColumns.join(", ")}.`
    );
  }

  const rowCount = await countPostgresRows(postgresPool, tableName);
  const orderBy = primaryKeyColumns.length
    ? ` ORDER BY ${primaryKeyColumns.map(pgIdentifier).join(", ")}`
    : "";
  let copiedRows = 0;

  for (let offset = 0; offset < rowCount; offset += pageSize) {
    const result = await postgresPool.query(
      `SELECT ${copyColumnNames.map(pgIdentifier).join(", ")}
       FROM ${pgIdentifier(tableName)}
       ${orderBy}
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    for (const row of result.rows) {
      await upsertMssqlRow(mssqlTransaction, tableName, copyColumns, primaryKeyColumns, row);
      copiedRows += 1;
    }
  }

  return { tableName, copiedRows, sourceRows: rowCount };
}

async function collectCutoverPlan(postgresPool, mssqlPool) {
  const [sourceTables, targetTables] = await Promise.all([
    listPostgresTables(postgresPool),
    listMssqlTables(mssqlPool)
  ]);
  const sourceTableSet = new Set(sourceTables);
  const targetTableSet = new Set(targetTables);
  const supportedTables = migrationTables.filter(
    (tableName) => sourceTableSet.has(tableName) && targetTableSet.has(tableName)
  );
  const unsupportedSourceTables = sourceTables.filter((tableName) => !targetTableSet.has(tableName));
  const unsupported = [];

  for (const tableName of unsupportedSourceTables) {
    unsupported.push({
      tableName,
      sourceRows: await countPostgresRows(postgresPool, tableName)
    });
  }

  const supported = [];
  for (const tableName of supportedTables) {
    supported.push({
      tableName,
      sourceRows: await countPostgresRows(postgresPool, tableName)
    });
  }

  return {
    supported,
    unsupported,
    unsupportedNonEmpty: unsupported.filter((entry) => entry.sourceRows > 0)
  };
}

async function migratePostgres() {
  const sourceUrl = postgresConnectionString();
  const targetUrl = connectionString();
  const dryRun = hasFlag("dry-run");
  const allowPartial = hasFlag("allow-partial");
  const pageSize = Math.max(1, Math.min(1000, Number(readOption("batch-size") || 100)));

  await withPostgresPool(sourceUrl, async (postgresPool) => {
    await withMssqlPool(targetUrl, async (mssqlPool) => {
      await mssqlPool.request().batch(readFileSync(schemaPath, "utf8"));

      const plan = await collectCutoverPlan(postgresPool, mssqlPool);
      const summary = {
        dryRun,
        supportedTables: plan.supported,
        unsupportedTables: plan.unsupported,
        unsupportedNonEmptyTables: plan.unsupportedNonEmpty
      };

      if (dryRun) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      if (plan.unsupportedNonEmpty.length && !allowPartial) {
        fail(
          `Flash ERP found ${plan.unsupportedNonEmpty.length} non-empty PostgreSQL table(s) that are not in the SQL Server store schema. ` +
            `Rerun with --allow-partial only if this is an intentional sync/bootstrap-only cutover. ` +
            `First unsupported table: ${plan.unsupportedNonEmpty[0].tableName} (${plan.unsupportedNonEmpty[0].sourceRows} row(s)).`
        );
      }

      const transaction = new sql.Transaction(mssqlPool);
      await transaction.begin();

      try {
        const migratedTables = [];

        for (const supportedTable of plan.supported) {
          const [sourceColumns, targetColumns, primaryKeyColumns] = await Promise.all([
            listPostgresColumns(postgresPool, supportedTable.tableName),
            listMssqlColumns(mssqlPool, supportedTable.tableName),
            listMssqlPrimaryKeyColumns(mssqlPool, supportedTable.tableName)
          ]);

          migratedTables.push(
            await copyPostgresTableToMssql({
              postgresPool,
              mssqlTransaction: transaction,
              tableName: supportedTable.tableName,
              sourceColumns,
              targetColumns,
              primaryKeyColumns,
              pageSize
            })
          );
        }

        await transaction.commit();
        await mssqlPool.request().batch(readFileSync(schemaPath, "utf8"));
        await mssqlPool
          .request()
          .input("completedAt", sql.NVarChar(40), new Date().toISOString())
          .query(`
            MERGE [dbo].[store_node_metadata] AS target
            USING (SELECT N'postgres_cutover_completed_at' AS [key], @completedAt AS [value], @completedAt AS [updated_at]) AS source
              ON target.[key] = source.[key]
            WHEN MATCHED THEN UPDATE SET
              target.[value] = source.[value],
              target.[updated_at] = source.[updated_at]
            WHEN NOT MATCHED THEN INSERT ([key], [value], [updated_at])
              VALUES (source.[key], source.[value], source.[updated_at]);
          `);

        console.log(
          JSON.stringify(
            {
              migratedTables,
              unsupportedTables: plan.unsupported,
              partialMigration: Boolean(plan.unsupportedNonEmpty.length)
            },
            null,
            2
          )
        );
      } catch (error) {
        await transaction.rollback().catch(() => undefined);
        throw error;
      }
    });
  });
}

try {
  if (command === "schema") {
    const out = readOption("out");
    if (out) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path.resolve(out), readFileSync(schemaPath, "utf8"), "utf8");
      console.log(`Wrote SQL Server store schema to ${path.resolve(out)}.`);
    } else {
      process.stdout.write(readFileSync(schemaPath, "utf8"));
    }
  } else if (command === "provision") {
    await provision();
  } else if (command === "probe") {
    await probe();
  } else if (command === "migrate-postgres") {
    await migratePostgres();
  } else {
    usage();
    process.exit(command === "help" ? 0 : 1);
  }
} catch (error) {
  console.error(formatCutoverError(error));
  process.exitCode = 1;
}

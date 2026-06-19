#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "..", "src", "main", "postgres", "store-postgres-schema.sql");
const { Pool } = pg;

dotenv.config({
  path: path.resolve(__dirname, "..", "..", "..", ".env")
});

const command = process.argv[2];
const args = process.argv.slice(3);

const migrationTables = [
  "app_metadata",
  "product_department_snapshot",
  "product_category_snapshot",
  "product_snapshot",
  "barcode_snapshot",
  "price_list_entry_snapshot",
  "tax_profile_snapshot",
  "tender_method_snapshot",
  "bank_account_snapshot",
  "promotion_snapshot",
  "inventory_location_snapshot",
  "inventory_location_balance",
  "serial_registry",
  "permission_snapshot",
  "role_snapshot",
  "retail_user_snapshot",
  "operator_session",
  "terminal_connection",
  "customer",
  "pos_shift",
  "pos_transaction",
  "pos_transaction_line",
  "pos_payment",
  "sales_order",
  "eod_reconciliation",
  "banking_deposit",
  "sync_outbox",
  "sync_inbox",
  "sync_recovery_task",
  "sync_checkpoint",
  "sync_run_log"
];

function readOption(name, fallback = null) {
  const index = args.indexOf(`--${name}`);

  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1] ?? fallback;
  return typeof value === "string" && value.startsWith("--") ? fallback : value;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function connectionString() {
  return readOption("url", process.env.FLASH_ERP_STORE_DATABASE_URL ?? "");
}

function enterpriseConnectionString() {
  return readOption("enterprise-url", process.env.DATABASE_URL ?? "");
}

function printUsage() {
  console.log(`Flash ERP store PostgreSQL tooling

Usage:
  npm --workspace @flash-erp/store-desktop run store:postgres -- schema --out <schema.sql>
  npm --workspace @flash-erp/store-desktop run store:postgres -- provision --url <postgres-url>
  npm --workspace @flash-erp/store-desktop run store:postgres -- probe --url <postgres-url>
  npm --workspace @flash-erp/store-desktop run store:postgres -- bootstrap-operators --store-code <store-code>
  npm --workspace @flash-erp/store-desktop run store:postgres -- migrate --sqlite <store.sqlite> --url <postgres-url>
  npm --workspace @flash-erp/store-desktop run store:postgres -- migrate --sqlite <store.sqlite> --dry-run

Options:
  --url             Store PostgreSQL connection string. Defaults to FLASH_ERP_STORE_DATABASE_URL.
  --enterprise-url  Enterprise PostgreSQL connection string. Defaults to DATABASE_URL.
  --store-code      Store code for operator bootstrap. Defaults to FLASH_ERP_BOOTSTRAP_STORE_CODE or store metadata.
  --sqlite          Source SQLite database for migration.
  --out             Output path for the schema command.
  --dry-run         Count source rows without writing to PostgreSQL.
`);
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

function sqlIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function withPool(url, work) {
  if (!url) {
    fail("Flash ERP needs --url or FLASH_ERP_STORE_DATABASE_URL for this command.");
  }

  const pool = new Pool({
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

async function probeStorePostgres(pool) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT
        current_database() AS database_name,
        current_setting('server_version') AS server_version,
        (
          SELECT value
          FROM store_node_metadata
          WHERE key = 'schema_version'
          LIMIT 1
        ) AS schema_version,
        (
          SELECT count(*)
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('pos_transaction', 'pos_shift', 'sync_outbox', 'terminal_connection')
        ) AS core_table_count`
    );
    const row = result.rows[0] ?? {};

    return {
      reachable: true,
      databaseName: row.database_name ?? null,
      serverVersion: row.server_version ?? null,
      schemaVersion: row.schema_version ?? null,
      coreTableCount: Number(row.core_table_count ?? 0),
      schemaReady: row.schema_version === "flash-erp-store-postgres-v1"
    };
  } finally {
    client.release();
  }
}

async function writeSchema() {
  const schema = readFileSync(schemaPath, "utf8");
  const out = readOption("out");

  if (out) {
    writeFileSync(path.resolve(out), schema, "utf8");
    console.log(JSON.stringify({ schema: path.resolve(out) }, null, 2));
    return;
  }

  console.log(schema);
}

async function provision() {
  await withPool(connectionString(), async (pool) => {
    await pool.query(readFileSync(schemaPath, "utf8"));
    const probe = await probeStorePostgres(pool);
    console.log(JSON.stringify(probe, null, 2));
  });
}

async function probe() {
  try {
    await withPool(connectionString(), async (pool) => {
      try {
        console.log(JSON.stringify(await probeStorePostgres(pool), null, 2));
      } catch (error) {
        console.log(
          JSON.stringify(
            {
              reachable: error instanceof Error && error.message.includes("store_node_metadata"),
              schemaReady: false,
              errorMessage: errorMessage(error, "Flash ERP store PostgreSQL probe failed.")
            },
            null,
            2
          )
        );
      }
    });
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          reachable: false,
          schemaReady: false,
          errorMessage: errorMessage(error, "Flash ERP store PostgreSQL is unreachable.")
        },
        null,
        2
      )
    );
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string");
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry) => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  return new Date().toISOString();
}

function deriveSnapshotEligibility(permissionCodes) {
  const normalized = new Set(permissionCodes);

  return {
    cashierEligible:
      normalized.has("pos.sale.process") ||
      normalized.has("pos.return.process") ||
      normalized.has("pos.shift.open"),
    supervisorEligible:
      normalized.has("pos.override.no-receipt-return") ||
      normalized.has("pos.override.discount") ||
      normalized.has("pos.override.price") ||
      normalized.has("inventory.adjust") ||
      normalized.has("inventory.count.commit") ||
      normalized.has("inventory.transfer.issue") ||
      normalized.has("inventory.transfer.receive")
  };
}

async function readTargetStoreCode(pool) {
  const explicitStoreCode =
    readOption("store-code") ?? process.env.FLASH_ERP_BOOTSTRAP_STORE_CODE ?? null;

  if (explicitStoreCode?.trim()) {
    return explicitStoreCode.trim();
  }

  try {
    const result = await pool.query(
      "SELECT value FROM app_metadata WHERE key = 'store_code' LIMIT 1"
    );
    const storeCode = result.rows[0]?.value;

    if (typeof storeCode === "string" && storeCode.trim()) {
      return storeCode.trim();
    }
  } catch {
    // The provision step below will create metadata if this is a fresh database.
  }

  return "accra-central";
}

async function bootstrapOperators() {
  const storeUrl = connectionString();
  const enterpriseUrl = enterpriseConnectionString();

  if (!enterpriseUrl) {
    fail("Flash ERP needs --enterprise-url or DATABASE_URL for operator bootstrap.");
  }

  await withPool(storeUrl, async (storePool) => {
    await storePool.query(readFileSync(schemaPath, "utf8"));

    const storeCode = await readTargetStoreCode(storePool);
    const enterprisePool = new Pool({
      connectionString: enterpriseUrl,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
      max: 1
    });

    try {
      const storeResult = await enterprisePool.query(
        `SELECT id, code, name, "retailOrgId"
         FROM "Store"
         WHERE code = $1
           AND status = 'ACTIVE'
         LIMIT 1`,
        [storeCode]
      );
      const store = storeResult.rows[0];

      if (!store) {
        fail(`Flash ERP could not find active enterprise store "${storeCode}".`);
      }

      const [permissionsResult, roleRowsResult, userRowsResult] = await Promise.all([
        enterprisePool.query(
          `SELECT id, code, name, description, "updatedAt"
           FROM "Permission"
           ORDER BY code ASC`
        ),
        enterprisePool.query(
          `SELECT
             role.id AS role_id,
             role.code AS role_code,
             role.name AS role_name,
             role.description AS role_description,
             role.status AS role_status,
             role."updatedAt" AS role_updated_at,
             permission.code AS permission_code
           FROM "Role" AS role
           LEFT JOIN "RolePermission" AS role_permission
             ON role_permission."roleId" = role.id
           LEFT JOIN "Permission" AS permission
             ON permission.id = role_permission."permissionId"
           WHERE role."retailOrgId" = $1
           ORDER BY role.name ASC, role.code ASC, permission.code ASC`,
          [store.retailOrgId]
        ),
        enterprisePool.query(
          `SELECT
             account.id AS user_id,
             account."loginId" AS login_id,
             account.email,
             account."displayName" AS display_name,
             account."accountStatus" AS account_status,
             account."passwordHash" AS password_hash,
             account."passwordUpdatedAt" AS password_updated_at,
             account."updatedAt" AS user_updated_at,
             home_store.code AS home_store_code,
             home_store.name AS home_store_name,
             role.code AS role_code,
             role.name AS role_name,
             role.status AS role_status,
             permission.code AS permission_code
           FROM "RetailUser" AS account
           LEFT JOIN "Store" AS home_store
             ON home_store.id = account."homeStoreId"
           LEFT JOIN "RetailUserRole" AS user_role
             ON user_role."retailUserId" = account.id
           LEFT JOIN "Role" AS role
             ON role.id = user_role."roleId"
           LEFT JOIN "RolePermission" AS role_permission
             ON role_permission."roleId" = role.id
           LEFT JOIN "Permission" AS permission
             ON permission.id = role_permission."permissionId"
           WHERE account."retailOrgId" = $1
             AND account."deletedAt" IS NULL
             AND account."homeStoreId" = $2
           ORDER BY account."displayName" ASC, account."loginId" ASC, role.code ASC, permission.code ASC`,
          [store.retailOrgId, store.id]
        )
      ]);

      const roleMap = new Map();
      for (const row of roleRowsResult.rows) {
        const role =
          roleMap.get(row.role_id) ??
          {
            id: row.role_id,
            roleCode: row.role_code,
            roleName: row.role_name,
            description: row.role_description,
            status: row.role_status,
            updatedAt: row.role_updated_at,
            permissionCodes: new Set()
          };

        if (row.permission_code) {
          role.permissionCodes.add(row.permission_code);
        }

        roleMap.set(row.role_id, role);
      }

      const userMap = new Map();
      for (const row of userRowsResult.rows) {
        const user =
          userMap.get(row.user_id) ??
          {
            id: row.user_id,
            loginId: row.login_id,
            email: row.email,
            displayName: row.display_name,
            accountStatus: row.account_status,
            passwordHash: row.password_hash,
            passwordUpdatedAt: row.password_updated_at,
            updatedAt: row.user_updated_at,
            homeStoreCode: row.home_store_code,
            homeStoreName: row.home_store_name,
            roleCodes: new Set(),
            roleNames: new Set(),
            permissionCodes: new Set()
          };

        if (row.role_code) {
          user.roleCodes.add(row.role_code);
        }

        if (row.role_name) {
          user.roleNames.add(row.role_name);
        }

        if (row.role_status === "ACTIVE" && row.permission_code) {
          user.permissionCodes.add(row.permission_code);
        }

        userMap.set(row.user_id, user);
      }

      const client = await storePool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO app_metadata (key, value)
           VALUES ('store_code', $1), ('store_name', $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [store.code, store.name]
        );

        for (const permission of permissionsResult.rows) {
          await client.query(
            `INSERT INTO permission_snapshot (id, permission_code, permission_name, description, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (permission_code) DO UPDATE SET
               id = excluded.id,
               permission_name = excluded.permission_name,
               description = excluded.description,
               updated_at = excluded.updated_at`,
            [
              permission.id,
              permission.code,
              permission.name,
              permission.description,
              toIso(permission.updatedAt)
            ]
          );
        }

        for (const role of roleMap.values()) {
          const permissionCodes = [...role.permissionCodes].sort();
          await client.query(
            `INSERT INTO role_snapshot (id, role_code, role_name, description, status, permission_codes_json, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (role_code) DO UPDATE SET
               id = excluded.id,
               role_name = excluded.role_name,
               description = excluded.description,
               status = excluded.status,
               permission_codes_json = excluded.permission_codes_json,
               updated_at = excluded.updated_at`,
            [
              role.id,
              role.roleCode,
              role.roleName,
              role.description,
              role.status,
              JSON.stringify(permissionCodes),
              toIso(role.updatedAt)
            ]
          );
        }

        for (const user of userMap.values()) {
          const permissionCodes = [...user.permissionCodes].sort();
          const roleCodes = [...user.roleCodes].sort();
          const roleNames = [...user.roleNames].sort();
          const eligibility = deriveSnapshotEligibility(permissionCodes);
          await client.query(
            `INSERT INTO retail_user_snapshot (
               id,
               login_id,
               email,
               display_name,
               account_status,
               home_store_code,
               home_store_name,
               role_codes_json,
               role_names_json,
               permission_codes_json,
               password_hash,
               password_updated_at,
               cashier_eligible,
               supervisor_eligible,
               updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (login_id) DO UPDATE SET
               id = excluded.id,
               email = excluded.email,
               display_name = excluded.display_name,
               account_status = excluded.account_status,
               home_store_code = excluded.home_store_code,
               home_store_name = excluded.home_store_name,
               role_codes_json = excluded.role_codes_json,
               role_names_json = excluded.role_names_json,
               permission_codes_json = excluded.permission_codes_json,
               password_hash = excluded.password_hash,
               password_updated_at = excluded.password_updated_at,
               cashier_eligible = excluded.cashier_eligible,
               supervisor_eligible = excluded.supervisor_eligible,
               updated_at = excluded.updated_at`,
            [
              user.id,
              user.loginId,
              user.email,
              user.displayName,
              user.accountStatus,
              user.homeStoreCode,
              user.homeStoreName,
              JSON.stringify(roleCodes),
              JSON.stringify(roleNames),
              JSON.stringify(permissionCodes),
              user.passwordHash,
              user.passwordUpdatedAt ? toIso(user.passwordUpdatedAt) : null,
              eligibility.cashierEligible ? 1 : 0,
              eligibility.supervisorEligible ? 1 : 0,
              toIso(user.updatedAt)
            ]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      console.log(
        JSON.stringify(
          {
            storeCode: store.code,
            storeName: store.name,
            permissions: permissionsResult.rows.length,
            roles: roleMap.size,
            operators: userMap.size
          },
          null,
          2
        )
      );
    } finally {
      await enterprisePool.end().catch(() => undefined);
    }
  });
}

async function readSqliteTablePlan(sqlitePath) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(sqlitePath);

  try {
    return migrationTables.map((table) => {
      const tableRow = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      const count = tableRow
        ? Number(db.prepare(`SELECT count(*) AS value FROM ${sqlIdentifier(table)}`).get().value ?? 0)
        : 0;

      return {
        table,
        sourceExists: Boolean(tableRow),
        sourceRows: count
      };
    });
  } finally {
    db.close();
  }
}

async function migrate() {
  const sqlitePath = readOption("sqlite");

  if (!sqlitePath) {
    fail("Flash ERP needs --sqlite <store.sqlite> for migration.");
  }

  const dryRun = hasFlag("dry-run");
  const sourcePlan = await readSqliteTablePlan(path.resolve(sqlitePath));

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          sqlite: path.resolve(sqlitePath),
          tables: sourcePlan,
          totalRows: sourcePlan.reduce((sum, table) => sum + table.sourceRows, 0)
        },
        null,
        2
      )
    );
    return;
  }

  await withPool(connectionString(), async (pool) => {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.resolve(sqlitePath));
    const client = await pool.connect();
    const summary = [];

    try {
      await client.query("BEGIN");

      for (const table of migrationTables) {
        const tableRow = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(table);

        if (!tableRow) {
          summary.push({ table, inserted: 0, skipped: true });
          continue;
        }

        const targetColumnsResult = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = $1
           ORDER BY ordinal_position`,
          [table]
        );
        const targetColumns = new Set(targetColumnsResult.rows.map((row) => row.column_name));
        const sourceColumns = db
          .prepare(`PRAGMA table_info(${sqlIdentifier(table)})`)
          .all()
          .map((row) => String(row.name))
          .filter((column) => targetColumns.has(column));

        if (!sourceColumns.length) {
          summary.push({ table, inserted: 0, skipped: true });
          continue;
        }

        const rows = db
          .prepare(
            `SELECT ${sourceColumns.map(sqlIdentifier).join(", ")} FROM ${sqlIdentifier(table)}`
          )
          .all();

        for (const row of rows) {
          const values = sourceColumns.map((column) => row[column]);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

          await client.query(
            `INSERT INTO ${sqlIdentifier(table)} (${sourceColumns.map(sqlIdentifier).join(", ")})
             VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            values
          );
        }

        summary.push({ table, inserted: rows.length, skipped: false });
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
      db.close();
    }

    console.log(
      JSON.stringify(
        {
          sqlite: path.resolve(sqlitePath),
          target: connectionString().replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
          tables: summary,
          totalRows: summary.reduce((sum, table) => sum + table.inserted, 0)
        },
        null,
        2
      )
    );
  });
}

switch (command) {
  case "schema":
    await writeSchema();
    break;
  case "provision":
    await provision();
    break;
  case "probe":
    await probe();
    break;
  case "bootstrap-operators":
    await bootstrapOperators();
    break;
  case "migrate":
    await migrate();
    break;
  case "--help":
  case "-h":
  case undefined:
    printUsage();
    break;
  default:
    printUsage();
    fail(`Unknown command: ${command}`);
}

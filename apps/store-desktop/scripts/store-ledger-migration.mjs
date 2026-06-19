#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ledgerImportTables = [
  "customer",
  "pos_shift",
  "pos_transaction",
  "pos_transaction_line",
  "pos_payment",
  "customer_account_entry",
  "sales_order",
  "eod_reconciliation",
  "banking_deposit",
  "local_goods_receipt",
  "local_goods_receipt_line",
  "local_goods_receipt_exception",
  "local_supplier_return",
  "local_supplier_return_line",
  "inter_store_transfer_request_draft",
  "stock_count_session"
];

function usage() {
  console.log(`Flash ERP store ledger migration

Usage:
  node apps/store-desktop/scripts/store-ledger-migration.mjs export --source <sqlite> --out <json>
  node apps/store-desktop/scripts/store-ledger-migration.mjs import --source <json> --target <sqlite> [--terminal-code <code>] [--all-tables]

Notes:
  export reads a terminal SQLite database and writes a JSON ledger packet.
  import merges ledger tables into an existing shared store SQLite database with INSERT OR IGNORE.
  --terminal-code rewrites terminal_code columns during import for recovered terminal ledgers.
`);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQLite identifier: ${value}`);
  }

  return `"${value}"`;
}

async function openDatabase(filePath, label) {
  if (!filePath) {
    throw new Error(`${label} path is required.`);
  }

  if (!existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }

  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(filePath);
}

function listTables(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => String(row.name));
}

function listColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .map((row) => String(row.name));
}

async function exportLedger() {
  const source = readArg("--source");
  const out = readArg("--out");

  if (!source || !out) {
    usage();
    process.exitCode = 1;
    return;
  }

  const db = await openDatabase(source, "Source SQLite database");
  const tables = listTables(db);
  const payload = {
    format: "flash-erp-store-ledger-v1",
    exportedAt: new Date().toISOString(),
    source: path.resolve(source),
    tables: {}
  };

  for (const tableName of tables) {
    payload.tables[tableName] = db.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all();
  }

  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  db.close();
  console.log(`Exported ${tables.length} table(s) from ${source} to ${out}.`);
}

async function importLedger() {
  const source = readArg("--source");
  const target = readArg("--target");
  const terminalCode = readArg("--terminal-code");
  const allTables = hasFlag("--all-tables");

  if (!source || !target) {
    usage();
    process.exitCode = 1;
    return;
  }

  const payload = JSON.parse(readFileSync(source, "utf8"));

  if (payload.format !== "flash-erp-store-ledger-v1" || typeof payload.tables !== "object") {
    throw new Error("The source file is not a Flash ERP store ledger export.");
  }

  const db = await openDatabase(target, "Target shared store SQLite database");
  const targetTables = new Set(listTables(db));
  const tableNames = allTables ? Object.keys(payload.tables) : ledgerImportTables;
  let importedRows = 0;

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const tableName of tableNames) {
      const rows = Array.isArray(payload.tables[tableName]) ? payload.tables[tableName] : [];

      if (!rows.length || !targetTables.has(tableName)) {
        continue;
      }

      const targetColumns = listColumns(db, tableName);
      const rowColumns = Object.keys(rows[0]).filter((column) => targetColumns.includes(column));

      if (!rowColumns.length) {
        continue;
      }

      const placeholders = rowColumns.map(() => "?").join(", ");
      const statement = db.prepare(
        `INSERT OR IGNORE INTO ${quoteIdentifier(tableName)} (${rowColumns
          .map(quoteIdentifier)
          .join(", ")}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        const values = rowColumns.map((column) => {
          if (column === "terminal_code" && terminalCode) {
            return terminalCode;
          }

          return row[column] ?? null;
        });

        statement.run(...values);
        importedRows += 1;
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  console.log(`Imported ${importedRows} row attempt(s) into ${target}.`);
}

const command = process.argv[2];

try {
  if (hasFlag("--help") || hasFlag("-h")) {
    usage();
  } else if (command === "export") {
    await exportLedger();
  } else if (command === "import") {
    await importLedger();
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

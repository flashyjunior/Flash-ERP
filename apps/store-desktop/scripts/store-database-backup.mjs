#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const command = process.argv[2];
const args = process.argv.slice(3);

function readOption(name, fallback = null) {
  const index = args.indexOf(`--${name}`);

  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1] ?? fallback;
  return typeof value === "string" && value.startsWith("--") ? fallback : value;
}

function printUsage() {
  console.log(`Flash ERP shared store database backup

Usage:
  npm --workspace @flash-erp/store-desktop run db:backup -- backup --source <store.sqlite> --out <folder>
  npm --workspace @flash-erp/store-desktop run db:backup -- backup --source <store.sqlite> --target <backup.sqlite>
  npm --workspace @flash-erp/store-desktop run db:backup -- verify --source <backup.sqlite>

Options:
  --source   Source SQLite database path.
  --out      Output folder for generated backup and manifest files.
  --target   Exact backup database path. Overrides --out.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sqliteString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readIntegrityCheck(databasePath) {
  if (!existsSync(databasePath)) {
    fail(`Flash ERP database was not found: ${databasePath}`);
  }

  if (!statSync(databasePath).isFile()) {
    fail(`Flash ERP database path is not a file: ${databasePath}`);
  }

  const db = new DatabaseSync(databasePath);

  try {
    const result = db.prepare("PRAGMA integrity_check").get();
    return String(Object.values(result ?? { integrity_check: "unknown" })[0] ?? "unknown");
  } finally {
    db.close();
  }
}

function resolveBackupTarget(sourcePath) {
  const exactTarget = readOption("target");

  if (exactTarget) {
    return path.resolve(exactTarget);
  }

  const outDir = path.resolve(readOption("out", path.resolve(process.cwd(), "store-db-backups")));
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));

  return path.join(outDir, `${sourceName}-backup-${timestampToken()}.sqlite`);
}

function backupDatabase() {
  const source = path.resolve(readOption("source", process.env.FLASH_ERP_STORE_DB_PATH ?? ""));

  if (!source || !existsSync(source) || !statSync(source).isFile()) {
    fail("Flash ERP needs --source <store.sqlite> or FLASH_ERP_STORE_DB_PATH for backup.");
  }

  const target = resolveBackupTarget(source);

  if (existsSync(target)) {
    fail(`Flash ERP backup target already exists: ${target}`);
  }

  mkdirSync(path.dirname(target), { recursive: true });

  const db = new DatabaseSync(source);

  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec(`VACUUM INTO ${sqliteString(target)};`);
  } finally {
    db.close();
  }

  const integrity = readIntegrityCheck(target);
  const targetStats = statSync(target);
  const manifest = {
    source,
    backup: target,
    sizeBytes: targetStats.size,
    sha256: sha256File(target),
    integrityCheck: integrity,
    generatedAt: new Date().toISOString()
  };
  const manifestPath = `${target}.manifest.json`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...manifest, manifest: manifestPath }, null, 2));
}

function verifyDatabase() {
  const sourceOption = readOption("source", "");
  const source = sourceOption ? path.resolve(sourceOption) : "";

  if (!source) {
    fail("Flash ERP needs --source <backup.sqlite> for verification.");
  }

  const stats = statSync(source);

  if (!stats.isFile()) {
    fail(`Flash ERP database path is not a file: ${source}`);
  }

  console.log(
    JSON.stringify(
      {
        source,
        sizeBytes: stats.size,
        sha256: sha256File(source),
        integrityCheck: readIntegrityCheck(source),
        checkedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

switch (command) {
  case "backup":
    backupDatabase();
    break;
  case "verify":
    verifyDatabase();
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

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { Prisma, PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const workspaceRoot = process.cwd();
const readinessErrorCode = "ENTERPRISE_DATABASE_SCHEMA_NOT_READY";
const requiredMigrationNames = [
  "20260522000000_init_sqlserver",
  "20260522021500_add_relation_indexes",
  "20260522043000_widen_receipt_template_html"
];
const requiredTables = ["GlAccount", "GlJournalEntry", "GlJournalLine", "OperatingExpense"];
const requiredColumns = [
  { tableName: "TenderMethod", columnName: "gatewayProvider" },
  { tableName: "TenderMethod", columnName: "gatewayMode" },
  { tableName: "TenderMethod", columnName: "gatewayMerchantId" },
  { tableName: "TenderMethod", columnName: "gatewayPublicKey" },
  { tableName: "TenderMethod", columnName: "gatewaySecretMask" },
  { tableName: "TenderMethod", columnName: "gatewayWebhookSecretMask" },
  { tableName: "TenderMethod", columnName: "gatewayCallbackUrl" },
  { tableName: "TenderMethod", columnName: "gatewayActive" },
  { tableName: "TenderMethod", columnName: "gatewayStatus" },
  { tableName: "TenderMethod", columnName: "gatewayConfigJson" },
  { tableName: "ReceiptTemplate", columnName: "templateHtml" },
  { tableName: "Store", columnName: "salesReceiptTemplateHtml" },
  { tableName: "Store", columnName: "accountPaymentReceiptTemplateHtml" },
  { tableName: "OperatingExpense", columnName: "expenseNo" },
  { tableName: "OperatingExpense", columnName: "expenseDate" },
  { tableName: "OperatingExpense", columnName: "status" }
];

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Database readiness gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Database readiness gate failed: ${label}`);
  }
}

function loadDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    dotenv.config({
      path: path.join(workspaceRoot, ".env")
    });
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Database readiness gate requires DATABASE_URL so it can verify applied Prisma migrations."
    );
  }

  return process.env.DATABASE_URL;
}

async function assertLiveDatabaseReadiness() {
  const prisma = new PrismaClient({
    adapter: new PrismaMssql(loadDatabaseUrl())
  });

  try {
    const [migrationRows, tableRows, columnRows] = await Promise.all([
      prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM [dbo].[_prisma_migrations]
        WHERE migration_name IN (${Prisma.join(requiredMigrationNames)})
          AND finished_at IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT TABLE_NAME AS table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME IN (${Prisma.join(requiredTables)})
      `,
      prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME IN (${Prisma.join([
            ...new Set(requiredColumns.map((column) => column.tableName))
          ])})
      `
    ]);
    const appliedMigrations = new Set(migrationRows.map((row) => row.migration_name));
    const existingTables = new Set(tableRows.map((row) => row.table_name));
    const existingColumns = new Set(
      columnRows.map((row) => `${row.table_name}.${row.column_name}`)
    );
    const missingMigrationNames = requiredMigrationNames.filter(
      (migration) => !appliedMigrations.has(migration)
    );
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    const missingColumns = requiredColumns.filter(
      (column) => !existingColumns.has(`${column.tableName}.${column.columnName}`)
    );
    const missing = [
      ...missingMigrationNames.map((migration) => `migration ${migration}`),
      ...missingTables.map((table) => `table ${table}`),
      ...missingColumns.map((column) => `column ${column.tableName}.${column.columnName}`)
    ];

    if (missing.length > 0) {
      throw new Error(`Live enterprise database is not ready. Missing: ${missing.join(", ")}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const readinessModule = requireFile(
  "apps/enterprise-web/src/server/readiness/enterprise-database-readiness.ts"
);
const readinessRoute = requireFile(
  "apps/enterprise-web/src/app/api/system/database-readiness/route.ts"
);
const pushRoute = requireFile(
  "apps/enterprise-web/src/app/api/sync/store-nodes/[nodeCode]/push/route.ts"
);
const pullRoute = requireFile(
  "apps/enterprise-web/src/app/api/sync/store-nodes/[nodeCode]/pull/route.ts"
);
const authRoute = requireFile("apps/enterprise-web/src/server/auth/enterprise-auth-route.ts");
const financeRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts"
);
const sqliteStore = requireFile("apps/store-desktop/src/main/offline/local-store-service.ts");
const postgresStore = requireFile("apps/store-desktop/src/main/postgres/postgres-store-service.ts");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const certificationPlan = requireFile("docs/12-production-certification-and-soak-plan.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");

if (!rootPackage.scripts?.["cert:database-readiness"]) {
  throw new Error("Root package.json must expose cert:database-readiness.");
}

requireIncludes(
  rootPackage.scripts["acceptance:production-hardening"] ?? "",
  "cert:database-readiness",
  "production hardening batch must include the database readiness gate."
);
requireIncludes(readinessModule, readinessErrorCode, "readiness module must expose schema error code.");
requireIncludes(readinessModule, "assertEnterpriseDatabaseReady", "readiness assertion must exist.");
requireIncludes(readinessModule, "isPrismaSchemaDriftError", "Prisma schema drift detection must exist.");
requireIncludes(readinessModule, "gatewayProvider", "tender gateway provider column must be checked.");
requireIncludes(readinessModule, "OperatingExpense", "operating expense table must be checked.");
requireIncludes(readinessRoute, "getEnterpriseDatabaseReadiness", "readiness API route must exist.");
requireIncludes(pushRoute, "assertEnterpriseDatabaseReady", "sync push must guard schema readiness.");
requireIncludes(pullRoute, "assertEnterpriseDatabaseReady", "sync pull must guard schema readiness.");
requireIncludes(pushRoute, "schemaDrift", "sync push must return schema drift diagnostics.");
requireIncludes(pullRoute, "schemaDrift", "sync pull must return schema drift diagnostics.");
requireIncludes(authRoute, "isPrismaSchemaDriftError", "HQ API errors must classify schema drift.");
requireIncludes(financeRepository, "assertEnterpriseDatabaseReady", "finance workspace must guard GL schema readiness.");

for (const [source, label] of [
  [sqliteStore, "SQLite desktop sync"],
  [postgresStore, "PostgreSQL desktop sync"]
] as const) {
  requireIncludes(source, '"SCHEMA"', `${label} must classify schema drift separately.`);
  requireIncludes(source, "schemaDrift", `${label} must read schema drift payloads.`);
  requireIncludes(source, readinessErrorCode, `${label} must recognize HQ readiness code.`);
}

requireIncludes(hardeningPack, "Schema Drift And Migration Readiness", "hardening pack must document schema readiness.");
requireIncludes(certificationPlan, "cert:database-readiness", "certification plan must include database readiness gate.");
requireIncludes(uatEvidence, "Database schema readiness", "UAT evidence log must include schema readiness evidence.");

async function main() {
  await assertLiveDatabaseReadiness();

  console.log("Enterprise database readiness gate passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

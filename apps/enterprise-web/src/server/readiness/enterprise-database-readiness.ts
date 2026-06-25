import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE =
  "ENTERPRISE_DATABASE_SCHEMA_NOT_READY";

const requiredMigrationNames = [
  "20260522000000_init_sqlserver",
  "20260522021500_add_relation_indexes",
  "20260522043000_widen_receipt_template_html",
];

const requiredTables = [
  "GlAccount",
  "GlJournalEntry",
  "GlJournalLine",
  "OperatingExpense",
  "UnitOfMeasure",
  "UnitOfMeasureSchedule",
  "UnitOfMeasureScheduleLine",
  "InventoryCatalog",
  "InventoryCatalogProduct",
  "InventoryCatalogStore",
  "LicenseEvent",
  "GiftCertificate",
];

const requiredColumns = [
  { tableName: "Store", columnName: "storeGroupCode" },
  { tableName: "Store", columnName: "storeGroupName" },
  { tableName: "Store", columnName: "storeGroupType" },
  { tableName: "Store", columnName: "licenseStatus" },
  { tableName: "Store", columnName: "licenseKey" },
  { tableName: "Store", columnName: "licensedUntil" },
  { tableName: "Store", columnName: "catalogPolicyJson" },
  { tableName: "Store", columnName: "touchModeEnabled" },
  { tableName: "Terminal", columnName: "licenseStatus" },
  { tableName: "Terminal", columnName: "licenseKey" },
  { tableName: "Terminal", columnName: "licensedUntil" },
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
  { tableName: "OperatingExpense", columnName: "status" },
  { tableName: "UnitOfMeasure", columnName: "code" },
  { tableName: "UnitOfMeasure", columnName: "decimalPrecision" },
  { tableName: "UnitOfMeasure", columnName: "allowFractionalSale" },
  { tableName: "UnitOfMeasureSchedule", columnName: "code" },
  { tableName: "UnitOfMeasureSchedule", columnName: "baseUnitOfMeasureId" },
  { tableName: "InventoryCatalog", columnName: "code" },
  { tableName: "InventoryCatalogProduct", columnName: "productId" },
  { tableName: "InventoryCatalogStore", columnName: "storeId" },
  { tableName: "LicenseEvent", columnName: "newLicensedUntil" },
  { tableName: "Product", columnName: "baseUnitOfMeasureId" },
  { tableName: "Product", columnName: "uomScheduleId" },
  { tableName: "GiftCertificate", columnName: "certificateNo" },
  { tableName: "GiftCertificate", columnName: "balanceAmount" },
  { tableName: "GiftCertificate", columnName: "status" },
];

export type EnterpriseDatabaseReadinessIssue = {
  kind: "MIGRATION" | "TABLE" | "COLUMN" | "QUERY";
  name: string;
  message: string;
};

export type EnterpriseDatabaseReadiness = {
  ready: boolean;
  checkedAt: string;
  requiredMigrationNames: string[];
  missingMigrationNames: string[];
  requiredTables: string[];
  missingTables: string[];
  requiredColumns: Array<{
    tableName: string;
    columnName: string;
  }>;
  missingColumns: Array<{
    tableName: string;
    columnName: string;
  }>;
  issues: EnterpriseDatabaseReadinessIssue[];
  message: string;
};

export class EnterpriseDatabaseSchemaNotReadyError extends Error {
  readonly code = ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE;
  readonly status = 503;

  constructor(readonly readiness: EnterpriseDatabaseReadiness) {
    super(readiness.message);
    this.name = "EnterpriseDatabaseSchemaNotReadyError";
  }
}

export function formatEnterpriseDatabaseReadinessMessage(input: {
  missingMigrationNames: string[];
  missingTables: string[];
  missingColumns: Array<{ tableName: string; columnName: string }>;
}) {
  const missing: string[] = [
    ...input.missingMigrationNames.map((migration) => `migration ${migration}`),
    ...input.missingTables.map((table) => `table ${table}`),
    ...input.missingColumns.map(
      (column) => `column ${column.tableName}.${column.columnName}`,
    ),
  ];

  if (missing.length === 0) {
    return "Flash ERP enterprise database schema is ready for this build.";
  }

  return `Flash ERP enterprise database schema is not ready for this build. Apply the latest Prisma migrations before running HQ or store sync. Missing: ${missing.join(", ")}.`;
}

function toIssueRows(input: {
  missingMigrationNames: string[];
  missingTables: string[];
  missingColumns: Array<{ tableName: string; columnName: string }>;
}): EnterpriseDatabaseReadinessIssue[] {
  return [
    ...input.missingMigrationNames.map((migration) => ({
      kind: "MIGRATION" as const,
      name: migration,
      message: `Prisma migration ${migration} has not been applied.`,
    })),
    ...input.missingTables.map((table) => ({
      kind: "TABLE" as const,
      name: table,
      message: `Database table ${table} is missing.`,
    })),
    ...input.missingColumns.map((column) => ({
      kind: "COLUMN" as const,
      name: `${column.tableName}.${column.columnName}`,
      message: `Database column ${column.tableName}.${column.columnName} is missing.`,
    })),
  ];
}

export function isEnterpriseDatabaseSchemaNotReadyError(
  error: unknown,
): error is EnterpriseDatabaseSchemaNotReadyError {
  return (
    error instanceof EnterpriseDatabaseSchemaNotReadyError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code ===
        ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE)
  );
}

export function isPrismaSchemaDriftError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");

  return /Unknown field .* on model|table .* does not exist|column .* does not exist|does not exist in the current database/i.test(
    message,
  );
}

export async function getEnterpriseDatabaseReadiness(): Promise<EnterpriseDatabaseReadiness> {
  const checkedAt = new Date().toISOString();

  try {
    const [migrationTableRows, tableRows, columnRows] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT TABLE_NAME AS table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = '_prisma_migrations'
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
            ...new Set(requiredColumns.map((column) => column.tableName)),
          ])})
      `,
    ]);
    const migrationTableExists = migrationTableRows.length > 0;
    const migrationRows = migrationTableExists
      ? await prisma.$queryRaw<Array<{ migration_name: string }>>`
          SELECT migration_name
          FROM [dbo].[_prisma_migrations]
          WHERE migration_name IN (${Prisma.join(requiredMigrationNames)})
            AND finished_at IS NOT NULL
        `
      : [];

    const appliedMigrations = new Set(
      migrationRows.map((row) => row.migration_name),
    );
    const existingTables = new Set(tableRows.map((row) => row.table_name));
    const existingColumns = new Set(
      columnRows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    const missingMigrationNames = migrationTableExists
      ? requiredMigrationNames.filter((migration) => !appliedMigrations.has(migration))
      : [];
    const missingTables = requiredTables.filter(
      (table) => !existingTables.has(table),
    );
    const missingColumns = requiredColumns.filter(
      (column) =>
        !existingColumns.has(`${column.tableName}.${column.columnName}`),
    );
    const message = formatEnterpriseDatabaseReadinessMessage({
      missingMigrationNames,
      missingTables,
      missingColumns,
    });
    const issues = toIssueRows({
      missingMigrationNames,
      missingTables,
      missingColumns,
    });

    return {
      ready: issues.length === 0,
      checkedAt,
      requiredMigrationNames,
      missingMigrationNames,
      requiredTables,
      missingTables,
      requiredColumns,
      missingColumns,
      issues,
      message,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Flash ERP could not verify enterprise database readiness: ${error.message}`
        : "Flash ERP could not verify enterprise database readiness.";

    return {
      ready: false,
      checkedAt,
      requiredMigrationNames,
      missingMigrationNames: requiredMigrationNames,
      requiredTables,
      missingTables: requiredTables,
      requiredColumns,
      missingColumns: requiredColumns,
      issues: [
        {
          kind: "QUERY",
          name: "database-readiness",
          message,
        },
      ],
      message,
    };
  }
}

export async function assertEnterpriseDatabaseReady() {
  const readiness = await getEnterpriseDatabaseReadiness();

  if (!readiness.ready) {
    throw new EnterpriseDatabaseSchemaNotReadyError(readiness);
  }

  return readiness;
}

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE =
  "ENTERPRISE_DATABASE_SCHEMA_NOT_READY";

const requiredMigrationNames = [
  "20260522000000_init_sqlserver",
  "20260522021500_add_relation_indexes",
  "20260522043000_widen_receipt_template_html",
  "20260812010000_public_ecommerce_extension",
  "20260712000000_stock_update_confirmation_policy",
  "20260813010000_enterprise_capacity_idempotency",
  "20260814010000_alternate_uom_selling",
  "20260814020000_layaway_lifecycle",
  "20260814030000_ecommerce_layaway",
  "20260814040000_sync_downstream_failure_details",
  "20260814050000_sqlserver_schema_reconciliation",
  "20260820010000_multi_branch_ecommerce_fulfillment",
  "20260820020000_ecommerce_network_allocation",
  "20260825010000_ecommerce_store_payment_reconciliation",
  "20260825020000_ecommerce_terminal_reservation_reconciliation",
  "20260826010000_public_trial_signup",
  "20260827010000_trial_workspace_lifecycle",
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
  "EcommerceCustomerAccount",
  "EcommerceCustomerIdentity",
  "EcommerceCustomerSession",
  "EcommerceOtpChallenge",
  "EcommerceCustomerAddress",
  "EcommerceOrder",
  "EcommercePayment",
  "EcommerceRefundRequest",
  "EcommerceOrderStatusEvent",
  "EcommerceStorePaymentMethod",
  "EcommerceProductReview",
  "EcommerceFulfillmentLocation",
  "EcommerceFulfillment",
  "EcommerceFulfillmentLine",
  "trial_signup_request",
  "trial_lifecycle_event",
  "trial_workspace_runtime",
  "StoreProductSellingUnit",
  "SalesOrderInventoryReservation",
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
  { tableName: "Store", columnName: "ecommerceEnabled" },
  { tableName: "Store", columnName: "ecommerceSlug" },
  { tableName: "Store", columnName: "ecommerceAllowPickup" },
  { tableName: "Store", columnName: "ecommerceAllowDelivery" },
  { tableName: "Store", columnName: "ecommerceHeroImageUrl" },
  { tableName: "Store", columnName: "ecommerceHeroSlidesJson" },
  { tableName: "Store", columnName: "ecommerceWhatsappPhone" },
  { tableName: "Store", columnName: "ecommercePayOnDeliveryEnabled" },
  { tableName: "Product", columnName: "ecommercePublished" },
  { tableName: "Product", columnName: "ecommerceFeatured" },
  { tableName: "Product", columnName: "ecommerceSortOrder" },
  { tableName: "Product", columnName: "ecommerceDescription" },
  { tableName: "Product", columnName: "ecommerceCompareAtPrice" },
  { tableName: "Product", columnName: "ecommerceSpecificationsJson" },
  { tableName: "Product", columnName: "ecommerceGalleryJson" },
  { tableName: "EcommerceOrder", columnName: "paymentTiming" },
  { tableName: "EcommerceOrder", columnName: "selectedPaymentMethodCode" },
  { tableName: "EcommerceOrder", columnName: "storefrontStoreId" },
  { tableName: "EcommerceCustomerAccount", columnName: "failedLoginAttempts" },
  { tableName: "EcommerceCustomerAccount", columnName: "lockedUntil" },
  { tableName: "EcommerceOrder", columnName: "checkoutRequestKey" },
  { tableName: "EcommerceOrder", columnName: "checkoutRequestHash" },
  { tableName: "EcommerceOrder", columnName: "layawayDepositAmount" },
  { tableName: "EcommercePayment", columnName: "initializationRequestKey" },
  { tableName: "EcommercePayment", columnName: "initializationRequestHash" },
  { tableName: "RetailOrg", columnName: "stockUpdateMode" },
  { tableName: "Store", columnName: "stockUpdateMode" },
  { tableName: "Store", columnName: "ecommerceLayawayEnabled" },
  { tableName: "GoodsReceipt", columnName: "stockUpdateStatus" },
  { tableName: "GoodsReceipt", columnName: "stockConfirmedAt" },
  { tableName: "GoodsReceipt", columnName: "stockConfirmedBy" },
  { tableName: "InterStoreTransfer", columnName: "issueStockUpdateStatus" },
  { tableName: "InterStoreTransfer", columnName: "issueStockConfirmedAt" },
  { tableName: "InterStoreTransfer", columnName: "issueStockConfirmedBy" },
  { tableName: "InterStoreTransfer", columnName: "receiptStockUpdateStatus" },
  { tableName: "InterStoreTransfer", columnName: "receiptStockConfirmedAt" },
  { tableName: "InterStoreTransfer", columnName: "receiptStockConfirmedBy" },
  { tableName: "PosTransactionLine", columnName: "sellingUnitOfMeasure" },
  { tableName: "PosTransactionLine", columnName: "baseUnitOfMeasure" },
  { tableName: "PosTransactionLine", columnName: "uomConversionFactor" },
  { tableName: "PosTransactionLine", columnName: "baseQuantity" },
  { tableName: "SalesOrderLine", columnName: "sellingUnitOfMeasure" },
  { tableName: "SalesOrderLine", columnName: "baseUnitOfMeasure" },
  { tableName: "SalesOrderLine", columnName: "uomConversionFactor" },
  { tableName: "SalesOrderLine", columnName: "baseQuantity" },
  { tableName: "SalesOrder", columnName: "orderType" },
  { tableName: "SalesOrder", columnName: "paidAmount" },
  { tableName: "SalesOrder", columnName: "layawayPolicySnapshotJson" },
  { tableName: "SalesOrder", columnName: "minimumDepositAmount" },
  { tableName: "SalesOrder", columnName: "reservationStatus" },
  { tableName: "SalesOrder", columnName: "reservationCreatedAt" },
  { tableName: "SalesOrder", columnName: "reservationReleasedAt" },
  { tableName: "SalesOrder", columnName: "layawayExpiresAt" },
  { tableName: "SalesOrder", columnName: "expiredAt" },
  { tableName: "SalesOrder", columnName: "cancellationFeeAmount" },
  { tableName: "SalesOrder", columnName: "refundedAmount" },
  { tableName: "ErpFuelOperationsSettings", columnName: "saleReceiptPaperKind" },
  { tableName: "ErpFuelOperationsSettings", columnName: "deliveryReceiptPaperKind" },
  { tableName: "ErpFuelOperationsSettings", columnName: "salesOrderReceiptPaperKind" },
  { tableName: "SyncOutboxEvent", columnName: "errorMessage" },
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

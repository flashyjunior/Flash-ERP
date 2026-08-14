import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl?.startsWith("sqlserver://")) {
  throw new Error(
    "DATABASE_URL must target SQL Server before running the layaway migration gate.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl),
});

type SchemaProbe = {
  orderType: number;
  paidAmount: number;
  policySnapshot: number;
  minimumDeposit: number;
  reservationStatus: number;
  reservationCreatedAt: number;
  reservationReleasedAt: number;
  expiresAt: number;
  expiredAt: number;
  cancellationFee: number;
  refundedAmount: number;
  reservationTable: number;
  orderStatusIndex: number;
  stockReservationIndex: number;
  ecommerceLayawayEnabled: number;
  ecommerceLayawayDepositAmount: number;
};

type BackfillProbe = {
  rowsMissingPaidAmount: number;
};

async function main() {
  const migrationPath = path.resolve(
    process.cwd(),
    "prisma",
    "migrations",
    "20260814_02_layaway_lifecycle",
    "migration.sql",
  );
  const migrationSql = await readFile(migrationPath, "utf8");
  const ecommerceMigrationSql = await readFile(
    path.resolve(
      process.cwd(),
      "prisma",
      "migrations",
      "20260814_03_ecommerce_layaway",
      "migration.sql",
    ),
    "utf8",
  );

  await prisma.$executeRawUnsafe(migrationSql);
  await prisma.$executeRawUnsafe(migrationSql);
  await prisma.$executeRawUnsafe(ecommerceMigrationSql);
  await prisma.$executeRawUnsafe(ecommerceMigrationSql);

  const [schema] = await prisma.$queryRawUnsafe<SchemaProbe[]>(`
    SELECT
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'orderType') IS NULL THEN 0 ELSE 1 END AS [orderType],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'paidAmount') IS NULL THEN 0 ELSE 1 END AS [paidAmount],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'layawayPolicySnapshotJson') IS NULL THEN 0 ELSE 1 END AS [policySnapshot],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'minimumDepositAmount') IS NULL THEN 0 ELSE 1 END AS [minimumDeposit],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'reservationStatus') IS NULL THEN 0 ELSE 1 END AS [reservationStatus],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'reservationCreatedAt') IS NULL THEN 0 ELSE 1 END AS [reservationCreatedAt],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'reservationReleasedAt') IS NULL THEN 0 ELSE 1 END AS [reservationReleasedAt],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'layawayExpiresAt') IS NULL THEN 0 ELSE 1 END AS [expiresAt],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'expiredAt') IS NULL THEN 0 ELSE 1 END AS [expiredAt],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'cancellationFeeAmount') IS NULL THEN 0 ELSE 1 END AS [cancellationFee],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrder', N'refundedAmount') IS NULL THEN 0 ELSE 1 END AS [refundedAmount],
      CASE WHEN COL_LENGTH(N'dbo.Store', N'ecommerceLayawayEnabled') IS NULL THEN 0 ELSE 1 END AS [ecommerceLayawayEnabled],
      CASE WHEN COL_LENGTH(N'dbo.EcommerceOrder', N'layawayDepositAmount') IS NULL THEN 0 ELSE 1 END AS [ecommerceLayawayDepositAmount],
      CASE WHEN OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]', N'U') IS NULL THEN 0 ELSE 1 END AS [reservationTable],
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [name] = N'SalesOrderInventoryReservation_salesOrderId_status_idx'
          AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]')
      ) THEN 1 ELSE 0 END AS [orderStatusIndex],
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [name] = N'SalesOrderInventoryReservation_inventoryLocationId_productCodeSnapshot_productVariantCodeSnapshot_status_idx'
          AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]')
      ) THEN 1 ELSE 0 END AS [stockReservationIndex]
  `);
  const [backfill] = await prisma.$queryRawUnsafe<BackfillProbe[]>(`
    SELECT COUNT(*) AS [rowsMissingPaidAmount]
    FROM [dbo].[SalesOrder]
    WHERE [depositAmount] > 0 AND [paidAmount] < [depositAmount]
  `);

  assert.ok(schema, "Expected a SQL Server layaway schema probe row.");
  for (const [field, value] of Object.entries(schema)) {
    assert.equal(Number(value), 1, `Layaway schema probe ${field} is missing.`);
  }
  assert.equal(
    Number(backfill?.rowsMissingPaidAmount ?? -1),
    0,
    "One or more historical sales orders were not backfilled to cumulative paid amount.",
  );

  console.log(
    "Layaway SQL Server migration gate passed: two idempotent runs, lifecycle, ecommerce offer and requested-deposit columns, reservation indexes, and paid-amount backfill verified.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

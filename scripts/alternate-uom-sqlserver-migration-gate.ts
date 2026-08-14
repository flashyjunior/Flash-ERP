import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";

import { prisma } from "../apps/enterprise-web/src/lib/db/prisma";

type SchemaProbe = {
  sellingUnitTable: number;
  transactionBaseQuantity: number;
  orderBaseQuantity: number;
  transferRequestedUnit: number;
  transferRequestedUnitQuantity: number;
  transferConversionFactor: number;
  transferBaseUnit: number;
};

type BackfillProbe = {
  transactionRowsMissingBaseQuantity: number;
  orderRowsMissingBaseQuantity: number;
};

async function main() {
  const transferMigrationPath = path.resolve(
    process.cwd(),
    "prisma",
    "migrations",
    "20260813_02_inter_store_transfer_uom",
    "migration.sql"
  );
  const migrationPath = path.resolve(
    process.cwd(),
    "prisma",
    "migrations",
    "20260814_01_alternate_uom_selling",
    "migration.sql"
  );
  const transferMigrationSql = await readFile(transferMigrationPath, "utf8");
  const migrationSql = await readFile(migrationPath, "utf8");

  await prisma.$executeRawUnsafe(transferMigrationSql);
  await prisma.$executeRawUnsafe(transferMigrationSql);
  await prisma.$executeRawUnsafe(migrationSql);
  await prisma.$executeRawUnsafe(migrationSql);

  const [schema] = await prisma.$queryRawUnsafe<SchemaProbe[]>(`
    SELECT
      CASE WHEN OBJECT_ID(N'[dbo].[StoreProductSellingUnit]', N'U') IS NULL THEN 0 ELSE 1 END AS [sellingUnitTable],
      CASE WHEN COL_LENGTH(N'dbo.PosTransactionLine', N'baseQuantity') IS NULL THEN 0 ELSE 1 END AS [transactionBaseQuantity],
      CASE WHEN COL_LENGTH(N'dbo.SalesOrderLine', N'baseQuantity') IS NULL THEN 0 ELSE 1 END AS [orderBaseQuantity],
      CASE WHEN COL_LENGTH(N'dbo.InterStoreTransfer', N'requestedUnitOfMeasure') IS NULL THEN 0 ELSE 1 END AS [transferRequestedUnit],
      CASE WHEN COL_LENGTH(N'dbo.InterStoreTransfer', N'requestedUnitQuantity') IS NULL THEN 0 ELSE 1 END AS [transferRequestedUnitQuantity],
      CASE WHEN COL_LENGTH(N'dbo.InterStoreTransfer', N'uomConversionFactor') IS NULL THEN 0 ELSE 1 END AS [transferConversionFactor],
      CASE WHEN COL_LENGTH(N'dbo.InterStoreTransfer', N'baseUnitOfMeasure') IS NULL THEN 0 ELSE 1 END AS [transferBaseUnit]
  `);
  const [backfill] = await prisma.$queryRawUnsafe<BackfillProbe[]>(`
    SELECT
      (SELECT COUNT(*) FROM [dbo].[PosTransactionLine] WHERE [quantity] <> 0 AND [baseQuantity] = 0) AS [transactionRowsMissingBaseQuantity],
      (SELECT COUNT(*) FROM [dbo].[SalesOrderLine] WHERE [quantity] <> 0 AND [baseQuantity] = 0) AS [orderRowsMissingBaseQuantity]
  `);

  assert.equal(schema?.sellingUnitTable, 1, "StoreProductSellingUnit was not created.");
  assert.equal(
    schema?.transactionBaseQuantity,
    1,
    "PosTransactionLine.baseQuantity was not created."
  );
  assert.equal(schema?.orderBaseQuantity, 1, "SalesOrderLine.baseQuantity was not created.");
  assert.equal(schema?.transferRequestedUnit, 1, "InterStoreTransfer.requestedUnitOfMeasure was not created.");
  assert.equal(schema?.transferRequestedUnitQuantity, 1, "InterStoreTransfer.requestedUnitQuantity was not created.");
  assert.equal(schema?.transferConversionFactor, 1, "InterStoreTransfer.uomConversionFactor was not created.");
  assert.equal(schema?.transferBaseUnit, 1, "InterStoreTransfer.baseUnitOfMeasure was not created.");
  assert.equal(
    Number(backfill?.transactionRowsMissingBaseQuantity ?? -1),
    0,
    "One or more historical POS lines were not backfilled to base quantity."
  );
  assert.equal(
    Number(backfill?.orderRowsMissingBaseQuantity ?? -1),
    0,
    "One or more historical sales-order lines were not backfilled to base quantity."
  );

  console.log(
    "Alternate-UOM SQL Server migration gate passed: two idempotent transfer/POS runs, required schema, and historical base-quantity backfill verified."
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

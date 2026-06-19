import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sql from "mssql";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) {
    continue;
  }

  const [key, inlineValue] = arg.slice(2).split("=", 2);
  const next = process.argv[index + 1];
  const value =
    inlineValue ??
    (next && !next.startsWith("--") ? process.argv[++index] : "true");
  args.set(key, value);
}

const storeId =
  args.get("store-id") ?? "d2079d86-c0b1-4f18-aac5-eea59ee1c8eb";
const targetQuantity = Number(args.get("target") ?? "100");
const apply = args.get("apply") === "true";
const allLocations = args.get("all-locations") === "true";
const explicitLocationId = args.get("location-id") ?? null;

if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
  throw new Error("--target must be a non-negative number.");
}

const password = process.env.RMS_HQ_SQL_PASSWORD;
if (!password) {
  throw new Error("Set RMS_HQ_SQL_PASSWORD before running this script.");
}

const config = {
  server: process.env.RMS_HQ_SQL_SERVER ?? "SQL6029.site4now.net",
  database: process.env.RMS_HQ_SQL_DATABASE ?? "db_abaaaa_sheval",
  user: process.env.RMS_HQ_SQL_USER ?? "db_abaaaa_sheval_admin",
  password,
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  requestTimeout: 120000,
  connectionTimeout: 30000,
  pool: {
    max: 4,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

function roundQuantity(value) {
  return Number(Number(value).toFixed(3));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toSqlDecimal(value) {
  return roundQuantity(value).toFixed(3);
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function main() {
  const pool = await sql.connect(config);
  try {
    const storeResult = await pool
      .request()
      .input("storeId", sql.NVarChar, storeId)
      .query(`
        SELECT TOP (1)
          [id],
          [retailOrgId],
          [code],
          [name],
          [status]
        FROM [dbo].[Store]
        WHERE [id] = @storeId;
      `);

    const store = storeResult.recordset[0];
    if (!store) {
      throw new Error(`Store ${storeId} was not found.`);
    }

    const locationRequest = pool
      .request()
      .input("storeId", sql.NVarChar, storeId);
    if (explicitLocationId) {
      locationRequest.input("locationId", sql.NVarChar, explicitLocationId);
    }

    const locationsResult = await locationRequest.query(`
      SELECT
        [id],
        [code],
        [name],
        [warehouseId],
        [status],
        [useForSalesDefault],
        [useForReceivingDefault]
      FROM [dbo].[InventoryLocation]
      WHERE [storeId] = @storeId
        AND [status] = 'ACTIVE'
        ${explicitLocationId ? "AND [id] = @locationId" : ""}
      ORDER BY [useForSalesDefault] DESC, [name] ASC;
    `);

    let targetLocations = locationsResult.recordset;
    if (!allLocations && !explicitLocationId && targetLocations.length > 1) {
      const salesDefaultLocations = targetLocations.filter(
        (location) => location.useForSalesDefault === true
      );
      if (salesDefaultLocations.length === 1) {
        targetLocations = salesDefaultLocations;
      } else {
        const labels = targetLocations
          .map(
            (location) =>
              `${location.name} (${location.code}, id=${location.id}, salesDefault=${location.useForSalesDefault})`
          )
          .join("; ");
        throw new Error(
          `Store ${store.code} has ${targetLocations.length} active inventory locations. Re-run with --location-id <id> or --all-locations true. Locations: ${labels}`
        );
      }
    }

    if (targetLocations.length === 0) {
      throw new Error(`Store ${store.code} has no matching active inventory location.`);
    }

    const locationIds = targetLocations.map((location) => location.id);
    const productBalanceRequest = pool
      .request()
      .input("retailOrgId", sql.NVarChar, store.retailOrgId);
    locationIds.forEach((locationId, index) => {
      productBalanceRequest.input(`locationId${index}`, sql.NVarChar, locationId);
    });

    const locationIdList = locationIds
      .map((_, index) => `@locationId${index}`)
      .join(", ");
    const balancesResult = await productBalanceRequest.query(`
      SELECT
        il.[id] AS [inventoryLocationId],
        il.[code] AS [locationCode],
        il.[name] AS [locationName],
        il.[warehouseId] AS [warehouseId],
        p.[id] AS [productId],
        p.[code] AS [productCode],
        p.[sku] AS [sku],
        p.[name] AS [productName],
        p.[baseCostPrice] AS [baseCostPrice],
        CAST(COALESCE(SUM(ile.[quantity]), 0) AS DECIMAL(18, 3)) AS [currentQuantity]
      FROM [dbo].[InventoryLocation] il
      CROSS JOIN [dbo].[Product] p
      LEFT JOIN [dbo].[InventoryLedgerEntry] ile
        ON ile.[inventoryLocationId] = il.[id]
       AND ile.[productId] = p.[id]
      WHERE il.[id] IN (${locationIdList})
        AND p.[retailOrgId] = @retailOrgId
        AND p.[status] = 'ACTIVE'
        AND p.[trackInventory] = 1
      GROUP BY
        il.[id],
        il.[code],
        il.[name],
        il.[warehouseId],
        p.[id],
        p.[code],
        p.[sku],
        p.[name],
        p.[baseCostPrice]
      ORDER BY il.[name] ASC, p.[name] ASC;
    `);

    const rows = balancesResult.recordset.map((row) => {
      const currentQuantity = roundQuantity(row.currentQuantity ?? 0);
      const deltaQuantity = roundQuantity(targetQuantity - currentQuantity);
      return {
        ...row,
        currentQuantity,
        targetQuantity: roundQuantity(targetQuantity),
        deltaQuantity
      };
    });
    const changedRows = rows.filter((row) => row.deltaQuantity !== 0);
    const positiveRows = changedRows.filter((row) => row.deltaQuantity > 0);
    const negativeRows = changedRows.filter((row) => row.deltaQuantity < 0);

    const artifactDir = path.join(
      process.cwd(),
      "artifacts",
      "inventory-adjustments"
    );
    fs.mkdirSync(artifactDir, { recursive: true });
    const batchId = `hq-set-store-${store.code}-${nowStamp()}-${randomUUID().slice(0, 8)}`;
    const csvPath = path.join(artifactDir, `${batchId}.csv`);
    const csvHeader = [
      "storeId",
      "storeCode",
      "storeName",
      "inventoryLocationId",
      "locationCode",
      "locationName",
      "productId",
      "productCode",
      "sku",
      "productName",
      "currentQuantity",
      "targetQuantity",
      "deltaQuantity"
    ];
    const csvLines = [
      csvHeader.join(","),
      ...rows.map((row) =>
        [
          store.id,
          store.code,
          store.name,
          row.inventoryLocationId,
          row.locationCode,
          row.locationName,
          row.productId,
          row.productCode,
          row.sku,
          row.productName,
          row.currentQuantity,
          row.targetQuantity,
          row.deltaQuantity
        ]
          .map(csvEscape)
          .join(",")
      )
    ];
    fs.writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");

    console.log(JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        store: {
          id: store.id,
          code: store.code,
          name: store.name
        },
        locations: targetLocations.map((location) => ({
          id: location.id,
          code: location.code,
          name: location.name,
          useForSalesDefault: location.useForSalesDefault
        })),
        targetQuantity: roundQuantity(targetQuantity),
        productLocationRows: rows.length,
        rowsAlreadyAtTarget: rows.length - changedRows.length,
        rowsToInsert: changedRows.length,
        positiveAdjustments: positiveRows.length,
        negativeAdjustments: negativeRows.length,
        previewCsvPath: csvPath
      },
      null,
      2
    ));

    if (!apply || changedRows.length === 0) {
      return;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      for (const row of changedRows) {
        await new sql.Request(transaction)
          .input("id", sql.NVarChar, randomUUID())
          .input("retailOrgId", sql.NVarChar, store.retailOrgId)
          .input("storeId", sql.NVarChar, store.id)
          .input("warehouseId", sql.NVarChar, row.warehouseId)
          .input("inventoryLocationId", sql.NVarChar, row.inventoryLocationId)
          .input("productId", sql.NVarChar, row.productId)
          .input("quantity", sql.Decimal(18, 3), toSqlDecimal(row.deltaQuantity))
          .input(
            "unitCost",
            sql.Decimal(18, 2),
            row.baseCostPrice === null || row.baseCostPrice === undefined
              ? null
              : Number(row.baseCostPrice)
          )
          .input("referenceId", sql.NVarChar, batchId)
          .input("externalReference", sql.NVarChar, batchId)
          .input("sourceNodeCode", sql.NVarChar, "HQ_BULK_ADJUSTMENT")
          .input("occurredAt", sql.DateTime2, new Date())
          .query(`
            INSERT INTO [dbo].[InventoryLedgerEntry] (
              [id],
              [retailOrgId],
              [storeId],
              [warehouseId],
              [inventoryLocationId],
              [productId],
              [movementType],
              [quantity],
              [unitCost],
              [referenceType],
              [referenceId],
              [externalReference],
              [sourceNodeCode],
              [occurredAt]
            )
            VALUES (
              @id,
              @retailOrgId,
              @storeId,
              @warehouseId,
              @inventoryLocationId,
              @productId,
              'COUNT_VARIANCE',
              @quantity,
              @unitCost,
              'HQ_BULK_QUANTITY_RESET',
              @referenceId,
              @externalReference,
              @sourceNodeCode,
              @occurredAt
            );
          `);
      }

      await transaction.commit();
      console.log(JSON.stringify(
        {
          applied: true,
          batchId,
          insertedLedgerRows: changedRows.length,
          previewCsvPath: csvPath
        },
        null,
        2
      ));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

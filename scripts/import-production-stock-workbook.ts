import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";

type SourceStockAllocation = {
  locationName: string;
  quantity: number;
  unitCost: number | null;
  sourceRows: number[];
};

type ImportProduct = {
  code: string;
  sourceSku: string;
  sku: string;
  name: string;
  shortName: string;
  department: string;
  category: string;
  subcategory: string;
  brand: string;
  manufacturer: string;
  condition: string;
  conditionCode: string;
  esimVariant: string;
  sourceQualifier: string;
  unitOfMeasure: string;
  price: number;
  cost: number | null;
  mustEnterPriceAtPos: boolean;
  notes: string;
  stock: SourceStockAllocation[];
  sourceRows: number[];
};

type ImportLocation = {
  name: string;
  code: string;
  locationType: string;
  useForSalesDefault: boolean;
  routingPriority: number;
  supportsPickup: boolean;
  supportsDelivery: boolean;
};

type ImportPayload = {
  formatVersion: number;
  sourceWorkbook: string;
  sourceWorkbookPath: string;
  stockAsOf: string;
  preparedAt: string;
  expectedDatabase: string;
  locations: ImportLocation[];
  products: ImportProduct[];
  statistics: {
    sourceRows: number;
    products: number;
    departments: number;
    categories: number;
    stockRows: number;
    totalQuantity: number;
    negativeStockRows: number;
    productsRequiringPosPrice: number;
    productsWithoutCost: number;
    serializedProducts: number;
    batchTrackedProducts: number;
  };
};

const args = process.argv.slice(2);
const targetStoreCodes = ["MAIN", "ABDUL-RAUF", "SCREENS-ACCESSORIES", "SHOP-B"] as const;
const targetStoreNames = ["Main Location", "Abdul Rauf", "Screens & Accessories", "SHOP B"];

function argument(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function categoryCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function requireUnique(values: string[], label: string) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate value(s): ${[...new Set(duplicates)].join(", ")}.`);
  }
}

function sameValues(actual: string[], expected: readonly string[]) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function validatePayload(payload: ImportPayload, expectedDatabase: string) {
  if (payload.formatVersion !== 1) throw new Error("Unsupported catalogue import payload version.");
  if (payload.expectedDatabase !== expectedDatabase) {
    throw new Error("The prepared workbook payload targets a different database.");
  }
  if (payload.products.length !== payload.statistics.products || payload.products.length !== 468) {
    throw new Error(`Expected 468 products, received ${payload.products.length}.`);
  }
  if (payload.statistics.sourceRows !== 507) {
    throw new Error(`Expected 507 source rows, received ${payload.statistics.sourceRows}.`);
  }
  if (payload.locations.length !== 4) {
    throw new Error(`Expected four workbook shops, received ${payload.locations.length}.`);
  }

  requireUnique(payload.products.map((product) => product.code), "Product codes");
  requireUnique(payload.products.map((product) => product.sku), "Normalized SKUs");
  requireUnique(payload.locations.map((location) => location.code), "Store codes");
  requireUnique(payload.locations.map((location) => location.name), "Store names");

  if (!sameValues(payload.locations.map((location) => location.code), targetStoreCodes)) {
    throw new Error("The workbook shops must be MAIN, ABDUL-RAUF, SCREENS-ACCESSORIES, and SHOP-B.");
  }
  if (!sameValues(payload.locations.map((location) => location.name), targetStoreNames)) {
    throw new Error("The workbook shop names do not match the approved four-shop topology.");
  }

  const stockRows = payload.products.flatMap((product) => product.stock);
  const totalQuantity = stockRows.reduce((sum, row) => sum + Number(row.quantity), 0);
  if (
    stockRows.length !== 0 ||
    payload.statistics.stockRows !== 0 ||
    totalQuantity !== 0 ||
    payload.statistics.totalQuantity !== 0 ||
    payload.statistics.negativeStockRows !== 0
  ) {
    throw new Error("Opening stock must be empty. Products will start with zero quantity in every shop.");
  }
  if (payload.statistics.serializedProducts !== 0 || payload.statistics.batchTrackedProducts !== 0) {
    throw new Error("The workbook has no serial or batch identifiers, so tracked products cannot be imported safely.");
  }
}

const inputPath = argument("--input");
const expectedDatabase = argument("--expected-database");
const execute = args.includes("--execute");
const datasourceUrl = process.env.DATABASE_URL;

if (!inputPath || !expectedDatabase || !datasourceUrl) {
  throw new Error("--input, --expected-database, and DATABASE_URL are required.");
}
if (expectedDatabase !== "Trial" && !/^Trial_Import_Rehearsal_[A-Za-z0-9_]+$/.test(expectedDatabase)) {
  throw new Error("The importer is locked to Trial and explicitly named Trial_Import_Rehearsal_* databases.");
}

const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as ImportPayload;
validatePayload(payload, expectedDatabase);

const prisma = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });

async function databaseName() {
  const rows = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT CONVERT(nvarchar(128), DB_NAME()) AS databaseName
  `;
  return rows[0]?.databaseName;
}

async function importPreparedData() {
  const currentDatabase = await databaseName();
  if (currentDatabase !== expectedDatabase) {
    throw new Error(`Connected to ${currentDatabase ?? "an unknown database"}, expected ${expectedDatabase}.`);
  }

  const enterpriseNode = await prisma.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", isPrimary: true, status: "ACTIVE" },
    select: { code: true, retailOrgId: true },
  });
  if (!enterpriseNode) throw new Error("The target has no active primary enterprise node.");

  const [retailOrg, stores, activeUsers] = await Promise.all([
    prisma.retailOrg.findUnique({
      where: { id: enterpriseNode.retailOrgId },
      select: { id: true, code: true, name: true, baseCurrencyCode: true },
    }),
    prisma.store.findMany({
      where: { retailOrgId: enterpriseNode.retailOrgId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        timezone: true,
        currencyCode: true,
        countryCode: true,
        storeMode: true,
        touchModeEnabled: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.retailUser.count({
      where: { retailOrgId: enterpriseNode.retailOrgId, accountStatus: "ACTIVE" },
    }),
  ]);
  if (!retailOrg) throw new Error("The target enterprise organisation is missing.");

  const currentStoreCodes = stores.map((store) => store.code);
  const legacyTopology = sameValues(currentStoreCodes, ["MAIN", "ONLINE"]);
  const targetTopology = sameValues(currentStoreCodes, targetStoreCodes);
  if ((!legacyTopology && !targetTopology) || stores.some((store) => store.status !== "ACTIVE")) {
    throw new Error(
      "The target must contain either the preserved MAIN/ONLINE topology or the approved four active shops.",
    );
  }
  if (activeUsers < 1) throw new Error("The target has no active administrator account to preserve.");

  const mainSource = stores.find((store) => store.code === "MAIN");
  const storefrontSource = stores.find((store) => store.code === (legacyTopology ? "ONLINE" : "SHOP-B"));
  if (!mainSource || !storefrontSource) throw new Error("The preserved main or ecommerce store is missing.");

  const plan = {
    database: currentDatabase,
    organisation: `${retailOrg.code} (${retailOrg.name})`,
    sourceTopology: stores.map((store) => `${store.code} (${store.name})`),
    preservedActiveUsers: activeUsers,
    shops: payload.locations.map((location) => `${location.code} (${location.name})`),
    products: payload.statistics.products,
    categories: payload.statistics.categories,
    openingStockRows: 0,
    openingQuantity: 0,
    ignoredWorkbookPlaceholder: "No Closing Stock",
    productsRequiringPosPrice: payload.statistics.productsRequiringPosPrice,
    productsWithoutCost: payload.statistics.productsWithoutCost,
    serialAndBatchPolicy: "Disabled because the workbook contains no serial, batch, or expiry identifiers.",
  };

  if (!execute) {
    console.log(JSON.stringify({ mode: "DRY_RUN", plan }, null, 2));
    return;
  }

  const { purgeEnterpriseData } = await import(
    "../apps/enterprise-web/src/server/repositories/enterprise-data-purge.repository"
  );
  const purgeScopes = [
    "pos-transactions",
    "sales-orders",
    "purchasing",
    "transfers-counts",
    "inventory-stock",
    "cash-banking",
    "ecommerce-orders",
    "sync-queues",
    "finance-journals",
    "customers",
    "suppliers",
    "products",
    "categories",
    "departments",
    "pricing",
    "promotions",
    "inventory-locations",
    "ecommerce-accounts",
  ];
  const purge = await purgeEnterpriseData(
    { scopes: purgeScopes, confirmationText: "PURGE" },
    `Production catalogue import from ${payload.sourceWorkbook}`,
  );

  const stockAsOf = new Date(payload.stockAsOf);
  if (Number.isNaN(stockAsOf.getTime())) throw new Error("The workbook stock date is invalid.");

  const importResult = await prisma.$transaction(
    async (tx) => {
      const unit = await tx.unitOfMeasure.findUnique({
        where: { retailOrgId_code: { retailOrgId: retailOrg.id, code: "EA" } },
        select: { id: true, code: true, name: true },
      });
      if (!unit) throw new Error("The preserved EA unit of measure is missing.");

      let schedule = await tx.unitOfMeasureSchedule.findFirst({
        where: { retailOrgId: retailOrg.id, baseUnitOfMeasureId: unit.id, status: "ACTIVE" },
        orderBy: [{ isDefaultForStock: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (!schedule) {
        schedule = await tx.unitOfMeasureSchedule.create({
          data: {
            retailOrgId: retailOrg.id,
            code: "PRODUCTION-EACH",
            name: "Each",
            baseUnitOfMeasureId: unit.id,
            isDefaultForStock: true,
            status: "ACTIVE",
            originNodeCode: enterpriseNode.code,
            lastModifiedByNodeCode: enterpriseNode.code,
            lines: {
              create: {
                unitOfMeasureId: unit.id,
                conversionFactor: "1.000000",
                isBaseUnit: true,
                allowSale: true,
                allowPurchase: true,
              },
            },
          },
          select: { id: true },
        });
      }

      await tx.store.update({
        where: { id: mainSource.id },
        data: { name: "Main Location", shortName: "Main Location", location: "Main Location", status: "ACTIVE" },
      });
      await tx.store.update({
        where: { id: storefrontSource.id },
        data: { code: "SHOP-B", name: "SHOP B", shortName: "SHOP B", location: "SHOP B", status: "ACTIVE" },
      });

      for (const definition of payload.locations.filter(
        (location) => location.code !== "MAIN" && location.code !== "SHOP-B",
      )) {
        await tx.store.upsert({
          where: { retailOrgId_code: { retailOrgId: retailOrg.id, code: definition.code } },
          update: {
            name: definition.name,
            shortName: definition.name,
            location: definition.name,
            salesEnabled: true,
            warehouseEnabled: true,
            status: "ACTIVE",
          },
          create: {
            retailOrgId: retailOrg.id,
            code: definition.code,
            name: definition.name,
            shortName: definition.name,
            location: definition.name,
            timezone: mainSource.timezone,
            currencyCode: mainSource.currencyCode,
            countryCode: mainSource.countryCode,
            storeMode: mainSource.storeMode,
            touchModeEnabled: mainSource.touchModeEnabled,
            salesEnabled: true,
            warehouseEnabled: true,
            status: "ACTIVE",
          },
        });
      }

      const configuredStores = await tx.store.findMany({
        where: { retailOrgId: retailOrg.id },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      });
      if (!sameValues(configuredStores.map((store) => store.code), targetStoreCodes)) {
        throw new Error("The importer could not establish the approved four-shop topology.");
      }

      for (const store of configuredStores) {
        const preferredTerminal = await tx.terminal.findUnique({
          where: { storeId_code: { storeId: store.id, code: "POS-01" } },
          select: { id: true },
        });
        if (preferredTerminal) {
          await tx.terminal.update({
            where: { id: preferredTerminal.id },
            data: { name: `${store.name} POS`, status: "ACTIVE" },
          });
          continue;
        }

        const existingTerminal = await tx.terminal.findFirst({
          where: { storeId: store.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (existingTerminal) {
          await tx.terminal.update({
            where: { id: existingTerminal.id },
            data: { code: "POS-01", name: `${store.name} POS`, status: "ACTIVE" },
          });
        } else {
          await tx.terminal.create({
            data: {
              retailOrgId: retailOrg.id,
              storeId: store.id,
              code: "POS-01",
              name: `${store.name} POS`,
              status: "ACTIVE",
            },
          });
        }
      }

      for (const store of configuredStores) {
        const warehouse = await tx.warehouse.create({
          data: {
            retailOrgId: retailOrg.id,
            storeId: store.id,
            code: `${store.code}-WH`,
            name: `${store.name} Warehouse`,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        const definition = payload.locations.find((location) => location.code === store.code);
        if (!definition) throw new Error(`Missing workbook definition for ${store.code}.`);
        await tx.inventoryLocation.create({
          data: {
            retailOrgId: retailOrg.id,
            storeId: store.id,
            warehouseId: warehouse.id,
            code: `${store.code}-SALES`,
            name: store.name,
            locationType: definition.locationType,
            status: "ACTIVE",
            useForSalesDefault: true,
            useForSalesOrderDefault: true,
            useForReceivingDefault: true,
          },
        });
      }

      const locations = await tx.inventoryLocation.findMany({
        where: { retailOrgId: retailOrg.id },
        select: { id: true, storeId: true, code: true, name: true },
      });
      const storeByCode = new Map(configuredStores.map((store) => [store.code, store]));
      const locationByStoreId = new Map(locations.map((location) => [location.storeId, location]));
      const storefrontStore = storeByCode.get("SHOP-B");
      if (!storefrontStore || locations.length !== 4) {
        throw new Error("The importer could not establish one inventory location per shop.");
      }

      await tx.ecommerceFulfillmentLocation.createMany({
        data: payload.locations.map((definition) => {
          const store = storeByCode.get(definition.code);
          const location = store ? locationByStoreId.get(store.id) : undefined;
          if (!store || !location) throw new Error(`Missing fulfilment location for ${definition.code}.`);
          return {
            retailOrgId: retailOrg.id,
            storefrontStoreId: storefrontStore.id,
            storeId: store.id,
            inventoryLocationId: location.id,
            status: "ACTIVE",
            supportsPickup: true,
            supportsDelivery: true,
            routingPriority: definition.routingPriority,
          };
        }),
      });

      const departmentNames = [...new Set(payload.products.map((product) => product.department))];
      if (departmentNames.length !== 1) throw new Error("The workbook must contain one department.");
      const department = await tx.productDepartment.create({
        data: {
          retailOrgId: retailOrg.id,
          code: categoryCode(departmentNames[0]),
          name: departmentNames[0],
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: { id: true },
      });
      const categoryNames = [...new Set(payload.products.map((product) => product.category))].sort();
      await tx.productCategory.createMany({
        data: categoryNames.map((name, index) => ({
          retailOrgId: retailOrg.id,
          departmentId: department.id,
          code: categoryCode(name),
          name,
          sortOrder: index + 1,
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        })),
      });

      const priceList = await tx.priceList.create({
        data: {
          retailOrgId: retailOrg.id,
          code: "PRODUCTION-RETAIL",
          name: "Production Retail Prices",
          currencyCode: retailOrg.baseCurrencyCode,
          isDefault: true,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      const catalog = await tx.inventoryCatalog.create({
        data: {
          retailOrgId: retailOrg.id,
          code: "PRODUCTION-CATALOG",
          name: "S Majeed Phones Catalogue",
          description: `Products imported from ${payload.sourceWorkbook}; opening quantities intentionally set to zero.`,
          status: "ACTIVE",
          effectiveFrom: stockAsOf,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: { id: true },
      });
      await tx.inventoryCatalogStore.createMany({
        data: configuredStores.map((store) => ({
          retailOrgId: retailOrg.id,
          catalogId: catalog.id,
          storeId: store.id,
        })),
      });

      await tx.product.createMany({
        data: payload.products.map((product) => ({
          retailOrgId: retailOrg.id,
          baseUnitOfMeasureId: unit.id,
          uomScheduleId: schedule.id,
          code: product.code,
          sku: product.sku,
          name: product.name,
          shortName: product.shortName,
          description: product.notes,
          productType: "STOCK",
          department: product.department,
          category: product.category,
          subcategory: product.subcategory,
          brand: product.brand || product.manufacturer || null,
          unitOfMeasure: unit.code,
          notes: product.notes,
          taxable: true,
          trackInventory: true,
          isSerialized: false,
          trackExpiry: false,
          mustEnterPriceAtPos: product.mustEnterPriceAtPos,
          ecommercePublished: false,
          ecommerceFeatured: false,
          baseUnitPrice: product.price.toFixed(2),
          baseCostPrice: product.cost === null ? null : product.cost.toFixed(2),
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        })),
      });

      const createdProducts = await tx.product.findMany({
        where: { retailOrgId: retailOrg.id },
        select: { id: true, code: true },
      });
      const productByCode = new Map(createdProducts.map((product) => [product.code, product]));
      if (createdProducts.length !== payload.products.length) {
        throw new Error(`Created ${createdProducts.length} products, expected ${payload.products.length}.`);
      }

      await tx.priceListEntry.createMany({
        data: payload.products.map((product) => ({
          priceListId: priceList.id,
          productId: productByCode.get(product.code)!.id,
          unitPrice: product.price.toFixed(2),
        })),
      });
      await tx.inventoryCatalogProduct.createMany({
        data: payload.products.map((product, index) => ({
          retailOrgId: retailOrg.id,
          catalogId: catalog.id,
          productId: productByCode.get(product.code)!.id,
          sortOrder: index + 1,
        })),
      });
      await tx.storeProductSellingUnit.createMany({
        data: configuredStores.flatMap((store) =>
          payload.products.map((product) => ({
            configurationKey: `production-catalog:${store.code}:${product.code}:${unit.code}`,
            retailOrgId: retailOrg.id,
            storeId: store.id,
            productId: productByCode.get(product.code)!.id,
            productVariantId: null,
            unitOfMeasureId: unit.id,
            unitOfMeasureCodeSnapshot: unit.code,
            unitOfMeasureNameSnapshot: unit.name,
            conversionFactor: "1.000000",
            unitPrice: product.price.toFixed(2),
            barcode: null,
            isDefault: true,
            status: "ACTIVE",
          })),
        ),
      });

      await tx.securityLog.create({
        data: {
          retailOrgId: retailOrg.id,
          kind: "AUDIT",
          severity: "HIGH",
          category: "DATA_IMPORT",
          action: "PRODUCTION_CATALOGUE_IMPORTED_ZERO_STOCK",
          actorLabel: `Production catalogue import from ${payload.sourceWorkbook}`,
          targetType: "Inventory catalogue",
          targetRef: catalog.id,
          sourceNodeCode: enterpriseNode.code,
          message: `Imported ${payload.products.length} products into four shops with zero opening stock.`,
          detailsJson: JSON.stringify({
            sourceWorkbook: payload.sourceWorkbook,
            shops: targetStoreNames,
            openingStockRows: 0,
            openingQuantity: 0,
            ignoredWorkbookPlaceholder: "No Closing Stock",
            serialAndBatchPolicy: "Disabled: source workbook supplied no identifiers.",
          }),
        },
      });

      return {
        products: createdProducts.length,
        categories: categoryNames.length,
        stores: configuredStores.length,
        locations: locations.length,
        ledgerRows: 0,
      };
    },
    { maxWait: 60_000, timeout: 600_000 },
  );

  const [
    verifiedStores,
    warehouseCount,
    verifiedLocations,
    terminalCount,
    productCount,
    categoryCount,
    ledgerAggregate,
    serializedCount,
    batchCount,
    trackedProductCount,
    catalogStoreCount,
    sellingUnitCount,
    fulfillmentLocations,
    verifiedActiveUsers,
  ] = await Promise.all([
    prisma.store.findMany({
      where: { retailOrgId: retailOrg.id },
      select: { id: true, code: true, name: true, status: true, ecommerceEnabled: true },
    }),
    prisma.warehouse.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.inventoryLocation.findMany({
      where: { retailOrgId: retailOrg.id },
      select: { code: true, name: true, storeId: true, useForSalesDefault: true },
    }),
    prisma.terminal.count({ where: { retailOrgId: retailOrg.id, status: "ACTIVE" } }),
    prisma.product.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.productCategory.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.inventoryLedgerEntry.aggregate({
      where: { retailOrgId: retailOrg.id },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.inventorySerialUnit.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.inventoryBatch.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.product.count({
      where: { retailOrgId: retailOrg.id, OR: [{ isSerialized: true }, { trackExpiry: true }] },
    }),
    prisma.inventoryCatalogStore.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.storeProductSellingUnit.count({ where: { retailOrgId: retailOrg.id } }),
    prisma.ecommerceFulfillmentLocation.findMany({
      where: { retailOrgId: retailOrg.id },
      select: { storefrontStoreId: true, storeId: true, supportsPickup: true, supportsDelivery: true },
    }),
    prisma.retailUser.count({ where: { retailOrgId: retailOrg.id, accountStatus: "ACTIVE" } }),
  ]);

  const verifiedQuantity = Number(ledgerAggregate._sum.quantity ?? 0);
  const storefrontStore = verifiedStores.find((store) => store.code === "SHOP-B");
  const verificationPassed =
    sameValues(verifiedStores.map((store) => store.code), targetStoreCodes) &&
    sameValues(verifiedStores.map((store) => store.name), targetStoreNames) &&
    verifiedStores.every((store) => store.status === "ACTIVE") &&
    warehouseCount === 4 &&
    verifiedLocations.length === 4 &&
    verifiedLocations.every((location) => location.storeId && location.useForSalesDefault) &&
    terminalCount >= 4 &&
    productCount === 468 &&
    categoryCount === 6 &&
    ledgerAggregate._count._all === 0 &&
    verifiedQuantity === 0 &&
    serializedCount === 0 &&
    batchCount === 0 &&
    trackedProductCount === 0 &&
    catalogStoreCount === 4 &&
    sellingUnitCount === 468 * 4 &&
    Boolean(storefrontStore?.ecommerceEnabled) &&
    fulfillmentLocations.length === 4 &&
    fulfillmentLocations.every(
      (location) =>
        location.storefrontStoreId === storefrontStore?.id &&
        location.supportsPickup &&
        location.supportsDelivery,
    ) &&
    verifiedActiveUsers === activeUsers;

  if (!verificationPassed) {
    throw new Error("Post-import verification failed. Restore the verified pre-import backup.");
  }

  console.log(
    JSON.stringify(
      {
        mode: "EXECUTED",
        plan,
        purge: { totalDeleted: purge.totalDeleted, tables: purge.deletedCounts.length },
        imported: importResult,
        verified: {
          stores: verifiedStores.map((store) => ({ code: store.code, name: store.name })),
          warehouses: warehouseCount,
          inventoryLocations: verifiedLocations.map((location) => ({
            code: location.code,
            name: location.name,
          })),
          activeTerminals: terminalCount,
          products: productCount,
          categories: categoryCount,
          openingStockRows: ledgerAggregate._count._all,
          openingQuantity: verifiedQuantity,
          serialUnits: serializedCount,
          batches: batchCount,
          trackedProducts: trackedProductCount,
          catalogueStoreLinks: catalogStoreCount,
          storeSellingUnits: sellingUnitCount,
          fulfillmentLocations: fulfillmentLocations.length,
          activeUsers: verifiedActiveUsers,
        },
      },
      null,
      2,
    ),
  );
}

importPreparedData()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

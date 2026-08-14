import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  calculatePosBaseQuantity,
  normalizePosSellingUnits,
  resolvePosSellingUom,
} from "../packages/domain/src/pos-selling-uom";

const workspaceRoot = process.cwd();

function requireIncludes(relativePath: string, needles: string[]) {
  const source = readFileSync(path.join(workspaceRoot, relativePath), "utf8");

  for (const needle of needles) {
    assert.ok(
      source.includes(needle),
      `Alternate-UOM gate is missing ${JSON.stringify(needle)} in ${relativePath}.`,
    );
  }
}

assert.equal(calculatePosBaseQuantity(1, 24), 24);
assert.equal(calculatePosBaseQuantity(2.5, 0.5), 1.25);

assert.deepEqual(
  resolvePosSellingUom({
    baseUnitOfMeasure: "EA",
    baseUnitPrice: 3,
    quantity: 2,
    selectedUnitOfMeasure: "CTN",
    sellingUnits: [
      {
        unitOfMeasureCode: "EA",
        unitOfMeasureName: "Each",
        conversionFactor: 1,
        unitPrice: 3,
      },
      {
        unitOfMeasureCode: "CTN",
        unitOfMeasureName: "Carton",
        conversionFactor: 24,
        unitPrice: 60,
        barcode: "1234567890123",
        isDefault: true,
      },
    ],
  }),
  {
    sellingUnitOfMeasure: "CTN",
    sellingUnitOfMeasureName: "Carton",
    sellingQuantity: 2,
    baseUnitOfMeasure: "EA",
    uomConversionFactor: 24,
    baseQuantity: 48,
    unitPrice: 60,
    barcode: "1234567890123",
  },
);

assert.equal(
  resolvePosSellingUom({
    baseUnitOfMeasure: "KG",
    baseUnitPrice: 10,
    quantity: 1.25,
  }).baseQuantity,
  1.25,
);

assert.deepEqual(
  resolvePosSellingUom({
    baseUnitOfMeasure: "EA",
    baseUnitPrice: 3,
    quantity: 2,
    selectedUnitOfMeasure: "EA",
    sellingUnits: [
      {
        unitOfMeasureCode: "CTN",
        unitOfMeasureName: "Carton",
        conversionFactor: 24,
        unitPrice: 60,
        isDefault: true,
      },
    ],
  }),
  {
    sellingUnitOfMeasure: "EA",
    sellingUnitOfMeasureName: "EA",
    sellingQuantity: 2,
    baseUnitOfMeasure: "EA",
    uomConversionFactor: 1,
    baseQuantity: 2,
    unitPrice: 3,
    barcode: null,
  },
);

assert.deepEqual(
  normalizePosSellingUnits({
    baseUnitOfMeasure: "EA",
    sellingUnits: [
      {
        unitOfMeasureCode: "ctn",
        unitOfMeasureName: "Carton",
        conversionFactor: 24,
        unitPrice: 60,
        barcode: "CTN-24",
        isDefault: true,
      },
    ],
  }),
  [
    {
      unitOfMeasureCode: "CTN",
      unitOfMeasureName: "Carton",
      conversionFactor: 24,
      unitPrice: 60,
      barcode: "CTN-24",
      isDefault: true,
      allowFractionalSale: false,
      decimalPrecision: 0,
    },
  ],
);

assert.throws(
  () =>
    normalizePosSellingUnits({
      baseUnitOfMeasure: "EA",
      sellingUnits: [
        {
          unitOfMeasureCode: "PACK",
          unitOfMeasureName: "Pack",
          conversionFactor: 6,
          unitPrice: 15,
          isDefault: true,
        },
        {
          unitOfMeasureCode: "CTN",
          unitOfMeasureName: "Carton",
          conversionFactor: 24,
          unitPrice: 50,
          isDefault: true,
        },
      ],
    }),
  /only one selling unit/i,
);

assert.throws(
  () =>
    resolvePosSellingUom({
      baseUnitOfMeasure: "EA",
      baseUnitPrice: 3,
      quantity: 1,
      selectedUnitOfMeasure: "CTN",
      sellingUnits: [],
    }),
  /no longer configured/i,
);

assert.equal(
  resolvePosSellingUom({
    baseUnitOfMeasure: "EA",
    baseUnitPrice: 3,
    quantity: 1,
    scannedBarcode: "1234567890123",
    sellingUnits: [
      {
        unitOfMeasureCode: "CTN",
        unitOfMeasureName: "Carton",
        conversionFactor: 24,
        unitPrice: 60,
        barcode: "1234567890123",
      },
    ],
  }).baseQuantity,
  24,
);

assert.deepEqual(
  resolvePosSellingUom({
    baseUnitOfMeasure: "EA",
    baseUnitPrice: 3,
    quantity: 4,
  }),
  {
    sellingUnitOfMeasure: "EA",
    sellingUnitOfMeasureName: "EA",
    sellingQuantity: 4,
    baseUnitOfMeasure: "EA",
    uomConversionFactor: 1,
    baseQuantity: 4,
    unitPrice: 3,
    barcode: null,
  },
);

assert.throws(
  () =>
    resolvePosSellingUom({
      baseUnitOfMeasure: "KG",
      baseUnitPrice: 10,
      quantity: 1.25,
      selectedUnitOfMeasure: "KG",
      sellingUnits: [
        {
          unitOfMeasureCode: "KG",
          unitOfMeasureName: "Kilogram",
          conversionFactor: 1,
          unitPrice: 10,
          allowFractionalSale: false,
        },
      ],
    }),
  /does not permit fractional sales/i,
);

assert.throws(
  () =>
    resolvePosSellingUom({
      baseUnitOfMeasure: "EA",
      baseUnitPrice: 100,
      quantity: 1,
      selectedUnitOfMeasure: "HALF",
      serialized: true,
      sellingUnits: [
        {
          unitOfMeasureCode: "HALF",
          unitOfMeasureName: "Half unit",
          conversionFactor: 0.5,
          unitPrice: 50,
        },
      ],
    }),
  /whole number of base units/i,
);

requireIncludes("prisma/schema.prisma", [
  "model StoreProductSellingUnit",
  "sellingUnitOfMeasure",
  "uomConversionFactor",
  "baseQuantity",
]);
requireIncludes(
  "prisma/migrations/20260814_01_alternate_uom_selling/migration.sql",
  [
    "StoreProductSellingUnit",
    "PosTransactionLine",
    "SalesOrderLine",
    "[baseQuantity] = line.[quantity]",
  ],
);
requireIncludes("packages/sync-core/src/contracts.ts", [
  "sellingUnitOfMeasure?: string | null",
  "sellingUnits?: Array",
]);
requireIncludes(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
  ["sellingUnits: productSellingUnits.map", "conversionFactor:"],
);
requireIncludes(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  [
    "resolvePosSellingUom",
    "sellingUnitOfMeasure",
    "baseQuantity",
    "uomConversionFactor",
  ],
);
requireIncludes(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts",
  ["resolvePosSellingUom", "sellingUnitOfMeasure", "baseQuantity"],
);
requireIncludes("apps/store-desktop/src/main/offline/local-store-service.ts", [
  "requestedBaseQuantity",
  "sourceLine.uom_conversion_factor",
  "selling_unit_of_measure",
]);
requireIncludes("apps/store-desktop/src/main/mssql/mssql-store-service.ts", [
  "requestedBaseQuantity",
  "[base_quantity] = @baseQuantity",
  "@sellingUnitOfMeasure",
]);
requireIncludes("apps/store-desktop/src/main/postgres/postgres-store-service.ts", [
  "getBasketLineBySourceLine",
  "requestedBaseQuantity",
  "base_quantity = $3",
]);
requireIncludes("apps/store-desktop/src/renderer/modern-app.tsx", [
  "sellingUnitOfMeasure",
  "calculatePosBaseQuantity",
  "Selling units and prices",
]);

console.log("Alternate-UOM selling gate passed.");

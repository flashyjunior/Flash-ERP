import "dotenv/config";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  InventoryMovementType,
  PaymentMethod,
  PosShiftStatus,
  PosTransactionStatus,
  PosTransactionType,
  securityPermissionCatalog,
  SyncEventStatus,
  SyncNodeType,
  UserAccountStatus
} from "@flash-erp/domain";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before running the Flash ERP seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

const seedRetailDemoData = process.env.FLASH_ERP_SEED_RETAIL_DEMO_DATA === "true";

const permissionSeeds = securityPermissionCatalog.map((permission) => ({
  code: permission.code,
  name: permission.name,
  description: permission.description
}));

const demoCompanySettings = {
  legalName: "Flash ERP Group",
  tradingName: "Flash ERP",
  companyLogoUrl: "/uploads/company/1777391355107-8c1b492c-fc23-459b-864a-c475c24f4a95.png",
  loginBackgroundImageUrl: "/images/retail-login-bg.jpg"
};

function serializeJson(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function jsonArrayOrDbNull(value: string[] | null) {
  return serializeJson(value);
}

const storeBlueprints = [
  {
    storeCode: "accra-central",
    storeName: "Accra Central",
    storeMode: "ONLINE_DIRECT",
    warehouseCode: "accra-central-wh",
    warehouseName: "Accra Central Warehouse",
    locationCode: "accra-sales-floor",
    locationName: "Accra Sales Floor",
    terminalCode: "front-01",
    terminalName: "Front Counter 01",
    nodeCode: process.env.FLASH_ERP_STORE_NODE_CODE ?? "store-accra-central-01",
    nodeName: "Accra Central Store Desktop",
    heartbeatMinutesAgo: 2,
    checkpointMinutesAgo: 2,
    reportedHealth: "healthy",
    reportedUpstreamQueued: 0,
    reportedUpstreamInFlight: 0,
    reportedDownstreamQueued: 0,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 2,
    reportedLastLocalWriteMinutesAgo: 5
  },
  {
    storeCode: "tema-mall",
    storeName: "Tema Mall",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "tema-mall-wh",
    warehouseName: "Tema Mall Warehouse",
    locationCode: "tema-sales-floor",
    locationName: "Tema Sales Floor",
    terminalCode: "front-01",
    terminalName: "Mall Counter 01",
    nodeCode: "store-tema-mall-01",
    nodeName: "Tema Mall Store Desktop",
    heartbeatMinutesAgo: 43,
    checkpointMinutesAgo: 43,
    reportedHealth: "lagging",
    reportedUpstreamQueued: 2,
    reportedUpstreamInFlight: 1,
    reportedDownstreamQueued: 2,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 43,
    reportedLastLocalWriteMinutesAgo: 18
  },
  {
    storeCode: "kumasi-hub",
    storeName: "Kumasi Hub",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "kumasi-hub-wh",
    warehouseName: "Kumasi Hub Warehouse",
    locationCode: "kumasi-sales-floor",
    locationName: "Kumasi Sales Floor",
    terminalCode: "front-01",
    terminalName: "Hub Counter 01",
    nodeCode: "store-kumasi-hub-01",
    nodeName: "Kumasi Hub Store Desktop",
    heartbeatMinutesAgo: 180,
    checkpointMinutesAgo: 180,
    reportedHealth: "attention",
    reportedUpstreamQueued: 1,
    reportedUpstreamInFlight: 0,
    reportedDownstreamQueued: 1,
    reportedDeadLetter: 1,
    reportedLastSyncMinutesAgo: 180,
    reportedLastLocalWriteMinutesAgo: 47
  },
  {
    storeCode: "osu-high-street",
    storeName: "Osu High Street",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "osu-high-street-wh",
    warehouseName: "Osu High Street Warehouse",
    locationCode: "osu-sales-floor",
    locationName: "Osu Sales Floor",
    terminalCode: "front-01",
    terminalName: "High Street Counter 01",
    nodeCode: "store-osu-high-street-01",
    nodeName: "Osu High Street Store Desktop",
    heartbeatMinutesAgo: 6,
    checkpointMinutesAgo: 6,
    reportedHealth: "healthy",
    reportedUpstreamQueued: 0,
    reportedUpstreamInFlight: 0,
    reportedDownstreamQueued: 1,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 6,
    reportedLastLocalWriteMinutesAgo: 9
  },
  {
    storeCode: "east-legon-market",
    storeName: "East Legon Market",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "east-legon-market-wh",
    warehouseName: "East Legon Market Warehouse",
    locationCode: "east-legon-sales-floor",
    locationName: "East Legon Sales Floor",
    terminalCode: "front-01",
    terminalName: "Market Counter 01",
    nodeCode: "store-east-legon-market-01",
    nodeName: "East Legon Market Store Desktop",
    heartbeatMinutesAgo: 14,
    checkpointMinutesAgo: 14,
    reportedHealth: "healthy",
    reportedUpstreamQueued: 1,
    reportedUpstreamInFlight: 0,
    reportedDownstreamQueued: 0,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 14,
    reportedLastLocalWriteMinutesAgo: 4
  },
  {
    storeCode: "takoradi-market-circle",
    storeName: "Takoradi Market Circle",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "takoradi-market-circle-wh",
    warehouseName: "Takoradi Market Circle Warehouse",
    locationCode: "takoradi-sales-floor",
    locationName: "Takoradi Sales Floor",
    terminalCode: "front-01",
    terminalName: "Market Circle Counter 01",
    nodeCode: "store-takoradi-market-circle-01",
    nodeName: "Takoradi Market Circle Store Desktop",
    heartbeatMinutesAgo: 27,
    checkpointMinutesAgo: 27,
    reportedHealth: "lagging",
    reportedUpstreamQueued: 3,
    reportedUpstreamInFlight: 1,
    reportedDownstreamQueued: 2,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 27,
    reportedLastLocalWriteMinutesAgo: 11
  },
  {
    storeCode: "cape-coast-castle-road",
    storeName: "Cape Coast Castle Road",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "cape-coast-castle-road-wh",
    warehouseName: "Cape Coast Castle Road Warehouse",
    locationCode: "cape-coast-sales-floor",
    locationName: "Cape Coast Sales Floor",
    terminalCode: "front-01",
    terminalName: "Castle Road Counter 01",
    nodeCode: "store-cape-coast-castle-road-01",
    nodeName: "Cape Coast Castle Road Store Desktop",
    heartbeatMinutesAgo: 52,
    checkpointMinutesAgo: 52,
    reportedHealth: "lagging",
    reportedUpstreamQueued: 4,
    reportedUpstreamInFlight: 0,
    reportedDownstreamQueued: 3,
    reportedDeadLetter: 0,
    reportedLastSyncMinutesAgo: 52,
    reportedLastLocalWriteMinutesAgo: 25
  },
  {
    storeCode: "tamale-retail-park",
    storeName: "Tamale Retail Park",
    storeMode: "OFFLINE_FIRST",
    warehouseCode: "tamale-retail-park-wh",
    warehouseName: "Tamale Retail Park Warehouse",
    locationCode: "tamale-sales-floor",
    locationName: "Tamale Sales Floor",
    terminalCode: "front-01",
    terminalName: "Retail Park Counter 01",
    nodeCode: "store-tamale-retail-park-01",
    nodeName: "Tamale Retail Park Store Desktop",
    heartbeatMinutesAgo: 96,
    checkpointMinutesAgo: 96,
    reportedHealth: "attention",
    reportedUpstreamQueued: 7,
    reportedUpstreamInFlight: 1,
    reportedDownstreamQueued: 5,
    reportedDeadLetter: 1,
    reportedLastSyncMinutesAgo: 96,
    reportedLastLocalWriteMinutesAgo: 38
  }
] as const;

const catalogProductSeeds = [
  {
    code: "FLASH-COLA-50CL",
    sku: "FLASH-COLA-50CL",
    name: "Flash Cola 50cl",
    baseUnitPrice: "2.50",
    baseCostPrice: "1.40",
    barcode: "0123456789012",
    openingQuantity: "42",
    minStockLevel: "18",
    reorderPoint: "24",
    reorderQuantity: "96",
    safetyStockLevel: "20"
  },
  {
    code: "FLASH-WATER-75CL",
    sku: "FLASH-WATER-75CL",
    name: "Flash Water 75cl",
    baseUnitPrice: "1.80",
    baseCostPrice: "0.90",
    barcode: "0123456789013",
    openingQuantity: "58",
    minStockLevel: "28",
    reorderPoint: "36",
    reorderQuantity: "144",
    safetyStockLevel: "30"
  },
  {
    code: "FLASH-BISCUIT-CHOCO",
    sku: "FLASH-BISCUIT-CHOCO",
    name: "Flash Choco Biscuit",
    baseUnitPrice: "3.20",
    baseCostPrice: "1.95",
    barcode: "0123456789014",
    openingQuantity: "34",
    minStockLevel: "16",
    reorderPoint: "22",
    reorderQuantity: "80",
    safetyStockLevel: "18"
  },
  {
    code: "FLASH-RICE-2KG",
    sku: "FLASH-RICE-2KG",
    name: "Flash Premium Rice 2kg",
    baseUnitPrice: "14.90",
    baseCostPrice: "10.80",
    barcode: "0123456789015",
    openingQuantity: "16",
    minStockLevel: "10",
    reorderPoint: "14",
    reorderQuantity: "40",
    safetyStockLevel: "12"
  }
] as const;

const fuelCatalogProductSeeds = [
  {
    code: "AGO",
    sku: "AGO",
    name: "Automotive Gas Oil",
    shortName: "AGO",
    category: "DIESEL"
  },
  {
    code: "KERO",
    sku: "KERO",
    name: "Kerosene",
    shortName: "Kerosene",
    category: "KEROSENE"
  },
  {
    code: "LPG",
    sku: "LPG",
    name: "Liquefied Petroleum Gas",
    shortName: "LPG",
    category: "LPG"
  },
  {
    code: "PMS",
    sku: "PMS",
    name: "Premium Motor Spirit",
    shortName: "PMS",
    category: "PETROL"
  }
] as const;

const tenderMethodSeeds = [
  {
    code: "CASH",
    name: "Cash",
    paymentMethod: PaymentMethod.CASH,
    requiresReference: false,
    allowChange: true,
    allowOpenCashDrawer: true,
    sortOrder: 10
  },
  {
    code: "VISA-MASTERCARD",
    name: "Visa / Mastercard",
    paymentMethod: PaymentMethod.CARD,
    requiresReference: true,
    allowChange: false,
    allowOpenCashDrawer: false,
    sortOrder: 20
  },
  {
    code: "MOMO",
    name: "Mobile Money",
    paymentMethod: PaymentMethod.MOBILE_MONEY,
    requiresReference: true,
    allowChange: false,
    allowOpenCashDrawer: false,
    sortOrder: 30
  },
  {
    code: "BANK-TRANSFER",
    name: "Bank Transfer",
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    requiresReference: true,
    allowChange: false,
    allowOpenCashDrawer: false,
    sortOrder: 40
  },
  {
    code: "CUSTOMER-CREDIT",
    name: "Customer Credit",
    paymentMethod: PaymentMethod.STORE_CREDIT,
    requiresReference: false,
    allowChange: false,
    allowOpenCashDrawer: false,
    sortOrder: 50
  }
] as const;

const fuelStationSeeds = [
  {
    stationCode: "FS-ACCRA-01",
    stationName: "Accra North Filling Station",
    customerNo: "FST-ACCRA-001",
    customerName: "Accra North Filling Station",
    phone: "+233302100110",
    city: "Accra",
    location: "North Industrial Area",
    gpsLatitude: "5.6051000",
    gpsLongitude: "-0.2012000",
    creditLimitAmount: "100000.00"
  },
  {
    stationCode: "FS-TEMA-01",
    stationName: "Tema Harbour Filling Station",
    customerNo: "FST-TEMA-001",
    customerName: "Tema Harbour Filling Station",
    phone: "+233303200220",
    city: "Tema",
    location: "Harbour Road",
    gpsLatitude: "5.6698000",
    gpsLongitude: "-0.0166000",
    creditLimitAmount: "85000.00"
  },
  {
    stationCode: "FS-KUMASI-01",
    stationName: "Kumasi Depot Filling Station",
    customerNo: "FST-KUMASI-001",
    customerName: "Kumasi Depot Filling Station",
    phone: "+233322300330",
    city: "Kumasi",
    location: "Asafo",
    gpsLatitude: "6.6885000",
    gpsLongitude: "-1.6244000",
    creditLimitAmount: "75000.00"
  }
] as const;

const fuelTankSeeds = [
  {
    code: "TANK-PMS-01",
    name: "PMS Tank 01",
    productCode: "PMS",
    storeIndex: 0,
    capacityQuantity: "45000.000",
    safeCapacityQuantity: "40500.000",
    reorderLevelQuantity: "9000.000"
  },
  {
    code: "TANK-AGO-01",
    name: "AGO Tank 01",
    productCode: "AGO",
    storeIndex: 0,
    capacityQuantity: "60000.000",
    safeCapacityQuantity: "54000.000",
    reorderLevelQuantity: "12000.000"
  },
  {
    code: "TANK-KERO-01",
    name: "Kerosene Tank 01",
    productCode: "KERO",
    storeIndex: 1,
    capacityQuantity: "30000.000",
    safeCapacityQuantity: "27000.000",
    reorderLevelQuantity: "6000.000"
  },
  {
    code: "TANK-LPG-01",
    name: "LPG Tank 01",
    productCode: "LPG",
    storeIndex: 1,
    capacityQuantity: "25000.000",
    safeCapacityQuantity: "22500.000",
    reorderLevelQuantity: "5000.000"
  }
] as const;

const supplierSeeds = [
  {
    supplierNo: "SUP-DRINKS-001",
    name: "Golden Coast Beverages",
    contactName: "Nana Boateng",
    phone: "+233302000111",
    email: "orders@goldencoast.local",
    city: "Accra",
    countryCode: "GH",
    leadTimeDays: 5,
    productCodes: ["FLASH-COLA-50CL", "FLASH-WATER-75CL"]
  },
  {
    supplierNo: "SUP-PANTRY-001",
    name: "Northern Pantry Supplies",
    contactName: "Aisha Yakubu",
    phone: "+233372000222",
    email: "sales@northernpantry.local",
    city: "Tamale",
    countryCode: "GH",
    leadTimeDays: 8,
    productCodes: ["FLASH-BISCUIT-CHOCO", "FLASH-RICE-2KG"]
  }
] as const;

function minutesAgo(value: number) {
  return new Date(Date.now() - value * 60_000);
}

function daysAgo(value: number, hour = 12, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - value);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function toMoney(value: number) {
  return value.toFixed(2);
}

function toQuantity(value: number) {
  return value.toFixed(3);
}

async function ensureUnitOfMeasureSeedDefaults(retailOrgId: string, nodeCode: string) {
  const eachUnit = await prisma.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "EA"
      }
    },
    update: {
      name: "Each",
      description: "Each/count unit for discrete stock items.",
      decimalPrecision: 0,
      allowFractionalSale: false,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "EA",
      name: "Each",
      description: "Each/count unit for discrete stock items.",
      decimalPrecision: 0,
      allowFractionalSale: false,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  const literUnit = await prisma.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "LTR"
      }
    },
    update: {
      name: "Litre",
      description: "Base fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "LTR",
      name: "Litre",
      description: "Base fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  const kilolitreUnit = await prisma.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "KL"
      }
    },
    update: {
      name: "Kilolitre",
      description: "Bulk fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "KL",
      name: "Kilolitre",
      description: "Bulk fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  const eachSchedule = await prisma.unitOfMeasureSchedule.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "EACH"
      }
    },
    update: {
      name: "Each",
      description: "Default count schedule for discrete stock items.",
      baseUnitOfMeasureId: eachUnit.id,
      isDefaultForStock: false,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "EACH",
      name: "Each",
      description: "Default count schedule for discrete stock items.",
      baseUnitOfMeasureId: eachUnit.id,
      isDefaultForStock: false,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  const fuelVolumeSchedule = await prisma.unitOfMeasureSchedule.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "FUEL-VOLUME"
      }
    },
    update: {
      name: "Fuel Volume",
      description: "Fuel volume schedule for pump, tank, sale, and delivery quantities.",
      baseUnitOfMeasureId: literUnit.id,
      isDefaultForStock: true,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "FUEL-VOLUME",
      name: "Fuel Volume",
      description: "Fuel volume schedule for pump, tank, sale, and delivery quantities.",
      baseUnitOfMeasureId: literUnit.id,
      isDefaultForStock: true,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  for (const line of [
    { scheduleId: eachSchedule.id, unitOfMeasureId: eachUnit.id, conversionFactor: "1.000000", isBaseUnit: true, sortOrder: 10 },
    { scheduleId: fuelVolumeSchedule.id, unitOfMeasureId: literUnit.id, conversionFactor: "1.000000", isBaseUnit: true, sortOrder: 10 },
    { scheduleId: fuelVolumeSchedule.id, unitOfMeasureId: kilolitreUnit.id, conversionFactor: "1000.000000", isBaseUnit: false, sortOrder: 20 }
  ]) {
    await prisma.unitOfMeasureScheduleLine.upsert({
      where: {
        scheduleId_unitOfMeasureId: {
          scheduleId: line.scheduleId,
          unitOfMeasureId: line.unitOfMeasureId
        }
      },
      update: {
        conversionFactor: line.conversionFactor,
        isBaseUnit: line.isBaseUnit,
        allowSale: true,
        allowPurchase: true,
        sortOrder: line.sortOrder
      },
      create: {
        scheduleId: line.scheduleId,
        unitOfMeasureId: line.unitOfMeasureId,
        conversionFactor: line.conversionFactor,
        isBaseUnit: line.isBaseUnit,
        allowSale: true,
        allowPurchase: true,
        sortOrder: line.sortOrder
      }
    });
  }

  return {
    eachUnitId: eachUnit.id,
    eachScheduleId: eachSchedule.id,
    literUnitId: literUnit.id,
    fuelVolumeScheduleId: fuelVolumeSchedule.id
  };
}

function fuelCategoryName(code: string) {
  const labels: Record<string, string> = {
    DIESEL: "Diesel",
    KEROSENE: "Kerosene",
    LPG: "Liquefied Petroleum Gas",
    PETROL: "Petrol"
  };

  return labels[code] ?? code;
}

async function ensureFuelProductHierarchySeedDefaults(retailOrgId: string, nodeCode: string) {
  const fuelDepartment = await prisma.productDepartment.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "FUEL"
      }
    },
    update: {
      name: "Fuel",
      description: "Fuel and petroleum products.",
      sortOrder: 10,
      status: "ACTIVE",
      lastModifiedByNodeCode: nodeCode,
      deletedAt: null
    },
    create: {
      retailOrgId,
      code: "FUEL",
      name: "Fuel",
      description: "Fuel and petroleum products.",
      sortOrder: 10,
      status: "ACTIVE",
      originNodeCode: nodeCode,
      lastModifiedByNodeCode: nodeCode
    },
    select: {
      id: true
    }
  });

  const categoryCodes = Array.from(
    new Set(fuelCatalogProductSeeds.map((seed) => seed.category))
  );

  for (const [index, categoryCode] of categoryCodes.entries()) {
    await prisma.productCategory.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId,
          code: categoryCode
        }
      },
      update: {
        departmentId: fuelDepartment.id,
        name: fuelCategoryName(categoryCode),
        description: `${fuelCategoryName(categoryCode)} fuel category.`,
        sortOrder: (index + 1) * 10,
        status: "ACTIVE",
        lastModifiedByNodeCode: nodeCode,
        deletedAt: null
      },
      create: {
        retailOrgId,
        departmentId: fuelDepartment.id,
        code: categoryCode,
        name: fuelCategoryName(categoryCode),
        description: `${fuelCategoryName(categoryCode)} fuel category.`,
        sortOrder: (index + 1) * 10,
        status: "ACTIVE",
        originNodeCode: nodeCode,
        lastModifiedByNodeCode: nodeCode
      }
    });
  }
}

async function ensureFuelCatalogSeedDefaults(
  retailOrgId: string,
  nodeCode: string,
  uomDefaults: Awaited<ReturnType<typeof ensureUnitOfMeasureSeedDefaults>>
) {
  await ensureFuelProductHierarchySeedDefaults(retailOrgId, nodeCode);

  const primaryCompany = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId,
      status: "ACTIVE"
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  for (const seed of fuelCatalogProductSeeds) {
    await prisma.product.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId,
          code: seed.code
        }
      },
      update: {
        sku: seed.sku,
        name: seed.name,
        shortName: seed.shortName,
        productType: "STOCK",
        department: "FUEL",
        category: seed.category,
        unitOfMeasure: "LTR",
        baseUnitOfMeasureId: uomDefaults.literUnitId,
        uomScheduleId: uomDefaults.fuelVolumeScheduleId,
        taxable: true,
        trackInventory: true,
        status: "ACTIVE",
        originNodeCode: nodeCode,
        lastModifiedByNodeCode: nodeCode,
        deletedAt: null
      },
      create: {
        retailOrgId,
        code: seed.code,
        sku: seed.sku,
        name: seed.name,
        shortName: seed.shortName,
        productType: "STOCK",
        department: "FUEL",
        category: seed.category,
        unitOfMeasure: "LTR",
        baseUnitOfMeasureId: uomDefaults.literUnitId,
        uomScheduleId: uomDefaults.fuelVolumeScheduleId,
        taxable: true,
        trackInventory: true,
        baseUnitPrice: "0.00",
        baseCostPrice: "0.00",
        status: "ACTIVE",
        originNodeCode: nodeCode,
        lastModifiedByNodeCode: nodeCode
      }
    });

    if (primaryCompany) {
      await prisma.erpProductProfile.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId,
            code: seed.code
          }
        },
        update: {
          companyId: primaryCompany.id,
          name: seed.name,
          productFamily: "FUEL",
          defaultUomCode: "LTR",
          trackingMode: "BULK_LIQUID",
          status: "ACTIVE"
        },
        create: {
          retailOrgId,
          companyId: primaryCompany.id,
          code: seed.code,
          name: seed.name,
          productFamily: "FUEL",
          defaultUomCode: "LTR",
          trackingMode: "BULK_LIQUID",
          status: "ACTIVE"
        }
      });
    }
  }
}

async function mapTenderSeedsToCashbookAccounts(retailOrgId: string) {
  const primaryCompany = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId,
      status: "ACTIVE"
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  if (!primaryCompany) {
    return;
  }

  const cashbookAccounts = await prisma.erpCashbookAccount.findMany({
    where: {
      companyId: primaryCompany.id,
      status: "ACTIVE",
      accountType: {
        in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
      }
    },
    select: {
      id: true,
      code: true,
      accountType: true
    }
  });
  const accountByCode = new Map(cashbookAccounts.map((account) => [account.code, account] as const));
  const accountByType = new Map(cashbookAccounts.map((account) => [account.accountType, account] as const));

  for (const seed of tenderMethodSeeds) {
    if (seed.paymentMethod === PaymentMethod.STORE_CREDIT) {
      await prisma.tenderMethod.updateMany({
        where: {
          retailOrgId,
          code: seed.code
        },
        data: {
          cashbookAccountId: null,
          requiresReference: seed.requiresReference
        }
      });
      continue;
    }

    const account =
      seed.paymentMethod === PaymentMethod.CASH
        ? accountByCode.get("MAIN-CASH") ?? accountByType.get("CASH") ?? null
        : seed.paymentMethod === PaymentMethod.BANK_TRANSFER
          ? accountByCode.get("MAIN-BANK") ?? accountByType.get("BANK") ?? null
          : seed.paymentMethod === PaymentMethod.MOBILE_MONEY
            ? accountByCode.get("MAIN-MOMO") ?? accountByType.get("MOBILE_MONEY") ?? null
            : seed.paymentMethod === PaymentMethod.CARD
              ? accountByType.get("CARD_CLEARING") ?? accountByCode.get("MAIN-BANK") ?? accountByType.get("BANK") ?? null
              : null;

    await prisma.tenderMethod.updateMany({
      where: {
        retailOrgId,
        code: seed.code
      },
      data: account
        ? {
            cashbookAccountId: account.id,
            requiresReference: seed.requiresReference
          }
        : {
            requiresReference: seed.requiresReference
          }
    });
  }
}

async function ensureFuelMasterDataSeedDefaults(
  retailOrgId: string,
  nodeCode: string,
  uomDefaults: Awaited<ReturnType<typeof ensureUnitOfMeasureSeedDefaults>>,
  storesWithNodes: Array<{
    store: { id: string; code: string; name: string };
    salesLocation: { id: string; code: string; name: string; locationType: string | null };
  }>
) {
  const primaryCompany = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId,
      status: "ACTIVE"
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  if (!primaryCompany) {
    return;
  }

  await ensureFuelCatalogSeedDefaults(retailOrgId, nodeCode, uomDefaults);

  const postingProfile = await prisma.erpArApPostingProfile.findFirst({
    where: {
      companyId: primaryCompany.id,
      profileType: "CUSTOMER",
      status: "ACTIVE"
    },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  const siteByStoreIndex = new Map<number, { id: string; code: string }>();

  for (const [index, entry] of storesWithNodes.slice(0, 3).entries()) {
    const operatingSite = await prisma.erpOperatingSite.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId,
          code: entry.salesLocation.code
        }
      },
      update: {
        companyId: primaryCompany.id,
        name: entry.store.name,
        siteType: entry.salesLocation.locationType ?? "INVENTORY_LOCATION",
        location: entry.salesLocation.name,
        status: "ACTIVE"
      },
      create: {
        retailOrgId,
        companyId: primaryCompany.id,
        code: entry.salesLocation.code,
        name: entry.store.name,
        siteType: entry.salesLocation.locationType ?? "INVENTORY_LOCATION",
        location: entry.salesLocation.name,
        status: "ACTIVE"
      },
      select: {
        id: true,
        code: true
      }
    });

    siteByStoreIndex.set(index, operatingSite);
  }

  for (const entry of storesWithNodes) {
    const storeDimensionCode = entry.store.code.trim().toUpperCase();

    for (const dimensionType of ["OPERATING_UNIT", "COST_CENTER"]) {
      await prisma.erpFinanceDimension.upsert({
        where: {
          companyId_dimensionType_code: {
            companyId: primaryCompany.id,
            dimensionType,
            code: storeDimensionCode
          }
        },
        update: {
          name: entry.store.name,
          description:
            dimensionType === "COST_CENTER"
              ? `Shop P&L cost center for ${entry.store.name}.`
              : `Shop operating unit for ${entry.store.name}.`,
          status: "ACTIVE"
        },
        create: {
          retailOrgId,
          companyId: primaryCompany.id,
          dimensionType,
          code: storeDimensionCode,
          name: entry.store.name,
          description:
            dimensionType === "COST_CENTER"
              ? `Shop P&L cost center for ${entry.store.name}.`
              : `Shop operating unit for ${entry.store.name}.`,
          status: "ACTIVE"
        }
      });
    }
  }

  const fuelProductProfiles = await prisma.erpProductProfile.findMany({
    where: {
      retailOrgId,
      companyId: primaryCompany.id,
      code: {
        in: fuelCatalogProductSeeds.map((seed) => seed.code)
      },
      status: "ACTIVE"
    },
    select: {
      id: true,
      code: true,
      defaultUomCode: true
    }
  });
  const profileByCode = new Map(fuelProductProfiles.map((profile) => [profile.code, profile] as const));

  for (const [index, seed] of fuelStationSeeds.entries()) {
    const homeStore = storesWithNodes[index]?.store ?? storesWithNodes[0]?.store ?? null;
    const homeLocation = storesWithNodes[index]?.salesLocation ?? storesWithNodes[0]?.salesLocation ?? null;
    const customer = await prisma.customer.upsert({
      where: {
        retailOrgId_customerNo: {
          retailOrgId,
          customerNo: seed.customerNo
        }
      },
      update: {
        storeId: homeStore?.id ?? null,
        customerType: "CORPORATE",
        fullName: seed.customerName,
        phone: seed.phone,
        addressLine1: seed.location,
        city: seed.city,
        countryCode: "GH",
        allowCreditSales: true,
        creditLimitAmount: seed.creditLimitAmount,
        status: "ACTIVE",
        originNodeCode: nodeCode,
        lastModifiedByNodeCode: nodeCode,
        deletedAt: null
      },
      create: {
        retailOrgId,
        storeId: homeStore?.id ?? null,
        customerNo: seed.customerNo,
        customerType: "CORPORATE",
        fullName: seed.customerName,
        phone: seed.phone,
        addressLine1: seed.location,
        city: seed.city,
        countryCode: "GH",
        allowCreditSales: true,
        creditLimitAmount: seed.creditLimitAmount,
        receivableBalanceAmount: "0.00",
        status: "ACTIVE",
        originNodeCode: nodeCode,
        lastModifiedByNodeCode: nodeCode
      }
    });

    await prisma.erpPartyAccountingProfile.upsert({
      where: {
        companyId_partyType_partyNo: {
          companyId: primaryCompany.id,
          partyType: "CUSTOMER",
          partyNo: customer.customerNo
        }
      },
      update: {
        partyName: customer.fullName,
        customerId: customer.id,
        postingProfileId: postingProfile?.id ?? null,
        creditTermsCode: "NET-30",
        paymentTermsCode: "NET-30",
        creditLimitAmount: seed.creditLimitAmount,
        allowCredit: true,
        creditStatus: "ACTIVE",
        status: "ACTIVE"
      },
      create: {
        retailOrgId,
        companyId: primaryCompany.id,
        partyType: "CUSTOMER",
        partyNo: customer.customerNo,
        partyName: customer.fullName,
        customerId: customer.id,
        postingProfileId: postingProfile?.id ?? null,
        creditTermsCode: "NET-30",
        paymentTermsCode: "NET-30",
        creditLimitAmount: seed.creditLimitAmount,
        allowCredit: true,
        creditStatus: "ACTIVE",
        status: "ACTIVE"
      }
    });

    await prisma.erpFuelStation.upsert({
      where: {
        companyId_stationCode: {
          companyId: primaryCompany.id,
          stationCode: seed.stationCode
        }
      },
      update: {
        customerId: customer.id,
        storeId: homeStore?.id ?? null,
        inventoryLocationId: homeLocation?.id ?? null,
        operatingSiteId: null,
        stationName: seed.stationName,
        stationType: "CUSTOMER",
        location: seed.location,
        city: seed.city,
        gpsLatitude: seed.gpsLatitude,
        gpsLongitude: seed.gpsLongitude,
        contactName: seed.stationName,
        phone: seed.phone,
        paymentTermsCode: "NET-30",
        creditLimitAmount: seed.creditLimitAmount,
        status: "ACTIVE",
        notes: "Seeded filling station for Fuel Operations customer-credit workflows."
      },
      create: {
        retailOrgId,
        companyId: primaryCompany.id,
        customerId: customer.id,
        storeId: homeStore?.id ?? null,
        inventoryLocationId: homeLocation?.id ?? null,
        stationCode: seed.stationCode,
        stationName: seed.stationName,
        stationType: "CUSTOMER",
        location: seed.location,
        city: seed.city,
        gpsLatitude: seed.gpsLatitude,
        gpsLongitude: seed.gpsLongitude,
        contactName: seed.stationName,
        phone: seed.phone,
        paymentTermsCode: "NET-30",
        creditLimitAmount: seed.creditLimitAmount,
        status: "ACTIVE",
        notes: "Seeded filling station for Fuel Operations customer-credit workflows."
      }
    });
  }

  for (const seed of fuelTankSeeds) {
    const operatingSite = siteByStoreIndex.get(seed.storeIndex) ?? siteByStoreIndex.get(0);
    const productProfile = profileByCode.get(seed.productCode);

    if (!operatingSite || !productProfile) {
      continue;
    }

    await prisma.erpFuelTank.upsert({
      where: {
        companyId_code: {
          companyId: primaryCompany.id,
          code: seed.code
        }
      },
      update: {
        operatingSiteId: operatingSite.id,
        productProfileId: productProfile.id,
        name: seed.name,
        tankType: "UNDERGROUND",
        capacityQuantity: seed.capacityQuantity,
        safeCapacityQuantity: seed.safeCapacityQuantity,
        reorderLevelQuantity: seed.reorderLevelQuantity,
        uomCode: productProfile.defaultUomCode,
        openingQuantity: "0.000",
        currentBookQuantity: "0.000",
        status: "ACTIVE",
        notes: "Seeded fuel tank; stock quantity should come through inventory receipts."
      },
      create: {
        retailOrgId,
        companyId: primaryCompany.id,
        operatingSiteId: operatingSite.id,
        productProfileId: productProfile.id,
        code: seed.code,
        name: seed.name,
        tankType: "UNDERGROUND",
        capacityQuantity: seed.capacityQuantity,
        safeCapacityQuantity: seed.safeCapacityQuantity,
        reorderLevelQuantity: seed.reorderLevelQuantity,
        uomCode: productProfile.defaultUomCode,
        openingQuantity: "0.000",
        currentBookQuantity: "0.000",
        status: "ACTIVE",
        notes: "Seeded fuel tank; stock quantity should come through inventory receipts."
      }
    });
  }
}

async function upsertPermissionSeeds() {
  for (const permission of permissionSeeds) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: permission,
      create: permission
    });
  }
}

async function ensureRolePermissions(roleId: string, permissionCodes: string[]) {
  const permissions = await prisma.permission.findMany({
    where: {
      code: {
        in: permissionCodes
      }
    }
  });

  await prisma.rolePermission.deleteMany({
    where: { roleId }
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId,
      permissionId: permission.id
    }))
  });
}

async function main() {
  await upsertPermissionSeeds();

  const retailOrg = await prisma.retailOrg.upsert({
    where: { code: "flash-erp" },
    update: {
      name: "Flash ERP Group",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "USD",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      companySettingsJson: serializeJson(demoCompanySettings)
    },
    create: {
      code: "flash-erp",
      name: "Flash ERP Group",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "USD",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      companySettingsJson: serializeJson(demoCompanySettings)
    }
  });

  const enterpriseNode = await prisma.syncNode.upsert({
    where: { code: "enterprise-primary" },
    update: {
      name: "Enterprise Primary",
      lastHeartbeatAt: new Date()
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "enterprise-primary",
      name: "Enterprise Primary",
      nodeType: SyncNodeType.ENTERPRISE,
      direction: "BIDIRECTIONAL",
      isPrimary: true,
      lastHeartbeatAt: new Date()
    }
  });

  const priceList = await prisma.priceList.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "default-sell"
      }
    },
    update: {
      name: "Default Sell Price"
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "default-sell",
      name: "Default Sell Price",
      currencyCode: retailOrg.baseCurrencyCode,
      isDefault: true
    }
  });

  const uomDefaults = await ensureUnitOfMeasureSeedDefaults(retailOrg.id, enterpriseNode.code);
  await ensureFuelCatalogSeedDefaults(retailOrg.id, enterpriseNode.code, uomDefaults);

  const tenderMethodByCode = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      paymentMethod: PaymentMethod;
    }
  >();

  for (const seed of tenderMethodSeeds) {
    const tenderMethod = await prisma.tenderMethod.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        code: seed.code,
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      }
    });

    tenderMethodByCode.set(seed.code, {
      id: tenderMethod.id,
      code: tenderMethod.code,
      name: tenderMethod.name,
      paymentMethod: tenderMethod.paymentMethod
    });
  }

  await mapTenderSeedsToCashbookAccounts(retailOrg.id);

  const legacyProduct = await prisma.product.findFirst({
    where: {
      retailOrgId: retailOrg.id,
      code: "SKU-1001"
    },
    select: {
      id: true
    }
  });

  if (legacyProduct) {
    await prisma.inventoryLedgerEntry.deleteMany({
      where: {
        productId: legacyProduct.id,
        referenceType: "seed"
      }
    });
    await prisma.barcode.deleteMany({
      where: {
        productId: legacyProduct.id
      }
    });
    await prisma.priceListEntry.deleteMany({
      where: {
        productId: legacyProduct.id
      }
    });
    await prisma.product.delete({
      where: {
        id: legacyProduct.id
      }
    });
  }

  const catalogProductByCode = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      barcode: string;
      baseUnitPrice: string;
      baseCostPrice: string;
    }
  >();
  const activeCatalogProductSeeds = seedRetailDemoData ? catalogProductSeeds : [];

  for (const seed of activeCatalogProductSeeds) {
    const product = await prisma.product.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        sku: seed.sku,
        name: seed.name,
        baseUnitPrice: seed.baseUnitPrice,
        baseCostPrice: seed.baseCostPrice,
        minStockLevel: seed.minStockLevel,
        reorderPoint: seed.reorderPoint,
        reorderQuantity: seed.reorderQuantity,
        safetyStockLevel: seed.safetyStockLevel,
        originNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        code: seed.code,
        sku: seed.sku,
        name: seed.name,
        baseUnitPrice: seed.baseUnitPrice,
        baseCostPrice: seed.baseCostPrice,
        minStockLevel: seed.minStockLevel,
        reorderPoint: seed.reorderPoint,
        reorderQuantity: seed.reorderQuantity,
        safetyStockLevel: seed.safetyStockLevel,
        originNodeCode: enterpriseNode.code
      }
    });

    await prisma.barcode.upsert({
      where: {
        code: seed.barcode
      },
      update: {
        productId: product.id
      },
      create: {
        productId: product.id,
        code: seed.barcode
      }
    });

    await prisma.priceListEntry.upsert({
      where: {
        priceListId_productId: {
          priceListId: priceList.id,
          productId: product.id
        }
      },
      update: {
        unitPrice: seed.baseUnitPrice
      },
      create: {
        priceListId: priceList.id,
        productId: product.id,
        unitPrice: seed.baseUnitPrice
      }
    });

    catalogProductByCode.set(seed.code, {
      id: product.id,
      code: product.code,
      name: product.name,
      barcode: seed.barcode,
      baseUnitPrice: seed.baseUnitPrice,
      baseCostPrice: seed.baseCostPrice
    });
  }

  const promotionSeeds = [
    {
      code: "FLASH-COLA-BUY2GET1",
      name: "Flash Cola Buy 2 Get 1",
      description: "Bonus-buy demo promotion for the beverage aisle.",
      discountType: "PERCENT" as const,
      targetScope: "PRODUCT" as const,
      discountValue: "100.00",
      minimumBasketAmount: null,
      minimumLineQuantity: "3.000",
      buyQuantity: "2.000",
      rewardQuantity: "1.000",
      targetDepartmentCode: null,
      targetCategoryCode: null,
      targetProductCode: "FLASH-COLA-50CL",
      eligibleStoreCodes: ["accra-central", "tema-mall", "kumasi-hub"],
      eligibleCustomerTypes: null,
      eligibleLoyaltyTiers: null,
      activeDaysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      activeFromMinutes: 8 * 60,
      activeToMinutes: 21 * 60,
      couponRequired: false,
      couponCode: null,
      allowWithLoyalty: true,
      applyOncePerBasket: false,
      priority: 5
    },
    {
      code: "GOLD-GROCERY-10",
      name: "Gold Grocery 10%",
      description: "Loyalty-tier promotion for Gold customers buying grocery lines.",
      discountType: "PERCENT" as const,
      targetScope: "DEPARTMENT" as const,
      discountValue: "10.00",
      minimumBasketAmount: "15.00",
      minimumLineQuantity: null,
      buyQuantity: null,
      rewardQuantity: null,
      targetDepartmentCode: "GROCERY",
      targetCategoryCode: null,
      targetProductCode: null,
      eligibleStoreCodes: null,
      eligibleCustomerTypes: ["CORPORATE", "INDIVIDUAL"],
      eligibleLoyaltyTiers: ["Gold"],
      activeDaysOfWeek: null,
      activeFromMinutes: null,
      activeToMinutes: null,
      couponRequired: false,
      couponCode: null,
      allowWithLoyalty: false,
      applyOncePerBasket: true,
      priority: 10
    },
    {
      code: "WEEKEND-WATER-COUPON",
      name: "Weekend Water Coupon",
      description: "Coupon-controlled fixed-price water promotion.",
      discountType: "FIXED_PRICE" as const,
      targetScope: "PRODUCT" as const,
      discountValue: "1.00",
      minimumBasketAmount: null,
      minimumLineQuantity: "1.000",
      buyQuantity: null,
      rewardQuantity: null,
      targetDepartmentCode: null,
      targetCategoryCode: null,
      targetProductCode: "FLASH-WATER-75CL",
      eligibleStoreCodes: ["osu-high-street", "east-legon-market"],
      eligibleCustomerTypes: null,
      eligibleLoyaltyTiers: null,
      activeDaysOfWeek: ["SATURDAY", "SUNDAY"],
      activeFromMinutes: 9 * 60,
      activeToMinutes: 20 * 60,
      couponRequired: true,
      couponCode: "WATERWEEKEND",
      allowWithLoyalty: true,
      applyOncePerBasket: false,
      priority: 20
    }
  ];

  if (seedRetailDemoData) {
    for (const seed of promotionSeeds) {
      await prisma.promotionCampaign.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: seed.code
          }
        },
        update: {
          name: seed.name,
          description: seed.description,
          discountType: seed.discountType,
          targetScope: seed.targetScope,
          discountValue: seed.discountValue,
          minimumBasketAmount: seed.minimumBasketAmount,
          minimumLineQuantity: seed.minimumLineQuantity,
          buyQuantity: seed.buyQuantity,
          rewardQuantity: seed.rewardQuantity,
          targetDepartmentCode: seed.targetDepartmentCode,
          targetCategoryCode: seed.targetCategoryCode,
          targetProductCode: seed.targetProductCode,
          eligibleStoreCodes: jsonArrayOrDbNull(seed.eligibleStoreCodes),
          eligibleCustomerTypes: jsonArrayOrDbNull(seed.eligibleCustomerTypes),
          eligibleLoyaltyTiers: jsonArrayOrDbNull(seed.eligibleLoyaltyTiers),
          activeDaysOfWeek: jsonArrayOrDbNull(seed.activeDaysOfWeek),
          activeFromMinutes: seed.activeFromMinutes,
          activeToMinutes: seed.activeToMinutes,
          couponRequired: seed.couponRequired,
          couponCode: seed.couponCode,
          allowWithLoyalty: seed.allowWithLoyalty,
          applyOncePerBasket: seed.applyOncePerBasket,
          priority: seed.priority,
          status: "ACTIVE",
          lastModifiedByNodeCode: enterpriseNode.code
        },
        create: {
          retailOrgId: retailOrg.id,
          code: seed.code,
          name: seed.name,
          description: seed.description,
          discountType: seed.discountType,
          targetScope: seed.targetScope,
          discountValue: seed.discountValue,
          minimumBasketAmount: seed.minimumBasketAmount,
          minimumLineQuantity: seed.minimumLineQuantity,
          buyQuantity: seed.buyQuantity,
          rewardQuantity: seed.rewardQuantity,
          targetDepartmentCode: seed.targetDepartmentCode,
          targetCategoryCode: seed.targetCategoryCode,
          targetProductCode: seed.targetProductCode,
          eligibleStoreCodes: jsonArrayOrDbNull(seed.eligibleStoreCodes),
          eligibleCustomerTypes: jsonArrayOrDbNull(seed.eligibleCustomerTypes),
          eligibleLoyaltyTiers: jsonArrayOrDbNull(seed.eligibleLoyaltyTiers),
          activeDaysOfWeek: jsonArrayOrDbNull(seed.activeDaysOfWeek),
          activeFromMinutes: seed.activeFromMinutes,
          activeToMinutes: seed.activeToMinutes,
          couponRequired: seed.couponRequired,
          couponCode: seed.couponCode,
          allowWithLoyalty: seed.allowWithLoyalty,
          applyOncePerBasket: seed.applyOncePerBasket,
          priority: seed.priority,
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });
    }

    for (const seed of supplierSeeds) {
      const supplier = await prisma.supplier.upsert({
        where: {
          retailOrgId_supplierNo: {
            retailOrgId: retailOrg.id,
            supplierNo: seed.supplierNo
          }
        },
        update: {
          name: seed.name,
          contactName: seed.contactName,
          phone: seed.phone,
          email: seed.email,
          city: seed.city,
          countryCode: seed.countryCode,
          leadTimeDays: seed.leadTimeDays,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        create: {
          retailOrgId: retailOrg.id,
          supplierNo: seed.supplierNo,
          name: seed.name,
          contactName: seed.contactName,
          phone: seed.phone,
          email: seed.email,
          city: seed.city,
          countryCode: seed.countryCode,
          leadTimeDays: seed.leadTimeDays,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        }
      });

      for (const productCode of seed.productCodes) {
        const product = catalogProductByCode.get(productCode);

        if (!product) {
          continue;
        }

        await prisma.productSupplier.upsert({
          where: {
            productId_supplierId: {
              productId: product.id,
              supplierId: supplier.id
            }
          },
          update: {
            packCostPrice: product.baseCostPrice,
            leadTimeDays: seed.leadTimeDays,
            minimumOrderQuantity: "12.000",
            isPrimary: true
          },
          create: {
            productId: product.id,
            supplierId: supplier.id,
            supplierSku: product.code,
            supplierProductName: product.name,
            packCostPrice: product.baseCostPrice,
            leadTimeDays: seed.leadTimeDays,
            minimumOrderQuantity: "12.000",
            isPrimary: true
          }
        });
      }
    }
  }

  const hqRole = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "HQ_ADMIN"
      }
    },
    update: { name: "HQ Admin" },
    create: {
      retailOrgId: retailOrg.id,
      code: "HQ_ADMIN",
      name: "HQ Admin"
    }
  });

  const storeManagerRole = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "STORE_MANAGER"
      }
    },
    update: { name: "Store Manager" },
    create: {
      retailOrgId: retailOrg.id,
      code: "STORE_MANAGER",
      name: "Store Manager"
    }
  });

  const onlineStoreCashierRole = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "ONLINE_STORE_CASHIER"
      }
    },
    update: {
      name: "Online Store Cashier"
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "ONLINE_STORE_CASHIER",
      name: "Online Store Cashier",
      description: "Browser POS cashier role for online-direct stores."
    }
  });

  const onlineStoreSupervisorRole = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "ONLINE_STORE_SUPERVISOR"
      }
    },
    update: {
      name: "Online Store Supervisor"
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "ONLINE_STORE_SUPERVISOR",
      name: "Online Store Supervisor",
      description: "Browser POS supervisor role for online-direct stores."
    }
  });

  await ensureRolePermissions(
    hqRole.id,
    permissionSeeds.map((permission) => permission.code)
  );
  await ensureRolePermissions(storeManagerRole.id, [
    "inventory.view",
    "inventory.adjust",
    "inventory.count.submit",
    "inventory.count.commit",
    "inventory.transfer.request",
    "inventory.transfer.issue",
    "inventory.transfer.receive",
    "inventory.grn.receive",
    "inventory.supplier-return.manage",
    "fuel.station.view",
    "fuel.tank.manage",
    "fuel.dip.capture",
    "fuel.meter-reading.capture",
    "fuel.supplier-receipt.capture",
    "fuel.reconciliation.manage",
    "pos.shift.open",
    "pos.shift.close",
    "pos.sale.process",
    "pos.return.process",
    "pos.exchange.process",
    "pos.override.no-receipt-return",
    "pos.receipt.search",
    "pos.receipt.reprint",
    "pos.customer.attach",
    "pos.customer.account.collect",
    "pos.loyalty.redeem"
  ]);
  await ensureRolePermissions(onlineStoreCashierRole.id, [
    "inventory.view",
    "inventory.transfer.request",
    "pos.shift.open",
    "pos.shift.close",
    "pos.sale.process",
    "pos.return.process",
    "pos.exchange.process",
    "pos.receipt.search",
    "pos.receipt.reprint",
    "pos.customer.attach",
    "pos.customer.account.collect",
    "pos.loyalty.redeem"
  ]);
  await ensureRolePermissions(onlineStoreSupervisorRole.id, [
    "inventory.view",
    "inventory.adjust",
    "inventory.count.submit",
    "inventory.count.commit",
    "inventory.transfer.request",
    "inventory.transfer.issue",
    "inventory.transfer.receive",
    "inventory.grn.receive",
    "inventory.supplier-return.manage",
    "fuel.station.view",
    "fuel.tank.manage",
    "fuel.dip.capture",
    "fuel.meter-reading.capture",
    "fuel.supplier-receipt.capture",
    "fuel.reconciliation.manage",
    "pos.shift.open",
    "pos.shift.close",
    "pos.sale.process",
    "pos.return.process",
    "pos.exchange.process",
    "pos.override.no-receipt-return",
    "pos.override.discount",
    "pos.override.price",
    "pos.receipt.search",
    "pos.receipt.reprint",
    "pos.customer.attach",
    "pos.customer.account.collect",
    "pos.loyalty.redeem"
  ]);

  const storesWithNodes = [];

  for (const blueprint of storeBlueprints) {
    const store = await prisma.store.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: blueprint.storeCode
        }
      },
      update: {
        name: blueprint.storeName,
        storeMode: blueprint.storeMode,
        timezone: "Africa/Accra",
        currencyCode: retailOrg.baseCurrencyCode
      },
      create: {
        retailOrgId: retailOrg.id,
        code: blueprint.storeCode,
        name: blueprint.storeName,
        storeMode: blueprint.storeMode,
        timezone: "Africa/Accra",
        currencyCode: retailOrg.baseCurrencyCode
      }
    });

    const warehouse = await prisma.warehouse.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: blueprint.warehouseCode
        }
      },
      update: {
        name: blueprint.warehouseName,
        storeId: store.id
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: store.id,
        code: blueprint.warehouseCode,
        name: blueprint.warehouseName
      }
    });

    const terminal = await prisma.terminal.upsert({
      where: {
        storeId_code: {
          storeId: store.id,
          code: blueprint.terminalCode
        }
      },
      update: {
        name: blueprint.terminalName,
        lastHeartbeatAt: minutesAgo(blueprint.heartbeatMinutesAgo)
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: store.id,
        code: blueprint.terminalCode,
        name: blueprint.terminalName,
        lastHeartbeatAt: minutesAgo(blueprint.heartbeatMinutesAgo)
      }
    });

    const syncNode = await prisma.syncNode.upsert({
      where: { code: blueprint.nodeCode },
      update: {
        name: blueprint.nodeName,
        storeId: store.id,
        terminalId: terminal.id,
        lastHeartbeatAt: minutesAgo(blueprint.heartbeatMinutesAgo)
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: store.id,
        terminalId: terminal.id,
        code: blueprint.nodeCode,
        name: blueprint.nodeName,
        nodeType: SyncNodeType.STORE_DESKTOP,
        direction: "BIDIRECTIONAL",
        lastHeartbeatAt: minutesAgo(blueprint.heartbeatMinutesAgo),
      }
    });

    await prisma.syncNode.update({
      where: {
        id: syncNode.id
      },
      data: {
        lastTelemetryAt: minutesAgo(blueprint.heartbeatMinutesAgo),
        lastReportedHealth: blueprint.reportedHealth,
        lastReportedUpstreamQueued: blueprint.reportedUpstreamQueued,
        lastReportedUpstreamInFlight: blueprint.reportedUpstreamInFlight,
        lastReportedDownstreamQueued: blueprint.reportedDownstreamQueued,
        lastReportedDeadLetter: blueprint.reportedDeadLetter,
        lastReportedLastSyncAt: minutesAgo(blueprint.reportedLastSyncMinutesAgo),
        lastReportedLastLocalWriteAt: minutesAgo(blueprint.reportedLastLocalWriteMinutesAgo)
      }
    });

    const salesLocation = await prisma.inventoryLocation.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: blueprint.locationCode
        }
      },
      update: {
        name: blueprint.locationName,
        storeId: store.id,
        warehouseId: warehouse.id,
        useForSalesDefault: true,
        useForSalesOrderDefault: true
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: store.id,
        warehouseId: warehouse.id,
        code: blueprint.locationCode,
        name: blueprint.locationName,
        locationType: "STORE_FLOOR",
        useForSalesDefault: true,
        useForSalesOrderDefault: true
      }
    });

    if (blueprint.storeCode === "accra-central") {
      await prisma.inventoryLocation.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: "accra-central-sales-floor"
          }
        },
        update: {
          name: "Accra Central Sales Floor",
          storeId: store.id,
          warehouseId: warehouse.id,
          useForSalesDefault: false,
          useForSalesOrderDefault: false
        },
        create: {
          retailOrgId: retailOrg.id,
          storeId: store.id,
          warehouseId: warehouse.id,
          code: "accra-central-sales-floor",
          name: "Accra Central Sales Floor",
          locationType: "STORE_FLOOR",
          useForSalesDefault: false,
          useForSalesOrderDefault: false
        }
      });
    }

    await prisma.syncInboxCheckpoint.upsert({
      where: {
        syncNodeId_remoteNodeCode: {
          syncNodeId: syncNode.id,
          remoteNodeCode: enterpriseNode.code
        }
      },
      update: {
        lastEventId: `${enterpriseNode.code}-cursor`,
        lastReceivedCursor: `${store.code}-downstream-cursor`,
        lastReceivedAt: minutesAgo(blueprint.checkpointMinutesAgo),
        lastAppliedAt: minutesAgo(blueprint.checkpointMinutesAgo)
      },
      create: {
        syncNodeId: syncNode.id,
        remoteNodeCode: enterpriseNode.code,
        lastEventId: `${enterpriseNode.code}-cursor`,
        lastReceivedCursor: `${store.code}-downstream-cursor`,
        lastReceivedAt: minutesAgo(blueprint.checkpointMinutesAgo),
        lastAppliedAt: minutesAgo(blueprint.checkpointMinutesAgo)
      }
    });

    storesWithNodes.push({
      blueprint,
      store,
      warehouse,
      terminal,
      syncNode,
      salesLocation
    });
  }

  const seededNodeCodes = new Set(storesWithNodes.map((entry) => entry.syncNode.code));
  const extraStoreNodes = await prisma.syncNode.findMany({
    where: {
      retailOrgId: retailOrg.id,
      nodeType: SyncNodeType.STORE_DESKTOP,
      status: "ACTIVE"
    },
    select: {
      code: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      terminal: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });

  for (const node of extraStoreNodes) {
    if (seededNodeCodes.has(node.code) || !node.store || !node.terminal) {
      continue;
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        retailOrgId: retailOrg.id,
        storeId: node.store.id
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const salesLocation = await prisma.inventoryLocation.findFirst({
      where: {
        retailOrgId: retailOrg.id,
        storeId: node.store.id,
        useForSalesDefault: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!warehouse || !salesLocation) {
      continue;
    }

    storesWithNodes.push({
      blueprint: null,
      store: node.store,
      warehouse,
      terminal: node.terminal,
      syncNode: {
        code: node.code
      },
      salesLocation
    });
  }

  const storeByCode = new Map(storesWithNodes.map((entry) => [entry.store.code, entry.store] as const));
  await ensureFuelMasterDataSeedDefaults(
    retailOrg.id,
    enterpriseNode.code,
    uomDefaults,
    storesWithNodes
  );

  if (!seedRetailDemoData) {
    await prisma.bankingDeposit.deleteMany({
      where: {
        retailOrgId: retailOrg.id,
        depositNo: {
          startsWith: "SEED-BANK-"
        }
      }
    });
    await prisma.eodReconciliation.deleteMany({
      where: {
        retailOrgId: retailOrg.id,
        reconciliationNo: {
          startsWith: "SEED-EOD-"
        }
      }
    });
    await prisma.inventoryLedgerEntry.deleteMany({
      where: {
        retailOrgId: retailOrg.id,
        referenceType: {
          in: ["seed", "seed-pos-sale"]
        }
      }
    });
    await prisma.syncInboundEvent.deleteMany({
      where: {
        id: {
          startsWith: "seed-demo-"
        }
      }
    });
    await prisma.syncOutboxEvent.deleteMany({
      where: {
        id: {
          startsWith: "seed-"
        }
      }
    });
    await prisma.posTransaction.deleteMany({
      where: {
        retailOrgId: retailOrg.id,
        transactionNo: {
          startsWith: "DEMO-"
        }
      }
    });
    await prisma.posShift.deleteMany({
      where: {
        retailOrgId: retailOrg.id,
        shiftNo: {
          startsWith: "SEED-"
        }
      }
    });

    return;
  }

  const customerSeeds = [
    {
      customerNo: "CUST-0001",
      fullName: "Ama Mensah",
      storeCode: "accra-central",
      customerType: "INDIVIDUAL" as const,
      phone: "+233200000111",
      email: "ama.mensah@flash.local",
      city: "Accra",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Silver",
      loyaltyPointsBalance: 145,
      allowCreditSales: false,
      creditLimitAmount: null,
      receivableBalanceAmount: "0.00",
      note: "Frequent retail shopper with active loyalty enrollment."
    },
    {
      customerNo: "CUST-0002",
      fullName: "Kojo Bediako",
      storeCode: "tema-mall",
      customerType: "WHOLESALE" as const,
      phone: "+233200000222",
      email: "kojo.bediako@flash.local",
      city: "Tema",
      countryCode: "GH",
      loyaltyEnrolled: false,
      loyaltyTier: null,
      loyaltyPointsBalance: 0,
      allowCreditSales: true,
      creditLimitAmount: "2500.00",
      receivableBalanceAmount: "640.00",
      note: "Wholesale account with open receivable exposure."
    },
    {
      customerNo: "CUST-0003",
      fullName: "Rita Asare",
      storeCode: "kumasi-hub",
      customerType: "CORPORATE" as const,
      phone: "+233200000333",
      email: "rita.asare@flash.local",
      city: "Kumasi",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Gold",
      loyaltyPointsBalance: 420,
      allowCreditSales: true,
      creditLimitAmount: "5000.00",
      receivableBalanceAmount: "1280.00",
      note: "Corporate purchasing contact with receivable terms enabled."
    },
    {
      customerNo: "CUST-0004",
      fullName: "Esi Owusu",
      storeCode: "osu-high-street",
      customerType: "INDIVIDUAL" as const,
      phone: "+233200000444",
      email: "esi.owusu@flash.local",
      city: "Osu",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Silver",
      loyaltyPointsBalance: 220,
      allowCreditSales: false,
      creditLimitAmount: null,
      receivableBalanceAmount: "0.00",
      note: "Weekend shopper used by the dashboard demo sales seed."
    },
    {
      customerNo: "CUST-0005",
      fullName: "Yaw Sarpong",
      storeCode: "east-legon-market",
      customerType: "WHOLESALE" as const,
      phone: "+233200000555",
      email: "yaw.sarpong@flash.local",
      city: "East Legon",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Gold",
      loyaltyPointsBalance: 510,
      allowCreditSales: true,
      creditLimitAmount: "3200.00",
      receivableBalanceAmount: "410.00",
      note: "Wholesale customer for East Legon shop sales samples."
    },
    {
      customerNo: "CUST-0006",
      fullName: "Abena Dapaah",
      storeCode: "takoradi-market-circle",
      customerType: "INDIVIDUAL" as const,
      phone: "+233200000666",
      email: "abena.dapaah@flash.local",
      city: "Takoradi",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Silver",
      loyaltyPointsBalance: 305,
      allowCreditSales: false,
      creditLimitAmount: null,
      receivableBalanceAmount: "0.00",
      note: "Takoradi customer seeded for multi-shop dashboard activity."
    },
    {
      customerNo: "CUST-0007",
      fullName: "Kofi Annan Stores",
      storeCode: "cape-coast-castle-road",
      customerType: "CORPORATE" as const,
      phone: "+233200000777",
      email: "procurement@kofiannanstores.local",
      city: "Cape Coast",
      countryCode: "GH",
      loyaltyEnrolled: false,
      loyaltyTier: null,
      loyaltyPointsBalance: 0,
      allowCreditSales: true,
      creditLimitAmount: "4200.00",
      receivableBalanceAmount: "925.00",
      note: "Corporate buyer for Cape Coast sample transactions."
    },
    {
      customerNo: "CUST-0008",
      fullName: "Hawa Fuseini",
      storeCode: "tamale-retail-park",
      customerType: "INDIVIDUAL" as const,
      phone: "+233200000888",
      email: "hawa.fuseini@flash.local",
      city: "Tamale",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Platinum",
      loyaltyPointsBalance: 860,
      allowCreditSales: true,
      creditLimitAmount: "1800.00",
      receivableBalanceAmount: "240.00",
      note: "Tamale loyalty customer for dashboard demo data."
    },
    {
      customerNo: "CUST-0009",
      fullName: "Mensah Family Shop",
      storeCode: "accra-central",
      customerType: "WHOLESALE" as const,
      phone: "+233200000999",
      email: "orders@mensahfamily.local",
      city: "Accra",
      countryCode: "GH",
      loyaltyEnrolled: true,
      loyaltyTier: "Gold",
      loyaltyPointsBalance: 645,
      allowCreditSales: true,
      creditLimitAmount: "2800.00",
      receivableBalanceAmount: "315.00",
      note: "Repeat customer used for top-customer dashboard rankings."
    },
    {
      customerNo: "CUST-0010",
      fullName: "Tema Office Pantry",
      storeCode: "tema-mall",
      customerType: "CORPORATE" as const,
      phone: "+233200001010",
      email: "admin@temaofficepantry.local",
      city: "Tema",
      countryCode: "GH",
      loyaltyEnrolled: false,
      loyaltyTier: null,
      loyaltyPointsBalance: 0,
      allowCreditSales: true,
      creditLimitAmount: "3500.00",
      receivableBalanceAmount: "725.00",
      note: "Corporate pantry account for recurring Tema sales."
    }
  ];

  const customerByNo = new Map<string, { id: string; customerNo: string; fullName: string }>();

  for (const seed of customerSeeds) {
    const customer = await prisma.customer.upsert({
      where: {
        retailOrgId_customerNo: {
          retailOrgId: retailOrg.id,
          customerNo: seed.customerNo
        }
      },
      update: {
        storeId: storeByCode.get(seed.storeCode)?.id ?? null,
        customerType: seed.customerType,
        fullName: seed.fullName,
        phone: seed.phone,
        email: seed.email,
        city: seed.city,
        countryCode: seed.countryCode,
        loyaltyEnrolled: seed.loyaltyEnrolled,
        loyaltyTier: seed.loyaltyTier,
        loyaltyPointsBalance: seed.loyaltyPointsBalance,
        allowCreditSales: seed.allowCreditSales,
        creditLimitAmount: seed.creditLimitAmount,
        receivableBalanceAmount: seed.receivableBalanceAmount,
        note: seed.note,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: storeByCode.get(seed.storeCode)?.id ?? null,
        customerNo: seed.customerNo,
        customerType: seed.customerType,
        fullName: seed.fullName,
        phone: seed.phone,
        email: seed.email,
        city: seed.city,
        countryCode: seed.countryCode,
        loyaltyEnrolled: seed.loyaltyEnrolled,
        loyaltyTier: seed.loyaltyTier,
        loyaltyPointsBalance: seed.loyaltyPointsBalance,
        allowCreditSales: seed.allowCreditSales,
        creditLimitAmount: seed.creditLimitAmount,
        receivableBalanceAmount: seed.receivableBalanceAmount,
        note: seed.note,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      }
    });

    customerByNo.set(seed.customerNo, {
      id: customer.id,
      customerNo: customer.customerNo,
      fullName: customer.fullName
    });
  }

  await prisma.inventoryLedgerEntry.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      referenceType: "seed",
      sourceNodeCode: enterpriseNode.code
    }
  });

  for (const storeNode of storesWithNodes) {
    for (const seed of catalogProductSeeds) {
      const product = catalogProductByCode.get(seed.code);

      if (!product) {
        continue;
      }

      await prisma.inventoryLedgerEntry.create({
        data: {
          retailOrgId: retailOrg.id,
          storeId: storeNode.store.id,
          warehouseId: storeNode.warehouse.id,
          inventoryLocationId: storeNode.salesLocation.id,
          productId: product.id,
          movementType: "OPENING_BALANCE",
          quantity: seed.openingQuantity,
          unitCost: seed.baseCostPrice,
          referenceType: "seed",
          referenceId: `opening-balance-${storeNode.store.code}-${seed.code}`,
          sourceNodeCode: enterpriseNode.code,
          occurredAt: new Date()
        }
      });
    }
  }

  await prisma.bankingDeposit.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      depositNo: {
        startsWith: "SEED-BANK-"
      }
    }
  });
  await prisma.eodReconciliation.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      reconciliationNo: {
        startsWith: "SEED-EOD-"
      }
    }
  });
  await prisma.inventoryLedgerEntry.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      referenceType: "seed-pos-sale"
    }
  });
  await prisma.syncInboundEvent.deleteMany({
    where: {
      id: {
        startsWith: "seed-demo-"
      }
    }
  });
  await prisma.posTransaction.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      transactionNo: {
        startsWith: "DEMO-"
      }
    }
  });
  await prisma.posShift.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      shiftNo: {
        startsWith: "SEED-"
      }
    }
  });

  const demoProducts = catalogProductSeeds
    .map((seed) => catalogProductByCode.get(seed.code))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
  const demoCustomers = customerSeeds
    .map((seed) => customerByNo.get(seed.customerNo))
    .filter((customer): customer is NonNullable<typeof customer> => Boolean(customer));
  const demoDayOffsets = [0, 1, 2, 3, 6, 12, 19, 33, 61, 92];
  const inboundEventSeeds: Array<{
    id: string;
    syncNodeId: string;
    sourceNodeCode: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    recordVersion: number;
    payload: Record<string, string | number | null>;
    status: SyncEventStatus;
    receivedAt: Date;
    appliedAt: Date;
  }> = [];

  for (const [storeIndex, storeNode] of storesWithNodes.entries()) {
    const storeCodeSlug = storeNode.store.code.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
    const cashierLoginId = `${storeNode.store.code}.cashier`;
    const cashier = await prisma.retailUser.upsert({
      where: {
        retailOrgId_loginId: {
          retailOrgId: retailOrg.id,
          loginId: cashierLoginId
        }
      },
      update: {
        homeStoreId: storeNode.store.id,
        displayName: `${storeNode.store.name} Cashier`,
        accountStatus: UserAccountStatus.ACTIVE,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        homeStoreId: storeNode.store.id,
        loginId: cashierLoginId,
        email: `${cashierLoginId.replace(/\./g, "-")}@flash.local`,
        displayName: `${storeNode.store.name} Cashier`,
        accountStatus: UserAccountStatus.ACTIVE,
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      }
    });

    await prisma.retailUserRole.upsert({
      where: {
        retailUserId_roleId: {
          retailUserId: cashier.id,
          roleId: storeManagerRole.id
        }
      },
      update: {},
      create: {
        retailUserId: cashier.id,
        roleId: storeManagerRole.id
      }
    });

    const shift = await prisma.posShift.create({
      data: {
        retailOrgId: retailOrg.id,
        storeId: storeNode.store.id,
        terminalId: storeNode.terminal.id,
        cashierUserId: cashier.id,
        shiftNo: `SEED-${storeCodeSlug}-CLOSE`,
        status: PosShiftStatus.CLOSED,
        openingFloatAmount: "250.00",
        closingDeclaredCash: "0.00",
        closingVariance: "0.00",
        originNodeCode: storeNode.syncNode.code,
        openedAt: daysAgo(1, 8, 0),
        closedAt: daysAgo(0, 21, 30)
      }
    });

    let storeCashTendered = 0;
    let storeNonCashTendered = 0;
    let storeNetSales = 0;

    for (const [saleIndex, dayOffset] of demoDayOffsets.entries()) {
      const completedAt = daysAgo(
        dayOffset + (storeIndex % 3),
        9 + ((saleIndex + storeIndex) % 10),
        (saleIndex * 7 + storeIndex * 3) % 60
      );
      const productA = demoProducts[(saleIndex + storeIndex) % demoProducts.length];
      const productB = demoProducts[(saleIndex + storeIndex + 1) % demoProducts.length];
      const quantityA = 1 + ((saleIndex + storeIndex) % 3);
      const quantityB = 1 + ((saleIndex + storeIndex + 2) % 2);
      const lineGrossA = Number(productA.baseUnitPrice) * quantityA;
      const lineGrossB = Number(productB.baseUnitPrice) * quantityB;
      const subtotalAmount = lineGrossA + lineGrossB;
      const discountAmount = saleIndex % 4 === 0 ? Number((subtotalAmount * 0.05).toFixed(2)) : 0;
      const appliedPromotion =
        discountAmount > 0
          ? promotionSeeds[(saleIndex + storeIndex) % promotionSeeds.length]
          : null;
      const totalAmount = Number((subtotalAmount - discountAmount).toFixed(2));
      const tenderSeed = tenderMethodSeeds[(saleIndex + storeIndex) % tenderMethodSeeds.length];
      const tenderMethod = tenderMethodByCode.get(tenderSeed.code);
      const customer = demoCustomers[(saleIndex + storeIndex) % demoCustomers.length];
      const transactionNo = `DEMO-${storeCodeSlug}-${`${saleIndex + 1}`.padStart(3, "0")}`;
      const transaction = await prisma.posTransaction.create({
        data: {
          retailOrgId: retailOrg.id,
          storeId: storeNode.store.id,
          terminalId: storeNode.terminal.id,
          posShiftId: shift.id,
          customerId: customer?.id ?? null,
          transactionNo,
          transactionType: PosTransactionType.SALE,
          status: PosTransactionStatus.COMPLETED,
          customerNameSnapshot: customer?.fullName ?? null,
          cashierCodeSnapshot: cashier.loginId,
          subtotalAmount: toMoney(subtotalAmount),
          discountAmount: toMoney(discountAmount),
          taxAmount: "0.00",
          totalAmount: toMoney(totalAmount),
          paidAmount: toMoney(totalAmount),
          changeAmount: "0.00",
          notes: "Seeded HQ dashboard sale",
          originNodeCode: storeNode.syncNode.code,
          completedAt,
          createdAt: completedAt,
          lines: {
            createMany: {
              data: [
                {
                  productId: productA.id,
                  lineIntent: "SALE",
                  productCodeSnapshot: productA.code,
                  productNameSnapshot: productA.name,
                  barcodeSnapshot: productA.barcode,
                  appliedPromotionCodeSnapshot: appliedPromotion?.code ?? null,
                  appliedPromotionNameSnapshot: appliedPromotion?.name ?? null,
                  quantity: toQuantity(quantityA),
                  unitPrice: productA.baseUnitPrice,
                  discountAmount: toMoney(discountAmount),
                  taxAmount: "0.00",
                  lineTotal: toMoney(lineGrossA - discountAmount)
                },
                {
                  productId: productB.id,
                  lineIntent: "SALE",
                  productCodeSnapshot: productB.code,
                  productNameSnapshot: productB.name,
                  barcodeSnapshot: productB.barcode,
                  quantity: toQuantity(quantityB),
                  unitPrice: productB.baseUnitPrice,
                  discountAmount: "0.00",
                  taxAmount: "0.00",
                  lineTotal: toMoney(lineGrossB)
                }
              ]
            }
          },
          payments: {
            create: {
              tenderMethodId: tenderMethod?.id ?? null,
              tenderMethodCodeSnapshot: tenderMethod?.code ?? tenderSeed.code,
              tenderMethodNameSnapshot: tenderMethod?.name ?? tenderSeed.name,
              method: tenderSeed.paymentMethod,
              amount: toMoney(totalAmount),
              reference:
                tenderSeed.paymentMethod === PaymentMethod.CASH
                  ? null
                  : `SEED-${storeCodeSlug}-${saleIndex + 1}`,
              receivedAt: completedAt
            }
          }
        }
      });

      storeNetSales += totalAmount;

      if (tenderSeed.paymentMethod === PaymentMethod.CASH) {
        storeCashTendered += totalAmount;
      } else {
        storeNonCashTendered += totalAmount;
      }

      const lineMovements = [
        { product: productA, quantity: quantityA },
        { product: productB, quantity: quantityB }
      ];

      for (const [lineIndex, line] of lineMovements.entries()) {
        const ledgerEntry = await prisma.inventoryLedgerEntry.create({
          data: {
            retailOrgId: retailOrg.id,
            storeId: storeNode.store.id,
            warehouseId: storeNode.warehouse.id,
            inventoryLocationId: storeNode.salesLocation.id,
            productId: line.product.id,
            movementType: InventoryMovementType.SALE,
            quantity: toQuantity(line.quantity * -1),
            unitCost: line.product.baseCostPrice,
            referenceType: "seed-pos-sale",
            referenceId: transaction.id,
            externalReference: transaction.transactionNo,
            sourceNodeCode: storeNode.syncNode.code,
            createdByUserId: cashier.id,
            occurredAt: completedAt
          }
        });

        inboundEventSeeds.push({
          id: `seed-demo-ledger-${storeNode.store.code}-${saleIndex + 1}-${lineIndex + 1}`,
          syncNodeId: enterpriseNode.id,
          sourceNodeCode: storeNode.syncNode.code,
          aggregateType: "inventoryLedgerEntry",
          aggregateId: ledgerEntry.id,
          eventType: "inventory.ledger.recorded",
          idempotencyKey: `seed-demo:${storeNode.syncNode.code}:ledger:${saleIndex + 1}:${lineIndex + 1}`,
          recordVersion: 1,
          payload: {
            ledgerEntryId: ledgerEntry.id,
            transactionNo: transaction.transactionNo,
            productCode: line.product.code,
            quantity: line.quantity * -1
          },
          status: SyncEventStatus.ACKNOWLEDGED,
          receivedAt: completedAt,
          appliedAt: completedAt
        });
      }

      inboundEventSeeds.push({
        id: `seed-demo-pos-${storeNode.store.code}-${saleIndex + 1}`,
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: storeNode.syncNode.code,
        aggregateType: "posTransaction",
        aggregateId: transaction.id,
        eventType: "pos.transaction.completed",
        idempotencyKey: `seed-demo:${storeNode.syncNode.code}:pos:${saleIndex + 1}`,
        recordVersion: 1,
        payload: {
          transactionId: transaction.id,
          transactionNo: transaction.transactionNo,
          cashierCode: cashier.loginId,
          storeCode: storeNode.store.code,
          terminalCode: storeNode.terminal.code,
          totalAmount
        },
        status: SyncEventStatus.ACKNOWLEDGED,
        receivedAt: completedAt,
        appliedAt: completedAt
      });
    }

    const varianceAmount = storeIndex % 2 === 0 ? 0 : -2.5;
    const declaredCashAmount = Number((storeCashTendered + varianceAmount).toFixed(2));
    const reconciliationNo = `SEED-EOD-${storeCodeSlug}`;
    const reconciliation = await prisma.eodReconciliation.create({
      data: {
        retailOrgId: retailOrg.id,
        storeId: storeNode.store.id,
        terminalId: storeNode.terminal.id,
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        cashierCode: cashier.loginId,
        reconciliationNo,
        expectedCashAmount: toMoney(storeCashTendered),
        declaredCashAmount: toMoney(declaredCashAmount),
        varianceAmount: toMoney(varianceAmount),
        netSalesAmount: toMoney(storeNetSales),
        cashTenderedAmount: toMoney(storeCashTendered),
        nonCashTenderedAmount: toMoney(storeNonCashTendered),
        transactionCount: demoDayOffsets.length,
        operatorName: cashier.displayName,
        note: "Seeded HQ dashboard closeout",
        originNodeCode: storeNode.syncNode.code,
        reconciledAt: daysAgo(0, 21, 30)
      }
    });
    const bankedAmount = Number((Math.max(0, declaredCashAmount) * 0.9).toFixed(2));

    await prisma.posShift.update({
      where: {
        id: shift.id
      },
      data: {
        closingDeclaredCash: toMoney(declaredCashAmount),
        closingVariance: toMoney(varianceAmount)
      }
    });

    await prisma.bankingDeposit.create({
      data: {
        retailOrgId: retailOrg.id,
        storeId: storeNode.store.id,
        terminalId: storeNode.terminal.id,
        reconciliationId: reconciliation.id,
        depositNo: `SEED-BANK-${storeCodeSlug}`,
        reconciliationNo,
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        amount: toMoney(bankedAmount),
        bankName: "Flash Demo Bank",
        reference: `DEP-${storeCodeSlug}`,
        operatorName: cashier.displayName,
        note: "Seeded dashboard banking deposit",
        originNodeCode: storeNode.syncNode.code,
        depositedAt: daysAgo(0, 22, 15)
      }
    });

    inboundEventSeeds.push(
      {
        id: `seed-demo-eod-${storeNode.store.code}`,
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: storeNode.syncNode.code,
        aggregateType: "eodReconciliation",
        aggregateId: reconciliation.id,
        eventType: "eod.reconciliation.posted",
        idempotencyKey: `seed-demo:${storeNode.syncNode.code}:eod`,
        recordVersion: 1,
        payload: {
          reconciliationNo,
          shiftId: shift.id,
          shiftNo: shift.shiftNo,
          cashierCode: cashier.loginId,
          netSalesAmount: storeNetSales
        },
        status: SyncEventStatus.ACKNOWLEDGED,
        receivedAt: daysAgo(0, 21, 32),
        appliedAt: daysAgo(0, 21, 32)
      },
      {
        id: `seed-demo-bank-${storeNode.store.code}`,
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: storeNode.syncNode.code,
        aggregateType: "bankingDeposit",
        aggregateId: `SEED-BANK-${storeCodeSlug}`,
        eventType: "banking.deposit.posted",
        idempotencyKey: `seed-demo:${storeNode.syncNode.code}:banking`,
        recordVersion: 1,
        payload: {
          depositNo: `SEED-BANK-${storeCodeSlug}`,
          reconciliationNo,
          shiftId: shift.id,
          shiftNo: shift.shiftNo,
          amount: bankedAmount
        },
        status: SyncEventStatus.ACKNOWLEDGED,
        receivedAt: daysAgo(0, 22, 16),
        appliedAt: daysAgo(0, 22, 16)
      }
    );
  }

  await prisma.syncInboundEvent.createMany({
    data: inboundEventSeeds.map((event) => ({
      ...event,
      payload: serializeJson(event.payload) ?? "null"
    }))
  });

  await prisma.syncOutboxEvent.deleteMany({
    where: {
      id: {
        startsWith: "seed-"
      }
    }
  });

  const colaProduct = catalogProductByCode.get("FLASH-COLA-50CL");
  const waterProduct = catalogProductByCode.get("FLASH-WATER-75CL");
  const biscuitProduct = catalogProductByCode.get("FLASH-BISCUIT-CHOCO");

  if (!colaProduct || !waterProduct || !biscuitProduct) {
    throw new Error("Flash ERP seed catalog is missing one or more core demo products.");
  }

  const eventSeeds = [
    {
      id: "seed-accra-upstream-1",
      syncNodeId: storesWithNodes[0].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "posTransaction",
      aggregateId: "seed-pos-accra-1",
      eventType: "pos.transaction.completed",
      idempotencyKey: "seed:store-accra-central-01:posTransaction:1",
      status: SyncEventStatus.PENDING,
      payload: { transactionNo: "POS-ACC-0001", totalAmount: 42.5 }
    },
    {
      id: "seed-accra-upstream-2",
      syncNodeId: storesWithNodes[0].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "inventoryLedgerEntry",
      aggregateId: "seed-ledger-accra-1",
      eventType: "inventory.ledger.recorded",
      idempotencyKey: "seed:store-accra-central-01:inventoryLedgerEntry:1",
      status: SyncEventStatus.IN_FLIGHT,
      payload: { movementType: "SALE", quantity: 3 }
    },
    {
      id: "seed-tema-upstream-1",
      syncNodeId: storesWithNodes[1].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "posTransaction",
      aggregateId: "seed-pos-tema-1",
      eventType: "pos.transaction.completed",
      idempotencyKey: "seed:store-tema-mall-01:posTransaction:1",
      status: SyncEventStatus.PENDING,
      payload: { transactionNo: "POS-TEM-0001", totalAmount: 88.3 }
    },
    {
      id: "seed-tema-upstream-2",
      syncNodeId: storesWithNodes[1].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "posPayment",
      aggregateId: "seed-payment-tema-1",
      eventType: "pos.payment.recorded",
      idempotencyKey: "seed:store-tema-mall-01:posPayment:1",
      status: SyncEventStatus.PENDING,
      payload: { method: "CARD", amount: 88.3 }
    },
    {
      id: "seed-tema-upstream-3",
      syncNodeId: storesWithNodes[1].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "inventoryLedgerEntry",
      aggregateId: "seed-ledger-tema-1",
      eventType: "inventory.ledger.recorded",
      idempotencyKey: "seed:store-tema-mall-01:inventoryLedgerEntry:1",
      status: SyncEventStatus.IN_FLIGHT,
      payload: { movementType: "SALE", quantity: 7 }
    },
    {
      id: "seed-kumasi-upstream-1",
      syncNodeId: storesWithNodes[2].syncNode.id,
      targetNodeCode: enterpriseNode.code,
      aggregateType: "posTransaction",
      aggregateId: "seed-pos-kumasi-1",
      eventType: "pos.transaction.completed",
      idempotencyKey: "seed:store-kumasi-hub-01:posTransaction:1",
      status: SyncEventStatus.FAILED,
      payload: { transactionNo: "POS-KUM-0001", totalAmount: 17.6 }
    },
    {
      id: "seed-enterprise-downstream-1",
      syncNodeId: enterpriseNode.id,
      targetNodeCode: storesWithNodes[0].syncNode.code,
      aggregateType: "priceList",
      aggregateId: "default-sell",
      eventType: "pricing.price-list.published",
      idempotencyKey: "seed:enterprise-primary:priceList:accra",
      status: SyncEventStatus.PENDING,
      payload: {
        storeCode: storesWithNodes[0].store.code,
        priceListCode: "default-sell",
        productCode: colaProduct.code,
        unitPrice: 2.65
      }
    },
    {
      id: "seed-enterprise-downstream-2",
      syncNodeId: enterpriseNode.id,
      targetNodeCode: storesWithNodes[1].syncNode.code,
      aggregateType: "product",
      aggregateId: waterProduct.id,
      eventType: "catalog.product.published",
      idempotencyKey: "seed:enterprise-primary:product:tema",
      status: SyncEventStatus.PENDING,
      payload: {
        storeCode: storesWithNodes[1].store.code,
        productCode: waterProduct.code,
        productName: waterProduct.name,
        unitPrice: 1.8,
        quantityOnHand: 52
      }
    },
    {
      id: "seed-enterprise-downstream-3",
      syncNodeId: enterpriseNode.id,
      targetNodeCode: storesWithNodes[1].syncNode.code,
      aggregateType: "inventoryLocation",
      aggregateId: storesWithNodes[1].salesLocation.id,
      eventType: "inventory.location.published",
      idempotencyKey: "seed:enterprise-primary:inventoryLocation:tema",
      status: SyncEventStatus.IN_FLIGHT,
      payload: {
        storeCode: storesWithNodes[1].store.code,
        locationCode: storesWithNodes[1].salesLocation.code,
        locationName: storesWithNodes[1].salesLocation.name,
        locationType: storesWithNodes[1].salesLocation.locationType,
        status: storesWithNodes[1].salesLocation.status,
        defaults: [
          storesWithNodes[1].salesLocation.useForSalesDefault ? "Sales default" : null,
          storesWithNodes[1].salesLocation.useForSalesOrderDefault ? "Sales order default" : null,
          storesWithNodes[1].salesLocation.useForReceivingDefault ? "Receiving default" : null
        ].filter(Boolean).join(", ") || "Standard",
        useForSalesDefault: storesWithNodes[1].salesLocation.useForSalesDefault,
        useForSalesOrderDefault: storesWithNodes[1].salesLocation.useForSalesOrderDefault,
        useForReceivingDefault: storesWithNodes[1].salesLocation.useForReceivingDefault,
        warehouseCode: storesWithNodes[1].warehouse.code,
        warehouseName: storesWithNodes[1].warehouse.name,
        publishedAt: new Date().toISOString()
      }
    },
    {
      id: "seed-enterprise-downstream-4",
      syncNodeId: enterpriseNode.id,
      targetNodeCode: storesWithNodes[0].syncNode.code,
      aggregateType: "product",
      aggregateId: colaProduct.id,
      eventType: "catalog.product.published",
      idempotencyKey: "seed:enterprise-primary:product:accra",
      status: SyncEventStatus.PENDING,
      payload: {
        storeCode: storesWithNodes[0].store.code,
        productCode: colaProduct.code,
        productName: colaProduct.name,
        unitPrice: 2.65,
        quantityOnHand: 48
      }
    },
    {
      id: "seed-enterprise-downstream-5",
      syncNodeId: enterpriseNode.id,
      targetNodeCode: storesWithNodes[2].syncNode.code,
      aggregateType: "product",
      aggregateId: biscuitProduct.id,
      eventType: "catalog.product.published",
      idempotencyKey: "seed:enterprise-primary:product:kumasi-replay",
      status: SyncEventStatus.DEAD_LETTER,
      payload: {
        storeCode: storesWithNodes[2].store.code,
        productCode: biscuitProduct.code,
        productName: `${biscuitProduct.name} Replay`,
        unitPrice: 3.35,
        quantityOnHand: 39
      }
    }
  ];

  await prisma.syncOutboxEvent.createMany({
    data: eventSeeds.map((event) => ({
      ...event,
      payload: serializeJson(event.payload) ?? "null",
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

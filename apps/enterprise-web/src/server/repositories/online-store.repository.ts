import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  CustomerAccountEntryType,
  allocateInventoryBatchesFefo,
  assertLayawayFulfilmentEligible,
  calculateLayawayAvailableBaseQuantity,
  calculateLayawayCancellationAmounts,
  deriveInventoryBatchStatus,
  deriveRetailUserCapabilities,
  evaluateLayawayOpening,
  inventoryBatchDaysUntilExpiry,
  normalizeLayawaySettings,
  resolvePosSellingUom,
  InterStoreTransferOrigin,
  InterStoreTransferStatus,
  InventoryMovementType,
  LocationType,
  OperatingExpenseStatus,
  PaymentMethod,
  PosShiftStatus,
  PosTransactionLineIntent,
  PosTransactionStatus,
  PosTransactionType,
  PurchaseOrderStatus,
  RecordStatus,
  SalesOrderStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  SerialInventoryStatus,
  StockCountSessionStatus,
  SupplierReturnReason,
  SupplierReturnStatus,
  UserAccountStatus,
  validateInventoryBatchReceipt,
  type InventoryBatchAllocation
} from "@flash-erp/domain";
import {
  applyAutomaticPromotions,
  calculateLoyaltyRedemption,
  deriveCustomerAccountPostingEffect,
  type AutomaticPromotionPolicy,
  type CustomerAccountPostingCustomer,
  type LoyaltyPolicy,
  type SyncPaymentMethod,
  type SyncPosTransactionType,
  type SyncPromotionDiscountType,
  type SyncPromotionTargetScope
} from "@flash-erp/sync-core";
import { parseJsonField, readJsonObject as parseJsonObject, readJsonStringArray, serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import { defaultAccountPaymentReceiptTemplateHtml } from "@/lib/templates/thermal-receipt-templates";
import { getEnterpriseSession, requireEnterpriseSession } from "@/server/auth/enterprise-session";
import { deriveEcommercePaymentProjection } from "@/server/ecommerce/ecommerce-payment-state";
import { resolveStoreReceiptTemplateSelection } from "@/server/repositories/receipt-template-support";
import {
  ensureAlternateUomSellingSchemaCompatibility,
  ensureInventoryLocationSalesOrderSchemaCompatibility,
  ensureLayawayLifecycleSchemaCompatibility,
  ensureOperatingExpenseSchemaCompatibility,
  ensureInventoryExpirySchemaCompatibility,
  ensureProductVariantSalesOrderDepositSchemaCompatibility,
  ensureMultiBranchEcommerceSchemaCompatibility
} from "@/server/repositories/schema-compatibility.repository";
import { queueInterStoreTransferPublication } from "@/server/repositories/store-sync.repository";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import { postPosTransactionAccountingInTransaction } from "@/server/services/erp-pos-sale-accounting";
import {
  captureTransactionReference,
  sendSaleSmsNotificationSafely
} from "@/server/repositories/sale-sms.repository";
import {
  buildUnavailableFuelOperationsWorkspace,
  getFuelOperationsWorkspace,
  type FuelOperationsWorkspaceData
} from "@/server/repositories/erp-fuel-operations.repository";
import {
  shouldPostStockImmediately,
  STOCK_UPDATE_STATUS_PENDING,
  STOCK_UPDATE_STATUS_POSTED
} from "@/server/repositories/inventory-stock-policy.repository";

const onlineTerminalCode = "online-web";
const onlineStoreRoleCodes = new Set([
  "ONLINE_STORE_CASHIER",
  "ONLINE_STORE_SUPERVISOR"
]);

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Enter a valid sale quantity.");
  }

  return Number(quantity.toFixed(3));
}

function readInventoryBatchAllocations(value: unknown): InventoryBatchAllocation[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      const batchNo = typeof candidate.batchNo === "string" ? candidate.batchNo.trim() : "";
      const expiryDate = typeof candidate.expiryDate === "string" ? candidate.expiryDate : "";
      const quantity = Number(candidate.quantity);

      if (!batchNo || !expiryDate || !Number.isFinite(quantity) || quantity < 0) {
        return [];
      }

      return [{
        batchId: typeof candidate.batchId === "string" ? candidate.batchId : null,
        batchNo,
        manufacturedAt:
          typeof candidate.manufacturedAt === "string"
            ? candidate.manufacturedAt
            : null,
        expiryDate,
        quantity: toQuantity(quantity)
      }];
    });
  } catch {
    return [];
  }
}

function takeOutstandingInventoryBatchAllocations(input: {
  productName: string;
  quantity: number;
  issued: InventoryBatchAllocation[];
  received: InventoryBatchAllocation[];
}) {
  const receivedByBatch = new Map<string, number>();

  for (const allocation of input.received) {
    const key = `${allocation.batchNo.toUpperCase()}:${allocation.expiryDate.slice(0, 10)}`;
    receivedByBatch.set(key, toQuantity((receivedByBatch.get(key) ?? 0) + allocation.quantity));
  }

  let remainingQuantity = toQuantity(input.quantity);
  const allocations: InventoryBatchAllocation[] = [];

  for (const allocation of input.issued) {
    if (remainingQuantity <= 0.0001) {
      break;
    }

    const key = `${allocation.batchNo.toUpperCase()}:${allocation.expiryDate.slice(0, 10)}`;
    const alreadyReceived = receivedByBatch.get(key) ?? 0;
    const available = toQuantity(Math.max(0, allocation.quantity - alreadyReceived));
    receivedByBatch.set(key, toQuantity(Math.max(0, alreadyReceived - allocation.quantity)));
    const allocatedQuantity = toQuantity(
      Math.min(available, remainingQuantity)
    );

    if (allocatedQuantity > 0) {
      allocations.push({ ...allocation, quantity: allocatedQuantity });
      remainingQuantity = toQuantity(remainingQuantity - allocatedQuantity);
    }
  }

  if (remainingQuantity > 0.0001) {
    throw new Error(
      `The source issue does not contain enough outstanding batch quantity for ${input.productName}. Sync the source issue before receiving.`
    );
  }

  return allocations;
}

function isNonInventorySaleProduct(product: {
  productType?: string | null;
  trackInventory?: boolean | null;
}) {
  return (
    product.productType?.trim().toUpperCase() === "SERVICE" ||
    product.trackInventory === false
  );
}

function tracksInventoryForSale(product: {
  productType?: string | null;
  trackInventory?: boolean | null;
}) {
  return product.trackInventory === true && !isNonInventorySaleProduct(product);
}
function normalizeNonNegativeQuantity(value: unknown, label: string) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`Enter a valid ${label} quantity.`);
  }

  return Number(quantity.toFixed(3));
}

function normalizeMoney(value: unknown, label: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Enter a valid ${label} amount.`);
  }

  return toMoney(amount);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isServiceProductType(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase() === "SERVICE";
}

function isOnlineStoreStockManagedProduct(product: {
  productType?: string | null;
  trackInventory?: boolean | null;
}) {
  return Boolean(product.trackInventory) && !isServiceProductType(product.productType);
}

function normalizeFuelTransferProductKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isFuelTransferProduct(product: {
  code?: string | null;
  sku?: string | null;
  name?: string | null;
  shortName?: string | null;
  department?: string | null;
  category?: string | null;
  subcategory?: string | null;
}) {
  const values = [
    product.code,
    product.sku,
    product.name,
    product.shortName,
    product.department,
    product.category,
    product.subcategory
  ].map(normalizeFuelTransferProductKey);
  const exactFuelCodes = new Set([
    "AGO",
    "DIESEL",
    "AUTOMOTIVEGASOIL",
    "PMS",
    "PETROL",
    "GASOLINE",
    "PREMIUMMOTORSPIRIT",
    "LPG",
    "LIQUEFIEDPETROLEUMGAS",
    "KERO",
    "KEROSENE",
    "ATK",
    "JETFUEL"
  ]);

  if (values.some((value) => exactFuelCodes.has(value))) {
    return true;
  }

  return values.some((value) =>
    ["FUEL", "PETROL", "DIESEL", "GASOIL", "GASOLINE", "LPG"].some((keyword) =>
      value.includes(keyword)
    )
  );
}

async function ensureOnlineFuelDeliverySequence(
  tx: Prisma.TransactionClient,
  input: { retailOrgId: string; companyId: string }
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId: input.companyId,
      status: {
        not: "CLOSED"
      }
    },
    orderBy: {
      startsOn: "desc"
    },
    select: {
      id: true
    }
  });

  if (!fiscalYear) {
    throw new Error("Flash ERP needs an open fiscal year before it can mirror a fuel receipt into a tank.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: input.companyId,
        documentType: "FUEL_DELIVERY",
        fiscalYearId: fiscalYear.id
      }
    },
    update: {},
    create: {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      fiscalYearId: fiscalYear.id,
      documentType: "FUEL_DELIVERY",
      prefix: "FD",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: RecordStatus.ACTIVE
    }
  });
}

async function ensureOnlineFuelProductProfileFromCatalogProduct(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
    product: {
      code: string;
      name: string;
      shortName?: string | null;
      unitOfMeasure?: string | null;
    };
  }
) {
  return tx.erpProductProfile.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: input.product.code
      }
    },
    update: {
      companyId: input.companyId,
      name: input.product.name,
      productFamily: "FUEL",
      variantName: input.product.shortName ?? null,
      defaultUomCode: input.product.unitOfMeasure || "LTR",
      trackingMode: "BULK_LIQUID",
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      code: input.product.code,
      name: input.product.name,
      productFamily: "FUEL",
      variantName: input.product.shortName ?? null,
      defaultUomCode: input.product.unitOfMeasure || "LTR",
      trackingMode: "BULK_LIQUID",
      status: RecordStatus.ACTIVE
    }
  });
}

async function mirrorOnlineFuelReceiptToTank(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    storeId: string;
    inventoryLocationId: string;
    inventoryLocationCode: string;
    inventoryLocationName: string;
    referenceNo: string;
    sourceLabel: string | null;
    notes: string;
    occurredAt: Date;
    lines: Array<{
      product: {
        code: string;
        sku?: string | null;
        name: string;
        shortName?: string | null;
        department?: string | null;
        category?: string | null;
        subcategory?: string | null;
        unitOfMeasure?: string | null;
        baseCostPrice?: Prisma.Decimal | number | null;
      };
      quantity: number;
      unitCost: number;
    }>;
  }
) {
  const fuelLineCandidates = input.lines.filter((line) => isFuelTransferProduct(line.product));

  if (fuelLineCandidates.length === 0) {
    return {
      deliveryNo: null as string | null,
      skippedProducts: [] as string[]
    };
  }

  const company = await tx.erpCompany.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      baseCurrencyCode: true
    }
  });

  if (!company) {
    return {
      deliveryNo: null,
      skippedProducts: fuelLineCandidates.map((line) => `${line.product.code} at ${input.inventoryLocationCode}`)
    };
  }

  const site = await tx.erpOperatingSite.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: input.inventoryLocationCode
      }
    },
    update: {
      companyId: company.id,
      name: input.inventoryLocationName,
      siteType: "FUEL_SITE",
      location: input.inventoryLocationName,
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      code: input.inventoryLocationCode,
      name: input.inventoryLocationName,
      siteType: "FUEL_SITE",
      location: input.inventoryLocationName,
      status: RecordStatus.ACTIVE
    }
  });
  const siblingLocations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [
      { useForReceivingDefault: "desc" },
      { useForSalesDefault: "desc" },
      { useForSalesOrderDefault: "desc" },
      { code: "asc" }
    ],
    select: {
      code: true
    }
  });
  const candidateSiteCodes = [
    input.inventoryLocationCode,
    ...siblingLocations.map((location) => location.code)
  ].filter((code, index, codes): code is string => code.length > 0 && codes.indexOf(code) === index);
  const candidateSiteRows = await tx.erpOperatingSite.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      code: {
        in: candidateSiteCodes
      },
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true
    }
  });
  const candidateSiteByCode = new Map(candidateSiteRows.map((candidateSite) => [candidateSite.code, candidateSite]));
  candidateSiteByCode.set(site.code, { id: site.id, code: site.code });
  const candidateSites = candidateSiteCodes
    .map((code) => candidateSiteByCode.get(code))
    .filter((candidateSite): candidateSite is { id: string; code: string } => Boolean(candidateSite));
  const fuelLines: Array<{
    tank: { id: string; code: string; currentBookQuantity: Prisma.Decimal };
    profile: { id: string; code: string };
    quantity: number;
    unitCost: number;
    site: { id: string; code: string };
  }> = [];
  const skippedProducts: string[] = [];

  for (const line of fuelLineCandidates) {
    const profile = await ensureOnlineFuelProductProfileFromCatalogProduct(tx, {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      product: line.product
    });
    let tank: { id: string; code: string; currentBookQuantity: Prisma.Decimal } | null = null;
    let tankSite: { id: string; code: string } | null = null;

    for (const candidateSite of candidateSites) {
      tank = await tx.erpFuelTank.findFirst({
        where: {
          companyId: company.id,
          operatingSiteId: candidateSite.id,
          productProfileId: profile.id,
          status: RecordStatus.ACTIVE
        },
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          currentBookQuantity: true
        }
      });

      if (tank) {
        tankSite = candidateSite;
        break;
      }
    }

    if (!tank) {
      skippedProducts.push(`${profile.code} at ${site.code}`);
      continue;
    }

    const fallbackUnitCost =
      line.product.baseCostPrice === null || line.product.baseCostPrice === undefined
        ? 0
        : Number(line.product.baseCostPrice);
    const unitCost = line.unitCost > 0 ? line.unitCost : fallbackUnitCost;

    fuelLines.push({
      tank,
      profile,
      quantity: toQuantity(line.quantity),
      unitCost: toMoney(unitCost),
      site: tankSite ?? site
    });
  }

  if (fuelLines.length === 0) {
    return {
      deliveryNo: null,
      skippedProducts
    };
  }

  await ensureOnlineFuelDeliverySequence(tx, {
    retailOrgId: input.retailOrgId,
    companyId: company.id
  });
  const reserved = await reserveErpDocumentNumberInTransaction(tx, {
    retailOrgId: input.retailOrgId,
    companyId: company.id,
    documentType: "FUEL_DELIVERY"
  });
  const mirrorSite = fuelLines[0]?.site ?? site;
  const delivery = await tx.erpFuelDelivery.create({
    data: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      operatingSiteId: mirrorSite.id,
      deliveryNo: reserved.documentNo,
      supplierName: input.sourceLabel,
      supplierDocumentNo: input.referenceNo,
      deliveryDate: input.occurredAt,
      currencyCode: company.baseCurrencyCode,
      totalOrderedQuantity: toQuantityString(fuelLines.reduce((sum, line) => sum + line.quantity, 0)),
      totalDeliveredQuantity: toQuantityString(fuelLines.reduce((sum, line) => sum + line.quantity, 0)),
      totalAcceptedQuantity: toQuantityString(fuelLines.reduce((sum, line) => sum + line.quantity, 0)),
      totalVarianceQuantity: toQuantityString(0),
      totalCostAmount: toMoneyString(fuelLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)),
      notes: input.notes,
      status: "POSTED",
      lines: {
        create: fuelLines.map((line) => ({
          retailOrgId: input.retailOrgId,
          companyId: company.id,
          tankId: line.tank.id,
          productProfileId: line.profile.id,
          orderedQuantity: toQuantityString(line.quantity),
          deliveredQuantity: toQuantityString(line.quantity),
          acceptedQuantity: toQuantityString(line.quantity),
          varianceQuantity: toQuantityString(0),
          unitCost: line.unitCost.toFixed(4),
          lineCostAmount: toMoneyString(line.quantity * line.unitCost),
          notes: input.referenceNo
        }))
      }
    },
    select: {
      deliveryNo: true
    }
  });
  const incrementByTankId = new Map<string, { tank: (typeof fuelLines)[number]["tank"]; quantity: number }>();

  for (const line of fuelLines) {
    const current = incrementByTankId.get(line.tank.id);
    incrementByTankId.set(line.tank.id, {
      tank: current?.tank ?? line.tank,
      quantity: toQuantity((current?.quantity ?? 0) + line.quantity)
    });
  }

  for (const entry of incrementByTankId.values()) {
    await tx.erpFuelTank.update({
      where: {
        id: entry.tank.id
      },
      data: {
        currentBookQuantity: toQuantityString(Number(entry.tank.currentBookQuantity) + entry.quantity)
      }
    });
  }

  return {
    deliveryNo: delivery.deliveryNo,
    skippedProducts
  };
}

async function reduceOnlineFuelTankForSale(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    storeId: string;
    inventoryLocationCode: string;
    inventoryLocationName: string;
    referenceNo: string;
    lines: Array<{
      product: {
        code?: string | null;
        sku?: string | null;
        name: string;
        shortName?: string | null;
        department?: string | null;
        category?: string | null;
        subcategory?: string | null;
        unitOfMeasure?: string | null;
      };
      quantity: number;
    }>;
  }
) {
  const fuelLineCandidates = input.lines.filter((line) => isFuelTransferProduct(line.product));

  if (fuelLineCandidates.length === 0) {
    return {
      adjustedProducts: [] as string[],
      skippedProducts: [] as string[]
    };
  }

  const company = await tx.erpCompany.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true
    }
  });

  if (!company) {
    return {
      adjustedProducts: [],
      skippedProducts: fuelLineCandidates.map((line) => `${line.product.code ?? line.product.name} at ${input.inventoryLocationCode}`)
    };
  }

  const site = await tx.erpOperatingSite.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: input.inventoryLocationCode
      }
    },
    update: {
      companyId: company.id,
      name: input.inventoryLocationName,
      siteType: "FUEL_SITE",
      location: input.inventoryLocationName,
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      code: input.inventoryLocationCode,
      name: input.inventoryLocationName,
      siteType: "FUEL_SITE",
      location: input.inventoryLocationName,
      status: RecordStatus.ACTIVE
    }
  });
  const siblingLocations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [
      { useForSalesDefault: "desc" },
      { useForReceivingDefault: "desc" },
      { useForSalesOrderDefault: "desc" },
      { code: "asc" }
    ],
    select: {
      code: true
    }
  });
  const candidateSiteCodes = [
    input.inventoryLocationCode,
    ...siblingLocations.map((location) => location.code)
  ].filter((code, index, codes): code is string => code.length > 0 && codes.indexOf(code) === index);
  const candidateSiteRows = await tx.erpOperatingSite.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      code: {
        in: candidateSiteCodes
      },
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true
    }
  });
  const candidateSiteByCode = new Map(candidateSiteRows.map((candidateSite) => [candidateSite.code, candidateSite]));
  candidateSiteByCode.set(site.code, { id: site.id, code: site.code });
  const candidateSites = candidateSiteCodes
    .map((code) => candidateSiteByCode.get(code))
    .filter((candidateSite): candidateSite is { id: string; code: string } => Boolean(candidateSite));
  const reductionByTankId = new Map<string, {
    tank: { id: string; code: string; currentBookQuantity: Prisma.Decimal };
    productCode: string;
    quantity: number;
  }>();
  const skippedProducts: string[] = [];

  for (const line of fuelLineCandidates) {
    const productCode = line.product.code ?? line.product.name;
    const profile = await ensureOnlineFuelProductProfileFromCatalogProduct(tx, {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      product: {
        code: productCode,
        name: line.product.name,
        shortName: line.product.shortName ?? null,
        unitOfMeasure: line.product.unitOfMeasure ?? "LTR"
      }
    });
    let tank: { id: string; code: string; currentBookQuantity: Prisma.Decimal } | null = null;

    for (const candidateSite of candidateSites) {
      tank = await tx.erpFuelTank.findFirst({
        where: {
          companyId: company.id,
          operatingSiteId: candidateSite.id,
          productProfileId: profile.id,
          status: RecordStatus.ACTIVE
        },
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          currentBookQuantity: true
        }
      });

      if (tank) {
        break;
      }
    }

    if (!tank) {
      skippedProducts.push(`${profile.code} at ${site.code}`);
      continue;
    }

    const current = reductionByTankId.get(tank.id);
    reductionByTankId.set(tank.id, {
      tank: current?.tank ?? tank,
      productCode: current?.productCode ?? profile.code,
      quantity: toQuantity((current?.quantity ?? 0) + line.quantity)
    });
  }

  for (const reduction of reductionByTankId.values()) {
    await tx.erpFuelTank.update({
      where: {
        id: reduction.tank.id
      },
      data: {
        currentBookQuantity: toQuantityString(Number(reduction.tank.currentBookQuantity) - reduction.quantity)
      }
    });
  }

  return {
    adjustedProducts: [...reductionByTankId.values()].map((entry) => entry.productCode),
    skippedProducts
  };
}

function resolveSaleSmsDetails(details: unknown, note: string | null) {
  const rawDetails = optionalText(details);

  if (rawDetails) {
    return rawDetails;
  }

  if (!note) {
    return null;
  }

  const noteDetails = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^reference\s*:/i.test(line))
    .join(" ");

  return noteDetails || null;
}

function readOnlineStoreBranding(retailOrg?: {
  name: string;
  companySettingsJson?: Prisma.JsonValue | null;
}) {
  const companySettings = readJsonObject(retailOrg?.companySettingsJson);
  const tradingName =
    optionalText(companySettings.tradingName) ??
    optionalText(companySettings.legalName) ??
    retailOrg?.name ??
    "Flash ERP";

  return {
    tradingName,
    companyLogoUrl: optionalText(companySettings.companyLogoUrl)
  };
}

function resolveOnlineStoreReceiptTemplate(store: {
  salesReceiptTemplateHtml: string | null;
  salesReceiptTemplate?:
    | {
        code: string;
        name: string;
        templateHtml: string;
        isDefault: boolean;
        updatedAt: Date;
      }
    | null;
}) {
  return resolveStoreReceiptTemplateSelection({
    salesReceiptTemplateHtml: store.salesReceiptTemplateHtml,
    salesReceiptTemplate: store.salesReceiptTemplate
  });
}

function buildOnlineStoreReceiptBranding(store: {
  code: string;
  phone?: string | null;
  location?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  salesReceiptTemplateHtml: string | null;
  salesReceiptTemplate?:
    | {
        code: string;
        name: string;
        templateHtml: string;
        isDefault: boolean;
        updatedAt: Date;
      }
    | null;
  retailOrg: {
    name: string;
    companySettingsJson?: Prisma.JsonValue | null;
  };
}) {
  const branding = readOnlineStoreBranding(store.retailOrg);
  const receiptTemplate = resolveOnlineStoreReceiptTemplate(store);

  return {
    retailOrgName: branding.tradingName,
    companyLogoUrl: branding.companyLogoUrl,
    storeCode: store.code,
    storePhone: store.phone ?? null,
    storeLocation: store.location ?? null,
    storeAddress: store.addressLine1 ?? null,
    storeAddressLine2: store.addressLine2 ?? null,
    salesReceiptTemplateHtml: receiptTemplate.html
  };
}

function readOnlineProductSizes(value: Prisma.JsonValue | null | undefined) {
  const payload = readJsonObject(value);
  const rawSizes = Array.isArray(payload.productSizes) ? payload.productSizes : [];
  const seen = new Set<string>();
  const sizes: string[] = [];

  for (const rawSize of rawSizes) {
    const size = String(rawSize ?? "").trim().slice(0, 24);
    const key = size.toUpperCase();

    if (!size || seen.has(key)) {
      continue;
    }

    seen.add(key);
    sizes.push(size);
  }

  return sizes;
}

function readOnlinePosDiscountRates(value: Prisma.JsonValue | null | undefined) {
  const payload = readJsonObject(value);
  const rawRates = Array.isArray(payload.posDiscountRates) ? payload.posDiscountRates : [];
  const seen = new Set<string>();
  const rates: number[] = [];

  for (const rawRate of rawRates) {
    const rate = Number(rawRate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      continue;
    }

    const normalizedRate = Number(rate.toFixed(2));
    const key = normalizedRate.toFixed(2);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rates.push(normalizedRate);
  }

  return rates;
}

function resolveOnlineTransferUom(
  product: {
    unitOfMeasure: string;
    baseUnitOfMeasure: { code: string } | null;
    uomSchedule: {
      baseUnitOfMeasure: { code: string };
      lines: Array<{
        conversionFactor: Prisma.Decimal;
        unitOfMeasure: { code: string };
      }>;
    } | null;
  },
  enteredQuantity: number,
  enteredUnitOfMeasure?: string | null
) {
  const baseUnitOfMeasure = (
    product.baseUnitOfMeasure?.code ??
    product.uomSchedule?.baseUnitOfMeasure.code ??
    product.unitOfMeasure ??
    "EA"
  ).trim().toUpperCase();
  const requestedUnitOfMeasure = (
    enteredUnitOfMeasure?.trim() || product.unitOfMeasure || baseUnitOfMeasure
  ).toUpperCase();
  const scheduleLine = product.uomSchedule?.lines.find(
    (line) => line.unitOfMeasure.code.toUpperCase() === requestedUnitOfMeasure
  );
  const uomConversionFactor =
    requestedUnitOfMeasure === baseUnitOfMeasure
      ? 1
      : Number(scheduleLine?.conversionFactor ?? Number.NaN);

  if (!Number.isFinite(uomConversionFactor) || uomConversionFactor <= 0) {
    throw new Error(
      `Unit ${requestedUnitOfMeasure} is not configured on this product's UOM schedule.`
    );
  }

  return {
    requestedUnitOfMeasure,
    requestedUnitQuantity: Number(enteredQuantity.toFixed(3)),
    uomConversionFactor: Number(uomConversionFactor.toFixed(6)),
    baseUnitOfMeasure,
    baseQuantity: Number((enteredQuantity * uomConversionFactor).toFixed(3))
  };
}

function readOnlinePosExpressChargeRates(value: Prisma.JsonValue | null | undefined) {
  const payload = readJsonObject(value);
  const rawRates = Array.isArray(payload.posExpressChargeRates)
    ? payload.posExpressChargeRates
    : [];
  const seen = new Set<string>();
  const rates: number[] = [];

  for (const rawRate of rawRates) {
    const rate = Number(rawRate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      continue;
    }

    const normalizedRate = Number(rate.toFixed(2));
    const key = normalizedRate.toFixed(2);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rates.push(normalizedRate);
  }

  return rates;
}

function readOnlineSalesOrderFulfilmentStoreId(value: Prisma.JsonValue | null | undefined) {
  return optionalText(readJsonObject(value).salesOrderFulfilmentStoreId);
}

function resolveOnlineConfiguredDiscountRate(
  requestedRate: unknown,
  companySettingsJson: Prisma.JsonValue | null | undefined
) {
  const rate = Number(requestedRate ?? 0);

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const normalizedRate = Number(rate.toFixed(2));
  const configuredRate = readOnlinePosDiscountRates(companySettingsJson).find(
    (candidate) => candidate.toFixed(2) === normalizedRate.toFixed(2)
  );

  if (configuredRate === undefined) {
    throw new Error("Choose a configured POS discount rate before applying this sale discount.");
  }

  return configuredRate;
}

function formatOnlineDiscountRate(rate: number) {
  return Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2);
}

function normalizeSerialNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

function validateOnlineSerializedSaleLine(input: {
  isSerialized: boolean;
  productName: string;
  baseQuantity: number;
  serialNumbers: unknown;
}) {
  const normalizedSerialNumbers = normalizeSerialNumbers(input.serialNumbers);

  if (!input.isSerialized) {
    if (normalizedSerialNumbers.length > 0) {
      throw new Error(
        `${input.productName} is not configured as a serialized item, so Flash ERP cannot accept serial numbers for it.`
      );
    }

    return [];
  }

  if (!Number.isInteger(input.baseQuantity)) {
    throw new Error(
      `${input.productName} is serialized, so Flash ERP requires a whole-number quantity.`
    );
  }

  if (normalizedSerialNumbers.length !== input.baseQuantity) {
    throw new Error(
      `${input.productName} is serialized, so Flash ERP needs exactly ${formatNumberForMessage(
        input.baseQuantity
      )} serial number(s). Scan or select them before completing the sale.`
    );
  }

  return normalizedSerialNumbers;
}

function assertNoDuplicateOnlineSaleSerials(
  lines: Array<{ product: { name: string }; serialNumbers: string[] }>
) {
  const seen = new Set<string>();

  for (const line of lines) {
    for (const serialNumber of line.serialNumbers) {
      if (seen.has(serialNumber)) {
        throw new Error(
          `Serial number ${serialNumber} appears more than once in this basket for ${line.product.name}.`
        );
      }

      seen.add(serialNumber);
    }
  }
}

function toSupplierReturnReason(value: unknown) {
  return value === SupplierReturnReason.DAMAGED ||
    value === SupplierReturnReason.REJECTED_AT_RECEIPT ||
    value === SupplierReturnReason.QUALITY_HOLD ||
    value === SupplierReturnReason.SHORT_EXPIRY ||
    value === SupplierReturnReason.WRONG_ITEM ||
    value === SupplierReturnReason.OTHER
    ? value
    : SupplierReturnReason.OTHER;
}

function toMoney(value: number) {
  return Number(value.toFixed(2));
}

function toMoneyString(value: number) {
  return toMoney(value).toFixed(2);
}

export type OnlineStoreManagerOverrideRequest = {
  supervisorCode?: string | null;
  supervisorPassword?: string | null;
  note?: string | null;
};

type OnlineStoreManagerApproval = {
  approvalType: "CURRENT_OPERATOR" | "MANAGER_OVERRIDE";
  supervisorUserId: string;
  supervisorLoginId: string;
  supervisorDisplayName: string;
  note: string | null;
  permissionCodes: string[];
};

function toQuantity(value: unknown) {
  return Number(Number(value ?? 0).toFixed(3));
}

function toQuantityString(value: number) {
  return toQuantity(value).toFixed(3);
}

function formatNumberForMessage(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3
  }).format(value);
}

const defaultOnlineLoyaltyPolicy: LoyaltyPolicy = {
  loyaltyProgramEnabled: true,
  loyaltyPointsPerCurrencyUnit: 1,
  loyaltyRedemptionEnabled: false,
  loyaltyRedemptionPointsStep: 100,
  loyaltyRedemptionValueAmount: 1,
  loyaltyMinimumRedeemPoints: 100,
  loyaltyMaximumRedeemPercentOfSale: 100
};

const defaultOnlineOptionSettings = {
  allowNegativeInventory: false,
  allowOfflineSales: true,
  autoPrintReceipts: true,
  enforceSerializedScanAtPos: true,
  requireCustomerForCreditSales: true,
  requireSupervisorForReceiptlessReturn: true,
  defaultReceiptSearchDays: 30,
  shiftFloatPromptAmount: 0,
  showCriticalStocksOnStartup: false,
  showExpiringBatchesOnStartup: true,
  expiryAlertLeadDays: 30,
  expiryCriticalDays: 7,
  productSizes: [] as string[],
  posDiscountRates: [] as number[],
  posExpressChargeRates: [] as number[],
  layawaySettings: normalizeLayawaySettings(null)
};

const defaultOnlineSalesOrderRouting = {
  fulfilmentStoreId: null,
  fulfilmentStoreCode: null,
  fulfilmentStoreName: null,
  isFulfilmentStore: false
};

function readJsonObject(value: unknown) {
  return parseJsonObject(value);
}

function readOnlineOptionSettings(value: Prisma.JsonValue | null | undefined) {
  const payload = readJsonObject(value);
  const readBooleanOption = (key: string, fallback: boolean) =>
    typeof payload[key] === "boolean" ? payload[key] === true : fallback;
  const readNumberOption = (key: string, fallback: number) => {
    const parsed = Number(payload[key] ?? fallback);

    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const shiftFloatPromptAmount = readNumberOption("shiftFloatPromptAmount", 0);
  const expiryAlertLeadDays = Math.min(
    3650,
    Math.max(
      1,
      Math.trunc(
        readNumberOption(
          "expiryAlertLeadDays",
          defaultOnlineOptionSettings.expiryAlertLeadDays
        )
      )
    )
  );
  const expiryCriticalDays = Math.min(
    expiryAlertLeadDays,
    Math.max(
      0,
      Math.trunc(
        readNumberOption(
          "expiryCriticalDays",
          defaultOnlineOptionSettings.expiryCriticalDays
        )
      )
    )
  );

  return {
    allowNegativeInventory: readBooleanOption(
      "allowNegativeInventory",
      defaultOnlineOptionSettings.allowNegativeInventory
    ),
    allowOfflineSales: readBooleanOption(
      "allowOfflineSales",
      defaultOnlineOptionSettings.allowOfflineSales
    ),
    autoPrintReceipts: readBooleanOption(
      "autoPrintReceipts",
      defaultOnlineOptionSettings.autoPrintReceipts
    ),
    enforceSerializedScanAtPos: readBooleanOption(
      "enforceSerializedScanAtPos",
      defaultOnlineOptionSettings.enforceSerializedScanAtPos
    ),
    requireCustomerForCreditSales: readBooleanOption(
      "requireCustomerForCreditSales",
      defaultOnlineOptionSettings.requireCustomerForCreditSales
    ),
    requireSupervisorForReceiptlessReturn: readBooleanOption(
      "requireSupervisorForReceiptlessReturn",
      defaultOnlineOptionSettings.requireSupervisorForReceiptlessReturn
    ),
    defaultReceiptSearchDays: Math.min(
      365,
      Math.max(
        1,
        Math.trunc(
          readNumberOption(
            "defaultReceiptSearchDays",
            defaultOnlineOptionSettings.defaultReceiptSearchDays
          )
        )
      )
    ),
    shiftFloatPromptAmount: Number(
      Math.max(0, Number.isFinite(shiftFloatPromptAmount) ? shiftFloatPromptAmount : 0).toFixed(2)
    ),
    showCriticalStocksOnStartup: readBooleanOption(
      "showCriticalStocksOnStartup",
      defaultOnlineOptionSettings.showCriticalStocksOnStartup
    ),
    showExpiringBatchesOnStartup: readBooleanOption(
      "showExpiringBatchesOnStartup",
      defaultOnlineOptionSettings.showExpiringBatchesOnStartup
    ),
    expiryAlertLeadDays,
    expiryCriticalDays
  };
}

function readCatalogPolicy(value: Prisma.JsonValue | null | undefined) {
  const record = readJsonObject(value);

  if (Object.keys(record).length === 0) {
    return null;
  }
  const readCodes = (key: string) => {
    const source = Array.isArray(record[key])
      ? record[key]
      : typeof record[key] === "string"
        ? record[key].split(/[,\n]+/)
        : [];
    const codes = source
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    return codes.length > 0 ? codes : null;
  };

  return {
    departmentCodes: readCodes("departmentCodes"),
    categoryCodes: readCodes("categoryCodes"),
    productCodes: readCodes("productCodes"),
    productSortOrders: null as Record<string, number> | null
  };
}

function readStringArrayJson(value: unknown) {
  return readJsonStringArray(value);
}

function readTransferFeedbackEvidence(value: unknown) {
  const parsed = parseJsonField(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const url = optionalText(record.url);

      if (!url) {
        return null;
      }

      return {
        url,
        fileName: optionalText(record.fileName),
        capturedAt: optionalText(record.capturedAt),
        uploadedAt: optionalText(record.uploadedAt),
      };
    })
    .filter(
      (item): item is {
        url: string;
        fileName: string | null;
        capturedAt: string | null;
        uploadedAt: string | null;
      } => Boolean(item),
    );
}

function resolveOnlineStoreCatalogPolicy(store: {
  catalogPolicyJson: Prisma.JsonValue | null;
  inventoryCatalogLinks: Array<{
    catalog: {
      products: Array<{
        sortOrder: number;
        product: {
          code: string;
        };
      }>;
    };
  }>;
}) {
  if (store.inventoryCatalogLinks.length === 0) {
    return readCatalogPolicy(store.catalogPolicyJson);
  }

  const productCodes = new Set<string>();
  const productSortOrders = new Map<string, number>();

  for (const link of store.inventoryCatalogLinks) {
    for (const productLink of link.catalog.products) {
      const productCode = productLink.product.code;
      productCodes.add(productCode);
      const currentSortOrder = productSortOrders.get(productCode);

      if (currentSortOrder === undefined || productLink.sortOrder < currentSortOrder) {
        productSortOrders.set(productCode, productLink.sortOrder);
      }
    }
  }

  return {
    departmentCodes: null,
    categoryCodes: null,
    productCodes: [...productCodes],
    productSortOrders:
      productSortOrders.size > 0
        ? Object.fromEntries(
            [...productSortOrders.entries()].sort((left, right) =>
              left[1] === right[1] ? left[0].localeCompare(right[0]) : left[1] - right[1]
            )
          )
        : null
  };
}

function catalogPolicyAllowsProduct(
  policy: ReturnType<typeof readCatalogPolicy>,
  product: {
    code: string;
    department: string | null;
    category: string | null;
  }
) {
  if (!policy) {
    return true;
  }

  const productCode = product.code.trim().toUpperCase();
  const departmentCode = product.department?.trim().toUpperCase() ?? "";
  const categoryCode = product.category?.trim().toUpperCase() ?? "";
  const productCodes = new Set((policy.productCodes ?? []).map((code) => code.trim().toUpperCase()));
  const departmentCodes = new Set((policy.departmentCodes ?? []).map((code) => code.trim().toUpperCase()));
  const categoryCodes = new Set((policy.categoryCodes ?? []).map((code) => code.trim().toUpperCase()));

  return (
    productCodes.has(productCode) ||
    (departmentCode.length > 0 && departmentCodes.has(departmentCode)) ||
    (categoryCode.length > 0 && categoryCodes.has(categoryCode)) ||
    (productCodes.size === 0 && departmentCodes.size === 0 && categoryCodes.size === 0)
  );
}

function buildBusinessDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function sanitizeCodeSegment(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

async function ensureOnlineStoreInventoryTopology(
  tx: OnlineStoreTx,
  input: {
    retailOrgId: string;
    store: {
      id: string;
      code: string;
      name: string;
      salesEnabled: boolean;
      warehouseEnabled: boolean;
    };
  }
) {
  const activeLocations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.store.id,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ createdAt: "asc" }, { code: "asc" }],
    select: {
      id: true,
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true
    }
  });

  if (activeLocations.length > 0) {
    const firstLocation = activeLocations[0];

    if (!input.store.salesEnabled) {
      await tx.inventoryLocation.updateMany({
        where: {
          retailOrgId: input.retailOrgId,
          storeId: input.store.id
        },
        data: {
          useForSalesDefault: false,
          useForSalesOrderDefault: false
        }
      });
    } else if (!activeLocations.some((location) => location.useForSalesDefault)) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id
        },
        data: {
          useForSalesDefault: true
        }
      });
    }

    if (
      input.store.salesEnabled &&
      !activeLocations.some((location) => location.useForSalesOrderDefault)
    ) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id
        },
        data: {
          useForSalesOrderDefault: true
        }
      });
    }

    if (!input.store.warehouseEnabled) {
      await tx.inventoryLocation.updateMany({
        where: {
          retailOrgId: input.retailOrgId,
          storeId: input.store.id
        },
        data: {
          useForReceivingDefault: false
        }
      });
    } else if (!activeLocations.some((location) => location.useForReceivingDefault)) {
      await tx.inventoryLocation.update({
        where: {
          id: firstLocation.id
        },
        data: {
          useForReceivingDefault: true
        }
      });
    }

    return;
  }

  if (!input.store.salesEnabled && !input.store.warehouseEnabled) {
    return;
  }

  const storeCode = sanitizeCodeSegment(input.store.code) || "ONLINE";
  const warehouseCode = `${storeCode}-WH`;
  const locationCode = `${storeCode}-LOC`;
  const existingWarehouse = await tx.warehouse.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      code: warehouseCode
    },
    select: {
      id: true,
      storeId: true
    }
  });

  if (existingWarehouse?.storeId && existingWarehouse.storeId !== input.store.id) {
    throw new Error(`Flash ERP cannot attach ${warehouseCode} because it belongs to another store.`);
  }

  const warehouse = existingWarehouse
    ? await tx.warehouse.update({
        where: {
          id: existingWarehouse.id
        },
        data: {
          storeId: input.store.id,
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true
        }
      })
    : await tx.warehouse.create({
        data: {
          retailOrgId: input.retailOrgId,
          storeId: input.store.id,
          code: warehouseCode,
          name: `${input.store.name} Warehouse`,
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true
        }
      });

  await tx.inventoryLocation.create({
    data: {
      retailOrgId: input.retailOrgId,
      storeId: input.store.id,
      warehouseId: warehouse.id,
      code: locationCode,
      name: `${input.store.name} Sales and Transfer Location`,
      locationType:
        !input.store.salesEnabled && input.store.warehouseEnabled
          ? LocationType.WAREHOUSE
          : LocationType.STORE_FLOOR,
      useForSalesDefault: input.store.salesEnabled,
      useForSalesOrderDefault: input.store.salesEnabled,
      useForReceivingDefault: input.store.warehouseEnabled,
      status: RecordStatus.ACTIVE
    }
  });
}

function tenderRequiresBankAccount(tender: {
  paymentMethod: PaymentMethod | string;
  code?: string | null;
  name?: string | null;
}) {
  const tokens = [tender.paymentMethod, tender.code, tender.name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toUpperCase();

  return (
    tokens.includes("BANK_TRANSFER") ||
    tokens.includes("BANK DEPOSIT") ||
    tokens.includes("BANK-DEPOSIT") ||
    tokens.includes("DEPOSIT") ||
    tokens.includes("CHEQUE") ||
    tokens.includes("CHECK")
  );
}

function isCashTender(tender: {
  paymentMethod: PaymentMethod | string;
  code?: string | null;
  name?: string | null;
}) {
  const tokens = `${tender.paymentMethod} ${tender.code ?? ""} ${tender.name ?? ""}`.toUpperCase();

  return tender.paymentMethod === PaymentMethod.CASH || tokens.includes("CASH") || tokens.includes("CASH SALE");
}

function buildLocalDocumentNo(prefix: string, storeCode: string, sequence: number, timestamp: Date) {
  const storeToken =
    storeCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "STORE";
  const stamp = timestamp.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

  return `${prefix}-${storeToken}-${String(sequence).padStart(4, "0")}-${stamp}`;
}

function signedPaymentAmount(input: {
  transactionType: PosTransactionType | string;
  totalAmount: number;
  paymentAmount: number;
}) {
  if (
    input.transactionType === PosTransactionType.RETURN ||
    (input.transactionType === PosTransactionType.EXCHANGE && input.totalAmount < 0)
  ) {
    return toMoney(input.paymentAmount * -1);
  }

  return toMoney(input.paymentAmount);
}

function signedTransactionAmount(input: {
  transactionType: PosTransactionType | string;
  amount: number;
}) {
  return input.transactionType === PosTransactionType.RETURN
    ? toMoney(Math.abs(input.amount) * -1)
    : toMoney(input.amount);
}

function signedLineAmount(input: {
  lineIntent: PosTransactionLineIntent | string;
  amount: number;
}) {
  return input.lineIntent === PosTransactionLineIntent.RETURN ? toMoney(input.amount * -1) : toMoney(input.amount);
}

async function getOnlineStoreAssignment(
  options: { redirectOnMissingSession?: boolean } = {}
) {
  await Promise.all([
    ensureProductVariantSalesOrderDepositSchemaCompatibility(),
    ensureLayawayLifecycleSchemaCompatibility(),
    ensureInventoryExpirySchemaCompatibility(),
    ensureAlternateUomSellingSchemaCompatibility()
  ]);

  const session =
    options.redirectOnMissingSession === false
      ? await getEnterpriseSession()
      : await requireEnterpriseSession();

  if (!session) {
    throw new Error("Your Online POS session has expired. Sign in again, then retry the POS action.");
  }

  const hasOnlineStoreRole = session.roleCodes.some((roleCode) =>
    onlineStoreRoleCodes.has(roleCode)
  );
  const user = await prisma.retailUser.findFirst({
    where: {
      id: session.userId,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      id: true,
      loginId: true,
      displayName: true,
      homeStore: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          timezone: true,
          phone: true,
          location: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          salesEnabled: true,
          warehouseEnabled: true,
          receiptHeader: true,
          receiptFooter: true,
          salesReceiptTemplateHtml: true,
          salesReceiptTemplate: {
            select: {
              code: true,
              name: true,
              templateHtml: true,
              isDefault: true,
              updatedAt: true
            }
          },
          accountPaymentReceiptTemplateHtml: true,
          accountPaymentReceiptTemplate: {
            select: {
              templateHtml: true
            }
          },
          storeMode: true,
          status: true,
          catalogPolicyJson: true,
          retailOrg: {
            select: {
              name: true,
              companySettingsJson: true,
              optionsSettingsJson: true
            }
          },
          inventoryCatalogLinks: {
            where: {
              catalog: {
                status: RecordStatus.ACTIVE,
                deletedAt: null
              }
            },
            select: {
              catalog: {
                select: {
                  products: {
                    select: {
                      sortOrder: true,
                      product: {
                        select: {
                          code: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user?.homeStore || user.homeStore.status !== RecordStatus.ACTIVE) {
    return {
      session,
      user,
      store: null
    };
  }

  return {
    session,
    user,
    store:
      hasOnlineStoreRole && user.homeStore.storeMode === "ONLINE_DIRECT"
        ? user.homeStore
        : null
  };
}

export type OnlineStoreReportId =
  | "sales"
  | "products"
  | "serialsBatches"
  | "orders"
  | "layaways"
  | "layawayPayments"
  | "tenders"
  | "inventory"
  | "banking"
  | "shifts";

export type OnlineStoreReportCriteria = {
  reportId?: OnlineStoreReportId | null;
  scope?: "CASHIER" | "STORE" | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  cashierCode?: string | null;
  shiftId?: string | null;
  searchQuery?: string | null;
  customerQuery?: string | null;
  productQuery?: string | null;
  tenderMethodCode?: string | null;
  locationId?: string | null;
  limit?: number | null;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
};

export type NormalizedOnlineReportCriteria = {
  reportId: OnlineStoreReportId;
  scope: "CASHIER" | "STORE";
  dateFrom: string;
  dateTo: string;
  cashierCode: string | null;
  shiftId: string | null;
  searchQuery: string | null;
  customerQuery: string | null;
  productQuery: string | null;
  tenderMethodCode: string | null;
  locationId: string | null;
  limit: number;
};

export type OnlineStoreReportParameter = {
  parameterId: string;
  label: string;
  inputType: "date" | "text" | "select" | "number";
  placeholder?: string | null;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

export type OnlineStoreReportDefinition = {
  reportId: OnlineStoreReportId;
  label: string;
  group: string;
  description: string;
  parameterIds: string[];
};

const defaultOnlineReportDefinitions: OnlineStoreReportDefinition[] = [
  {
    reportId: "sales",
    label: "Sales",
    group: "Sales",
    description: "Receipt, customer, cashier, shift, and product movement.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "customerQuery", "productQuery", "limit"]
  },
  {
    reportId: "products",
    label: "Products",
    group: "Sales",
    description: "Product quantity, gross, tax, discount, and net movement.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "productQuery", "limit"]
  },
  {
    reportId: "serialsBatches",
    label: "Sold serials and batches",
    group: "Inventory",
    description: "Receipt-level serial numbers and batch allocations for tracked items sold at this shop.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "productQuery", "locationId", "limit"]
  },
  {
    reportId: "orders",
    label: "Sales Orders",
    group: "Sales",
    description: "Sales order deposits, outstanding balances, and fulfilment status.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "customerQuery", "productQuery", "limit"]
  },
  {
    reportId: "layaways",
    label: "Layaway ageing",
    group: "Sales",
    description: "Outstanding balances, reservations, ageing, cancellations, and refunds.",
    parameterIds: ["dateFrom", "dateTo", "scope", "customerQuery", "limit"]
  },
  {
    reportId: "layawayPayments",
    label: "Layaway payments",
    group: "Sales",
    description: "Deposits, installments, and refunds by tender, cashier, terminal, and shift.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "customerQuery", "tenderMethodCode", "limit"]
  },
  {
    reportId: "tenders",
    label: "Tenders",
    group: "Banking",
    description: "Tender mix filtered by date, cashier, shift, and tender method.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "tenderMethodCode", "limit"]
  },
  {
    reportId: "inventory",
    label: "Inventory",
    group: "Inventory",
    description: "Current inventory valuation by product and location.",
    parameterIds: ["locationId", "productQuery", "limit"]
  },
  {
    reportId: "banking",
    label: "Banking",
    group: "Banking",
    description: "Banking deposits filtered by date, shift, and reference search.",
    parameterIds: ["dateFrom", "dateTo", "shiftId", "searchQuery", "limit"]
  },
  {
    reportId: "shifts",
    label: "Shifts",
    group: "Audit",
    description: "Shift closeout and cash variance rows.",
    parameterIds: ["dateFrom", "dateTo", "scope", "cashierCode", "shiftId", "searchQuery", "limit"]
  }
];

const onlineReportParameterIds = new Set([
  "dateFrom",
  "dateTo",
  "scope",
  "cashierCode",
  "shiftId",
  "customerQuery",
  "productQuery",
  "searchQuery",
  "tenderMethodCode",
  "locationId",
  "limit"
]);

function readOnlineReportDefinitions(value: Prisma.JsonValue | null | undefined) {
  const rawDefinitions = readJsonObject(value).onlineStoreReportDefinitions;

  if (!Array.isArray(rawDefinitions)) {
    return defaultOnlineReportDefinitions;
  }

  const definitions = rawDefinitions
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const rawReportId = typeof record.reportId === "string" ? record.reportId : null;
      const reportId = normalizeOnlineReportId(rawReportId);
      const fallback = defaultOnlineReportDefinitions.find((definition) => definition.reportId === reportId);
      const label = optionalText(record.label) ?? fallback?.label ?? reportId.toUpperCase();
      const group = optionalText(record.group) ?? fallback?.group ?? "Reports";
      const description = optionalText(record.description) ?? fallback?.description ?? "";
      const parameterIds = Array.isArray(record.parameterIds)
        ? record.parameterIds.filter((parameterId): parameterId is string =>
            typeof parameterId === "string" && onlineReportParameterIds.has(parameterId)
          )
        : fallback?.parameterIds ?? ["limit"];

      return {
        reportId,
        label,
        group,
        description,
        parameterIds: [...new Set(parameterIds.length ? parameterIds : fallback?.parameterIds ?? ["limit"])],
        sortOrder:
          typeof record.sortOrder === "number" && Number.isFinite(record.sortOrder)
            ? record.sortOrder
            : defaultOnlineReportDefinitions.findIndex((definition) => definition.reportId === reportId)
      };
    })
    .filter((definition): definition is OnlineStoreReportDefinition & { sortOrder: number } => definition !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...definition }) => definition);

  if (!definitions.length) {
    return defaultOnlineReportDefinitions;
  }

  const soldTraceDefinition = defaultOnlineReportDefinitions.find(
    (definition) => definition.reportId === "serialsBatches"
  );

  return soldTraceDefinition && !definitions.some((definition) => definition.reportId === "serialsBatches")
    ? [...definitions, soldTraceDefinition]
    : definitions;
}

export type OnlineStoreWorkspaceData = {
  isAvailable: boolean;
  unavailableReason: string | null;
  operator: {
    displayName: string;
    loginId: string;
  };
  capabilities: {
    canAccessEcommerceConsole: boolean;
    canCreateLayaway: boolean;
    canReceiveLayawayPayment: boolean;
    canCancelLayaway: boolean;
    canReleaseLayawayReservation: boolean;
    canOverrideLayawayPolicy: boolean;
    canFulfilLayaway: boolean;
    hasFuelOperationsVisibility: boolean;
    canManageFuelTanks: boolean;
    canCaptureFuelDips: boolean;
    canCaptureFuelMeterReadings: boolean;
    canCaptureSupplierFuelReceipts: boolean;
    canManageFuelReconciliation: boolean;
  };
  fuelOperationsWorkspace: FuelOperationsWorkspaceData;
  store: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    timezone: string;
    phone: string | null;
    location: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    salesEnabled: boolean;
    warehouseEnabled: boolean;
    receiptHeader: string | null;
    receiptFooter: string | null;
    salesReceiptTemplateHtml: string | null;
    accountPaymentReceiptTemplateHtml: string | null;
  } | null;
  branding: {
    tradingName: string;
    companyLogoUrl: string | null;
  };
  metrics: {
    todaySales: number;
    todayTransactions: number;
    todayReturns: number;
    todayExchanges: number;
    todayReturnsAmount: number;
    expectedCash: number;
    accountPayments: number;
    openOrders: number;
    openShiftNo: string | null;
    productCount: number;
  };
  optionSettings: {
    allowNegativeInventory: boolean;
    allowOfflineSales: boolean;
    autoPrintReceipts: boolean;
    enforceSerializedScanAtPos: boolean;
    requireCustomerForCreditSales: boolean;
    requireSupervisorForReceiptlessReturn: boolean;
    defaultReceiptSearchDays: number;
    shiftFloatPromptAmount: number;
    showCriticalStocksOnStartup: boolean;
    showExpiringBatchesOnStartup: boolean;
    expiryAlertLeadDays: number;
    expiryCriticalDays: number;
    productSizes: string[];
    posDiscountRates: number[];
    posExpressChargeRates: number[];
    layawaySettings: ReturnType<typeof normalizeLayawaySettings>;
  };
  salesOrderRouting: {
    fulfilmentStoreId: string | null;
    fulfilmentStoreCode: string | null;
    fulfilmentStoreName: string | null;
    isFulfilmentStore: boolean;
  };
  loyaltyPolicy: LoyaltyPolicy;
  promotions: AutomaticPromotionPolicy[];
  customers: Array<{
    customerId: string;
    customerNo: string;
    fullName: string;
    customerType: string;
    phone: string | null;
    email: string | null;
    allowCreditSales: boolean;
    creditLimitAmount: number | null;
    receivableBalanceAmount: number;
    loyaltyEnrolled: boolean;
    loyaltyTier: string | null;
    loyaltyPointsBalance: number;
  }>;
  products: Array<{
    productId: string;
    productCode: string;
    productName: string;
    productType: string;
    unitOfMeasure: string;
    baseUnitOfMeasure: string;
    sellingUnits: Array<{
      productVariantId: string | null;
      unitOfMeasureCode: string;
      unitOfMeasureName: string;
      conversionFactor: number;
      unitPrice: number;
      barcode: string | null;
      isDefault: boolean;
      allowFractionalSale: boolean;
      decimalPrecision: number;
    }>;
    price: number;
    department: string | null;
    category: string | null;
    imageUrl: string | null;
    quantityOnHand: number;
    taxRatePercent: number;
    taxInclusive: boolean;
    mustEnterPriceAtPos: boolean;
    isSerialized: boolean;
    trackInventory: boolean;
    trackSize: boolean;
    trackColor: boolean;
    trackExpiry: boolean;
    shelfLifeDays: number | null;
    minStockLevel: number | null;
    reorderPoint: number | null;
    safetyStockLevel: number | null;
    earliestExpiryDate: string | null;
    expiringQuantity: number;
    matrixVariants: Array<{
      variantId: string;
      code: string;
      sku: string | null;
      displayName: string | null;
      unitPrice: number;
      quantityOnHand: number;
      barcode: string | null;
      attributes: Array<{
        attributeName: string;
        valueLabel: string;
      }>;
    }>;
  }>;
  inventoryProducts: Array<{
    productId: string;
    productCode: string;
    sku: string | null;
    productName: string;
    productType: string;
    unitOfMeasure: string;
    baseUnitOfMeasure: string;
    sellingUnits: Array<{
      productVariantId: string | null;
      unitOfMeasureCode: string;
      unitOfMeasureName: string;
      conversionFactor: number;
      unitPrice: number;
      barcode: string | null;
      isDefault: boolean;
      allowFractionalSale: boolean;
      decimalPrecision: number;
    }>;
    uomConversions: Array<{
      uomCode: string;
      uomName: string;
      conversionFactor: number;
      isBaseUnit: boolean;
      allowSale: boolean;
      allowPurchase: boolean;
    }>;
    price: number;
    unitCost: number | null;
    department: string | null;
    category: string | null;
    imageUrl: string | null;
    quantityOnHand: number;
    taxRatePercent: number;
    taxInclusive: boolean;
    mustEnterPriceAtPos: boolean;
    isSerialized: boolean;
    trackInventory: boolean;
    trackSize: boolean;
    trackColor: boolean;
    trackExpiry: boolean;
    shelfLifeDays: number | null;
    minStockLevel: number | null;
    reorderPoint: number | null;
    safetyStockLevel: number | null;
    earliestExpiryDate: string | null;
    expiringQuantity: number;
    matrixVariants: Array<{
      variantId: string;
      code: string;
      sku: string | null;
      displayName: string | null;
      unitPrice: number;
      quantityOnHand: number;
      barcode: string | null;
      attributes: Array<{
        attributeName: string;
        valueLabel: string;
      }>;
    }>;
  }>;
  purchaseOrderSuppliers: Array<{
    supplierNo: string;
    supplierName: string;
  }>;
  inventoryRows: Array<{
    productId: string;
    productCode: string;
    productName: string;
    isSerialized: boolean;
    trackExpiry: boolean;
    locationId: string;
    locationCode: string;
    locationName: string;
    quantityOnHand: number;
    activeReservedQuantity: number;
    ecommerceSellableQuantity: number;
    ecommercePickupEligible: boolean;
    ecommerceDeliveryEligible: boolean;
    ecommerceEligibilityLabel: string;
    price: number;
  }>;
  inventoryBatches: Array<{
    batchId: string;
    productId: string;
    productCode: string;
    productName: string;
    locationId: string;
    locationCode: string;
    locationName: string;
    batchNo: string;
    manufacturedAt: string | null;
    expiryDate: string;
    daysUntilExpiry: number;
    quantityOnHand: number;
    status: string;
  }>;
  inventorySerialUnits: Array<{
    serialUnitId: string;
    productId: string;
    productCode: string;
    productName: string;
    locationId: string | null;
    locationCode: string | null;
    locationName: string | null;
    serialNumber: string;
    status: string;
    sourceReferenceType: string | null;
    sourceReferenceId: string | null;
    sourceReferenceLabel: string | null;
    lastOccurredAt: string | null;
    updatedAt: string;
  }>;
  inventoryLocations: Array<{
    locationId: string;
    locationCode: string;
    locationName: string;
    warehouseId: string | null;
    warehouseCode: string | null;
    useForSalesDefault: boolean;
    useForSalesOrderDefault: boolean;
    useForReceivingDefault: boolean;
  }>;
  transferStores: Array<{
    storeId: string;
    storeCode: string;
    storeName: string;
    defaultLocationId: string | null;
    sourceLocations: Array<{
      locationId: string;
      locationCode: string;
      locationName: string;
    }>;
  }>;
  tenderMethods: Array<{
    tenderMethodId: string;
    tenderMethodCode: string;
    tenderMethodName: string;
    paymentMethod: string;
    requiresReference: boolean;
    requiresBankAccount: boolean;
    allowRefund: boolean;
    allowChange: boolean;
    sortOrder: number;
  }>;
  bankAccounts: Array<{
    bankAccountId: string;
    accountNumber: string;
    accountName: string;
    currencyCode: string;
    bankCode: string | null;
    bankName: string | null;
    branchCode: string | null;
    branchName: string | null;
  }>;
  shift: {
    shiftId: string;
    shiftNo: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    openingFloatAmount: number;
    expectedCashAmount: number;
    declaredCashAmount: number | null;
    varianceAmount: number | null;
    transactionCount: number;
    salesCount: number;
    returnCount: number;
    exchangeCount: number;
    netSalesAmount: number;
    cashTenderedAmount: number;
    nonCashTenderedAmount: number;
    tenderTotals: Array<{
      paymentMethod: string;
      tenderMethodCode: string | null;
      tenderMethodName: string | null;
      transactionCount: number;
      netAmount: number;
    }>;
  } | null;
  eodReconciliations: Array<{
    reconciliationId: string;
    reconciliationNo: string;
    shiftId: string;
    shiftNo: string;
    cashierCode: string;
    expectedCashAmount: number;
    declaredCashAmount: number;
    varianceAmount: number;
    transactionCount: number;
    remainingCashAmount: number;
    reconciledAt: string;
  }>;
  bankingDeposits: Array<{
    depositId: string;
    depositNo: string;
    reconciliationNo: string;
    shiftNo: string;
    amount: number;
    bankName: string | null;
    accountNumber: string | null;
    reference: string | null;
    depositedAt: string;
  }>;
  purchaseOrders: Array<{
    purchaseOrderId: string;
    purchaseOrderNo: string;
    status: string;
    supplierNo: string | null;
    supplierName: string | null;
    locationId: string;
    locationCode: string;
    locationName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    exceptionQuantity: number;
    outstandingQuantity: number;
    lineCount: number;
    updatedAt: string;
    lines: Array<{
      purchaseOrderLineId: string;
      lineNo: number;
      productId: string;
      productCode: string;
      productName: string;
      isSerialized: boolean;
      trackExpiry: boolean;
      orderedQuantity: number;
      receivedQuantity: number;
      exceptionQuantity: number;
      outstandingQuantity: number;
      unitCost: number | null;
    }>;
  }>;
  recentGoodsReceipts: Array<{
    receiptId: string;
    receiptNo: string;
    purchaseOrderNo: string | null;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    lineCount: number;
    totalQuantity: number;
    operatorName: string | null;
    receivedAt: string;
    lines: Array<{
      goodsReceiptLineId: string;
      lineNo: number;
      productId: string;
      productCode: string;
      productName: string;
      quantity: number;
      unitCost: number | null;
      serialNumbers: string[];
      batchNo: string | null;
      manufacturedAt: string | null;
      expiryDate: string | null;
    }>;
  }>;
  supplierReturns: Array<{
    supplierReturnId: string;
    supplierReturnNo: string;
    supplierNo: string;
    supplierName: string;
    goodsReceiptNo: string | null;
    purchaseOrderNo: string | null;
    locationName: string;
    reason: string;
    status: string;
    totalQuantity: number;
    returnedAt: string;
  }>;
  transferRequests: Array<{
    transferId: string;
    transferNo: string;
    transferBatchNo: string | null;
    lineNo: number;
    role: "SOURCE" | "DESTINATION";
    origin: string;
    externalReference: string | null;
    workflowType: string | null;
    sourceStoreCode: string;
    sourceStoreName: string;
    sourceLocationId: string;
    sourceLocationCode: string;
    sourceLocationName: string;
    destinationStoreCode: string;
    destinationStoreName: string;
    destinationLocationId: string;
    destinationLocationCode: string;
    destinationLocationName: string;
    productId: string;
    productCode: string;
    productName: string;
    isSerialized: boolean;
    trackExpiry: boolean;
    status: string;
    requestedQuantity: number;
    requestedUnitOfMeasure: string;
    requestedUnitQuantity: number;
    uomConversionFactor: number;
    baseUnitOfMeasure: string;
    issuedQuantity: number;
    receivedQuantity: number;
    outstandingIssueQuantity: number;
    outstandingReceiptQuantity: number;
    unitCost: number | null;
    transporterName: string | null;
    vehicleRegistrationNo: string | null;
    driverName: string | null;
    driverContact: string | null;
    deliveryNoteNo: string | null;
    feedbackStatus: string;
    waterTestResult: string | null;
    quantityBeforeDelivery: number | null;
    expectedQuantityReceived: number | null;
    expectedStockQuantity: number | null;
    quantityAfterDelivery: number | null;
    actualQuantityReceived: number | null;
    feedbackVarianceQuantity: number | null;
    feedbackDipReading: number | null;
    beforeDischargeEvidence: Array<{
      url: string;
      fileName: string | null;
      capturedAt: string | null;
      uploadedAt: string | null;
    }>;
    afterDischargeEvidence: Array<{
      url: string;
      fileName: string | null;
      capturedAt: string | null;
      uploadedAt: string | null;
    }>;
    feedbackNote: string | null;
    feedbackRecordedAt: string | null;
    feedbackConfirmedAt: string | null;
    feedbackPostedAt: string | null;
    feedbackOperatorName: string | null;
    issuedSerialNumbers: string[];
    receivedSerialNumbers: string[];
    issuedBatchAllocations: InventoryBatchAllocation[];
    receivedBatchAllocations: InventoryBatchAllocation[];
    requestNote: string | null;
    issueNote: string | null;
    receiptNote: string | null;
    requestOperatorName: string | null;
    issueOperatorName: string | null;
    receiptOperatorName: string | null;
    requestedAt: string;
    requiredAt: string | null;
    issuedAt: string | null;
    receivedAt: string | null;
    closedAt: string | null;
    updatedAt: string;
  }>;
  storeExpenses: Array<{
    expenseId: string;
    expenseNo: string;
    expenseDate: string;
    category: string;
    description: string;
    supplierName: string | null;
    paymentMethod: string | null;
    externalReference: string | null;
    attachmentFileName: string | null;
    attachmentUrl: string | null;
    amount: number;
    taxAmount: number;
    status: string;
    confirmedBy: string | null;
    confirmedAt: string | null;
    postedAt: string | null;
    note: string | null;
  }>;
  stockCountSessions: Array<{
    sessionId: string;
    sessionNo: string;
    productId: string;
    productCode: string;
    productName: string;
    locationId: string;
    locationCode: string;
    locationName: string;
    status: string;
    previousQuantity: number;
    countedQuantity: number;
    varianceQuantity: number;
    operatorName: string;
    submittedAt: string;
    committedAt: string | null;
  }>;
  heldSales: Array<{
    transactionId: string;
    transactionNo: string;
    customerId: string | null;
    customerNo: string | null;
    customerName: string;
    transactionType: string;
    totalAmount: number;
    itemCount: number;
    lineCount: number;
    updatedAt: string;
    lines: Array<{
      productId: string;
      productCode: string;
      productName: string;
      variantSize: string | null;
      variantColor: string | null;
      lineNote: string | null;
      quantity: number;
      sellingUnitOfMeasure: string | null;
      baseUnitOfMeasure: string | null;
      uomConversionFactor: number;
      baseQuantity: number;
      unitPrice: number;
      discountAmount: number;
      taxAmount: number;
      lineTotal: number;
      appliedPromotionName: string | null;
      serialNumbers: string[];
    }>;
  }>;
  salesOrders: Array<{
    orderId: string;
    orderNo: string;
    sourceTransactionId: string;
    sourceTransactionNo: string;
    customerId: string | null;
    customerNo: string | null;
    customerName: string;
    originStoreId: string;
    originStoreCode: string;
    originStoreName: string;
    isFulfilmentOrder: boolean;
    orderType: "SALES_ORDER" | "LAYAWAY";
    status: string;
    totalAmount: number;
    depositAmount: number;
    paidAmount: number;
    balanceAmount: number;
    depositTenderMethodCode: string | null;
    depositTenderMethodName: string | null;
    depositPaymentMethod: string | null;
    depositReference: string | null;
    depositPaidAt: string | null;
    minimumDepositAmount: number;
    layawayPolicy: ReturnType<typeof normalizeLayawaySettings> | null;
    reservationStatus: string;
    reservationCreatedAt: string | null;
    reservationReleasedAt: string | null;
    layawayExpiresAt: string | null;
    expiredAt: string | null;
    cancellationFeeAmount: number;
    refundedAmount: number;
    itemCount: number;
    lineCount: number;
    operatorName: string | null;
    note: string | null;
    fulfilledTransactionNo: string | null;
    createdAt: string;
    fulfilledAt: string | null;
    cancelledAt: string | null;
    lines: Array<{
      productId: string;
      productCode: string;
      productName: string;
      variantSize: string | null;
      variantColor: string | null;
      lineNote: string | null;
      quantity: number;
      sellingUnitOfMeasure: string | null;
      baseUnitOfMeasure: string | null;
      uomConversionFactor: number;
      baseQuantity: number;
      unitPrice: number;
      discountAmount: number;
      taxAmount: number;
      lineTotal: number;
      appliedPromotionName: string | null;
    }>;
  }>;
  accountPayments: Array<{
    entryId: string;
    entryNo: string;
    customerId: string;
    customerNo: string;
    customerName: string;
    amount: number;
    reference: string | null;
    note: string | null;
    occurredAt: string;
  }>;
  recentTransactions: Array<{
    transactionId: string;
    transactionNo: string;
    transactionType: string;
    sourceTransactionNo: string | null;
    status: string;
    customerName: string;
    totalAmount: number;
    completedAt: string | null;
    note: string | null;
    payments: Array<{
      paymentMethod: string;
      tenderMethodCode: string | null;
      tenderMethodName: string | null;
      bankAccountId: string | null;
      amount: number;
      reference: string | null;
    }>;
    lines: Array<{
      lineId: string;
      productId: string;
      productCode: string;
      productName: string;
      variantSize: string | null;
      variantColor: string | null;
      lineNote: string | null;
      lineIntent: string;
      sourceLineId: string | null;
      quantity: number;
      sellingUnitOfMeasure: string | null;
      baseUnitOfMeasure: string | null;
      uomConversionFactor: number;
      baseQuantity: number;
      returnableQuantity: number;
      unitPrice: number;
      taxAmount: number;
      discountAmount: number;
      lineTotal: number;
      appliedPromotionName: string | null;
    }>;
  }>;
  reports: {
    summary: {
      salesCount: number;
      returnCount: number;
      exchangeCount: number;
      netSalesAmount: number;
      returnAmount: number;
      discountAmount: number;
      taxAmount: number;
      tenderedAmount: number;
      inventoryStockValue: number;
    };
    salesRows: Array<{
      transactionNo: string;
      transactionType: string;
      sourceTransactionNo: string | null;
      completedAt: string | null;
      cashierCode: string | null;
      customerName: string;
      lineCount: number;
      productPreview: string;
      totalAmount: number;
      paidAmount: number;
    }>;
    tenderRows: Array<{
      paymentMethod: string;
      tenderMethodCode: string | null;
      tenderMethodName: string | null;
      transactionCount: number;
      netAmount: number;
    }>;
    productRows: Array<{
      productCode: string;
      productName: string;
      variantSize: string | null;
      variantColor: string | null;
      sellingUnitOfMeasure: string;
      baseUnitOfMeasure: string;
      quantity: number;
      baseQuantity: number;
      grossAmount: number;
      discountAmount: number;
      taxAmount: number;
      netAmount: number;
    }>;
    serialBatchRows: Array<{
      traceId: string;
      transactionNo: string;
      completedAt: string | null;
      cashierCode: string | null;
      productCode: string;
      productName: string;
      locationId: string | null;
      locationName: string | null;
      trackingType: "Serial" | "Batch";
      serialNumber: string | null;
      batchNo: string | null;
      expiryDate: string | null;
      quantity: number;
    }>;
    salesOrderRows: Array<{
      orderId: string;
      orderNo: string;
      status: string;
      customerNo: string | null;
      customerName: string;
      totalAmount: number;
      depositAmount: number;
      balanceAmount: number;
      depositTenderMethodName: string | null;
      depositPaymentMethod: string | null;
      depositReference: string | null;
      itemCount: number;
      lineCount: number;
      operatorName: string | null;
      fulfilledTransactionNo: string | null;
      createdAt: string;
      fulfilledAt: string | null;
      cancelledAt: string | null;
    }>;
    layawayRows: Array<{
      orderId: string;
      orderNo: string;
      status: string;
      customerName: string;
      totalAmount: number;
      paidAmount: number;
      balanceAmount: number;
      reservationStatus: string;
      reservedBaseQuantity: number;
      cancellationFeeAmount: number;
      refundedAmount: number;
      ageDays: number;
      ageingBucket: string;
      createdAt: string;
      expiresAt: string | null;
    }>;
    layawayPaymentRows: Array<{
      paymentId: string;
      orderNo: string;
      customerName: string;
      paymentPurpose: string;
      tenderName: string;
      amount: number;
      reference: string | null;
      shiftNo: string | null;
      terminalCode: string | null;
      cashierCode: string | null;
      receivedAt: string;
    }>;
    shiftRows: Array<{
      shiftId: string;
      shiftNo: string;
      status: string;
      openedAt: string;
      closedAt: string | null;
      transactionCount: number;
      netSalesAmount: number;
      expectedCashAmount: number;
      declaredCashAmount: number | null;
      varianceAmount: number | null;
    }>;
    inventoryRows: Array<{
      productCode: string;
      productName: string;
      locationName: string;
      quantityOnHand: number;
      stockValue: number;
    }>;
    bankingRows: Array<{
      depositNo: string;
      reconciliationNo: string;
      shiftNo: string;
      depositedAt: string;
      bankName: string | null;
      accountNumber: string | null;
      amount: number;
      reference: string | null;
    }>;
  };
  reporting: {
    definitions: OnlineStoreReportDefinition[];
    parameters: OnlineStoreReportParameter[];
    lastCriteria: NormalizedOnlineReportCriteria;
  };
  refreshedAt: string;
};

const emptyOnlineStoreCollections = {
  fuelOperationsWorkspace: buildUnavailableFuelOperationsWorkspace(
    "Fuel Operations is not available for this online-store workspace."
  ),
  promotions: [],
  customers: [],
  products: [],
  inventoryProducts: [],
  purchaseOrderSuppliers: [],
  inventoryRows: [],
  inventoryBatches: [],
  inventorySerialUnits: [],
  inventoryLocations: [],
  transferStores: [],
  tenderMethods: [],
  bankAccounts: [],
  shift: null,
  eodReconciliations: [],
  bankingDeposits: [],
  purchaseOrders: [],
  recentGoodsReceipts: [],
  supplierReturns: [],
  transferRequests: [],
  storeExpenses: [],
  stockCountSessions: [],
  heldSales: [],
  salesOrders: [],
  accountPayments: [],
  recentTransactions: [],
  reports: {
    summary: {
      salesCount: 0,
      returnCount: 0,
      exchangeCount: 0,
      netSalesAmount: 0,
      returnAmount: 0,
      discountAmount: 0,
      taxAmount: 0,
      tenderedAmount: 0,
      inventoryStockValue: 0
    },
    salesRows: [],
    tenderRows: [],
    productRows: [],
    serialBatchRows: [],
    salesOrderRows: [],
    layawayRows: [],
    layawayPaymentRows: [],
    shiftRows: [],
    inventoryRows: [],
    bankingRows: []
  },
  reporting: {
    definitions: [],
    parameters: [],
    lastCriteria: {
      reportId: "sales" as OnlineStoreReportId,
      scope: "CASHIER" as const,
      dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
      cashierCode: null,
      shiftId: null,
      searchQuery: null,
      customerQuery: null,
      productQuery: null,
      tenderMethodCode: null,
      locationId: null,
      limit: 100
    }
  }
};

function mapOnlineStoreCapabilities(capabilities: ReturnType<typeof deriveRetailUserCapabilities>) {
  const permissionCodes = new Set(capabilities.normalizedPermissionCodes);

  return {
    canAccessEcommerceConsole: permissionCodes.has("ecommerce.console.access"),
    canCreateLayaway: permissionCodes.has("pos.layaway.create"),
    canReceiveLayawayPayment: permissionCodes.has("pos.layaway.payment.receive"),
    canCancelLayaway: permissionCodes.has("pos.layaway.cancel-refund"),
    canReleaseLayawayReservation: permissionCodes.has("pos.layaway.reservation.release"),
    canOverrideLayawayPolicy: permissionCodes.has("pos.layaway.policy.override"),
    canFulfilLayaway: permissionCodes.has("pos.layaway.fulfil"),
    hasFuelOperationsVisibility: capabilities.hasFuelOperationsVisibility,
    canManageFuelTanks: capabilities.canManageFuelTanks,
    canCaptureFuelDips: capabilities.canCaptureFuelDips,
    canCaptureFuelMeterReadings: capabilities.canCaptureFuelMeterReadings,
    canCaptureSupplierFuelReceipts: capabilities.canCaptureSupplierFuelReceipts,
    canManageFuelReconciliation: capabilities.canManageFuelReconciliation
  };
}

type OnlineStoreContext = Awaited<ReturnType<typeof requireOnlineStoreForOperation>>;
type OnlineStoreTx = Prisma.TransactionClient | typeof prisma;

function sessionHasAllPermissions(
  session: {
    permissionCodes: string[];
    accountStatus: string;
  },
  permissionCodes: string[],
  options: { requireSupervisorEligible?: boolean } = {}
) {
  const capabilities = deriveRetailUserCapabilities(session.permissionCodes, session.accountStatus);
  const granted = new Set(capabilities.normalizedPermissionCodes);

  return (
    permissionCodes.every((permissionCode) => granted.has(permissionCode)) &&
    (!options.requireSupervisorEligible || capabilities.supervisorEligible)
  );
}

async function recordOnlineOverrideFailure(input: {
  retailOrgId: string;
  actorLabel: string;
  supervisorCode: string | null;
  storeCode: string;
  purpose: string;
  reason: string;
}) {
  await prisma.securityLog
    .create({
      data: {
        retailOrgId: input.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.WARNING,
        category: "ONLINE_STORE_OVERRIDE",
        action: "MANAGER_OVERRIDE_DENIED",
        actorLabel: input.actorLabel,
        targetType: "Manager override",
        targetRef: input.supervisorCode,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `Manager override denied for ${input.purpose}.`,
        detailsJson: serializeJsonField({
          storeCode: input.storeCode,
          supervisorCode: input.supervisorCode,
          reason: input.reason
        } satisfies Prisma.InputJsonValue)
      }
    })
    .catch(() => undefined);
}

async function requireOnlineManagerApproval(input: {
  session: {
    retailOrgId: string;
    userId: string;
    loginId: string;
    displayName: string;
    accountStatus: string;
    permissionCodes: string[];
  };
  currentUser: {
    id: string;
    loginId: string;
    displayName: string;
  };
  store: {
    id: string;
    code: string;
  };
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
  permissionCodes: string[];
  purpose: string;
  requireSupervisorEligible?: boolean;
  allowCurrentOperator?: boolean;
}): Promise<OnlineStoreManagerApproval> {
  if (
    input.allowCurrentOperator !== false &&
    sessionHasAllPermissions(input.session, input.permissionCodes, {
      requireSupervisorEligible: input.requireSupervisorEligible
    })
  ) {
    return {
      approvalType: "CURRENT_OPERATOR",
      supervisorUserId: input.currentUser.id,
      supervisorLoginId: input.currentUser.loginId,
      supervisorDisplayName: input.currentUser.displayName,
      note: null,
      permissionCodes: input.permissionCodes
    };
  }

  const supervisorCode = optionalText(input.managerOverride?.supervisorCode);
  const supervisorPassword =
    typeof input.managerOverride?.supervisorPassword === "string"
      ? input.managerOverride.supervisorPassword.trim()
      : "";
  const note = optionalText(input.managerOverride?.note);

  if (!supervisorCode || !supervisorPassword) {
    await recordOnlineOverrideFailure({
      retailOrgId: input.session.retailOrgId,
      actorLabel: input.currentUser.loginId,
      supervisorCode,
      storeCode: input.store.code,
      purpose: input.purpose,
      reason: "MISSING_CREDENTIALS"
    });
    throw new Error(`Enter a manager login and password before ${input.purpose}.`);
  }

  const supervisor = await prisma.retailUser.findFirst({
    where: {
      retailOrgId: input.session.retailOrgId,
      loginId: {
        equals: supervisorCode
      },
      deletedAt: null
    },
    select: {
      id: true,
      loginId: true,
      displayName: true,
      passwordHash: true,
      accountStatus: true,
      homeStoreId: true,
      userRoles: {
        where: {
          role: {
            status: RecordStatus.ACTIVE
          }
        },
        select: {
          role: {
            select: {
              rolePermissions: {
                select: {
                  permission: {
                    select: {
                      code: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const passwordMatches =
    supervisor?.passwordHash ? await bcrypt.compare(supervisorPassword, supervisor.passwordHash) : false;

  if (!supervisor || !passwordMatches || supervisor.accountStatus !== "ACTIVE") {
    await recordOnlineOverrideFailure({
      retailOrgId: input.session.retailOrgId,
      actorLabel: input.currentUser.loginId,
      supervisorCode,
      storeCode: input.store.code,
      purpose: input.purpose,
      reason: "INVALID_CREDENTIALS"
    });
    throw new Error("Flash ERP could not approve the manager override with those credentials.");
  }

  if (supervisor.homeStoreId && supervisor.homeStoreId !== input.store.id) {
    await recordOnlineOverrideFailure({
      retailOrgId: input.session.retailOrgId,
      actorLabel: input.currentUser.loginId,
      supervisorCode,
      storeCode: input.store.code,
      purpose: input.purpose,
      reason: "WRONG_HOME_STORE"
    });
    throw new Error(`${supervisor.displayName} is not assigned to this Online POS.`);
  }

  const permissionCodes = [
    ...new Set(
      supervisor.userRoles.flatMap((assignment) =>
        assignment.role.rolePermissions.map((entry) => entry.permission.code)
      )
    )
  ];

  if (
    !sessionHasAllPermissions(
      {
        permissionCodes,
        accountStatus: supervisor.accountStatus
      },
      input.permissionCodes,
      {
        requireSupervisorEligible: input.requireSupervisorEligible
      }
    )
  ) {
    await recordOnlineOverrideFailure({
      retailOrgId: input.session.retailOrgId,
      actorLabel: input.currentUser.loginId,
      supervisorCode,
      storeCode: input.store.code,
      purpose: input.purpose,
      reason: "MISSING_PERMISSION"
    });
    throw new Error(`${supervisor.displayName} is not allowed to approve ${input.purpose}.`);
  }

  return {
    approvalType: "MANAGER_OVERRIDE",
    supervisorUserId: supervisor.id,
    supervisorLoginId: supervisor.loginId,
    supervisorDisplayName: supervisor.displayName,
    note,
    permissionCodes: input.permissionCodes
  };
}

type OnlinePaymentRequest = {
  tenderMethodCode?: string | null;
  tenderMethodId?: string | null;
  paymentMethod?: string | null;
  bankAccountId?: string | null;
  amount?: number | null;
  reference?: string | null;
};

type OnlineShiftSummary = NonNullable<OnlineStoreWorkspaceData["shift"]>;

function summarizeOnlineShift(shift: {
  id: string;
  shiftNo: string;
  status: PosShiftStatus | string;
  openingFloatAmount: Prisma.Decimal | number | string;
  closingDeclaredCash: Prisma.Decimal | number | string | null;
  closingVariance: Prisma.Decimal | number | string | null;
  openedAt: Date;
  closedAt: Date | null;
  posTransactions: Array<{
    id: string;
    transactionType: PosTransactionType | string;
    totalAmount: Prisma.Decimal | number | string;
    changeAmount: Prisma.Decimal | number | string;
  }>;
  receivedPayments: Array<{
    posTransactionId: string;
    method: PaymentMethod | string;
    tenderMethodCodeSnapshot: string | null;
    tenderMethodNameSnapshot: string | null;
    amount: Prisma.Decimal | number | string;
    posTransaction: {
      transactionType: PosTransactionType | string;
      totalAmount: Prisma.Decimal | number | string;
    };
  }>;
}): OnlineShiftSummary {
  const tenderTotals = new Map<string, OnlineShiftSummary["tenderTotals"][number]>();
  let expectedCashAmount = Number(Number(shift.openingFloatAmount).toFixed(2));
  let netSalesAmount = 0;
  let cashTenderedAmount = 0;
  let nonCashTenderedAmount = 0;
  let salesCount = 0;
  let returnCount = 0;
  let exchangeCount = 0;

  for (const transaction of shift.posTransactions) {
    const totalAmount = toMoney(Number(transaction.totalAmount));
    const isRefundSettlement =
      transaction.transactionType === PosTransactionType.RETURN ||
      (transaction.transactionType === PosTransactionType.EXCHANGE && totalAmount < 0);

    netSalesAmount = toMoney(
      netSalesAmount +
        signedTransactionAmount({
          transactionType: transaction.transactionType,
          amount: totalAmount
        })
    );

    if (transaction.transactionType === PosTransactionType.SALE) {
      salesCount += 1;
    } else if (transaction.transactionType === PosTransactionType.RETURN) {
      returnCount += 1;
    } else if (transaction.transactionType === PosTransactionType.EXCHANGE) {
      exchangeCount += 1;
    }

    if (
      shift.receivedPayments.some(
        (payment) =>
          payment.posTransactionId === transaction.id &&
          payment.method === PaymentMethod.CASH
      ) &&
      !isRefundSettlement
    ) {
      expectedCashAmount = toMoney(expectedCashAmount - Number(transaction.changeAmount));
    }
  }

  for (const payment of shift.receivedPayments) {
    const totalAmount = toMoney(Number(payment.posTransaction.totalAmount));
    const signedAmount = signedPaymentAmount({
      transactionType: payment.posTransaction.transactionType,
      totalAmount,
      paymentAmount: Number(payment.amount)
    });
    const tenderKey = `${payment.method}:${payment.tenderMethodCodeSnapshot ?? payment.tenderMethodNameSnapshot ?? "unmapped"}`;
    const current = tenderTotals.get(tenderKey) ?? {
      paymentMethod: String(payment.method),
      tenderMethodCode: payment.tenderMethodCodeSnapshot,
      tenderMethodName: payment.tenderMethodNameSnapshot,
      transactionCount: 0,
      netAmount: 0
    };

    current.transactionCount += 1;
    current.netAmount = toMoney(current.netAmount + signedAmount);
    tenderTotals.set(tenderKey, current);

    if (payment.method === PaymentMethod.CASH) {
      cashTenderedAmount = toMoney(cashTenderedAmount + signedAmount);
      expectedCashAmount = toMoney(expectedCashAmount + signedAmount);
    } else {
      nonCashTenderedAmount = toMoney(nonCashTenderedAmount + signedAmount);
    }
  }

  return {
    shiftId: shift.id,
    shiftNo: shift.shiftNo,
    status: String(shift.status),
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    openingFloatAmount: Number(shift.openingFloatAmount),
    expectedCashAmount: toMoney(expectedCashAmount),
    declaredCashAmount: shift.closingDeclaredCash === null ? null : Number(shift.closingDeclaredCash),
    varianceAmount: shift.closingVariance === null ? null : Number(shift.closingVariance),
    transactionCount: shift.posTransactions.length,
    salesCount,
    returnCount,
    exchangeCount,
    netSalesAmount: toMoney(netSalesAmount),
    cashTenderedAmount: toMoney(cashTenderedAmount),
    nonCashTenderedAmount: toMoney(nonCashTenderedAmount),
    tenderTotals: [...tenderTotals.values()].sort((left, right) =>
      (left.tenderMethodName ?? left.paymentMethod).localeCompare(right.tenderMethodName ?? right.paymentMethod)
    )
  };
}

async function ensureOnlineRegisterTerminal(tx: OnlineStoreTx, context: OnlineStoreContext) {
  const { session, store } = context;

  return tx.terminal.upsert({
    where: {
      storeId_code: {
        storeId: store.id,
        code: onlineTerminalCode
      }
    },
    create: {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      code: onlineTerminalCode,
      name: "Online POS Browser Register",
      status: RecordStatus.ACTIVE,
      licenseStatus: "LICENSED"
    },
    update: {
      status: RecordStatus.ACTIVE,
      lastHeartbeatAt: new Date()
    },
    select: {
      id: true
    }
  });
}

async function ensureOnlineRegisterShift(tx: OnlineStoreTx, context: OnlineStoreContext) {
  const { session, user, store } = context;
  const terminal = await ensureOnlineRegisterTerminal(tx, context);
  const existingOpenShift = await tx.posShift.findFirst({
    where: {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      terminalId: terminal.id,
      cashierUserId: user.id,
      status: PosShiftStatus.OPEN
    },
    orderBy: {
      openedAt: "desc"
    },
    select: {
      id: true,
      shiftNo: true
    }
  });

  if (existingOpenShift) {
    return {
      terminal,
      shift: existingOpenShift
    };
  }

  const baseShiftNo = `WEB-${buildBusinessDate()}-${sanitizeCodeSegment(user.loginId)}`;
  const priorShiftCount = await tx.posShift.count({
    where: {
      storeId: store.id,
      shiftNo: {
        startsWith: baseShiftNo
      }
    }
  });
  const shiftNo = priorShiftCount === 0 ? baseShiftNo : `${baseShiftNo}-${priorShiftCount + 1}`;
  const shift = await tx.posShift.create({
    data: {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      terminalId: terminal.id,
      cashierUserId: user.id,
      shiftNo,
      status: PosShiftStatus.OPEN,
      openingFloatAmount: 0,
      originNodeCode: "ONLINE_DIRECT",
      openedAt: new Date()
    },
    select: {
      id: true,
      shiftNo: true
    }
  });

  return {
    terminal,
    shift
  };
}

async function getActiveTenderMethods(tx: OnlineStoreTx, retailOrgId: string) {
  return tx.tenderMethod.findMany({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      paymentMethod: true,
      requiresReference: true,
      allowRefund: true,
      allowChange: true,
      sortOrder: true
    }
  });
}

async function getActiveBankAccounts(tx: OnlineStoreTx, retailOrgId: string) {
  return tx.bankAccount.findMany({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE,
      deletedAt: null,
      branch: {
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        bank: {
          status: RecordStatus.ACTIVE,
          deletedAt: null
        }
      }
    },
    orderBy: [{ accountName: "asc" }, { accountNumber: "asc" }],
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      currencyCode: true,
      branch: {
        select: {
          code: true,
          name: true,
          bank: {
            select: {
              code: true,
              name: true
            }
          }
        }
      }
    }
  });
}

function mapTenderMethod(tender: Awaited<ReturnType<typeof getActiveTenderMethods>>[number]) {
  return {
    tenderMethodId: tender.id,
    tenderMethodCode: tender.code,
    tenderMethodName: tender.name,
    paymentMethod: tender.paymentMethod,
    requiresReference: tender.requiresReference,
    requiresBankAccount: tenderRequiresBankAccount(tender),
    allowRefund: tender.allowRefund,
    allowChange: tender.allowChange,
    sortOrder: tender.sortOrder
  };
}

function mapBankAccount(account: Awaited<ReturnType<typeof getActiveBankAccounts>>[number]) {
  return {
    bankAccountId: account.id,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    currencyCode: account.currencyCode,
    bankCode: account.branch.bank.code,
    bankName: account.branch.bank.name,
    branchCode: account.branch.code,
    branchName: account.branch.name
  };
}

async function prepareOnlinePayments(
  tx: OnlineStoreTx,
  retailOrgId: string,
  paymentInputs: OnlinePaymentRequest[],
  settlementAmount: number,
  options: {
    allowChange: boolean;
    refund?: boolean;
    settlementLabel: string;
    paymentPurpose?:
      | "TRANSACTION_SETTLEMENT"
      | "SALES_ORDER_DEPOSIT"
      | "SALES_ORDER_BALANCE"
      | "LAYAWAY_DEPOSIT"
      | "LAYAWAY_INSTALLMENT"
      | "LAYAWAY_REFUND";
    receiptContext?: {
      shiftId: string;
      shiftNo: string;
      terminalCode: string;
      cashierCode: string;
    };
  }
) {
  const expectedAmount = toMoney(Math.abs(settlementAmount));

  if (expectedAmount <= 0) {
    return {
      paymentTotal: 0,
      changeAmount: 0,
      payments: [] as Prisma.PosPaymentCreateWithoutPosTransactionInput[]
    };
  }

  const tenderMethods = await getActiveTenderMethods(tx, retailOrgId);

  if (tenderMethods.length === 0) {
    throw new Error("Configure at least one active tender method before taking payments in the Online POS.");
  }

  const defaultTender = tenderMethods.find(isCashTender) ?? tenderMethods[0];
  const usableInputs =
    paymentInputs.length > 0
      ? paymentInputs
      : [
          {
            tenderMethodCode: defaultTender.code,
            amount: expectedAmount
          }
        ];
  const bankAccountIds = usableInputs
    .map((payment) => optionalText(payment.bankAccountId))
    .filter((bankAccountId): bankAccountId is string => Boolean(bankAccountId));
  const bankAccounts =
    bankAccountIds.length > 0 || usableInputs.some((payment) => payment.bankAccountId)
      ? await getActiveBankAccounts(tx, retailOrgId)
      : [];
  const bankAccountById = new Map(bankAccounts.map((account) => [account.id, account] as const));
  const payments: Prisma.PosPaymentCreateWithoutPosTransactionInput[] = [];
  let paymentTotal = 0;
  let hasChangeTender = false;

  for (const [index, payment] of usableInputs.entries()) {
    const amount = normalizeMoney(payment.amount, `payment row ${index + 1}`);

    if (amount <= 0) {
      continue;
    }

    const tenderCode = optionalText(payment.tenderMethodCode)?.toUpperCase() ?? null;
    const tenderId = optionalText(payment.tenderMethodId);
    const fallbackMethod = optionalText(payment.paymentMethod)?.toUpperCase() ?? null;
    const tender =
      tenderMethods.find((method) => method.id === tenderId) ??
      tenderMethods.find((method) => method.code.toUpperCase() === tenderCode) ??
      tenderMethods.find((method) => method.paymentMethod === fallbackMethod) ??
      null;

    if (!tender) {
      throw new Error(`Choose an active tender method for payment row ${index + 1}.`);
    }

    if (options.refund && !tender.allowRefund) {
      throw new Error(`${tender.name} is not configured for refunds.`);
    }

    const reference = optionalText(payment.reference);

    if (tender.requiresReference && !reference) {
      throw new Error(`${tender.name} requires a payment reference before ${options.settlementLabel}.`);
    }

    const needsBankAccount = tenderRequiresBankAccount(tender);
    const bankAccountId = optionalText(payment.bankAccountId);
    const bankAccount = bankAccountId ? bankAccountById.get(bankAccountId) ?? null : null;

    if (needsBankAccount && !bankAccount) {
      throw new Error(`${tender.name} requires a valid active bank account before ${options.settlementLabel}.`);
    }

    paymentTotal = toMoney(paymentTotal + amount);
    hasChangeTender = hasChangeTender || (tender.paymentMethod === PaymentMethod.CASH && tender.allowChange);
    payments.push({
      tenderMethod: {
        connect: {
          id: tender.id
        }
      },
      ...(bankAccount
        ? {
            bankAccount: {
              connect: {
                id: bankAccount.id
              }
            }
          }
        : {}),
      tenderMethodCodeSnapshot: tender.code,
      tenderMethodNameSnapshot: tender.name,
      bankCodeSnapshot: bankAccount?.branch.bank.code ?? null,
      bankNameSnapshot: bankAccount?.branch.bank.name ?? null,
      bankBranchCodeSnapshot: bankAccount?.branch.code ?? null,
      bankBranchNameSnapshot: bankAccount?.branch.name ?? null,
      bankAccountNumberSnapshot: bankAccount?.accountNumber ?? null,
      bankAccountNameSnapshot: bankAccount?.accountName ?? null,
      method: tender.paymentMethod,
      paymentPurpose: options.paymentPurpose ?? "TRANSACTION_SETTLEMENT",
      ...(options.receiptContext
        ? { receivedShift: { connect: { id: options.receiptContext.shiftId } } }
        : {}),
      receivedShiftNoSnapshot: options.receiptContext?.shiftNo ?? null,
      receivedTerminalCodeSnapshot: options.receiptContext?.terminalCode ?? null,
      receivedCashierCodeSnapshot: options.receiptContext?.cashierCode ?? null,
      amount,
      reference,
      receivedAt: new Date()
    });
  }

  if (payments.length === 0) {
    throw new Error(`Add at least one payment before ${options.settlementLabel}.`);
  }

  if (paymentTotal + 0.005 < expectedAmount) {
    throw new Error(`Tender is short by ${toMoney(expectedAmount - paymentTotal).toFixed(2)}.`);
  }

  const overTendered = toMoney(paymentTotal - expectedAmount);

  if (overTendered > 0.005 && (!options.allowChange || !hasChangeTender)) {
    throw new Error(`Tender exceeds the ${options.settlementLabel} amount by ${overTendered.toFixed(2)}.`);
  }

  return {
    paymentTotal,
    changeAmount: overTendered > 0 ? overTendered : 0,
    payments
  };
}

export async function getOnlineStorePendingSalesOrders(): Promise<
  OnlineStoreWorkspaceData["salesOrders"]
> {
  const assignment = await getOnlineStoreAssignment({ redirectOnMissingSession: false });

  if (!assignment.user?.homeStore) {
    throw new Error("Assign your user profile to a home store before refreshing pending orders.");
  }

  if (!assignment.store) {
    throw new Error("Your home store must be an Online POS shop before refreshing pending orders.");
  }

  const currentStoreId = assignment.store.id;
  const fulfilmentStoreId = readOnlineSalesOrderFulfilmentStoreId(
    assignment.store.retailOrg.companySettingsJson
  );
  const isSalesOrderFulfilmentStore = fulfilmentStoreId === currentStoreId;
  const orders = await prisma.salesOrder.findMany({
    where: {
      retailOrgId: assignment.session.retailOrgId,
      status: SalesOrderStatus.OPEN,
      AND: [
        {
          OR: [
            { storeId: currentStoreId },
            ...(isSalesOrderFulfilmentStore
              ? [{ storeId: { not: currentStoreId } }]
              : [])
          ]
        },
        {
          OR: [
            { ecommerceOrder: { is: null } },
            { ecommerceOrder: { is: { status: { not: "PLACED" } } } }
          ]
        }
      ]
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: isSalesOrderFulfilmentStore ? 100 : 30,
    select: {
      id: true,
      orderNo: true,
      sourceTransactionId: true,
      sourceTransactionNo: true,
      customerId: true,
      customerNoSnapshot: true,
      customerNameSnapshot: true,
      orderType: true,
      status: true,
      totalAmount: true,
      depositAmount: true,
      paidAmount: true,
      balanceAmount: true,
      depositTenderMethodCodeSnapshot: true,
      depositTenderMethodNameSnapshot: true,
      depositPaymentMethodSnapshot: true,
      depositReference: true,
      depositPaidAt: true,
      minimumDepositAmount: true,
      layawayPolicySnapshotJson: true,
      reservationStatus: true,
      reservationCreatedAt: true,
      reservationReleasedAt: true,
      layawayExpiresAt: true,
      expiredAt: true,
      cancellationFeeAmount: true,
      refundedAmount: true,
      operatorName: true,
      note: true,
      fulfilledTransactionNo: true,
      createdAt: true,
      fulfilledAt: true,
      cancelledAt: true,
      store: { select: { id: true, code: true, name: true } }
    }
  });
  const sourceTransactionIds = orders.map((order) => order.sourceTransactionId);
  const sourceLines = sourceTransactionIds.length
    ? await prisma.posTransactionLine.findMany({
        where: { posTransactionId: { in: sourceTransactionIds } },
        orderBy: { createdAt: "asc" },
        select: {
          posTransactionId: true,
          productId: true,
          productCodeSnapshot: true,
          productNameSnapshot: true,
          variantSizeSnapshot: true,
          variantColorSnapshot: true,
          quantity: true,
          sellingUnitOfMeasure: true,
          baseUnitOfMeasure: true,
          uomConversionFactor: true,
          baseQuantity: true,
          unitPrice: true,
          discountAmount: true,
          appliedPromotionNameSnapshot: true,
          taxAmount: true,
          lineTotal: true,
          lineNote: true
        }
      })
    : [];
  const linesByTransactionId = new Map<
    string,
    OnlineStoreWorkspaceData["salesOrders"][number]["lines"]
  >();

  for (const line of sourceLines) {
    const lines = linesByTransactionId.get(line.posTransactionId) ?? [];
    lines.push({
      productId: line.productId,
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      variantSize: line.variantSizeSnapshot,
      variantColor: line.variantColorSnapshot,
      lineNote: line.lineNote,
      quantity: Number(line.quantity),
      sellingUnitOfMeasure: line.sellingUnitOfMeasure,
      baseUnitOfMeasure: line.baseUnitOfMeasure,
      uomConversionFactor: Number(line.uomConversionFactor ?? 1),
      baseQuantity: Number(line.baseQuantity ?? line.quantity),
      unitPrice: Number(line.unitPrice),
      discountAmount: Number(line.discountAmount),
      taxAmount: Number(line.taxAmount),
      lineTotal: Number(line.lineTotal),
      appliedPromotionName: line.appliedPromotionNameSnapshot
    });
    linesByTransactionId.set(line.posTransactionId, lines);
  }

  return orders.map((order) => {
    const lines = linesByTransactionId.get(order.sourceTransactionId) ?? [];
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      sourceTransactionId: order.sourceTransactionId,
      sourceTransactionNo: order.sourceTransactionNo,
      customerId: order.customerId,
      customerNo: order.customerNoSnapshot,
      customerName: order.customerNameSnapshot ?? "Customer",
      originStoreId: order.store.id,
      originStoreCode: order.store.code,
      originStoreName: order.store.name,
      isFulfilmentOrder: isSalesOrderFulfilmentStore && order.store.id !== currentStoreId,
      orderType: order.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER",
      status: order.status,
      totalAmount: Number(order.totalAmount),
      depositAmount: Number(order.depositAmount),
      paidAmount: Number(order.paidAmount),
      balanceAmount: Number(order.balanceAmount),
      depositTenderMethodCode: order.depositTenderMethodCodeSnapshot,
      depositTenderMethodName: order.depositTenderMethodNameSnapshot,
      depositPaymentMethod: order.depositPaymentMethodSnapshot,
      depositReference: order.depositReference,
      depositPaidAt: order.depositPaidAt?.toISOString() ?? null,
      minimumDepositAmount: Number(order.minimumDepositAmount),
      layawayPolicy:
        order.orderType === "LAYAWAY"
          ? normalizeLayawaySettings(order.layawayPolicySnapshotJson)
          : null,
      reservationStatus: order.reservationStatus,
      reservationCreatedAt: order.reservationCreatedAt?.toISOString() ?? null,
      reservationReleasedAt: order.reservationReleasedAt?.toISOString() ?? null,
      layawayExpiresAt: order.layawayExpiresAt?.toISOString() ?? null,
      expiredAt: order.expiredAt?.toISOString() ?? null,
      cancellationFeeAmount: Number(order.cancellationFeeAmount),
      refundedAmount: Number(order.refundedAmount),
      itemCount: toQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
      lineCount: lines.length,
      operatorName: order.operatorName,
      note: order.note,
      fulfilledTransactionNo: order.fulfilledTransactionNo,
      createdAt: order.createdAt.toISOString(),
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      lines
    };
  });
}

async function getOnlineStoreSalesOrderSummaryById(input: {
  retailOrgId: string;
  storeId: string;
  orderId: string;
}): Promise<OnlineStoreWorkspaceData["salesOrders"][number]> {
  const order = await prisma.salesOrder.findFirst({
    where: {
      id: input.orderId,
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      orderNo: true,
      sourceTransactionId: true,
      sourceTransactionNo: true,
      customerId: true,
      customerNoSnapshot: true,
      customerNameSnapshot: true,
      orderType: true,
      status: true,
      totalAmount: true,
      depositAmount: true,
      paidAmount: true,
      balanceAmount: true,
      depositTenderMethodCodeSnapshot: true,
      depositTenderMethodNameSnapshot: true,
      depositPaymentMethodSnapshot: true,
      depositReference: true,
      depositPaidAt: true,
      minimumDepositAmount: true,
      layawayPolicySnapshotJson: true,
      reservationStatus: true,
      reservationCreatedAt: true,
      reservationReleasedAt: true,
      layawayExpiresAt: true,
      expiredAt: true,
      cancellationFeeAmount: true,
      refundedAmount: true,
      operatorName: true,
      note: true,
      fulfilledTransactionNo: true,
      createdAt: true,
      fulfilledAt: true,
      cancelledAt: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("Flash ERP could not reload that online-store sales order.");
  }

  const sourceLines = await prisma.posTransactionLine.findMany({
    where: { posTransactionId: order.sourceTransactionId },
    orderBy: { createdAt: "asc" },
    select: {
      productId: true,
      productCodeSnapshot: true,
      productNameSnapshot: true,
      variantSizeSnapshot: true,
      variantColorSnapshot: true,
      lineNote: true,
      quantity: true,
      sellingUnitOfMeasure: true,
      baseUnitOfMeasure: true,
      uomConversionFactor: true,
      baseQuantity: true,
      unitPrice: true,
      discountAmount: true,
      taxAmount: true,
      lineTotal: true,
      appliedPromotionNameSnapshot: true,
    },
  });
  const lines = sourceLines.map((line) => ({
    productId: line.productId,
    productCode: line.productCodeSnapshot,
    productName: line.productNameSnapshot,
    variantSize: line.variantSizeSnapshot,
    variantColor: line.variantColorSnapshot,
    lineNote: line.lineNote,
    quantity: Number(line.quantity),
    sellingUnitOfMeasure: line.sellingUnitOfMeasure,
    baseUnitOfMeasure: line.baseUnitOfMeasure,
    uomConversionFactor: Number(line.uomConversionFactor ?? 1),
    baseQuantity: Number(line.baseQuantity ?? line.quantity),
    unitPrice: Number(line.unitPrice),
    discountAmount: Number(line.discountAmount),
    taxAmount: Number(line.taxAmount),
    lineTotal: Number(line.lineTotal),
    appliedPromotionName: line.appliedPromotionNameSnapshot,
  }));

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    sourceTransactionId: order.sourceTransactionId,
    sourceTransactionNo: order.sourceTransactionNo,
    customerId: order.customerId,
    customerNo: order.customerNoSnapshot,
    customerName: order.customerNameSnapshot ?? "Customer",
    originStoreId: order.store.id,
    originStoreCode: order.store.code,
    originStoreName: order.store.name,
    isFulfilmentOrder: false,
    orderType: order.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER",
    status: order.status,
    totalAmount: Number(order.totalAmount),
    depositAmount: Number(order.depositAmount),
    paidAmount: Number(order.paidAmount),
    balanceAmount: Number(order.balanceAmount),
    depositTenderMethodCode: order.depositTenderMethodCodeSnapshot,
    depositTenderMethodName: order.depositTenderMethodNameSnapshot,
    depositPaymentMethod: order.depositPaymentMethodSnapshot,
    depositReference: order.depositReference,
    depositPaidAt: order.depositPaidAt?.toISOString() ?? null,
    minimumDepositAmount: Number(order.minimumDepositAmount),
    layawayPolicy:
      order.orderType === "LAYAWAY"
        ? normalizeLayawaySettings(order.layawayPolicySnapshotJson)
        : null,
    reservationStatus: order.reservationStatus,
    reservationCreatedAt: order.reservationCreatedAt?.toISOString() ?? null,
    reservationReleasedAt: order.reservationReleasedAt?.toISOString() ?? null,
    layawayExpiresAt: order.layawayExpiresAt?.toISOString() ?? null,
    expiredAt: order.expiredAt?.toISOString() ?? null,
    cancellationFeeAmount: Number(order.cancellationFeeAmount),
    refundedAmount: Number(order.refundedAmount),
    itemCount: toQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
    lineCount: lines.length,
    operatorName: order.operatorName,
    note: order.note,
    fulfilledTransactionNo: order.fulfilledTransactionNo,
    createdAt: order.createdAt.toISOString(),
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    lines,
  };
}

export async function getOnlineStoreWorkspace(): Promise<OnlineStoreWorkspaceData> {
  await Promise.all([
    ensureInventoryLocationSalesOrderSchemaCompatibility(),
    ensureOperatingExpenseSchemaCompatibility(),
    ensureInventoryExpirySchemaCompatibility(),
    ensureAlternateUomSellingSchemaCompatibility(),
    ensureLayawayLifecycleSchemaCompatibility(),
    ensureProductVariantSalesOrderDepositSchemaCompatibility(),
    ensureMultiBranchEcommerceSchemaCompatibility()
  ]);

  const assignment = await getOnlineStoreAssignment();
  const operator = {
    displayName: assignment.user?.displayName ?? assignment.session.displayName,
    loginId: assignment.user?.loginId ?? assignment.session.loginId
  };
  const capabilities = mapOnlineStoreCapabilities(
    deriveRetailUserCapabilities(assignment.session.permissionCodes, assignment.session.accountStatus)
  );
  const fuelOperationsWorkspace = capabilities.hasFuelOperationsVisibility
    ? await getFuelOperationsWorkspace({ storeCode: assignment.store?.code ?? null }).catch((error: unknown) =>
        buildUnavailableFuelOperationsWorkspace(
          error instanceof Error
            ? error.message
            : "Flash ERP could not load Online POS Fuel Operations."
        )
      )
    : buildUnavailableFuelOperationsWorkspace(
        "Fuel Operations is not enabled for this online-store user."
      );

  if (!assignment.user?.homeStore) {
    return {
      isAvailable: false,
      unavailableReason:
        "Your user profile is not assigned to a home store. Assign the user to an Online POS shop from Retail Users.",
      operator,
      capabilities,
      store: null,
      branding: readOnlineStoreBranding(),
      metrics: {
        todaySales: 0,
        todayTransactions: 0,
        todayReturns: 0,
        todayExchanges: 0,
        todayReturnsAmount: 0,
        expectedCash: 0,
        accountPayments: 0,
        openOrders: 0,
        openShiftNo: null,
        productCount: 0
      },
      optionSettings: defaultOnlineOptionSettings,
      salesOrderRouting: defaultOnlineSalesOrderRouting,
      loyaltyPolicy: defaultOnlineLoyaltyPolicy,
      ...emptyOnlineStoreCollections,
      refreshedAt: new Date().toISOString()
    };
  }

  if (!assignment.store) {
    const hasOnlineStoreRole = assignment.session.roleCodes.some((roleCode) =>
      onlineStoreRoleCodes.has(roleCode)
    );

    return {
      isAvailable: false,
      unavailableReason:
        hasOnlineStoreRole
          ? "Your home store is not marked as an Online POS shop. Switch the store execution mode in HQ store setup before using browser POS."
          : "Your user profile is not assigned to an online-store role. Assign Online POS Cashier or Online POS Supervisor before using browser POS.",
      operator,
      capabilities,
      store: null,
      branding: readOnlineStoreBranding(assignment.user.homeStore.retailOrg),
      metrics: {
        todaySales: 0,
        todayTransactions: 0,
        todayReturns: 0,
        todayExchanges: 0,
        todayReturnsAmount: 0,
        expectedCash: 0,
        accountPayments: 0,
        openOrders: 0,
        openShiftNo: null,
        productCount: 0
      },
      optionSettings: defaultOnlineOptionSettings,
      salesOrderRouting: defaultOnlineSalesOrderRouting,
      loyaltyPolicy: defaultOnlineLoyaltyPolicy,
      ...emptyOnlineStoreCollections,
      refreshedAt: new Date().toISOString()
    };
  }

  await ensureOnlineStoreInventoryTopology(prisma, {
    retailOrgId: assignment.session.retailOrgId,
    store: assignment.store
  });

  const loyaltyPolicy = await getOnlineLoyaltyPolicy(prisma, assignment.session.retailOrgId);
  const optionSettings = {
    ...readOnlineOptionSettings(assignment.store.retailOrg.optionsSettingsJson),
    productSizes: readOnlineProductSizes(assignment.store.retailOrg.companySettingsJson),
    posDiscountRates: readOnlinePosDiscountRates(assignment.store.retailOrg.companySettingsJson),
    posExpressChargeRates: readOnlinePosExpressChargeRates(
      assignment.store.retailOrg.companySettingsJson
    ),
    layawaySettings: normalizeLayawaySettings(
      readJsonObject(assignment.store.retailOrg.companySettingsJson).layawaySettings
    )
  };
  const salesOrderFulfilmentStoreId = readOnlineSalesOrderFulfilmentStoreId(
    assignment.store.retailOrg.companySettingsJson
  );
  const salesOrderFulfilmentStore = salesOrderFulfilmentStoreId
    ? await prisma.store.findFirst({
        where: {
          id: salesOrderFulfilmentStoreId,
          retailOrgId: assignment.session.retailOrgId,
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true,
          code: true,
          name: true
        }
      })
    : null;
  const isSalesOrderFulfilmentStore =
    Boolean(salesOrderFulfilmentStore) &&
    salesOrderFulfilmentStore?.id === assignment.store.id;
  const branding = readOnlineStoreBranding(assignment.store.retailOrg);
  const receiptTemplateResolution = resolveOnlineStoreReceiptTemplate(assignment.store);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [
    products,
    purchaseOrderSuppliers,
    inventoryLocations,
    transferStores,
    customers,
    recentTransactions,
    heldTransactions,
    salesOrders,
    todaySales,
    todayBreakdown,
    todayAccountPayments,
    recentShifts,
    tenderMethods,
    bankAccounts,
    eodReconciliations,
    bankingDeposits,
    purchaseOrders,
    recentGoodsReceipts,
    supplierReturns,
    transferRequests,
    storeExpenses,
    stockCountSessions,
    accountPayments,
    promotions
  ] = await Promise.all([
    prisma.product.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }],
      take: 240,
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        productType: true,
        department: true,
        category: true,
        primaryImageUrl: true,
        unitOfMeasure: true,
        baseUnitOfMeasure: { select: { code: true } },
        uomSchedule: {
          select: {
            baseUnitOfMeasure: { select: { code: true } },
            lines: {
              orderBy: [{ isBaseUnit: "desc" }, { sortOrder: "asc" }],
              select: {
                conversionFactor: true,
                isBaseUnit: true,
                allowSale: true,
                allowPurchase: true,
                unitOfMeasure: { select: { code: true, name: true } },
              },
            },
          },
        },
        baseUnitPrice: true,
        baseCostPrice: true,
        storeProductSellingUnits: {
          where: {
            storeId: assignment.store.id,
            status: RecordStatus.ACTIVE
          },
          orderBy: [{ isDefault: "desc" }, { unitOfMeasureCodeSnapshot: "asc" }],
          select: {
            productVariantId: true,
            unitOfMeasureCodeSnapshot: true,
            unitOfMeasureNameSnapshot: true,
            conversionFactor: true,
            unitPrice: true,
            barcode: true,
            isDefault: true,
            unitOfMeasure: {
              select: {
                allowFractionalSale: true,
                decimalPrecision: true
              }
            }
          }
        },
        storeProductPrices: {
          where: {
            storeId: assignment.store.id,
            status: RecordStatus.ACTIVE,
            productVariantId: null
          },
          take: 1,
          select: {
            unitPrice: true
          }
        },
        mustEnterPriceAtPos: true,
        trackInventory: true,
        trackExpiry: true,
        shelfLifeDays: true,
        minStockLevel: true,
        reorderPoint: true,
        safetyStockLevel: true,
        isSerialized: true,
        trackSize: true,
        trackColor: true,
        inventoryBatches: {
          where: {
            storeId: assignment.store.id
          },
          orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }],
          select: {
            id: true,
            inventoryLocationId: true,
            batchNo: true,
            manufacturedAt: true,
            expiryDate: true,
            quantityOnHand: true,
            status: true
          }
        },
        inventorySerialUnits: {
          where: {
            storeId: assignment.store.id
          },
          orderBy: [{ status: "asc" }, { serialNumber: "asc" }],
          select: {
            id: true,
            inventoryLocationId: true,
            serialNumber: true,
            status: true,
            sourceReferenceType: true,
            sourceReferenceId: true,
            sourceReferenceLabel: true,
            lastOccurredAt: true,
            updatedAt: true
          }
        },
        matrixVariants: {
          where: {
            status: RecordStatus.ACTIVE
          },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          select: {
            id: true,
            code: true,
            sku: true,
            displayName: true,
            unitPrice: true,
            storeProductPrices: {
              where: {
                storeId: assignment.store.id,
                status: RecordStatus.ACTIVE
              },
              take: 1,
              select: {
                unitPrice: true
              }
            },
            quantityOnHand: true,
            barcode: true,
            values: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                valueLabelSnapshot: true,
                attribute: {
                  select: {
                    name: true
                  }
                },
                attributeValue: {
                  select: {
                    label: true
                  }
                }
              }
            }
          }
        },
        taxProfile: {
          select: {
            ratePercent: true,
            isTaxInclusive: true
          }
        }
      }
    }),
    prisma.supplier.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }, { supplierNo: "asc" }],
      select: {
        supplierNo: true,
        name: true
      }
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: RecordStatus.ACTIVE
      },
      orderBy: [
        { useForSalesDefault: "desc" },
        { useForSalesOrderDefault: "desc" },
        { useForReceivingDefault: "desc" },
        { name: "asc" }
      ],
      select: {
        id: true,
        code: true,
        name: true,
        warehouseId: true,
        useForSalesDefault: true,
        useForSalesOrderDefault: true,
        useForReceivingDefault: true,
        warehouse: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.store.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        status: RecordStatus.ACTIVE,
        id: {
          not: assignment.store.id
        }
      },
      orderBy: {
        name: "asc"
      },
      select: {
        id: true,
        code: true,
        name: true,
        inventoryLocations: {
          where: {
            status: RecordStatus.ACTIVE
          },
          orderBy: [
            { useForSalesDefault: "desc" },
            { useForReceivingDefault: "desc" },
            { name: "asc" }
          ],
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.customer.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ fullName: "asc" }, { customerNo: "asc" }],
      take: 120,
      select: {
        id: true,
        customerNo: true,
        fullName: true,
        customerType: true,
        phone: true,
        email: true,
        allowCreditSales: true,
        creditLimitAmount: true,
        receivableBalanceAmount: true,
        loyaltyEnrolled: true,
        loyaltyTier: true,
        loyaltyPointsBalance: true
      }
    }),
    prisma.posTransaction.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: PosTransactionStatus.COMPLETED
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        transactionNo: true,
        transactionType: true,
        sourceTransactionNo: true,
        status: true,
        customerNameSnapshot: true,
        totalAmount: true,
        completedAt: true,
        notes: true,
        payments: {
          orderBy: {
            receivedAt: "asc"
          },
          select: {
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            bankAccountId: true,
            amount: true,
            reference: true
          }
        },
        lines: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            productId: true,
            productVariantId: true,
            lineIntent: true,
            sourceLineId: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            uomConversionFactor: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            appliedPromotionNameSnapshot: true,
            taxAmount: true,
            lineTotal: true,
            lineNote: true
          }
        }
      }
    }),
    prisma.posTransaction.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: PosTransactionStatus.PARKED
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        transactionNo: true,
        transactionType: true,
        customerId: true,
        customerNameSnapshot: true,
        totalAmount: true,
        updatedAt: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        },
        lines: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            productId: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            uomConversionFactor: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            appliedPromotionNameSnapshot: true,
            taxAmount: true,
            lineTotal: true,
            lineNote: true,
            serialNumbersSnapshot: true
          }
        }
      }
    }),
    prisma.salesOrder.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        AND: [
          {
            OR: [
              { storeId: assignment.store.id },
              ...(isSalesOrderFulfilmentStore
                ? [
                    {
                      storeId: {
                        not: assignment.store.id
                      },
                      status: SalesOrderStatus.OPEN
                    }
                  ]
                : [])
            ]
          },
          {
            OR: [
              { ecommerceOrder: { is: null } },
              { ecommerceOrder: { is: { status: { not: "PLACED" } } } }
            ]
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: isSalesOrderFulfilmentStore ? 100 : 30,
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        sourceTransactionNo: true,
        customerId: true,
        customerNoSnapshot: true,
        customerNameSnapshot: true,
        orderType: true,
        status: true,
        totalAmount: true,
        depositAmount: true,
        paidAmount: true,
        balanceAmount: true,
        depositTenderMethodCodeSnapshot: true,
        depositTenderMethodNameSnapshot: true,
        depositPaymentMethodSnapshot: true,
        depositReference: true,
        depositPaidAt: true,
        minimumDepositAmount: true,
        layawayPolicySnapshotJson: true,
        reservationStatus: true,
        reservationCreatedAt: true,
        reservationReleasedAt: true,
        layawayExpiresAt: true,
        expiredAt: true,
        cancellationFeeAmount: true,
        refundedAmount: true,
        operatorName: true,
        note: true,
        fulfilledTransactionNo: true,
        createdAt: true,
        fulfilledAt: true,
        cancelledAt: true,
        inventoryReservations: {
          select: {
            baseQuantity: true,
            status: true
          }
        },
        store: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.posTransaction.aggregate({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: PosTransactionStatus.COMPLETED,
        completedAt: {
          gte: startOfDay
        }
      },
      _sum: {
        totalAmount: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.posTransaction.groupBy({
      by: ["transactionType"],
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: PosTransactionStatus.COMPLETED,
        completedAt: {
          gte: startOfDay
        }
      },
      _sum: {
        totalAmount: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.customerAccountEntry.aggregate({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        entryType: CustomerAccountEntryType.ACCOUNT_PAYMENT,
        occurredAt: {
          gte: startOfDay
        }
      },
      _sum: {
        receivableDeltaAmount: true
      }
    }),
    prisma.posShift.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        cashierUserId: assignment.user.id
      },
      orderBy: {
        openedAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        shiftNo: true,
        status: true,
        openingFloatAmount: true,
        closingDeclaredCash: true,
        closingVariance: true,
        openedAt: true,
        closedAt: true,
        posTransactions: {
          where: {
            status: PosTransactionStatus.COMPLETED
          },
          select: {
            id: true,
            transactionType: true,
            totalAmount: true,
            changeAmount: true
          }
        },
        receivedPayments: {
          where: {
            posTransaction: {
              deletedAt: null
            }
          },
          select: {
            posTransactionId: true,
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            amount: true,
            posTransaction: {
              select: {
                transactionType: true,
                totalAmount: true
              }
            }
          }
        }
      }
    }),
    getActiveTenderMethods(prisma, assignment.session.retailOrgId),
    getActiveBankAccounts(prisma, assignment.session.retailOrgId),
    prisma.eodReconciliation.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id
      },
      orderBy: {
        reconciledAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        reconciliationNo: true,
        shiftId: true,
        shiftNo: true,
        cashierCode: true,
        expectedCashAmount: true,
        declaredCashAmount: true,
        varianceAmount: true,
        transactionCount: true,
        reconciledAt: true,
        bankingDeposits: {
          select: {
            amount: true
          }
        }
      }
    }),
    prisma.bankingDeposit.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id
      },
      orderBy: {
        depositedAt: "desc"
      },
      take: 8,
      select: {
        id: true,
        depositNo: true,
        reconciliationNo: true,
        shiftNo: true,
        amount: true,
        bankNameSnapshot: true,
        bankAccountNumberSnapshot: true,
        reference: true,
        depositedAt: true
      }
    }),
    prisma.purchaseOrder.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        OR: [
          {
            storeId: assignment.store.id
          },
          {
            inventoryLocation: {
              storeId: assignment.store.id
            }
          }
        ],
        status: {
          in: [
            PurchaseOrderStatus.COMMITTED,
            PurchaseOrderStatus.PART_RECEIVED,
            PurchaseOrderStatus.RECEIVED,
            PurchaseOrderStatus.CLOSED
          ]
        }
      },
      orderBy: [{ updatedAt: "desc" }, { purchaseOrderNo: "desc" }],
      take: 12,
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        updatedAt: true,
        inventoryLocation: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          select: {
            id: true,
            lineNo: true,
            orderedQuantity: true,
            receivedQuantity: true,
            exceptionQuantity: true,
            unitCost: true,
            productId: true,
            product: {
              select: {
                code: true,
                name: true,
                isSerialized: true,
                trackExpiry: true
              }
            }
          }
        }
      }
    }),
    prisma.goodsReceipt.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        receiptNo: true,
        operatorName: true,
        receivedAt: true,
        purchaseOrder: {
          select: {
            purchaseOrderNo: true
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        inventoryLocation: {
          select: {
            code: true,
            name: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          select: {
            lineNo: true,
            id: true,
            productId: true,
            quantity: true,
            unitCost: true,
            serialNumbersSnapshot: true,
            batchNo: true,
            expiryDate: true,
            manufacturedAt: true,
            product: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.supplierReturn.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id
      },
      orderBy: [{ returnedAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        supplierReturnNo: true,
        reason: true,
        status: true,
        returnedAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        goodsReceipt: {
          select: {
            receiptNo: true
          }
        },
        purchaseOrder: {
          select: {
            purchaseOrderNo: true
          }
        },
        inventoryLocation: {
          select: {
            name: true
          }
        },
        lines: {
          select: {
            quantity: true
          }
        }
      }
    }),
    prisma.interStoreTransfer.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        OR: [
          { destinationStoreId: assignment.store.id },
          {
            sourceStoreId: assignment.store.id,
            status: { not: InterStoreTransferStatus.DRAFT }
          }
        ]
      },
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        lineNo: true,
        origin: true,
        workflowType: true,
        status: true,
        externalReference: true,
        requestedQuantity: true,
        requestedUnitOfMeasure: true,
        requestedUnitQuantity: true,
        uomConversionFactor: true,
        baseUnitOfMeasure: true,
        issuedQuantity: true,
        receivedQuantity: true,
        unitCost: true,
        transporterName: true,
        vehicleRegistrationNo: true,
        driverName: true,
        driverContact: true,
        deliveryNoteNo: true,
        feedbackStatus: true,
        waterTestResult: true,
        quantityBeforeDelivery: true,
        expectedQuantityReceived: true,
        expectedStockQuantity: true,
        quantityAfterDelivery: true,
        actualQuantityReceived: true,
        feedbackVarianceQuantity: true,
        feedbackDipReading: true,
        beforeDischargeEvidenceJson: true,
        afterDischargeEvidenceJson: true,
        feedbackNote: true,
        feedbackRecordedAt: true,
        feedbackConfirmedAt: true,
        feedbackPostedAt: true,
        feedbackOperatorName: true,
        issuedSerialNumbersSnapshot: true,
        receivedSerialNumbersSnapshot: true,
        issuedBatchAllocationsSnapshot: true,
        receivedBatchAllocationsSnapshot: true,
        requestNote: true,
        issueNote: true,
        receiptNote: true,
        requestOperatorName: true,
        issueOperatorName: true,
        receiptOperatorName: true,
        requestedAt: true,
        requiredAt: true,
        issuedAt: true,
        receivedAt: true,
        closedAt: true,
        updatedAt: true,
        sourceStore: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        sourceInventoryLocation: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        destinationStore: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        destinationInventoryLocation: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            isSerialized: true,
            trackExpiry: true
          }
        }
      }
    }),
    prisma.operatingExpense.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: {
          in: [
            OperatingExpenseStatus.DRAFT,
            OperatingExpenseStatus.APPROVED,
            OperatingExpenseStatus.POSTED
          ]
        }
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true,
        expenseNo: true,
        expenseDate: true,
        category: true,
        description: true,
        supplierName: true,
        paymentMethod: true,
        externalReference: true,
        attachmentFileName: true,
        attachmentUrl: true,
        amount: true,
        taxAmount: true,
        status: true,
        confirmedBy: true,
        confirmedAt: true,
        postedAt: true,
        note: true
      }
    }),
    prisma.stockCountSession.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        sessionNo: true,
        status: true,
        previousQuantity: true,
        countedQuantity: true,
        varianceQuantity: true,
        operatorName: true,
        submittedAt: true,
        committedAt: true,
        inventoryLocation: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        product: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.customerAccountEntry.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        entryType: CustomerAccountEntryType.ACCOUNT_PAYMENT
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        transactionNoSnapshot: true,
        sourceTransactionNoSnapshot: true,
        receivableDeltaAmount: true,
        note: true,
        occurredAt: true,
        customer: {
          select: {
            id: true,
            customerNo: true,
            fullName: true
          }
        }
      }
    }),
    getOnlinePromotionPolicies(prisma, assignment.session.retailOrgId)
  ]);
  const catalogPolicy = resolveOnlineStoreCatalogPolicy(assignment.store);
  const catalogSortOrderByProductCode = new Map(
    Object.entries(catalogPolicy?.productSortOrders ?? {}).map(([productCode, sortOrder]) => [
      productCode.trim().toUpperCase(),
      sortOrder
    ])
  );
  const productsForCatalog = products
    .filter(
      (product) =>
        catalogPolicyAllowsProduct(catalogPolicy, product) ||
        isServiceProductType(product.productType)
    )
    .sort((left, right) => {
      const leftSortOrder =
        catalogSortOrderByProductCode.get(left.code.trim().toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
      const rightSortOrder =
        catalogSortOrderByProductCode.get(right.code.trim().toUpperCase()) ?? Number.MAX_SAFE_INTEGER;

      return leftSortOrder === rightSortOrder
        ? left.name.localeCompare(right.name)
        : leftSortOrder - rightSortOrder;
    });
  const salesLocation = inventoryLocations.find((location) => location.useForSalesDefault) ?? inventoryLocations[0] ?? null;
  const locationIds = inventoryLocations.map((location) => location.id);
  const inventoryManagedProducts = products.filter(isOnlineStoreStockManagedProduct);
  const productIds = [...new Set([...productsForCatalog, ...inventoryManagedProducts].map((product) => product.id))];
  const [ledgerPositions, activeReservationGroups, ecommerceFulfillmentLocations] =
    locationIds.length && productIds.length
      ? await Promise.all([
          prisma.inventoryLedgerEntry.groupBy({
          by: ["productId", "inventoryLocationId"],
          where: {
            retailOrgId: assignment.session.retailOrgId,
            storeId: assignment.store.id,
            inventoryLocationId: {
              in: locationIds
            },
            productId: {
              in: productIds
            }
          },
          _sum: {
            quantity: true
          }
          }),
          prisma.salesOrderInventoryReservation.groupBy({
            by: ["inventoryLocationId", "productCodeSnapshot"],
            where: {
              inventoryLocationId: {
                in: locationIds
              },
              productCodeSnapshot: {
                in: products.map((product) => product.code)
              },
              status: "ACTIVE",
              salesOrder: {
                retailOrgId: assignment.session.retailOrgId
              }
            },
            _sum: {
              baseQuantity: true
            }
          }),
          prisma.ecommerceFulfillmentLocation.findMany({
            where: {
              retailOrgId: assignment.session.retailOrgId,
              inventoryLocationId: {
                in: locationIds
              },
              status: RecordStatus.ACTIVE,
              storefrontStore: {
                status: RecordStatus.ACTIVE,
                ecommerceEnabled: true
              }
            },
            orderBy: [
              { inventoryLocationId: "asc" },
              { routingPriority: "asc" },
              { storefrontStore: { name: "asc" } }
            ],
            select: {
              inventoryLocationId: true,
              supportsPickup: true,
              supportsDelivery: true,
              routingPriority: true,
              storefrontStore: {
                select: {
                  name: true
                }
              }
            }
          })
        ])
      : [[], [], []] as const;
  const salesOrderSourceTransactionIds = salesOrders.map((order) => order.sourceTransactionId);
  const salesOrderLineRows =
    salesOrderSourceTransactionIds.length > 0
      ? await prisma.posTransactionLine.findMany({
          where: {
            posTransactionId: {
              in: salesOrderSourceTransactionIds
            }
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            posTransactionId: true,
            productId: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            uomConversionFactor: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            appliedPromotionNameSnapshot: true,
            taxAmount: true,
            lineTotal: true,
            lineNote: true
          }
        })
      : [];
  const salesOrderPaymentRows =
    salesOrderSourceTransactionIds.length > 0
      ? await prisma.posPayment.findMany({
          where: {
            posTransactionId: { in: salesOrderSourceTransactionIds },
            paymentPurpose: {
              in: ["LAYAWAY_DEPOSIT", "LAYAWAY_INSTALLMENT", "LAYAWAY_REFUND"]
            }
          },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            posTransactionId: true,
            paymentPurpose: true,
            tenderMethodNameSnapshot: true,
            tenderMethodCodeSnapshot: true,
            method: true,
            amount: true,
            reference: true,
            receivedShiftNoSnapshot: true,
            receivedTerminalCodeSnapshot: true,
            receivedCashierCodeSnapshot: true,
            receivedAt: true
          }
        })
      : [];
  const recentSourceLineIds = recentTransactions.flatMap((transaction) =>
    transaction.lines.map((line) => line.id)
  );
  const [returnedLineQuantities, reportTransactions, reportPayments] = await Promise.all([
    recentSourceLineIds.length > 0
      ? prisma.posTransactionLine.groupBy({
          by: ["sourceLineId"],
          where: {
            sourceLineId: {
              in: recentSourceLineIds
            },
            posTransaction: {
              retailOrgId: assignment.session.retailOrgId,
              storeId: assignment.store.id,
              status: PosTransactionStatus.COMPLETED,
              transactionType: {
                in: [PosTransactionType.RETURN, PosTransactionType.EXCHANGE]
              }
            }
          },
          _sum: {
            quantity: true
          }
        })
      : [],
    prisma.posTransaction.findMany({
      where: {
        retailOrgId: assignment.session.retailOrgId,
        storeId: assignment.store.id,
        status: PosTransactionStatus.COMPLETED,
        completedAt: {
          gte: startOfDay
        }
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        transactionNo: true,
        transactionType: true,
        sourceTransactionNo: true,
        cashierCodeSnapshot: true,
        customerNameSnapshot: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        completedAt: true,
        lines: {
          select: {
            id: true,
            lineIntent: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            appliedPromotionNameSnapshot: true,
            taxAmount: true,
            lineTotal: true,
            lineNote: true,
            serialNumbersSnapshot: true,
            batchAllocationsSnapshot: true,
            inventoryLocationId: true,
            inventoryLocation: {
              select: {
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.posPayment.findMany({
      where: {
        receivedAt: {
          gte: startOfDay
        },
        posTransaction: {
          retailOrgId: assignment.session.retailOrgId,
          storeId: assignment.store.id,
          deletedAt: null
        }
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        posTransactionId: true,
        method: true,
        tenderMethodCodeSnapshot: true,
        tenderMethodNameSnapshot: true,
        amount: true,
        reference: true,
        paymentPurpose: true,
        receivedShiftNoSnapshot: true,
        receivedTerminalCodeSnapshot: true,
        receivedCashierCodeSnapshot: true,
        receivedAt: true,
        posTransaction: {
          select: {
            transactionType: true,
            totalAmount: true
          }
        }
      }
    })
  ]);
  const returnedQuantityBySourceLineId = new Map(
    returnedLineQuantities
      .filter((row) => row.sourceLineId)
      .map((row) => [row.sourceLineId as string, toQuantity(row._sum.quantity)] as const)
  );
  const quantityBySalesProduct = new Map<string, number>();
  const productById = new Map(products.map((product) => [product.id, product] as const));
  const locationById = new Map(inventoryLocations.map((location) => [location.id, location] as const));
  const activeReservedByLocationProduct = new Map(
    activeReservationGroups.map((group) => [
      `${group.inventoryLocationId}:${group.productCodeSnapshot.trim().toUpperCase()}`,
      toQuantity(group._sum.baseQuantity)
    ] as const)
  );
  const ecommerceEligibilityByLocation = new Map<
    string,
    {
      supportsPickup: boolean;
      supportsDelivery: boolean;
      labels: string[];
    }
  >();

  for (const fulfillmentLocation of ecommerceFulfillmentLocations) {
    const current = ecommerceEligibilityByLocation.get(
      fulfillmentLocation.inventoryLocationId
    );
    const modes = [
      fulfillmentLocation.supportsPickup ? "pickup" : null,
      fulfillmentLocation.supportsDelivery ? "delivery" : null
    ].filter((value): value is string => Boolean(value));
    const label = `${fulfillmentLocation.storefrontStore.name}: ${modes.length ? modes.join(" + ") : "disabled"} (priority ${fulfillmentLocation.routingPriority})`;

    if (current) {
      current.supportsPickup ||= fulfillmentLocation.supportsPickup;
      current.supportsDelivery ||= fulfillmentLocation.supportsDelivery;
      current.labels.push(label);
    } else {
      ecommerceEligibilityByLocation.set(fulfillmentLocation.inventoryLocationId, {
        supportsPickup: fulfillmentLocation.supportsPickup,
        supportsDelivery: fulfillmentLocation.supportsDelivery,
        labels: [label]
      });
    }
  }

  for (const position of ledgerPositions) {
    const quantity = toQuantity(position._sum.quantity);

    if (salesLocation && position.inventoryLocationId === salesLocation.id) {
      quantityBySalesProduct.set(
        position.productId,
        toQuantity((quantityBySalesProduct.get(position.productId) ?? 0) + quantity)
      );
    }
  }
  const salesSummary = todayBreakdown.find((row) => row.transactionType === PosTransactionType.SALE);
  const returnSummary = todayBreakdown.find((row) => row.transactionType === PosTransactionType.RETURN);
  const exchangeSummary = todayBreakdown.find((row) => row.transactionType === PosTransactionType.EXCHANGE);
  const mapWorkspaceProduct = (product: (typeof products)[number]) => {
    const salesBatches = salesLocation
      ? product.inventoryBatches.filter(
          (batch) => batch.inventoryLocationId === salesLocation.id && Number(batch.quantityOnHand) > 0
        )
      : [];
    const earliestExpiryDate = salesBatches[0]?.expiryDate.toISOString() ?? null;
    const expiringQuantity = toQuantity(
      salesBatches
        .filter(
          (batch) =>
            inventoryBatchDaysUntilExpiry(batch.expiryDate) <=
            optionSettings.expiryAlertLeadDays
        )
        .reduce((sum, batch) => sum + Number(batch.quantityOnHand), 0)
    );
    const matrixVariants = product.matrixVariants.map((variant) => ({
      variantId: variant.id,
      code: variant.code,
      sku: variant.sku,
      displayName: variant.displayName,
      unitPrice: Number(variant.storeProductPrices[0]?.unitPrice ?? variant.unitPrice),
      quantityOnHand: Number(variant.quantityOnHand),
      barcode: variant.barcode,
      attributes: variant.values.map((value) => ({
        attributeName: value.attribute.name,
        valueLabel: value.valueLabelSnapshot || value.attributeValue.label
      }))
    }));
    const matrixQuantityOnHand = matrixVariants.reduce(
      (sum, variant) => sum + variant.quantityOnHand,
      0
    );
    const matrixPrice =
      matrixVariants.length > 0
        ? Math.min(...matrixVariants.map((variant) => variant.unitPrice))
        : Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice);
    const productPrice = Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice);

    return {
      productId: product.id,
      productCode: product.code,
      sku: product.sku,
      productName: product.name,
      productType: product.productType,
      unitOfMeasure: product.unitOfMeasure,
      baseUnitOfMeasure:
        product.baseUnitOfMeasure?.code ??
        product.uomSchedule?.baseUnitOfMeasure.code ??
        product.unitOfMeasure,
      uomConversions:
        product.uomSchedule?.lines.map((line) => ({
          uomCode: line.unitOfMeasure.code,
          uomName: line.unitOfMeasure.name,
          conversionFactor: Number(line.conversionFactor),
          isBaseUnit: line.isBaseUnit,
          allowSale: line.allowSale,
          allowPurchase: line.allowPurchase,
        })) ?? [],
      sellingUnits: product.storeProductSellingUnits.map((sellingUnit) => ({
        productVariantId: sellingUnit.productVariantId,
        unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
        unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
        conversionFactor: Number(sellingUnit.conversionFactor),
        unitPrice: Number(sellingUnit.unitPrice),
        barcode: sellingUnit.barcode,
        isDefault: sellingUnit.isDefault,
        allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
        decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
      })),
      price: product.productType === "MATRIX" ? matrixPrice : productPrice,
      unitCost: product.baseCostPrice === null ? null : Number(product.baseCostPrice),
      department: product.department,
      category: product.category,
      imageUrl: product.primaryImageUrl,
      quantityOnHand:
        product.productType === "MATRIX"
          ? matrixQuantityOnHand
          : quantityBySalesProduct.get(product.id) ?? 0,
      taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
      taxInclusive: product.taxProfile?.isTaxInclusive ?? false,
      mustEnterPriceAtPos: product.mustEnterPriceAtPos,
      isSerialized: product.isSerialized,
      trackSize: product.trackSize,
      trackColor: product.trackColor,
      trackInventory: product.trackInventory,
      trackExpiry: product.trackExpiry,
      shelfLifeDays: product.shelfLifeDays,
      minStockLevel:
        product.minStockLevel === null ? null : Number(product.minStockLevel),
      reorderPoint:
        product.reorderPoint === null ? null : Number(product.reorderPoint),
      safetyStockLevel:
        product.safetyStockLevel === null
          ? null
          : Number(product.safetyStockLevel),
      earliestExpiryDate,
      expiringQuantity,
      matrixVariants
    };
  };
  const mappedProducts = productsForCatalog.map(mapWorkspaceProduct);
  const mappedInventoryProducts = inventoryManagedProducts.map(mapWorkspaceProduct);
  const catalogProducts = mappedProducts.map((product) => ({
    productId: product.productId,
    productCode: product.productCode,
    productName: product.productName,
    productType: product.productType,
    unitOfMeasure: product.unitOfMeasure,
    baseUnitOfMeasure: product.baseUnitOfMeasure,
    sellingUnits: product.sellingUnits,
    price: product.price,
    department: product.department,
    category: product.category,
    imageUrl: product.imageUrl,
    quantityOnHand: product.quantityOnHand,
    taxRatePercent: product.taxRatePercent,
    taxInclusive: product.taxInclusive,
    mustEnterPriceAtPos: product.mustEnterPriceAtPos,
    isSerialized: product.isSerialized,
    trackSize: product.trackSize,
    trackColor: product.trackColor,
    trackInventory: product.trackInventory,
    trackExpiry: product.trackExpiry,
    shelfLifeDays: product.shelfLifeDays,
    minStockLevel: product.minStockLevel,
    reorderPoint: product.reorderPoint,
    safetyStockLevel: product.safetyStockLevel,
    earliestExpiryDate: product.earliestExpiryDate,
    expiringQuantity: product.expiringQuantity,
    matrixVariants: product.matrixVariants
  }));
  const sellableProducts = catalogProducts.filter(
    (product) => product.quantityOnHand > 0 || isNonInventorySaleProduct(product)
  );
  const shiftSummaries = recentShifts.map((shift) => summarizeOnlineShift(shift));
  const activeShiftSummary = shiftSummaries.find((shift) => shift.status === PosShiftStatus.OPEN) ?? null;
  const mappedEodReconciliations = eodReconciliations.map((reconciliation) => {
    const depositedAmount = toMoney(
      reconciliation.bankingDeposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0)
    );

    return {
      reconciliationId: reconciliation.id,
      reconciliationNo: reconciliation.reconciliationNo,
      shiftId: reconciliation.shiftId,
      shiftNo: reconciliation.shiftNo,
      cashierCode: reconciliation.cashierCode,
      expectedCashAmount: Number(reconciliation.expectedCashAmount),
      declaredCashAmount: Number(reconciliation.declaredCashAmount),
      varianceAmount: Number(reconciliation.varianceAmount),
      transactionCount: reconciliation.transactionCount,
      remainingCashAmount: toMoney(Math.max(0, Number(reconciliation.declaredCashAmount) - depositedAmount)),
      reconciledAt: reconciliation.reconciledAt.toISOString()
    };
  });
  const mappedBankingDeposits = bankingDeposits.map((deposit) => ({
    depositId: deposit.id,
    depositNo: deposit.depositNo,
    reconciliationNo: deposit.reconciliationNo,
    shiftNo: deposit.shiftNo,
    amount: Number(deposit.amount),
    bankName: deposit.bankNameSnapshot,
    accountNumber: deposit.bankAccountNumberSnapshot,
    reference: deposit.reference,
    depositedAt: deposit.depositedAt.toISOString()
  }));
  const mappedPurchaseOrders = purchaseOrders.map((purchaseOrder) => {
    const lines = purchaseOrder.lines.map((line) => {
      const orderedQuantity = toQuantity(line.orderedQuantity);
      const receivedQuantity = toQuantity(line.receivedQuantity);
      const exceptionQuantity = toQuantity(line.exceptionQuantity);

      return {
        purchaseOrderLineId: line.id,
        lineNo: line.lineNo,
        productId: line.productId,
        productCode: line.product.code,
        productName: line.product.name,
        isSerialized: line.product.isSerialized,
        trackExpiry: line.product.trackExpiry,
        orderedQuantity,
        receivedQuantity,
        exceptionQuantity,
        outstandingQuantity: toQuantity(Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity)),
        unitCost: line.unitCost === null ? null : Number(line.unitCost)
      };
    });
    const orderedQuantity = toQuantity(lines.reduce((sum, line) => sum + line.orderedQuantity, 0));
    const receivedQuantity = toQuantity(lines.reduce((sum, line) => sum + line.receivedQuantity, 0));
    const exceptionQuantity = toQuantity(lines.reduce((sum, line) => sum + line.exceptionQuantity, 0));

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      status: purchaseOrder.status,
      supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
      supplierName: purchaseOrder.supplier?.name ?? null,
      locationId: purchaseOrder.inventoryLocation.id,
      locationCode: purchaseOrder.inventoryLocation.code,
      locationName: purchaseOrder.inventoryLocation.name,
      orderedQuantity,
      receivedQuantity,
      exceptionQuantity,
      outstandingQuantity: toQuantity(Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity)),
      lineCount: lines.length,
      updatedAt: purchaseOrder.updatedAt.toISOString(),
      lines
    };
  });
  const mappedRecentGoodsReceipts = recentGoodsReceipts.map((receipt) => ({
    receiptId: receipt.id,
    receiptNo: receipt.receiptNo,
    purchaseOrderNo: receipt.purchaseOrder?.purchaseOrderNo ?? null,
    supplierNo: receipt.supplier?.supplierNo ?? null,
    supplierName: receipt.supplier?.name ?? null,
    locationCode: receipt.inventoryLocation.code,
    locationName: receipt.inventoryLocation.name,
    lineCount: receipt.lines.length,
    totalQuantity: toQuantity(receipt.lines.reduce((sum, line) => sum + Number(line.quantity), 0)),
    operatorName: receipt.operatorName,
    receivedAt: receipt.receivedAt.toISOString(),
    lines: receipt.lines.map((line) => ({
      goodsReceiptLineId: line.id,
      lineNo: line.lineNo,
      productId: line.productId,
      productCode: line.product.code,
      productName: line.product.name,
      quantity: toQuantity(line.quantity),
      unitCost: line.unitCost === null ? null : Number(line.unitCost),
      serialNumbers: readStringArrayJson(line.serialNumbersSnapshot) ?? [],
      batchNo: line.batchNo,
      manufacturedAt: line.manufacturedAt?.toISOString() ?? null,
      expiryDate: line.expiryDate?.toISOString() ?? null
    }))
  }));
  const mappedSupplierReturns = supplierReturns.map((supplierReturn) => ({
    supplierReturnId: supplierReturn.id,
    supplierReturnNo: supplierReturn.supplierReturnNo,
    supplierNo: supplierReturn.supplier.supplierNo,
    supplierName: supplierReturn.supplier.name,
    goodsReceiptNo: supplierReturn.goodsReceipt?.receiptNo ?? null,
    purchaseOrderNo: supplierReturn.purchaseOrder?.purchaseOrderNo ?? null,
    locationName: supplierReturn.inventoryLocation.name,
    reason: supplierReturn.reason,
    status: supplierReturn.status,
    totalQuantity: toQuantity(supplierReturn.lines.reduce((sum, line) => sum + Number(line.quantity), 0)),
    returnedAt: supplierReturn.returnedAt.toISOString()
  }));
  const currentStoreId = assignment.store.id;
  const mappedTransferRequests = transferRequests
    .filter(
      (transfer) =>
        transfer.sourceStore.id === currentStoreId || transfer.destinationStore.id === currentStoreId
    )
    .map((transfer) => {
    const requestedQuantity = toQuantity(transfer.requestedQuantity);
    const issuedQuantity = toQuantity(transfer.issuedQuantity);
    const receivedQuantity = toQuantity(transfer.receivedQuantity);

    return {
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      transferBatchNo: transfer.transferBatchNo,
      lineNo: transfer.lineNo,
      role: transfer.sourceStore.id === currentStoreId ? "SOURCE" as const : "DESTINATION" as const,
      origin: transfer.origin,
      externalReference: transfer.externalReference,
      workflowType: transfer.workflowType,
      sourceStoreCode: transfer.sourceStore.code,
      sourceStoreName: transfer.sourceStore.name,
      sourceLocationId: transfer.sourceInventoryLocation.id,
      sourceLocationCode:
        issuedQuantity > 0 ? transfer.sourceInventoryLocation.code : "",
      sourceLocationName:
        issuedQuantity > 0
          ? transfer.sourceInventoryLocation.name
          : "Selected by source shop on issue",
      destinationStoreCode: transfer.destinationStore.code,
      destinationStoreName: transfer.destinationStore.name,
      destinationLocationId: transfer.destinationInventoryLocation.id,
      destinationLocationCode: transfer.destinationInventoryLocation.code,
      destinationLocationName: transfer.destinationInventoryLocation.name,
      productId: transfer.product.id,
      productCode: transfer.product.code,
      productName: transfer.product.name,
      isSerialized: transfer.product.isSerialized,
      trackExpiry: transfer.product.trackExpiry,
      status: transfer.status,
      requestedQuantity,
      requestedUnitOfMeasure: transfer.requestedUnitOfMeasure,
      requestedUnitQuantity: toQuantity(transfer.requestedUnitQuantity),
      uomConversionFactor: Number(transfer.uomConversionFactor),
      baseUnitOfMeasure: transfer.baseUnitOfMeasure,
      issuedQuantity,
      receivedQuantity,
      outstandingIssueQuantity: toQuantity(Math.max(0, requestedQuantity - issuedQuantity)),
      outstandingReceiptQuantity: toQuantity(Math.max(0, issuedQuantity - receivedQuantity)),
      unitCost: transfer.unitCost === null ? null : Number(transfer.unitCost),
      transporterName: transfer.transporterName,
      vehicleRegistrationNo: transfer.vehicleRegistrationNo,
      driverName: transfer.driverName,
      driverContact: transfer.driverContact,
      deliveryNoteNo: transfer.deliveryNoteNo,
      feedbackStatus: transfer.feedbackStatus,
      waterTestResult: transfer.waterTestResult,
      quantityBeforeDelivery:
        transfer.quantityBeforeDelivery === null ? null : toQuantity(transfer.quantityBeforeDelivery),
      expectedQuantityReceived:
        transfer.expectedQuantityReceived === null ? null : toQuantity(transfer.expectedQuantityReceived),
      expectedStockQuantity:
        transfer.expectedStockQuantity === null ? null : toQuantity(transfer.expectedStockQuantity),
      quantityAfterDelivery:
        transfer.quantityAfterDelivery === null ? null : toQuantity(transfer.quantityAfterDelivery),
      actualQuantityReceived:
        transfer.actualQuantityReceived === null ? null : toQuantity(transfer.actualQuantityReceived),
      feedbackVarianceQuantity:
        transfer.feedbackVarianceQuantity === null ? null : toQuantity(transfer.feedbackVarianceQuantity),
      feedbackDipReading:
        transfer.feedbackDipReading === null ? null : toQuantity(transfer.feedbackDipReading),
      beforeDischargeEvidence: readTransferFeedbackEvidence(
        transfer.beforeDischargeEvidenceJson
      ),
      afterDischargeEvidence: readTransferFeedbackEvidence(
        transfer.afterDischargeEvidenceJson
      ),
      feedbackNote: transfer.feedbackNote,
      feedbackRecordedAt: transfer.feedbackRecordedAt?.toISOString() ?? null,
      feedbackConfirmedAt: transfer.feedbackConfirmedAt?.toISOString() ?? null,
      feedbackPostedAt: transfer.feedbackPostedAt?.toISOString() ?? null,
      feedbackOperatorName: transfer.feedbackOperatorName,
      issuedSerialNumbers: readStringArrayJson(transfer.issuedSerialNumbersSnapshot) ?? [],
      receivedSerialNumbers: readStringArrayJson(transfer.receivedSerialNumbersSnapshot) ?? [],
      issuedBatchAllocations: readInventoryBatchAllocations(transfer.issuedBatchAllocationsSnapshot),
      receivedBatchAllocations: readInventoryBatchAllocations(transfer.receivedBatchAllocationsSnapshot),
      requestNote: transfer.requestNote,
      issueNote: transfer.issueNote,
      receiptNote: transfer.receiptNote,
      requestOperatorName: transfer.requestOperatorName,
      issueOperatorName: transfer.issueOperatorName,
      receiptOperatorName: transfer.receiptOperatorName,
      requestedAt: transfer.requestedAt.toISOString(),
      requiredAt: transfer.requiredAt?.toISOString() ?? null,
      issuedAt: transfer.issuedAt?.toISOString() ?? null,
      receivedAt: transfer.receivedAt?.toISOString() ?? null,
      closedAt: transfer.closedAt?.toISOString() ?? null,
      updatedAt: transfer.updatedAt.toISOString()
    };
  });
  const mappedStoreExpenses = storeExpenses.map((expense) => ({
    expenseId: expense.id,
    expenseNo: expense.expenseNo,
    expenseDate: expense.expenseDate.toISOString(),
    category: expense.category,
    description: expense.description,
    supplierName: expense.supplierName,
    paymentMethod: expense.paymentMethod,
    externalReference: expense.externalReference,
    attachmentFileName: expense.attachmentFileName,
    attachmentUrl: expense.attachmentUrl,
    amount: Number(expense.amount),
    taxAmount: Number(expense.taxAmount),
    status: expense.status,
    confirmedBy: expense.confirmedBy,
    confirmedAt: expense.confirmedAt?.toISOString() ?? null,
    postedAt: expense.postedAt?.toISOString() ?? null,
    note: expense.note
  }));
  const mappedStockCountSessions = stockCountSessions.map((session) => ({
    sessionId: session.id,
    sessionNo: session.sessionNo,
    productId: session.product.id,
    productCode: session.product.code,
    productName: session.product.name,
    locationId: session.inventoryLocation.id,
    locationCode: session.inventoryLocation.code,
    locationName: session.inventoryLocation.name,
    status: session.status,
    previousQuantity: Number(session.previousQuantity),
    countedQuantity: Number(session.countedQuantity),
    varianceQuantity: Number(session.varianceQuantity),
    operatorName: session.operatorName,
    submittedAt: session.submittedAt.toISOString(),
    committedAt: session.committedAt?.toISOString() ?? null
  }));
  const salesOrderLineRowsByTransactionId = new Map<
    string,
    OnlineStoreWorkspaceData["salesOrders"][number]["lines"]
  >();

  for (const line of salesOrderLineRows) {
    const currentLines = salesOrderLineRowsByTransactionId.get(line.posTransactionId) ?? [];

    currentLines.push({
      productId: line.productId,
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      variantSize: line.variantSizeSnapshot,
      variantColor: line.variantColorSnapshot,
      lineNote: line.lineNote ?? null,
      quantity: Number(line.quantity),
      sellingUnitOfMeasure: line.sellingUnitOfMeasure,
      baseUnitOfMeasure: line.baseUnitOfMeasure,
      uomConversionFactor: Number(line.uomConversionFactor ?? 1),
      baseQuantity: Number(line.baseQuantity ?? line.quantity),
      unitPrice: Number(line.unitPrice),
      discountAmount: Number(line.discountAmount),
      taxAmount: Number(line.taxAmount),
      lineTotal: Number(line.lineTotal),
      appliedPromotionName: line.appliedPromotionNameSnapshot
    });
    salesOrderLineRowsByTransactionId.set(line.posTransactionId, currentLines);
  }

  const openSalesOrderSourceIds = new Set(
    salesOrders
      .filter((order) => order.status === SalesOrderStatus.OPEN)
      .map((order) => order.sourceTransactionId)
  );
  const mappedCustomers: OnlineStoreWorkspaceData["customers"] = customers.map((customer) => ({
    customerId: customer.id,
    customerNo: customer.customerNo,
    fullName: customer.fullName,
    customerType: customer.customerType,
    phone: customer.phone,
    email: customer.email,
    allowCreditSales: customer.allowCreditSales,
    creditLimitAmount: customer.creditLimitAmount === null ? null : Number(customer.creditLimitAmount),
    receivableBalanceAmount: Number(customer.receivableBalanceAmount),
    loyaltyEnrolled: customer.loyaltyEnrolled,
    loyaltyTier: customer.loyaltyTier,
    loyaltyPointsBalance: customer.loyaltyPointsBalance
  }));
  const mappedHeldSales: OnlineStoreWorkspaceData["heldSales"] = heldTransactions
    .filter((transaction) => !openSalesOrderSourceIds.has(transaction.id))
    .map((transaction) => ({
      transactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      customerId: transaction.customerId,
      customerNo: transaction.customer?.customerNo ?? null,
      customerName: transaction.customerNameSnapshot ?? transaction.customer?.fullName ?? "Walk-in",
      transactionType: transaction.transactionType,
      totalAmount: Number(transaction.totalAmount),
      itemCount: toQuantity(transaction.lines.reduce((sum, line) => sum + Number(line.quantity), 0)),
      lineCount: transaction.lines.length,
      updatedAt: transaction.updatedAt.toISOString(),
      lines: transaction.lines.map((line) => ({
        productId: line.productId,
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variantSize: line.variantSizeSnapshot,
        variantColor: line.variantColorSnapshot,
      lineNote: line.lineNote ?? null,
      quantity: Number(line.quantity),
      sellingUnitOfMeasure: line.sellingUnitOfMeasure,
      baseUnitOfMeasure: line.baseUnitOfMeasure,
      uomConversionFactor: Number(line.uomConversionFactor ?? 1),
      baseQuantity: Number(line.baseQuantity ?? line.quantity),
      unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        taxAmount: Number(line.taxAmount),
        lineTotal: Number(line.lineTotal),
        appliedPromotionName: line.appliedPromotionNameSnapshot,
        serialNumbers: readStringArrayJson(line.serialNumbersSnapshot) ?? []
      }))
    }));
  const mappedSalesOrders: OnlineStoreWorkspaceData["salesOrders"] = salesOrders.map((order) => {
    const orderLines = salesOrderLineRowsByTransactionId.get(order.sourceTransactionId) ?? [];

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      sourceTransactionId: order.sourceTransactionId,
      sourceTransactionNo: order.sourceTransactionNo,
      customerId: order.customerId,
      customerNo: order.customerNoSnapshot,
      customerName: order.customerNameSnapshot ?? "Customer",
      originStoreId: order.store.id,
      originStoreCode: order.store.code,
      originStoreName: order.store.name,
      isFulfilmentOrder: isSalesOrderFulfilmentStore && order.store.id !== currentStoreId,
      orderType: order.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER",
      status: order.status,
      totalAmount: Number(order.totalAmount),
      depositAmount: Number(order.depositAmount),
      paidAmount: Number(order.paidAmount),
      balanceAmount: Number(order.balanceAmount),
      depositTenderMethodCode: order.depositTenderMethodCodeSnapshot,
      depositTenderMethodName: order.depositTenderMethodNameSnapshot,
      depositPaymentMethod: order.depositPaymentMethodSnapshot,
      depositReference: order.depositReference,
      depositPaidAt: order.depositPaidAt?.toISOString() ?? null,
      minimumDepositAmount: Number(order.minimumDepositAmount),
      layawayPolicy:
        order.orderType === "LAYAWAY"
          ? normalizeLayawaySettings(order.layawayPolicySnapshotJson)
          : null,
      reservationStatus: order.reservationStatus,
      reservationCreatedAt: order.reservationCreatedAt?.toISOString() ?? null,
      reservationReleasedAt: order.reservationReleasedAt?.toISOString() ?? null,
      layawayExpiresAt: order.layawayExpiresAt?.toISOString() ?? null,
      expiredAt: order.expiredAt?.toISOString() ?? null,
      cancellationFeeAmount: Number(order.cancellationFeeAmount),
      refundedAmount: Number(order.refundedAmount),
      itemCount: toQuantity(orderLines.reduce((sum, line) => sum + line.quantity, 0)),
      lineCount: orderLines.length,
      operatorName: order.operatorName,
      note: order.note,
      fulfilledTransactionNo: order.fulfilledTransactionNo,
      createdAt: order.createdAt.toISOString(),
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      lines: orderLines
    };
  });
  const mappedAccountPayments: OnlineStoreWorkspaceData["accountPayments"] = accountPayments.map((entry) => ({
    entryId: entry.id,
    entryNo: entry.transactionNoSnapshot ?? `ACC-${entry.id.slice(0, 8).toUpperCase()}`,
    customerId: entry.customer.id,
    customerNo: entry.customer.customerNo,
    customerName: entry.customer.fullName,
    amount: Math.abs(Number(entry.receivableDeltaAmount)),
    reference: entry.sourceTransactionNoSnapshot,
    note: entry.note,
    occurredAt: entry.occurredAt.toISOString()
  }));
  const reportTenderMap = new Map<string, OnlineStoreWorkspaceData["reports"]["tenderRows"][number]>();
  const reportProductMap = new Map<string, OnlineStoreWorkspaceData["reports"]["productRows"][number]>();
  let reportReturnAmount = 0;

  for (const payment of reportPayments) {
    const totalAmount = Number(payment.posTransaction.totalAmount);
    const signedAmount = signedPaymentAmount({
      transactionType: payment.posTransaction.transactionType,
      totalAmount,
      paymentAmount: Number(payment.amount)
    });
    const tenderKey = `${payment.method}:${payment.tenderMethodCodeSnapshot ?? payment.tenderMethodNameSnapshot ?? "unmapped"}`;
    const current = reportTenderMap.get(tenderKey) ?? {
      paymentMethod: payment.method,
      tenderMethodCode: payment.tenderMethodCodeSnapshot,
      tenderMethodName: payment.tenderMethodNameSnapshot,
      transactionCount: 0,
      netAmount: 0
    };

    current.transactionCount += 1;
    current.netAmount = toMoney(current.netAmount + signedAmount);
    reportTenderMap.set(tenderKey, current);
  }

  for (const transaction of reportTransactions) {
    const totalAmount = Number(transaction.totalAmount);

    if (transaction.transactionType === PosTransactionType.RETURN) {
      reportReturnAmount = toMoney(reportReturnAmount + Math.abs(totalAmount));
    }

    for (const line of transaction.lines) {
      const variantSize = line.variantSizeSnapshot ?? null;
      const variantColor = line.variantColorSnapshot ?? null;
      const sellingUnitOfMeasure = line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA";
      const baseUnitOfMeasure = line.baseUnitOfMeasure ?? sellingUnitOfMeasure;
      const key = `${line.productCodeSnapshot}:${line.productNameSnapshot}:${variantSize ?? ""}:${variantColor ?? ""}:${sellingUnitOfMeasure}`;
      const current = reportProductMap.get(key) ?? {
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variantSize,
        variantColor,
        sellingUnitOfMeasure,
        baseUnitOfMeasure,
        quantity: 0,
        baseQuantity: 0,
        grossAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        netAmount: 0
      };
      const direction = line.lineIntent === PosTransactionLineIntent.RETURN ? -1 : 1;

      current.quantity = toQuantity(current.quantity + Number(line.quantity) * direction);
      current.baseQuantity = toQuantity(
        current.baseQuantity + Number(line.baseQuantity ?? line.quantity) * direction
      );
      current.grossAmount = toMoney(current.grossAmount + Number(line.unitPrice) * Number(line.quantity) * direction);
      current.discountAmount = toMoney(current.discountAmount + Number(line.discountAmount) * direction);
      current.taxAmount = toMoney(current.taxAmount + Number(line.taxAmount) * direction);
      current.netAmount = toMoney(current.netAmount + Number(line.lineTotal) * direction);
      reportProductMap.set(key, current);
    }
  }

  const reportSalesRows = reportTransactions.map((transaction) => ({
    transactionNo: transaction.transactionNo,
    transactionType: transaction.transactionType,
    sourceTransactionNo: transaction.sourceTransactionNo,
    completedAt: transaction.completedAt?.toISOString() ?? null,
    cashierCode: transaction.cashierCodeSnapshot,
    customerName: transaction.customerNameSnapshot ?? "Walk-in",
    lineCount: transaction.lines.length,
    productPreview: transaction.lines.map((line) => line.productNameSnapshot).join(", "),
    totalAmount: Number(transaction.totalAmount),
    paidAmount: Number(transaction.paidAmount)
  }));
  const reportTenderRows = [...reportTenderMap.values()].sort((left, right) => right.netAmount - left.netAmount);
  const reportProductRows = [...reportProductMap.values()].sort((left, right) => Math.abs(right.netAmount) - Math.abs(left.netAmount));
  const reportSerialBatchRows: OnlineStoreWorkspaceData["reports"]["serialBatchRows"] =
    reportTransactions
      .flatMap((transaction) =>
        transaction.lines
          .filter((line) => line.lineIntent === PosTransactionLineIntent.SALE)
          .flatMap((line) => {
            const common = {
              transactionNo: transaction.transactionNo,
              completedAt: transaction.completedAt?.toISOString() ?? null,
              cashierCode: transaction.cashierCodeSnapshot,
              productCode: line.productCodeSnapshot,
              productName: line.productNameSnapshot,
              locationId: line.inventoryLocationId,
              locationName: line.inventoryLocation?.name ?? null
            };
            const serialRows = (readStringArrayJson(line.serialNumbersSnapshot) ?? []).map(
              (serialNumber) => ({
                traceId: `${line.id}:SERIAL:${serialNumber}`,
                ...common,
                trackingType: "Serial" as const,
                serialNumber,
                batchNo: null,
                expiryDate: null,
                quantity: 1
              })
            );
            const batchRows = readInventoryBatchAllocations(line.batchAllocationsSnapshot).map(
              (batch) => ({
                traceId: `${line.id}:BATCH:${batch.batchNo}:${batch.expiryDate}`,
                ...common,
                trackingType: "Batch" as const,
                serialNumber: null,
                batchNo: batch.batchNo,
                expiryDate: batch.expiryDate,
                quantity: batch.quantity
              })
            );

            return [...serialRows, ...batchRows];
          })
      )
      .slice(0, 500);
  const reportInventoryRows = ledgerPositions
    .map((position) => {
      const product = productById.get(position.productId);
      const location = locationById.get(position.inventoryLocationId);
      const quantityOnHand = toQuantity(position._sum.quantity);

      if (!product || !location || quantityOnHand === 0) {
        return null;
      }

      return {
        productCode: product.code,
        productName: product.name,
        locationName: location.name,
        quantityOnHand,
        stockValue: toMoney(quantityOnHand * Number(product.baseUnitPrice))
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => Math.abs(right.stockValue) - Math.abs(left.stockValue));
  const reportNetSalesAmount = toMoney(reportTransactions.reduce((sum, transaction) => sum + Number(transaction.totalAmount), 0));
  const layawayOrders = salesOrders.filter((order) => order.orderType === "LAYAWAY");
  const layawayOrderBySourceTransactionId = new Map(
    layawayOrders.map((order) => [order.sourceTransactionId, order] as const)
  );
  const layawayAgeingNow = new Date();
  const reportLayawayRows: OnlineStoreWorkspaceData["reports"]["layawayRows"] = layawayOrders.map((order) => {
    const ageingEnd = order.fulfilledAt ?? order.cancelledAt ?? order.expiredAt ?? layawayAgeingNow;
    const ageDays = Math.max(
      0,
      Math.floor((ageingEnd.getTime() - order.createdAt.getTime()) / 86_400_000)
    );

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      customerName: order.customerNameSnapshot ?? "Customer",
      totalAmount: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      balanceAmount: Number(order.balanceAmount),
      reservationStatus: order.reservationStatus,
      reservedBaseQuantity: toQuantity(
        order.inventoryReservations
          .filter((reservation) => reservation.status === "ACTIVE")
          .reduce((sum, reservation) => sum + Number(reservation.baseQuantity), 0)
      ),
      cancellationFeeAmount: Number(order.cancellationFeeAmount),
      refundedAmount: Number(order.refundedAmount),
      ageDays,
      ageingBucket:
        ageDays <= 30
          ? "0-30 days"
          : ageDays <= 60
            ? "31-60 days"
            : ageDays <= 90
              ? "61-90 days"
              : "91+ days",
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.layawayExpiresAt?.toISOString() ?? null
    };
  });
  const reportLayawayPaymentRows: OnlineStoreWorkspaceData["reports"]["layawayPaymentRows"] =
    salesOrderPaymentRows.flatMap((payment) => {
      const order = layawayOrderBySourceTransactionId.get(payment.posTransactionId);

      return order
        ? [
            {
              paymentId: payment.id,
              orderNo: order.orderNo,
              customerName: order.customerNameSnapshot ?? "Customer",
              paymentPurpose: payment.paymentPurpose,
              tenderName:
                payment.tenderMethodNameSnapshot ??
                payment.tenderMethodCodeSnapshot ??
                payment.method,
              amount: Number(payment.amount),
              reference: payment.reference,
              shiftNo: payment.receivedShiftNoSnapshot,
              terminalCode: payment.receivedTerminalCodeSnapshot,
              cashierCode: payment.receivedCashierCodeSnapshot,
              receivedAt: payment.receivedAt.toISOString()
            }
          ]
        : [];
    });
  const reports: OnlineStoreWorkspaceData["reports"] = {
    summary: {
      salesCount: reportTransactions.filter((transaction) => transaction.transactionType === PosTransactionType.SALE).length,
      returnCount: reportTransactions.filter((transaction) => transaction.transactionType === PosTransactionType.RETURN).length,
      exchangeCount: reportTransactions.filter((transaction) => transaction.transactionType === PosTransactionType.EXCHANGE).length,
      netSalesAmount: reportNetSalesAmount,
      returnAmount: reportReturnAmount,
      discountAmount: toMoney(reportTransactions.reduce((sum, transaction) => sum + Number(transaction.discountAmount), 0)),
      taxAmount: toMoney(reportTransactions.reduce((sum, transaction) => sum + Number(transaction.taxAmount), 0)),
      tenderedAmount: toMoney(reportTenderRows.reduce((sum, row) => sum + row.netAmount, 0)),
      inventoryStockValue: toMoney(reportInventoryRows.reduce((sum, row) => sum + row.stockValue, 0))
    },
    salesRows: reportSalesRows,
    tenderRows: reportTenderRows,
    productRows: reportProductRows,
    serialBatchRows: reportSerialBatchRows,
    salesOrderRows: mappedSalesOrders.map((order) => ({
      orderId: order.orderId,
      orderNo: order.orderNo,
      status: order.status,
      customerNo: order.customerNo,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
      depositAmount: order.depositAmount,
      balanceAmount: order.balanceAmount,
      depositTenderMethodName: order.depositTenderMethodName,
      depositPaymentMethod: order.depositPaymentMethod,
      depositReference: order.depositReference,
      itemCount: order.itemCount,
      lineCount: order.lineCount,
      operatorName: order.operatorName,
      fulfilledTransactionNo: order.fulfilledTransactionNo,
      createdAt: order.createdAt,
      fulfilledAt: order.fulfilledAt,
      cancelledAt: order.cancelledAt
    })),
    layawayRows: reportLayawayRows,
    layawayPaymentRows: reportLayawayPaymentRows,
    shiftRows: shiftSummaries.map((shift) => ({
      shiftId: shift.shiftId,
      shiftNo: shift.shiftNo,
      status: shift.status,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      transactionCount: shift.transactionCount,
      netSalesAmount: shift.netSalesAmount,
      expectedCashAmount: shift.expectedCashAmount,
      declaredCashAmount: shift.declaredCashAmount,
      varianceAmount: shift.varianceAmount
    })),
    inventoryRows: reportInventoryRows,
    bankingRows: mappedBankingDeposits.map((deposit) => ({
      depositNo: deposit.depositNo,
      reconciliationNo: deposit.reconciliationNo,
      shiftNo: deposit.shiftNo,
      depositedAt: deposit.depositedAt,
      bankName: deposit.bankName,
      accountNumber: deposit.accountNumber,
      amount: deposit.amount,
      reference: deposit.reference
    }))
  };
  const reporting = await buildOnlineReportMetadata({
    retailOrgId: assignment.session.retailOrgId,
    storeId: assignment.store.id,
    currentCashierCode: assignment.user.loginId,
    supervisorScopeAllowed: sessionHasAllPermissions(assignment.session, ["pos.receipt.search"], {
      requireSupervisorEligible: true
    }),
    lastCriteria: {
      reportId: "sales",
      scope: "CASHIER",
      dateFrom: formatDateInput(startOfDay),
      dateTo: formatDateInput(startOfDay),
      cashierCode: assignment.user.loginId,
      limit: 100
    }
  });

  return {
    isAvailable: true,
    unavailableReason: null,
    operator,
    capabilities,
    store: {
      id: assignment.store.id,
      code: assignment.store.code,
      name: assignment.store.name,
      currencyCode: assignment.store.currencyCode,
      timezone: assignment.store.timezone,
      phone: assignment.store.phone,
      location: assignment.store.location,
      addressLine1: assignment.store.addressLine1,
      addressLine2: assignment.store.addressLine2,
      city: assignment.store.city,
      salesEnabled: assignment.store.salesEnabled,
      warehouseEnabled: assignment.store.warehouseEnabled,
      receiptHeader: assignment.store.receiptHeader,
      receiptFooter: assignment.store.receiptFooter,
      salesReceiptTemplateHtml: receiptTemplateResolution.html,
      accountPaymentReceiptTemplateHtml:
        assignment.store.accountPaymentReceiptTemplate?.templateHtml ??
        assignment.store.accountPaymentReceiptTemplateHtml ??
        defaultAccountPaymentReceiptTemplateHtml
    },
    branding,
    metrics: {
      todaySales: reports.summary.netSalesAmount,
      todayTransactions: todaySales._count._all,
      todayReturns: returnSummary?._count._all ?? 0,
      todayExchanges: exchangeSummary?._count._all ?? 0,
      todayReturnsAmount: reports.summary.returnAmount,
      expectedCash: activeShiftSummary?.expectedCashAmount ?? 0,
      accountPayments: Math.abs(Number(todayAccountPayments._sum.receivableDeltaAmount ?? 0)),
      openOrders:
        mappedHeldSales.length +
        mappedSalesOrders.filter((order) => order.status === SalesOrderStatus.OPEN).length,
      openShiftNo: activeShiftSummary?.shiftNo ?? null,
      productCount: sellableProducts.length
    },
    optionSettings,
    salesOrderRouting: {
      fulfilmentStoreId: salesOrderFulfilmentStore?.id ?? null,
      fulfilmentStoreCode: salesOrderFulfilmentStore?.code ?? null,
      fulfilmentStoreName: salesOrderFulfilmentStore?.name ?? null,
      isFulfilmentStore: isSalesOrderFulfilmentStore
    },
    loyaltyPolicy,
    promotions,
    customers: mappedCustomers,
    products: catalogProducts,
    inventoryProducts: mappedInventoryProducts.map((product) => ({
      productId: product.productId,
      productCode: product.productCode,
      sku: product.sku,
      productName: product.productName,
      productType: product.productType,
      unitOfMeasure: product.unitOfMeasure,
      baseUnitOfMeasure: product.baseUnitOfMeasure,
      sellingUnits: product.sellingUnits,
      uomConversions: product.uomConversions,
      price: product.price,
      unitCost: product.unitCost,
      department: product.department,
      category: product.category,
      imageUrl: product.imageUrl,
      quantityOnHand: product.quantityOnHand,
      taxRatePercent: product.taxRatePercent,
      taxInclusive: product.taxInclusive,
      mustEnterPriceAtPos: product.mustEnterPriceAtPos,
      isSerialized: product.isSerialized,
      trackInventory: product.trackInventory,
      trackSize: product.trackSize,
      trackColor: product.trackColor,
      trackExpiry: product.trackExpiry,
      shelfLifeDays: product.shelfLifeDays,
      minStockLevel: product.minStockLevel,
      reorderPoint: product.reorderPoint,
      safetyStockLevel: product.safetyStockLevel,
      earliestExpiryDate: product.earliestExpiryDate,
      expiringQuantity: product.expiringQuantity,
      matrixVariants: product.matrixVariants
    })),
    purchaseOrderSuppliers: purchaseOrderSuppliers.map((supplier) => ({
      supplierNo: supplier.supplierNo,
      supplierName: supplier.name
    })),
    inventoryRows: ledgerPositions
      .map((position) => {
        const product = productById.get(position.productId);
        const location = locationById.get(position.inventoryLocationId);
        const quantityOnHand = toQuantity(position._sum.quantity);

        if (!product || !location || quantityOnHand === 0) {
          return null;
        }

        const activeReservedQuantity =
          activeReservedByLocationProduct.get(
            `${position.inventoryLocationId}:${product.code.trim().toUpperCase()}`
          ) ?? 0;
        const safetyStockLevel = toQuantity(product.safetyStockLevel);
        const ecommerceEligibility = ecommerceEligibilityByLocation.get(
          position.inventoryLocationId
        );
        const ecommerceEligible = Boolean(
          ecommerceEligibility?.supportsPickup || ecommerceEligibility?.supportsDelivery
        );

        return {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          isSerialized: product.isSerialized,
          trackExpiry: product.trackExpiry,
          locationId: location.id,
          locationCode: location.code,
          locationName: location.name,
          quantityOnHand,
          activeReservedQuantity,
          ecommerceSellableQuantity: ecommerceEligible
            ? toQuantity(
                Math.max(0, quantityOnHand - activeReservedQuantity - safetyStockLevel)
              )
            : 0,
          ecommercePickupEligible: ecommerceEligibility?.supportsPickup ?? false,
          ecommerceDeliveryEligible: ecommerceEligibility?.supportsDelivery ?? false,
          ecommerceEligibilityLabel:
            ecommerceEligibility?.labels.join("; ") ??
            "Not configured for ecommerce fulfilment",
          price: Number(product.baseUnitPrice)
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    inventoryBatches: products.flatMap((product) =>
      product.inventoryBatches.flatMap((batch) => {
        const location = locationById.get(batch.inventoryLocationId);

        if (!location || Number(batch.quantityOnHand) <= 0) {
          return [];
        }

        return [{
          batchId: batch.id,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          locationId: location.id,
          locationCode: location.code,
          locationName: location.name,
          batchNo: batch.batchNo,
          manufacturedAt: batch.manufacturedAt?.toISOString() ?? null,
          expiryDate: batch.expiryDate.toISOString(),
          daysUntilExpiry: inventoryBatchDaysUntilExpiry(batch.expiryDate),
          quantityOnHand: toQuantity(batch.quantityOnHand),
          status: batch.status
        }];
      })
    ),
    inventorySerialUnits: products.flatMap((product) =>
      product.inventorySerialUnits.map((serialUnit) => {
        const location = serialUnit.inventoryLocationId
          ? locationById.get(serialUnit.inventoryLocationId)
          : null;

        return {
          serialUnitId: serialUnit.id,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          locationId: location?.id ?? null,
          locationCode: location?.code ?? null,
          locationName: location?.name ?? null,
          serialNumber: serialUnit.serialNumber,
          status: serialUnit.status,
          sourceReferenceType: serialUnit.sourceReferenceType,
          sourceReferenceId: serialUnit.sourceReferenceId,
          sourceReferenceLabel: serialUnit.sourceReferenceLabel,
          lastOccurredAt: serialUnit.lastOccurredAt?.toISOString() ?? null,
          updatedAt: serialUnit.updatedAt.toISOString()
        };
      })
    ),
    inventoryLocations: inventoryLocations.map((location) => ({
      locationId: location.id,
      locationCode: location.code,
      locationName: location.name,
      warehouseId: location.warehouseId,
      warehouseCode: location.warehouse?.code ?? null,
      useForSalesDefault: location.useForSalesDefault,
      useForSalesOrderDefault: location.useForSalesOrderDefault,
      useForReceivingDefault: location.useForReceivingDefault
    })),
    transferStores: transferStores.map((store) => ({
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name,
      defaultLocationId: store.inventoryLocations[0]?.id ?? null,
      sourceLocations: store.inventoryLocations.map((location) => ({
        locationId: location.id,
        locationCode: location.code,
        locationName: location.name
      }))
    })),
    tenderMethods: tenderMethods.map(mapTenderMethod),
    bankAccounts: bankAccounts.map(mapBankAccount),
    shift: activeShiftSummary,
    eodReconciliations: mappedEodReconciliations,
    bankingDeposits: mappedBankingDeposits,
    purchaseOrders: mappedPurchaseOrders,
    recentGoodsReceipts: mappedRecentGoodsReceipts,
    supplierReturns: mappedSupplierReturns,
    transferRequests: mappedTransferRequests,
    storeExpenses: mappedStoreExpenses,
    stockCountSessions: mappedStockCountSessions,
    heldSales: mappedHeldSales,
    salesOrders: mappedSalesOrders,
    accountPayments: mappedAccountPayments,
    recentTransactions: recentTransactions.map((transaction) => ({
      transactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      transactionType: transaction.transactionType,
      sourceTransactionNo: transaction.sourceTransactionNo,
      status: transaction.status,
      customerName: transaction.customerNameSnapshot ?? "Walk-in",
      totalAmount: Number(transaction.totalAmount),
      completedAt: transaction.completedAt?.toISOString() ?? null,
      note: transaction.notes,
      payments: transaction.payments.map((payment) => ({
        paymentMethod: payment.method,
        tenderMethodCode: payment.tenderMethodCodeSnapshot,
        tenderMethodName: payment.tenderMethodNameSnapshot,
        bankAccountId: payment.bankAccountId,
        amount: Number(payment.amount),
        reference: payment.reference
      })),
      lines: transaction.lines.map((line) => ({
        lineId: line.id,
        productId: line.productId,
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variantSize: line.variantSizeSnapshot,
        variantColor: line.variantColorSnapshot,
        lineNote: line.lineNote ?? null,
        lineIntent: line.lineIntent,
        sourceLineId: line.sourceLineId,
        quantity: Number(line.quantity),
        sellingUnitOfMeasure: line.sellingUnitOfMeasure,
        baseUnitOfMeasure: line.baseUnitOfMeasure,
        uomConversionFactor: Number(line.uomConversionFactor ?? 1),
        baseQuantity: Number(line.baseQuantity ?? line.quantity),
        returnableQuantity:
          transaction.transactionType === PosTransactionType.RETURN || line.lineIntent === PosTransactionLineIntent.RETURN
            ? 0
            : toQuantity(Math.max(0, Number(line.quantity) - (returnedQuantityBySourceLineId.get(line.id) ?? 0))),
        unitPrice: Number(line.unitPrice),
        taxAmount: Number(line.taxAmount),
        discountAmount: Number(line.discountAmount),
        lineTotal: Number(line.lineTotal),
        appliedPromotionName: line.appliedPromotionNameSnapshot
      }))
    })),
    reports,
    reporting,
    fuelOperationsWorkspace,
    refreshedAt: new Date().toISOString()
  };
}

export type BrowseOnlineStoreReportsResponse = {
  reports: OnlineStoreWorkspaceData["reports"];
  reporting: OnlineStoreWorkspaceData["reporting"];
  generatedAt: string;
};

export async function browseOnlineStoreReports(
  input: OnlineStoreReportCriteria = {}
): Promise<BrowseOnlineStoreReportsResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("browsing Online POS reports");
  const requestedStoreScope = input.scope === "STORE";
  const storeScopeAllowed = sessionHasAllPermissions(session, ["pos.receipt.search"], {
    requireSupervisorEligible: true
  });
  const managerApproval =
    requestedStoreScope && !storeScopeAllowed
      ? await requireOnlineManagerApproval({
          session,
          currentUser: user,
          store,
          managerOverride: input.managerOverride,
          permissionCodes: ["pos.receipt.search"],
          purpose: "viewing whole-store online reports",
          requireSupervisorEligible: true
        })
      : null;
  const supervisorScopeAllowed = storeScopeAllowed || managerApproval !== null;
  const criteria = normalizeOnlineReportCriteria(input, {
    defaultCashierCode: user.loginId,
    supervisorScopeAllowed
  });
  const dateFrom = normalizeReportDateStart(criteria.dateFrom);
  const dateTo = normalizeReportDateEnd(criteria.dateTo);
  const shiftStatusSearch = toPosShiftStatusFilter(criteria.searchQuery);
  const transactionWhere: Prisma.PosTransactionWhereInput = {
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    status: PosTransactionStatus.COMPLETED,
    ...(dateFrom || dateTo
      ? {
          completedAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {})
          }
        }
      : {}),
    ...(criteria.cashierCode ? { cashierCodeSnapshot: criteria.cashierCode } : {}),
    ...(criteria.shiftId ? { posShiftId: criteria.shiftId } : {}),
    ...(criteria.customerQuery
      ? {
          OR: [
            { customerNameSnapshot: { contains: criteria.customerQuery } },
            { customer: { customerNo: { contains: criteria.customerQuery } } },
            { customer: { fullName: { contains: criteria.customerQuery } } }
          ]
        }
      : {}),
    ...(criteria.productQuery
      ? {
          lines: {
            some: {
              OR: [
                { productCodeSnapshot: { contains: criteria.productQuery } },
                { productNameSnapshot: { contains: criteria.productQuery } }
              ]
            }
          }
        }
      : {}),
    ...(criteria.tenderMethodCode
      ? {
          payments: {
            some: {
              tenderMethodCodeSnapshot: criteria.tenderMethodCode
            }
          }
        }
      : {})
  };
  const paymentWhere: Prisma.PosPaymentWhereInput = {
    posTransaction: {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      deletedAt: null,
      ...(criteria.customerQuery
        ? {
            OR: [
              { customerNameSnapshot: { contains: criteria.customerQuery } },
              { customer: { customerNo: { contains: criteria.customerQuery } } },
              { customer: { fullName: { contains: criteria.customerQuery } } }
            ]
          }
        : {}),
      ...(criteria.productQuery
        ? {
            lines: {
              some: {
                OR: [
                  { productCodeSnapshot: { contains: criteria.productQuery } },
                  { productNameSnapshot: { contains: criteria.productQuery } }
                ]
              }
            }
          }
        : {})
    },
    ...(dateFrom || dateTo
      ? {
          receivedAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {})
          }
        }
      : {}),
    ...(criteria.cashierCode ? { receivedCashierCodeSnapshot: criteria.cashierCode } : {}),
    ...(criteria.shiftId ? { receivedShiftId: criteria.shiftId } : {}),
    ...(criteria.tenderMethodCode
      ? { tenderMethodCodeSnapshot: criteria.tenderMethodCode }
      : {})
  };
  const salesOrderWhere: Prisma.SalesOrderWhereInput = {
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    ...((dateFrom || dateTo) && criteria.reportId !== "layawayPayments"
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {})
          }
        }
      : {}),
    ...(criteria.cashierCode && criteria.reportId !== "layawayPayments"
      ? { operatorName: { contains: criteria.cashierCode } }
      : {}),
    ...(criteria.customerQuery
      ? {
          OR: [
            { customerNoSnapshot: { contains: criteria.customerQuery } },
            { customerNameSnapshot: { contains: criteria.customerQuery } },
            { customer: { customerNo: { contains: criteria.customerQuery } } },
            { customer: { fullName: { contains: criteria.customerQuery } } }
          ]
        }
      : {}),
    ...(criteria.productQuery
      ? {
          lines: {
            some: {
              OR: [
                { productCodeSnapshot: { contains: criteria.productQuery } },
                { productNameSnapshot: { contains: criteria.productQuery } }
              ]
            }
          }
        }
      : {})
  };
  const [transactions, reportPayments, shifts, bankingDeposits, inventoryEntries, salesOrderReportRows] = await Promise.all([
    prisma.posTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: criteria.limit,
      select: {
        transactionNo: true,
        transactionType: true,
        sourceTransactionNo: true,
        cashierCodeSnapshot: true,
        customerNameSnapshot: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        completedAt: true,
        lines: {
          select: {
            id: true,
            lineIntent: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            taxAmount: true,
            lineTotal: true,
            serialNumbersSnapshot: true,
            batchAllocationsSnapshot: true,
            inventoryLocationId: true,
            inventoryLocation: {
              select: {
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.posPayment.findMany({
      where: paymentWhere,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        posTransactionId: true,
        method: true,
        tenderMethodCodeSnapshot: true,
        tenderMethodNameSnapshot: true,
        amount: true,
        reference: true,
        paymentPurpose: true,
        receivedShiftNoSnapshot: true,
        receivedTerminalCodeSnapshot: true,
        receivedCashierCodeSnapshot: true,
        receivedAt: true,
        posTransaction: {
          select: {
            transactionType: true,
            totalAmount: true
          }
        }
      }
    }),
    prisma.posShift.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        ...(criteria.shiftId ? { id: criteria.shiftId } : {}),
        ...(criteria.cashierCode ? { cashierUser: { loginId: criteria.cashierCode } } : {}),
        ...(dateFrom || dateTo
          ? {
              openedAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {})
              }
            }
          : {}),
        ...(criteria.searchQuery
          ? {
              OR: [
                { shiftNo: { contains: criteria.searchQuery } },
                ...(shiftStatusSearch ? [{ status: { equals: shiftStatusSearch } }] : [])
              ]
            }
          : {})
      },
      orderBy: {
        openedAt: "desc"
      },
      take: criteria.limit,
      select: {
        id: true,
        shiftNo: true,
        status: true,
        openingFloatAmount: true,
        closingDeclaredCash: true,
        closingVariance: true,
        openedAt: true,
        closedAt: true,
        posTransactions: {
          where: {
            status: PosTransactionStatus.COMPLETED
          },
          select: {
            id: true,
            transactionType: true,
            totalAmount: true,
            changeAmount: true
          }
        },
        receivedPayments: {
          where: {
            posTransaction: {
              deletedAt: null
            }
          },
          select: {
            posTransactionId: true,
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            amount: true,
            posTransaction: {
              select: {
                transactionType: true,
                totalAmount: true
              }
            }
          }
        }
      }
    }),
    prisma.bankingDeposit.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        ...(criteria.shiftId ? { reconciliation: { shiftId: criteria.shiftId } } : {}),
        ...(dateFrom || dateTo
          ? {
              depositedAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {})
              }
            }
          : {}),
        ...(criteria.searchQuery
          ? {
              OR: [
                { depositNo: { contains: criteria.searchQuery } },
                { reconciliationNo: { contains: criteria.searchQuery } },
                { shiftNo: { contains: criteria.searchQuery } },
                { bankNameSnapshot: { contains: criteria.searchQuery } },
                { bankAccountNumberSnapshot: { contains: criteria.searchQuery } },
                { reference: { contains: criteria.searchQuery } }
              ]
            }
          : {})
      },
      orderBy: {
        depositedAt: "desc"
      },
      take: criteria.limit,
      select: {
        depositNo: true,
        reconciliationNo: true,
        shiftNo: true,
        depositedAt: true,
        bankNameSnapshot: true,
        bankAccountNumberSnapshot: true,
        amount: true,
        reference: true
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        ...(criteria.locationId ? { inventoryLocationId: criteria.locationId } : {}),
        ...(criteria.productQuery
          ? {
              product: {
                OR: [
                  { code: { contains: criteria.productQuery } },
                  { name: { contains: criteria.productQuery } }
                ]
              }
            }
          : {})
      },
      take: Math.min(criteria.limit * 20, 2000),
      select: {
        quantity: true,
        inventoryLocation: {
          select: {
            name: true
          }
        },
        product: {
          select: {
            code: true,
            name: true,
            baseUnitPrice: true
          }
        }
      }
    }),
    prisma.salesOrder.findMany({
      where: salesOrderWhere,
      orderBy: [{ createdAt: "desc" }, { orderNo: "desc" }],
      take: criteria.limit,
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        orderType: true,
        status: true,
        customerNoSnapshot: true,
        customerNameSnapshot: true,
        totalAmount: true,
        depositAmount: true,
        paidAmount: true,
        balanceAmount: true,
        depositTenderMethodNameSnapshot: true,
        depositPaymentMethodSnapshot: true,
        depositReference: true,
        minimumDepositAmount: true,
        reservationStatus: true,
        layawayExpiresAt: true,
        expiredAt: true,
        cancellationFeeAmount: true,
        refundedAmount: true,
        operatorName: true,
        fulfilledTransactionNo: true,
        createdAt: true,
        fulfilledAt: true,
        cancelledAt: true,
        inventoryReservations: {
          select: {
            baseQuantity: true,
            status: true
          }
        }
      }
    })
  ]);
  const salesOrderReportLineCounts =
    salesOrderReportRows.length > 0
      ? await prisma.salesOrderLine.groupBy({
          by: ["salesOrderId"],
          where: {
            salesOrderId: {
              in: salesOrderReportRows.map((order) => order.id)
            }
          },
          _count: {
            _all: true
          },
          _sum: {
            quantity: true
          }
        })
      : [];
  const salesOrderReportLineCountByOrderId = new Map(
    salesOrderReportLineCounts.map((row) => [
      row.salesOrderId,
      {
        lineCount: row._count._all,
        itemCount: toQuantity(row._sum.quantity)
      }
    ] as const)
  );
  const tenderRowsByKey = new Map<string, OnlineStoreWorkspaceData["reports"]["tenderRows"][number]>();
  const productRowsByKey = new Map<string, OnlineStoreWorkspaceData["reports"]["productRows"][number]>();
  let returnAmount = 0;

  for (const payment of reportPayments) {
    const totalAmount = Number(payment.posTransaction.totalAmount);
    const signedAmount = signedPaymentAmount({
      transactionType: payment.posTransaction.transactionType,
      totalAmount,
      paymentAmount: Number(payment.amount)
    });
    const key = `${payment.method}:${payment.tenderMethodCodeSnapshot ?? payment.tenderMethodNameSnapshot ?? "unmapped"}`;
    const current = tenderRowsByKey.get(key) ?? {
      paymentMethod: payment.method,
      tenderMethodCode: payment.tenderMethodCodeSnapshot,
      tenderMethodName: payment.tenderMethodNameSnapshot,
      transactionCount: 0,
      netAmount: 0
    };

    current.transactionCount += 1;
    current.netAmount = toMoney(current.netAmount + signedAmount);
    tenderRowsByKey.set(key, current);
  }

  for (const transaction of transactions) {
    const totalAmount = Number(transaction.totalAmount);

    if (transaction.transactionType === PosTransactionType.RETURN) {
      returnAmount = toMoney(returnAmount + Math.abs(totalAmount));
    }

    for (const line of transaction.lines) {
      const variantSize = line.variantSizeSnapshot ?? null;
      const variantColor = line.variantColorSnapshot ?? null;
      const sellingUnitOfMeasure = line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA";
      const baseUnitOfMeasure = line.baseUnitOfMeasure ?? sellingUnitOfMeasure;
      const key = `${line.productCodeSnapshot}:${line.productNameSnapshot}:${variantSize ?? ""}:${variantColor ?? ""}:${sellingUnitOfMeasure}`;
      const current = productRowsByKey.get(key) ?? {
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variantSize,
        variantColor,
        sellingUnitOfMeasure,
        baseUnitOfMeasure,
        quantity: 0,
        baseQuantity: 0,
        grossAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        netAmount: 0
      };
      const direction = line.lineIntent === PosTransactionLineIntent.RETURN ? -1 : 1;

      current.quantity = toQuantity(current.quantity + Number(line.quantity) * direction);
      current.baseQuantity = toQuantity(
        current.baseQuantity + Number(line.baseQuantity ?? line.quantity) * direction
      );
      current.grossAmount = toMoney(current.grossAmount + Number(line.unitPrice) * Number(line.quantity) * direction);
      current.discountAmount = toMoney(current.discountAmount + Number(line.discountAmount) * direction);
      current.taxAmount = toMoney(current.taxAmount + Number(line.taxAmount) * direction);
      current.netAmount = toMoney(current.netAmount + Number(line.lineTotal) * direction);
      productRowsByKey.set(key, current);
    }
  }

  const inventoryRowsByKey = new Map<string, OnlineStoreWorkspaceData["reports"]["inventoryRows"][number]>();

  for (const entry of inventoryEntries) {
    const key = `${entry.product.code}:${entry.inventoryLocation.name}`;
    const current = inventoryRowsByKey.get(key) ?? {
      productCode: entry.product.code,
      productName: entry.product.name,
      locationName: entry.inventoryLocation.name,
      quantityOnHand: 0,
      stockValue: 0
    };

    current.quantityOnHand = toQuantity(current.quantityOnHand + Number(entry.quantity));
    current.stockValue = toMoney(current.quantityOnHand * Number(entry.product.baseUnitPrice));
    inventoryRowsByKey.set(key, current);
  }

  const inventoryRows = [...inventoryRowsByKey.values()]
    .filter((row) => row.quantityOnHand !== 0)
    .sort((left, right) => Math.abs(right.stockValue) - Math.abs(left.stockValue))
    .slice(0, criteria.limit);
  const netSalesAmount = toMoney(
    transactions.reduce(
      (sum, transaction) =>
        sum +
        signedTransactionAmount({
          transactionType: transaction.transactionType,
          amount: Number(transaction.totalAmount)
        }),
      0
    )
  );
  const discountAmount = toMoney(
    transactions.reduce(
      (sum, transaction) =>
        sum +
        signedTransactionAmount({
          transactionType: transaction.transactionType,
          amount: Number(transaction.discountAmount)
        }),
      0
    )
  );
  const taxAmount = toMoney(
    transactions.reduce(
      (sum, transaction) =>
        sum +
        signedTransactionAmount({
          transactionType: transaction.transactionType,
          amount: Number(transaction.taxAmount)
        }),
      0
    )
  );
  const filteredLayawayOrders = salesOrderReportRows.filter(
    (order) => order.orderType === "LAYAWAY"
  );
  const filteredLayawayBySourceTransactionId = new Map(
    filteredLayawayOrders.map((order) => [order.sourceTransactionId, order] as const)
  );
  const filteredLayawayAgeingNow = new Date();
  const layawayRows: OnlineStoreWorkspaceData["reports"]["layawayRows"] =
    filteredLayawayOrders.map((order) => {
      const ageingEnd =
        order.fulfilledAt ?? order.cancelledAt ?? order.expiredAt ?? filteredLayawayAgeingNow;
      const ageDays = Math.max(
        0,
        Math.floor((ageingEnd.getTime() - order.createdAt.getTime()) / 86_400_000)
      );

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        customerName: order.customerNameSnapshot ?? "Customer",
        totalAmount: Number(order.totalAmount),
        paidAmount: Number(order.paidAmount),
        balanceAmount: Number(order.balanceAmount),
        reservationStatus: order.reservationStatus,
        reservedBaseQuantity: toQuantity(
          order.inventoryReservations
            .filter((reservation) => reservation.status === "ACTIVE")
            .reduce((sum, reservation) => sum + Number(reservation.baseQuantity), 0)
        ),
        cancellationFeeAmount: Number(order.cancellationFeeAmount),
        refundedAmount: Number(order.refundedAmount),
        ageDays,
        ageingBucket:
          ageDays <= 30
            ? "0-30 days"
            : ageDays <= 60
              ? "31-60 days"
              : ageDays <= 90
                ? "61-90 days"
                : "91+ days",
        createdAt: order.createdAt.toISOString(),
        expiresAt: order.layawayExpiresAt?.toISOString() ?? null
      };
    });
  const layawayPaymentRows: OnlineStoreWorkspaceData["reports"]["layawayPaymentRows"] =
    reportPayments.flatMap((payment) => {
      const order = filteredLayawayBySourceTransactionId.get(payment.posTransactionId);

      if (
        !order ||
        !["LAYAWAY_DEPOSIT", "LAYAWAY_INSTALLMENT", "LAYAWAY_REFUND"].includes(
          payment.paymentPurpose
        )
      ) {
        return [];
      }

      return [
        {
          paymentId: payment.id,
          orderNo: order.orderNo,
          customerName: order.customerNameSnapshot ?? "Customer",
          paymentPurpose: payment.paymentPurpose,
          tenderName:
            payment.tenderMethodNameSnapshot ??
            payment.tenderMethodCodeSnapshot ??
            payment.method,
          amount: Number(payment.amount),
          reference: payment.reference,
          shiftNo: payment.receivedShiftNoSnapshot,
          terminalCode: payment.receivedTerminalCodeSnapshot,
          cashierCode: payment.receivedCashierCodeSnapshot,
          receivedAt: payment.receivedAt.toISOString()
        }
      ];
    });
  const reports: OnlineStoreWorkspaceData["reports"] = {
    summary: {
      salesCount: transactions.filter((transaction) => transaction.transactionType === PosTransactionType.SALE).length,
      returnCount: transactions.filter((transaction) => transaction.transactionType === PosTransactionType.RETURN).length,
      exchangeCount: transactions.filter((transaction) => transaction.transactionType === PosTransactionType.EXCHANGE).length,
      netSalesAmount,
      returnAmount,
      discountAmount,
      taxAmount,
      tenderedAmount: toMoney([...tenderRowsByKey.values()].reduce((sum, row) => sum + row.netAmount, 0)),
      inventoryStockValue: toMoney(inventoryRows.reduce((sum, row) => sum + row.stockValue, 0))
    },
    salesRows: transactions.map((transaction) => ({
      transactionNo: transaction.transactionNo,
      transactionType: transaction.transactionType,
      sourceTransactionNo: transaction.sourceTransactionNo,
      completedAt: transaction.completedAt?.toISOString() ?? null,
      cashierCode: transaction.cashierCodeSnapshot,
      customerName: transaction.customerNameSnapshot ?? "Walk-in",
      lineCount: transaction.lines.length,
      productPreview: transaction.lines.map((line) => line.productNameSnapshot).join(", "),
      totalAmount: Number(transaction.totalAmount),
      paidAmount: Number(transaction.paidAmount)
    })),
    tenderRows: [...tenderRowsByKey.values()].sort((left, right) => right.netAmount - left.netAmount),
    productRows: [...productRowsByKey.values()].sort((left, right) => Math.abs(right.netAmount) - Math.abs(left.netAmount)),
    serialBatchRows: transactions
      .flatMap((transaction) =>
        transaction.lines
          .filter(
            (line) =>
              line.lineIntent === PosTransactionLineIntent.SALE &&
              (!criteria.locationId || line.inventoryLocationId === criteria.locationId)
          )
          .flatMap((line) => {
            const common = {
              transactionNo: transaction.transactionNo,
              completedAt: transaction.completedAt?.toISOString() ?? null,
              cashierCode: transaction.cashierCodeSnapshot,
              productCode: line.productCodeSnapshot,
              productName: line.productNameSnapshot,
              locationId: line.inventoryLocationId,
              locationName: line.inventoryLocation?.name ?? null
            };
            const serialRows = (readStringArrayJson(line.serialNumbersSnapshot) ?? []).map(
              (serialNumber) => ({
                traceId: `${line.id}:SERIAL:${serialNumber}`,
                ...common,
                trackingType: "Serial" as const,
                serialNumber,
                batchNo: null,
                expiryDate: null,
                quantity: 1
              })
            );
            const batchRows = readInventoryBatchAllocations(line.batchAllocationsSnapshot).map(
              (batch) => ({
                traceId: `${line.id}:BATCH:${batch.batchNo}:${batch.expiryDate}`,
                ...common,
                trackingType: "Batch" as const,
                serialNumber: null,
                batchNo: batch.batchNo,
                expiryDate: batch.expiryDate,
                quantity: batch.quantity
              })
            );

            return [...serialRows, ...batchRows];
          })
      )
      .slice(0, criteria.limit),
    salesOrderRows: salesOrderReportRows.map((order) => {
      const lineCounts = salesOrderReportLineCountByOrderId.get(order.id);

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        customerNo: order.customerNoSnapshot,
        customerName: order.customerNameSnapshot ?? "Customer",
        totalAmount: Number(order.totalAmount),
        depositAmount: Number(order.depositAmount),
        balanceAmount: Number(order.balanceAmount),
        depositTenderMethodName: order.depositTenderMethodNameSnapshot,
        depositPaymentMethod: order.depositPaymentMethodSnapshot,
        depositReference: order.depositReference,
        itemCount: lineCounts?.itemCount ?? 0,
        lineCount: lineCounts?.lineCount ?? 0,
        operatorName: order.operatorName,
        fulfilledTransactionNo: order.fulfilledTransactionNo,
        createdAt: order.createdAt.toISOString(),
        fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
        cancelledAt: order.cancelledAt?.toISOString() ?? null
      };
    }),
    layawayRows,
    layawayPaymentRows,
    shiftRows: shifts.map((shift) => {
      const summary = summarizeOnlineShift(shift);

      return {
        shiftId: summary.shiftId,
        shiftNo: summary.shiftNo,
        status: summary.status,
        openedAt: summary.openedAt,
        closedAt: summary.closedAt,
        transactionCount: summary.transactionCount,
        netSalesAmount: summary.netSalesAmount,
        expectedCashAmount: summary.expectedCashAmount,
        declaredCashAmount: summary.declaredCashAmount,
        varianceAmount: summary.varianceAmount
      };
    }),
    inventoryRows,
    bankingRows: bankingDeposits.map((deposit) => ({
      depositNo: deposit.depositNo,
      reconciliationNo: deposit.reconciliationNo,
      shiftNo: deposit.shiftNo,
      depositedAt: deposit.depositedAt.toISOString(),
      bankName: deposit.bankNameSnapshot,
      accountNumber: deposit.bankAccountNumberSnapshot,
      amount: Number(deposit.amount),
      reference: deposit.reference
    }))
  };
  const reporting = await buildOnlineReportMetadata({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    currentCashierCode: user.loginId,
    supervisorScopeAllowed,
    lastCriteria: criteria
  });

  await prisma.securityLog.create({
    data: {
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "ONLINE_STORE",
      action: "REPORT_BROWSED",
      actorLabel: user.loginId,
      targetType: "Online POS report",
      targetRef: criteria.reportId,
      sourceNodeCode: "ONLINE_DIRECT",
      message: `${user.loginId} browsed ${criteria.reportId} report parameters for ${store.code}.`,
      detailsJson: serializeJsonField({
        storeCode: store.code,
        criteria,
        managerOverride:
          managerApproval === null
            ? null
            : {
                approvalType: managerApproval.approvalType,
                supervisorLoginId: managerApproval.supervisorLoginId,
                supervisorDisplayName: managerApproval.supervisorDisplayName,
                permissionCodes: managerApproval.permissionCodes,
                note: managerApproval.note
              }
      } satisfies Prisma.InputJsonValue)
    }
  });

  return {
    reports,
    reporting,
    generatedAt: new Date().toISOString()
  };
}

export type CreateOnlineStoreSaleRequest = {
  sourceTransactionId?: string | null;
  salesOrderId?: string | null;
  customerId?: string | null;
  lines: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number | null;
    overrideDiscountAmount?: number | null;
    overrideNote?: string | null;
    configuredDiscountRate?: number | null;
    productVariantCode?: string | null;
    variantSize?: string | null;
    variantColor?: string | null;
    lineNote?: string | null;
    preferredBatchId?: string | null;
    serialNumbers?: string[] | null;
    sellingUnitOfMeasure?: string | null;
  }>;
  payments?: OnlinePaymentRequest[] | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  loyaltyPointsRedeemed?: number | null;
  loyaltyRedemptionAmount?: number | null;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
  reference?: string | null;
  serviceType?: string | null;
  note?: string | null;
  details?: string | null;
};

export type CreateOnlineStoreSaleResponse = {
  transactionNo: string;
  totalAmount: number;
  customerAccount?: {
    customerId: string;
    receivableBalanceAmount: number;
    loyaltyPointsBalance: number;
  } | null;
  receipt: {
    retailOrgName: string;
    companyLogoUrl: string | null;
    storeCode: string;
    storeName: string;
    storePhone: string | null;
    storeLocation: string | null;
    storeAddress: string | null;
    storeAddressLine2: string | null;
    transactionNo: string;
    transactionType: string;
    completedAt: string;
    terminalCode: string;
    shiftNo: string | null;
    cashierCode: string;
    currencyCode: string;
    timezone: string;
    receiptHeader: string | null;
    receiptFooter: string | null;
    salesReceiptTemplateHtml: string | null;
    customerName: string;
    subtotalAmount: number;
    discountAmount: number;
    loyaltyRedemptionPoints: number;
    loyaltyRedemptionAmount: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    changeAmount: number;
    reference?: string | null;
    note: string | null;
    lines: Array<{
      productCode: string;
      productName: string;
      variantSize: string | null;
      variantColor: string | null;
      lineNote: string | null;
      quantity: number;
      sellingUnitOfMeasure: string;
      baseUnitOfMeasure: string;
      uomConversionFactor: number;
      baseQuantity: number;
      unitPrice: number;
      discountAmount: number;
      taxAmount: number;
      lineTotal: number;
      appliedPromotionName: string | null;
    }>;
    payments: Array<{
      method: string;
      tenderMethodCode: string | null;
      tenderMethodName: string | null;
      amount: number;
      reference: string | null;
    }>;
  };
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreCorrectionRequest = {
  sourceTransactionNo: string;
  correctionType: "RETURN" | "EXCHANGE";
  returnLines: Array<{
    sourceLineId: string;
    quantity: number;
  }>;
  saleLines?: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number | null;
    overrideDiscountAmount?: number | null;
    variantSize?: string | null;
    variantColor?: string | null;
    lineNote?: string | null;
    overrideNote?: string | null;
    sellingUnitOfMeasure?: string | null;
  }> | null;
  payments?: OnlinePaymentRequest[] | null;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
  note?: string | null;
};

export type CreateOnlineStoreCorrectionResponse = CreateOnlineStoreSaleResponse;

export type CreateOnlineStoreHeldSaleRequest = {
  customerId?: string | null;
  lines: CreateOnlineStoreSaleRequest["lines"];
  note?: string | null;
};

export type CreateOnlineStoreHeldSaleResponse = {
  heldSale: OnlineStoreWorkspaceData["heldSales"][number];
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreSalesOrderRequest = {
  customerId: string;
  lines: CreateOnlineStoreSaleRequest["lines"];
  orderType?: "SALES_ORDER" | "LAYAWAY" | null;
  payments?: OnlinePaymentRequest[] | null;
  depositAmount?: number | null;
  depositTenderMethodCode?: string | null;
  depositReference?: string | null;
  serviceType?: string | null;
  note?: string | null;
  layawayExpiresAt?: string | null;
  policyOverrideApproved?: boolean | null;
};

export type CreateOnlineStoreSalesOrderResponse = {
  salesOrder: OnlineStoreWorkspaceData["salesOrders"][number];
  receipt: CreateOnlineStoreSaleResponse["receipt"] | null;
  message: string;
  serverProcessedAt: string;
};

export type CancelOnlineStoreSalesOrderResponse = {
  orderId: string;
  orderNo: string;
  status: string;
  salesOrder: OnlineStoreWorkspaceData["salesOrders"][number];
  message: string;
  serverProcessedAt: string;
};

export type ReceiveOnlineStoreLayawayPaymentRequest = {
  payments: OnlinePaymentRequest[];
  note?: string | null;
};

export type OnlineStoreLayawayActionResponse = {
  salesOrder: OnlineStoreWorkspaceData["salesOrders"][number];
  message: string;
  serverProcessedAt: string;
};

export type CancelOnlineStoreSalesOrderRequest = {
  refundPayments?: OnlinePaymentRequest[] | null;
  note?: string | null;
  policyOverrideApproved?: boolean | null;
};

export type CreateOnlineStoreSalesOrderFulfilmentTransferRequest = {
  salesOrderIds?: string[] | null;
  note?: string | null;
};

export type CreateOnlineStoreSalesOrderFulfilmentTransferResponse = {
  createdBatches: Array<{
    transferBatchNo: string;
    destinationStoreId: string;
    destinationStoreCode: string;
    destinationStoreName: string;
    salesOrderNos: string[];
    lineCount: number;
    quantity: number;
  }>;
  createdTransfers: Array<{
    transferId: string;
    transferNo: string;
    transferBatchNo: string;
    salesOrderNo: string;
    destinationStoreCode: string;
    productCode: string;
    quantity: number;
  }>;
  message: string;
  serverProcessedAt: string;
};

export type RecordOnlineStoreAccountPaymentRequest = {
  customerId: string;
  tenderMethodCode: string;
  bankAccountId?: string | null;
  amount: number;
  reference?: string | null;
  note?: string | null;
};

export type RecordOnlineStoreAccountPaymentResponse = {
  accountPayment: OnlineStoreWorkspaceData["accountPayments"][number];
  receipt: {
    entryNo: string;
    retailOrgName: string;
    companyLogoUrl: string | null;
    storeCode: string;
    storeName: string;
    storePhone: string | null;
    storeLocation: string | null;
    storeAddress: string | null;
    storeAddressLine2: string | null;
    terminalCode: string;
    shiftNo: string | null;
    customerNo: string;
    customerName: string;
    cashierCode: string;
    paymentMethod: string;
    tenderMethodName: string | null;
    amount: number;
    remainingBalanceAmount: number | null;
    reference: string | null;
    note: string | null;
    occurredAt: string;
    currencyCode: string;
    timezone: string;
    receiptHeader: string | null;
    receiptFooter: string | null;
    accountPaymentReceiptTemplateHtml: string | null;
  };
  message: string;
  serverProcessedAt: string;
};

export type RecordOnlineStoreEodRequest = {
  shiftId?: string | null;
  declaredCashAmount: number;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
  note?: string | null;
};

export type OpenOnlineStoreShiftRequest = {
  openingFloatAmount?: number | null;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
};

export type OpenOnlineStoreShiftResponse = {
  shift: OnlineShiftSummary;
  message: string;
  serverProcessedAt: string;
};

export type RecordOnlineStoreEodResponse = {
  reconciliationNo: string;
  varianceAmount: number;
  message: string;
  serverProcessedAt: string;
};

export type RecordOnlineStoreBankingRequest = {
  reconciliationId: string;
  amount: number;
  bankAccountId?: string | null;
  bankName?: string | null;
  reference?: string | null;
  managerOverride?: OnlineStoreManagerOverrideRequest | null;
  note?: string | null;
};

export type RecordOnlineStoreBankingResponse = {
  depositNo: string;
  remainingCashAmount: number;
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreGoodsReceiptRequest = {
  inventoryLocationId?: string | null;
  purchaseOrderId?: string | null;
  note?: string | null;
  lines: Array<{
    productId: string;
    purchaseOrderLineId?: string | null;
    quantity: number;
    unitCost?: number | null;
    serialNumbers?: string[] | null;
    batchNo?: string | null;
    manufacturedAt?: string | null;
    expiryDate?: string | null;
  }>;
};

export type CreateOnlineStoreGoodsReceiptResponse = {
  receiptNo: string;
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreSupplierReturnRequest = {
  goodsReceiptId: string;
  goodsReceiptLineId: string;
  quantity: number;
  reason: SupplierReturnReason | string;
  externalReference?: string | null;
  note?: string | null;
  serialNumbers?: string[] | null;
};

export type CreateOnlineStoreSupplierReturnResponse = {
  supplierReturnNo: string;
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreTransferRequest = {
  transferBatchNo?: string | null;
  sourceStoreId: string;
  destinationInventoryLocationId?: string | null;
  productId?: string | null;
  quantity?: number | null;
  lines?: Array<{
    productId: string;
    quantity: number;
    unitOfMeasure?: string | null;
  }> | null;
  externalReference?: string | null;
  requiredAt?: string | null;
  transporterName?: string | null;
  vehicleRegistrationNo?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  deliveryNoteNo?: string | null;
  note?: string | null;
};

export type CreateOnlineStoreTransferResponse = {
  transferNo: string;
  transferBatchNo: string;
  createdTransfers: Array<{
    transferId: string;
    transferNo: string;
    productId: string;
    quantity: number;
  }>;
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreStockCountRequest = {
  sheetNo?: string | null;
  lineNo?: number | null;
  inventoryLocationId?: string | null;
  productId: string;
  countedQuantity: number;
  batchCounts?: Array<{
    batchId: string;
    countedQuantity: number;
  }> | null;
  commitNow?: boolean | null;
  note?: string | null;
};

export type OnlineStoreUnlockRequest = {
  loginId: string;
  password: string;
};

export type OnlineStoreUnlockResponse = {
  operator: {
    loginId: string;
    displayName: string;
  };
  message: string;
  serverProcessedAt: string;
};

export type OnlineStoreRemoteInventoryLookupRequest = {
  query?: string | null;
  productCode?: string | null;
  storeCode?: string | null;
  locationCode?: string | null;
  limit?: number | null;
};

export type OnlineStoreTransactionReferenceSearchRequest = {
  query?: string | null;
  limit?: number | string | null;
};

export type OnlineStoreTransactionReferenceSummary = {
  id: string;
  reference: string;
  details: string | null;
  customerName: string | null;
  sourceTransactionNo: string | null;
  source: string;
  lastCapturedAt: string;
};

export type OnlineStoreRemoteInventoryLookupResponse = {
  rows: Array<{
    storeCode: string;
    storeName: string;
    locationCode: string;
    locationName: string;
    productCode: string;
    productName: string;
    departmentCode: string | null;
    categoryCode: string | null;
    subcategory: string | null;
    quantityOnHand: number;
    activeReservedQuantity: number;
    safetyStockQuantity: number;
    ecommerceSellableQuantity: number;
    ecommercePickupEligible: boolean;
    ecommerceDeliveryEligible: boolean;
    locationBreakdown: Array<{
      locationCode: string;
      locationName: string;
      quantityOnHand: number;
      activeReservedQuantity: number;
      safetyStockLevel: number;
      ecommerceSellableQuantity: number;
      ecommercePickupEligible: boolean;
      ecommerceDeliveryEligible: boolean;
      ecommerceEligibilityLabel: string;
    }>;
    unitPrice: number;
    updatedAt: string;
  }>;
  serverProcessedAt: string;
};

export type UpsertOnlineStoreExpenseRequest = {
  expenseId?: string | null;
  expenseDate?: string | null;
  category?: string | null;
  description?: string | null;
  supplierName?: string | null;
  paymentMethod?: string | null;
  externalReference?: string | null;
  attachmentFileName?: string | null;
  attachmentUrl?: string | null;
  amount?: number | string | null;
  taxAmount?: number | string | null;
  note?: string | null;
};

export type OnlineStoreExpenseMutationResponse = {
  expenseId: string;
  expenseNo: string;
  status: string;
  message: string;
  serverProcessedAt: string;
};

export type CreateOnlineStoreStockCountResponse = {
  sessionId: string;
  sessionNo: string;
  status: string;
  previousQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  message: string;
  serverProcessedAt: string;
};

export type CommitOnlineStoreStockCountResponse = {
  sessionNo: string;
  previousQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  message: string;
  serverProcessedAt: string;
};

export type ProcessOnlineStoreTransferResponse = {
  transferNo: string;
  status: string;
  issuedQuantity: number;
  receivedQuantity: number;
  outstandingIssueQuantity: number;
  outstandingReceiptQuantity: number;
  message: string;
  serverProcessedAt: string;
};

async function findOnlineStoreCustomer(
  tx: OnlineStoreTx,
  retailOrgId: string,
  customerId: string | null
) {
  if (!customerId) {
    return null;
  }

  const customer = await tx.customer.findFirst({
    where: {
      id: customerId,
      retailOrgId,
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      id: true,
      customerNo: true,
      fullName: true,
      customerType: true,
      status: true,
      loyaltyEnrolled: true,
      loyaltyTier: true,
      receivableBalanceAmount: true,
      loyaltyPointsBalance: true,
      allowCreditSales: true,
      creditLimitAmount: true
    }
  });

  if (!customer) {
    throw new Error("Choose an active customer before continuing this Online POS action.");
  }

  return customer;
}

async function getOnlineLoyaltyPolicy(
  tx: OnlineStoreTx,
  retailOrgId: string
): Promise<LoyaltyPolicy> {
  const retailOrg = await tx.retailOrg.findUnique({
    where: {
      id: retailOrgId
    },
    select: {
      loyaltyProgramEnabled: true,
      loyaltyPointsPerCurrencyUnit: true,
      loyaltyRedemptionEnabled: true,
      loyaltyRedemptionPointsStep: true,
      loyaltyRedemptionValueAmount: true,
      loyaltyMinimumRedeemPoints: true,
      loyaltyMaximumRedeemPercentOfSale: true
    }
  });

  return {
    loyaltyProgramEnabled: retailOrg?.loyaltyProgramEnabled ?? true,
    loyaltyPointsPerCurrencyUnit: Number(retailOrg?.loyaltyPointsPerCurrencyUnit ?? 1),
    loyaltyRedemptionEnabled: retailOrg?.loyaltyRedemptionEnabled ?? false,
    loyaltyRedemptionPointsStep: retailOrg?.loyaltyRedemptionPointsStep ?? 100,
    loyaltyRedemptionValueAmount: Number(retailOrg?.loyaltyRedemptionValueAmount ?? 1),
    loyaltyMinimumRedeemPoints: retailOrg?.loyaltyMinimumRedeemPoints ?? 100,
    loyaltyMaximumRedeemPercentOfSale: Number(retailOrg?.loyaltyMaximumRedeemPercentOfSale ?? 100)
  };
}

async function getOnlinePromotionPolicies(
  tx: OnlineStoreTx,
  retailOrgId: string
): Promise<AutomaticPromotionPolicy[]> {
  const promotions = await tx.promotionCampaign.findMany({
    where: {
      retailOrgId,
      deletedAt: null
    },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    select: {
      code: true,
      name: true,
      discountType: true,
      targetScope: true,
      discountValue: true,
      minimumBasketAmount: true,
      minimumLineQuantity: true,
      buyQuantity: true,
      rewardQuantity: true,
      targetDepartmentCode: true,
      targetCategoryCode: true,
      targetProductCode: true,
      eligibleStoreCodes: true,
      eligibleCustomerTypes: true,
      eligibleLoyaltyTiers: true,
      activeDaysOfWeek: true,
      activeFromMinutes: true,
      activeToMinutes: true,
      couponRequired: true,
      couponCode: true,
      allowWithLoyalty: true,
      applyOncePerBasket: true,
      priority: true,
      startAt: true,
      endAt: true,
      status: true
    }
  });

  return promotions.map((promotion) => ({
    promotionCode: promotion.code,
    promotionName: promotion.name,
    discountType: promotion.discountType as SyncPromotionDiscountType,
    targetScope: promotion.targetScope as SyncPromotionTargetScope,
    discountValue: Number(promotion.discountValue),
    minimumBasketAmount:
      promotion.minimumBasketAmount === null ? null : Number(promotion.minimumBasketAmount),
    minimumLineQuantity:
      promotion.minimumLineQuantity === null ? null : Number(promotion.minimumLineQuantity),
    buyQuantity: promotion.buyQuantity === null ? null : Number(promotion.buyQuantity),
    rewardQuantity: promotion.rewardQuantity === null ? null : Number(promotion.rewardQuantity),
    targetDepartmentCode: promotion.targetDepartmentCode,
    targetCategoryCode: promotion.targetCategoryCode,
    targetProductCode: promotion.targetProductCode,
    eligibleStoreCodes: readStringArrayJson(promotion.eligibleStoreCodes),
    eligibleCustomerTypes: readStringArrayJson(promotion.eligibleCustomerTypes),
    eligibleLoyaltyTiers: readStringArrayJson(promotion.eligibleLoyaltyTiers),
    activeDaysOfWeek: readStringArrayJson(promotion.activeDaysOfWeek),
    activeFromMinutes: promotion.activeFromMinutes,
    activeToMinutes: promotion.activeToMinutes,
    couponRequired: promotion.couponRequired,
    couponCode: promotion.couponCode,
    allowWithLoyalty: promotion.allowWithLoyalty,
    applyOncePerBasket: promotion.applyOncePerBasket,
    priority: promotion.priority,
    startAt: promotion.startAt?.toISOString() ?? null,
    endAt: promotion.endAt?.toISOString() ?? null,
    status: promotion.status
  }));
}

function toCustomerAccountPostingCustomer(
  customer: Awaited<ReturnType<typeof findOnlineStoreCustomer>>
): CustomerAccountPostingCustomer | null {
  if (!customer) {
    return null;
  }

  return {
    customerId: customer.id,
    customerNo: customer.customerNo,
    fullName: customer.fullName,
    status: customer.status,
    loyaltyEnrolled: customer.loyaltyEnrolled,
    loyaltyPointsBalance: customer.loyaltyPointsBalance,
    allowCreditSales: customer.allowCreditSales,
    creditLimitAmount: customer.creditLimitAmount === null ? null : Number(customer.creditLimitAmount),
    receivableBalanceAmount: Number(customer.receivableBalanceAmount)
  };
}

function resolveOnlineLoyaltyRedemption(input: {
  customer: Awaited<ReturnType<typeof findOnlineStoreCustomer>>;
  totalAmount: number;
  loyaltyPolicy: LoyaltyPolicy;
  requestedPoints?: number | null;
  requestedAmount?: number | null;
}) {
  const requestedPoints = Math.max(0, Math.trunc(Number(input.requestedPoints ?? 0)));
  const requestedAmountInput = Number(input.requestedAmount ?? 0);

  if (!Number.isFinite(requestedAmountInput) || requestedAmountInput < 0) {
    throw new Error("Enter a valid loyalty redemption amount.");
  }

  const requestedAmount = toMoney(requestedAmountInput);

  if (requestedPoints <= 0 && requestedAmount <= 0) {
    return {
      points: 0,
      amount: 0
    };
  }

  const calculation = calculateLoyaltyRedemption({
    customer: toCustomerAccountPostingCustomer(input.customer),
    totalAmount: input.totalAmount,
    requestedPoints,
    policy: input.loyaltyPolicy
  });

  if (!calculation.canRedeem || calculation.appliedPoints <= 0) {
    throw new Error(calculation.message ?? "Flash ERP cannot apply loyalty redemption to this basket right now.");
  }

  if (requestedPoints !== calculation.appliedPoints) {
    throw new Error(`Flash ERP can only redeem ${calculation.appliedPoints} loyalty point(s) on this basket right now.`);
  }

  if (requestedAmount > 0 && requestedAmount !== calculation.appliedAmount) {
    throw new Error("Flash ERP rejected the loyalty redemption because the amount did not match enterprise policy.");
  }

  return {
    points: calculation.appliedPoints,
    amount: calculation.appliedAmount
  };
}

async function applyOnlineCustomerAccountPostingForSale(
  tx: OnlineStoreTx,
  context: OnlineStoreContext,
  input: {
    transactionId: string;
    transactionNo: string;
    sourceTransactionNo: string | null;
    terminalId: string;
    completedAt: Date;
    customer: Awaited<ReturnType<typeof findOnlineStoreCustomer>>;
    totalAmount: number;
    payments: Array<{
      method: PaymentMethod | string;
      amount: unknown;
    }>;
    loyaltyPointsRedeemed?: number | null;
    loyaltyRedemptionAmount?: number | null;
  }
) {
  const postingCustomer = toCustomerAccountPostingCustomer(input.customer);
  const loyaltyPolicy = await getOnlineLoyaltyPolicy(tx, context.session.retailOrgId);
  const postingEffect = deriveCustomerAccountPostingEffect({
    customer: postingCustomer,
    transactionType: PosTransactionType.SALE as SyncPosTransactionType,
    totalAmount: input.totalAmount,
    loyaltyPolicy,
    loyaltyPointsRedeemed: input.loyaltyPointsRedeemed ?? 0,
    loyaltyRedemptionAmount: input.loyaltyRedemptionAmount ?? 0,
    payments: input.payments.map((payment) => ({
      method: String(payment.method) as SyncPaymentMethod,
      amount: Number(payment.amount)
    }))
  });

  if (
    !postingCustomer ||
    (postingEffect.receivableDeltaAmount === 0 && postingEffect.loyaltyPointsDelta === 0)
  ) {
    return postingCustomer
      ? {
          customerId: postingCustomer.customerId,
          receivableBalanceAmount: postingCustomer.receivableBalanceAmount,
          loyaltyPointsBalance: postingCustomer.loyaltyPointsBalance
        }
      : null;
  }

  const resultingReceivableBalance =
    postingEffect.nextReceivableBalanceAmount ?? postingCustomer.receivableBalanceAmount;
  const resultingLoyaltyPointsBalance =
    postingEffect.nextLoyaltyPointsBalance ?? postingCustomer.loyaltyPointsBalance;
  const entries: Prisma.CustomerAccountEntryCreateManyInput[] = [];

  await tx.customer.update({
    where: {
      id: postingCustomer.customerId
    },
    data: {
      receivableBalanceAmount: resultingReceivableBalance,
      loyaltyPointsBalance: resultingLoyaltyPointsBalance,
      lastModifiedByNodeCode: "ONLINE_DIRECT",
      recordVersion: {
        increment: 1
      }
    }
  });

  if (postingEffect.receivableDeltaAmount !== 0) {
    entries.push({
      retailOrgId: context.session.retailOrgId,
      customerId: postingCustomer.customerId,
      storeId: context.store.id,
      terminalId: input.terminalId,
      posTransactionId: input.transactionId,
      entryType:
        postingEffect.receivableDeltaAmount > 0
          ? CustomerAccountEntryType.POS_RECEIVABLE_CHARGE
          : CustomerAccountEntryType.POS_RECEIVABLE_SETTLEMENT,
      transactionNoSnapshot: input.transactionNo,
      sourceTransactionNoSnapshot: input.sourceTransactionNo,
      receivableDeltaAmount: postingEffect.receivableDeltaAmount,
      loyaltyPointsDelta: 0,
      resultingReceivableBalance,
      resultingLoyaltyPointsBalance,
      note:
        postingEffect.receivableDeltaAmount > 0
          ? `POS transaction ${input.transactionNo} increased customer receivables through Store Credit tender.`
          : `POS transaction ${input.transactionNo} reduced customer receivables through Store Credit tender.`,
      originNodeCode: "ONLINE_DIRECT",
      occurredAt: input.completedAt
    });
  }

  if (postingEffect.loyaltyPointsDelta !== 0) {
    entries.push({
      retailOrgId: context.session.retailOrgId,
      customerId: postingCustomer.customerId,
      storeId: context.store.id,
      terminalId: input.terminalId,
      posTransactionId: input.transactionId,
      entryType:
        postingEffect.loyaltyPointsDelta > 0
          ? CustomerAccountEntryType.POS_LOYALTY_ACCRUAL
          : CustomerAccountEntryType.POS_LOYALTY_REVERSAL,
      transactionNoSnapshot: input.transactionNo,
      sourceTransactionNoSnapshot: input.sourceTransactionNo,
      receivableDeltaAmount: 0,
      loyaltyPointsDelta: postingEffect.loyaltyPointsDelta,
      resultingReceivableBalance,
      resultingLoyaltyPointsBalance,
      note:
        postingEffect.loyaltyPointsDelta > 0
          ? postingEffect.loyaltyPointsRedeemed > 0
            ? `POS transaction ${input.transactionNo} redeemed ${postingEffect.loyaltyPointsRedeemed} point(s) and then accrued loyalty points on the net sale.`
            : `POS transaction ${input.transactionNo} accrued loyalty points.`
          : postingEffect.loyaltyPointsRedeemed > 0
            ? `POS transaction ${input.transactionNo} redeemed ${postingEffect.loyaltyPointsRedeemed} point(s) and finished with a net loyalty reduction.`
            : `POS transaction ${input.transactionNo} reversed loyalty points.`,
      originNodeCode: "ONLINE_DIRECT",
      occurredAt: input.completedAt
    });
  }

  if (entries.length > 0) {
    await tx.customerAccountEntry.createMany({
      data: entries
    });
  }

  return {
    customerId: postingCustomer.customerId,
    receivableBalanceAmount: resultingReceivableBalance,
    loyaltyPointsBalance: resultingLoyaltyPointsBalance
  };
}

async function prepareOnlineStoreBasketLines(
  tx: OnlineStoreTx,
  retailOrgId: string,
  storeId: string,
  lineInputs: CreateOnlineStoreSaleRequest["lines"],
  emptyMessage: string
) {
  if (lineInputs.length === 0) {
    throw new Error(emptyMessage);
  }

  const productIds = [...new Set(lineInputs.map((line) => line.productId).filter(Boolean))];
  const products = await tx.product.findMany({
    where: {
      retailOrgId,
      // Mobile clients that cached products with an early build may have queued
      // offline sales keyed by product CODE instead of the HQ product id.
      // Resolve by either identifier so those outbox mutations can drain.
      OR: [{ id: { in: productIds } }, { code: { in: productIds } }],
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      productType: true,
      department: true,
      category: true,
      subcategory: true,
      unitOfMeasure: true,
      baseUnitOfMeasure: {
        select: {
          code: true
        }
      },
      baseUnitPrice: true,
      storeProductSellingUnits: {
        where: {
          storeId,
          status: RecordStatus.ACTIVE
        },
        orderBy: [{ isDefault: "desc" }, { unitOfMeasureCodeSnapshot: "asc" }],
        select: {
          productVariantId: true,
          unitOfMeasureCodeSnapshot: true,
          unitOfMeasureNameSnapshot: true,
          conversionFactor: true,
          unitPrice: true,
          barcode: true,
          isDefault: true,
          unitOfMeasure: {
            select: {
              allowFractionalSale: true,
              decimalPrecision: true
            }
          }
        }
      },
      storeProductPrices: {
        where: {
          storeId,
          status: RecordStatus.ACTIVE,
          productVariantId: null
        },
        take: 1,
        select: {
          unitPrice: true
        }
      },
      baseCostPrice: true,
      mustEnterPriceAtPos: true,
      trackSize: true,
      trackColor: true,
      isSerialized: true,
      matrixVariants: {
        where: {
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true,
          code: true,
          displayName: true,
          unitPrice: true,
          storeProductPrices: {
            where: {
              storeId,
              status: RecordStatus.ACTIVE
            },
            take: 1,
            select: {
              unitPrice: true
            }
          },
          quantityOnHand: true,
          values: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              valueLabelSnapshot: true,
              attribute: {
                select: {
                  name: true
                }
              },
              attributeValue: {
                select: {
                  label: true
                }
              }
            }
          }
        }
      },
      taxProfile: {
        select: {
          ratePercent: true,
          isTaxInclusive: true
        }
      },
      trackInventory: true,
      trackExpiry: true
    }
  });
  const productById = new Map<string, (typeof products)[number]>(products.map((product) => [product.id, product] as const));
  for (const product of products) {
    if (!productById.has(product.code)) productById.set(product.code, product);
  }

  return lineInputs.map((line) => {
    const product = productById.get(line.productId);

    if (!product) {
      throw new Error("One of the selected products is no longer available.");
    }

    const quantity = normalizeQuantity(line.quantity);
    const productVariantCode = optionalText(line.productVariantCode)?.toUpperCase() ?? null;
    const productVariant =
      product.productType === "MATRIX"
        ? product.matrixVariants.find((variant) => variant.code.toUpperCase() === productVariantCode) ?? null
        : null;

    if (product.productType === "MATRIX" && !productVariant) {
      throw new Error(`Choose a matrix option for ${product.name}.`);
    }

    const variantAttributesSnapshot =
      productVariant?.values
        .map((value) => `${value.attribute.name}: ${value.valueLabelSnapshot || value.attributeValue.label}`)
        .join(" / ") ?? null;
    const baseUnitPrice = Number(
      productVariant?.storeProductPrices[0]?.unitPrice ??
        productVariant?.unitPrice ??
        product.storeProductPrices[0]?.unitPrice ??
        product.baseUnitPrice
    );
    const sellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
      baseUnitPrice,
      quantity,
      selectedUnitOfMeasure: line.sellingUnitOfMeasure,
      sellingUnits: product.storeProductSellingUnits
        .filter(
          (sellingUnit) =>
            sellingUnit.productVariantId === null ||
            sellingUnit.productVariantId === productVariant?.id
        )
        .map((sellingUnit) => ({
          unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
          unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
          conversionFactor: Number(sellingUnit.conversionFactor),
          unitPrice: Number(sellingUnit.unitPrice),
          barcode: sellingUnit.barcode,
          isDefault: sellingUnit.isDefault,
          allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
          decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
        })),
      serialized: product.isSerialized
    });
    const requestedPrice = Number(line.unitPrice ?? sellingUom.unitPrice);
    const unitPrice =
      product.mustEnterPriceAtPos && Number.isFinite(requestedPrice) && requestedPrice > 0
        ? toMoney(requestedPrice)
        : toMoney(sellingUom.unitPrice);
    const amounts = calculateOnlineSaleLineAmounts({
      quantity,
      unitPrice,
      taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
      taxInclusive: product.taxProfile?.isTaxInclusive ?? false
    });

    return {
      product,
      productVariant,
      variantAttributesSnapshot,
      quantity,
      sellingUnitOfMeasure: sellingUom.sellingUnitOfMeasure,
      baseUnitOfMeasure: sellingUom.baseUnitOfMeasure,
      uomConversionFactor: sellingUom.uomConversionFactor,
      baseQuantity: sellingUom.baseQuantity,
      variantSize: product.trackSize ? optionalText(line.variantSize) : null,
      variantColor: product.trackColor ? optionalText(line.variantColor) : null,
      lineNote: optionalText(line.lineNote),
      serialNumbers: validateOnlineSerializedSaleLine({
        isSerialized: product.isSerialized && tracksInventoryForSale(product),
        productName: product.name,
        baseQuantity: sellingUom.baseQuantity,
        serialNumbers: line.serialNumbers
      }),
      unitPrice,
      appliedPromotionCode: null as string | null,
      appliedPromotionName: null as string | null,
      ...amounts
    };
  });
}

function summarizeOnlineStoreSaleLines(
  preparedLines: Array<{
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>
) {
  return {
    subtotalAmount: toMoney(preparedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
    discountAmount: toMoney(preparedLines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxAmount: toMoney(preparedLines.reduce((sum, line) => sum + line.taxAmount, 0)),
    totalAmount: toMoney(preparedLines.reduce((sum, line) => sum + line.lineTotal, 0))
  };
}

function applyOnlineAutomaticPromotions<
  TLine extends {
    product: {
      code: string;
      department: string | null;
      category: string | null;
      taxProfile?: {
        ratePercent: Prisma.Decimal | number | string;
        isTaxInclusive: boolean;
      } | null;
    };
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
    appliedPromotionCode?: string | null;
    appliedPromotionName?: string | null;
    appliedPromotionAllowWithLoyalty?: boolean | null;
    skipAutomaticPromotion?: boolean | null;
  }
>(input: {
  lines: TLine[];
  promotions: AutomaticPromotionPolicy[];
  storeCode: string;
  customer: Awaited<ReturnType<typeof findOnlineStoreCustomer>>;
}) {
  const pricing = applyAutomaticPromotions({
    promotions: input.promotions,
    storeCode: input.storeCode,
    customerType: input.customer?.customerType ?? null,
    loyaltyTier: input.customer?.loyaltyTier ?? null,
    lines: input.lines.map((line, index) => ({
      lineId: String(index),
      lineIntent: "SALE",
      sourceLineId: null,
      productCode: line.product.code,
      departmentCode: line.product.department,
      categoryCode: line.product.category,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxable: Number(line.product.taxProfile?.ratePercent ?? 0) > 0,
      taxRatePercent: Number(line.product.taxProfile?.ratePercent ?? 0),
      taxInclusive: line.product.taxProfile?.isTaxInclusive ?? false
    }))
  });
  const linePricingById = new Map(pricing.lineResults.map((line) => [line.lineId, line] as const));

  return input.lines.map((line, index) => {
    if (line.skipAutomaticPromotion) {
      return line;
    }

    const linePricing = linePricingById.get(String(index));

    if (!linePricing) {
      return line;
    }

    return {
      ...line,
      discountAmount: linePricing.discountAmount,
      taxAmount: linePricing.taxAmount,
      lineTotal: linePricing.lineTotal,
      appliedPromotionCode: linePricing.appliedPromotionCode,
      appliedPromotionName: linePricing.appliedPromotionName,
      appliedPromotionAllowWithLoyalty: linePricing.allowWithLoyalty
    };
  });
}

type OnlineConfigurableDiscountLine = {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  appliedPromotionCode?: string | null;
  appliedPromotionName?: string | null;
  appliedPromotionAllowWithLoyalty?: boolean | null;
  skipAutomaticPromotion?: boolean | null;
  product: {
    taxProfile?: {
      ratePercent: Prisma.Decimal | number | string;
      isTaxInclusive: boolean;
    } | null;
  };
};

function applyOnlineConfiguredPosDiscount<TLine extends OnlineConfigurableDiscountLine>(
  line: TLine,
  discountRate: number
) {
  const label = `POS discount ${formatOnlineDiscountRate(discountRate)}%`;
  const extendedAmount = toMoney(line.quantity * line.unitPrice);
  const discountAmount = toMoney(extendedAmount * (discountRate / 100));
  const amounts = calculateOnlineSaleLineAmounts({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount,
    taxRatePercent: Number(line.product.taxProfile?.ratePercent ?? 0),
    taxInclusive: line.product.taxProfile?.isTaxInclusive ?? false
  });

  return {
    ...line,
    discountAmount: amounts.discountAmount,
    taxAmount: amounts.taxAmount,
    lineTotal: amounts.lineTotal,
    appliedPromotionCode: null,
    appliedPromotionName: label,
    appliedPromotionAllowWithLoyalty: true,
    skipAutomaticPromotion: true
  };
}

function applyOnlineConfiguredPosDiscounts<TLine extends OnlineConfigurableDiscountLine>(
  lines: TLine[],
  lineInputs: CreateOnlineStoreSaleRequest["lines"],
  companySettingsJson: Prisma.JsonValue | null | undefined
) {
  return lines.map((line, index) => {
    const configuredRate = resolveOnlineConfiguredDiscountRate(
      lineInputs[index]?.configuredDiscountRate,
      companySettingsJson
    );

    return configuredRate === null
      ? line
      : applyOnlineConfiguredPosDiscount(line, configuredRate);
  });
}

function assertOnlinePromotionsAllowLoyalty(input: {
  requestedPoints?: unknown;
  requestedAmount?: unknown;
  promotionLines: Array<{
    appliedPromotionCode?: string | null;
    appliedPromotionName?: string | null;
    appliedPromotionAllowWithLoyalty?: boolean | null;
  }>;
}) {
  const requestedPoints = Math.max(0, Math.trunc(Number(input.requestedPoints ?? 0)));
  const requestedAmount = Number(input.requestedAmount ?? 0);
  const loyaltyRequested =
    requestedPoints > 0 || (Number.isFinite(requestedAmount) && requestedAmount > 0);

  if (!loyaltyRequested) {
    return;
  }

  const blockingPromotionNames = [
    ...new Set(
      input.promotionLines
        .filter((line) => line.appliedPromotionCode && line.appliedPromotionAllowWithLoyalty === false)
        .map((line) => line.appliedPromotionName ?? line.appliedPromotionCode ?? "active promotion")
    )
  ];

  if (blockingPromotionNames.length > 0) {
    throw new Error(
      `Flash ERP cannot combine loyalty redemption with ${blockingPromotionNames.slice(0, 2).join(", ")}.`
    );
  }
}

async function assertOnlineStoreSaleStockAvailable(
  tx: OnlineStoreTx,
  context: OnlineStoreContext,
  salesLocation: Awaited<ReturnType<typeof resolveOnlineStoreLocation>>,
  preparedLines: Array<{
    product: {
      id: string;
      name: string;
      productType?: string | null;
      trackInventory: boolean;
    };
    productVariant?: {
      id: string;
      code: string;
      displayName?: string | null;
    } | null;
    quantity: number;
    baseQuantity: number;
  }>,
  actionLabel: string
) {
  const trackedProductIds = [
    ...new Set(
      preparedLines
        .filter((line) => isOnlineStoreStockManagedProduct(line.product))
        .map((line) => line.product.id)
    )
  ];
  const positionKey = (productId: string, productVariantId?: string | null) =>
    `${productId}:${productVariantId ?? ""}`;
  const requestedQuantityByPosition = new Map<string, number>();

  for (const line of preparedLines) {
    if (!isOnlineStoreStockManagedProduct(line.product)) {
      continue;
    }

    const key = positionKey(line.product.id, line.productVariant?.id);
    requestedQuantityByPosition.set(
      key,
      toQuantity((requestedQuantityByPosition.get(key) ?? 0) + line.baseQuantity)
    );
  }

  const stockPositions =
    trackedProductIds.length > 0
      ? await tx.inventoryLedgerEntry.groupBy({
          by: ["productId", "productVariantId"],
          where: {
            retailOrgId: context.session.retailOrgId,
            storeId: context.store.id,
            inventoryLocationId: salesLocation.id,
            productId: {
              in: trackedProductIds
            }
          },
          _sum: {
            quantity: true
          }
        })
      : [];
  const availableQuantityByPosition = new Map(
    stockPositions.map(
      (position) => [
        positionKey(position.productId, position.productVariantId),
        toQuantity(position._sum.quantity)
      ] as const
    )
  );
  const insufficientLine = preparedLines.find((line) => {
    if (!isOnlineStoreStockManagedProduct(line.product)) {
      return false;
    }

    const key = positionKey(line.product.id, line.productVariant?.id);
    const requestedQuantity = requestedQuantityByPosition.get(key) ?? line.baseQuantity;
    const availableQuantity = availableQuantityByPosition.get(key) ?? 0;
    return availableQuantity < requestedQuantity;
  });

  if (!insufficientLine) {
    return;
  }

  const key = positionKey(insufficientLine.product.id, insufficientLine.productVariant?.id);
  const requestedQuantity = requestedQuantityByPosition.get(key) ?? insufficientLine.baseQuantity;
  const availableQuantity = availableQuantityByPosition.get(key) ?? 0;
  const itemLabel = insufficientLine.productVariant
    ? `${insufficientLine.product.name} (${insufficientLine.productVariant.displayName ?? insufficientLine.productVariant.code})`
    : insufficientLine.product.name;

  throw new Error(
    `Only ${formatNumberForMessage(availableQuantity)} ${itemLabel} is available in ${salesLocation.code}. Receive or transfer stock into the Online POS sales location before ${actionLabel} ${formatNumberForMessage(requestedQuantity)}.`
  );
}

async function completeOnlineStoreParkedTransaction(
  tx: OnlineStoreTx,
  context: OnlineStoreContext,
  input: {
    sourceTransactionId?: string | null;
    salesOrderId?: string | null;
    payments?: OnlinePaymentRequest[] | null;
    loyaltyPointsRedeemed?: number | null;
    loyaltyRedemptionAmount?: number | null;
    note?: string | null;
    reference?: string | null;
    details?: string | null;
  }
): Promise<CreateOnlineStoreSaleResponse> {
  const { session, user, store } = context;
  const requestedSalesOrderId = optionalText(input.salesOrderId);
  const requestedSourceTransactionId = optionalText(input.sourceTransactionId);
  const openSalesOrder = requestedSalesOrderId
    ? await tx.salesOrder.findFirst({
        where: {
          id: requestedSalesOrderId,
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          status: SalesOrderStatus.OPEN
        },
        select: {
          id: true,
          orderNo: true,
          sourceTransactionId: true,
          sourceTransactionNo: true,
          orderType: true,
          depositAmount: true,
          paidAmount: true,
          balanceAmount: true,
          layawayPolicySnapshotJson: true,
          reservationStatus: true,
        }
      })
    : requestedSourceTransactionId
      ? await tx.salesOrder.findFirst({
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            sourceTransactionId: requestedSourceTransactionId,
            status: SalesOrderStatus.OPEN
          },
          select: {
            id: true,
            orderNo: true,
            sourceTransactionId: true,
            sourceTransactionNo: true,
            orderType: true,
            depositAmount: true,
            paidAmount: true,
            balanceAmount: true,
            layawayPolicySnapshotJson: true,
            reservationStatus: true,
          }
        })
      : null;

  if (openSalesOrder?.orderType === "LAYAWAY") {
    if (!sessionHasAllPermissions(session, ["pos.layaway.fulfil"])) {
      throw new Error("Your role is not allowed to fulfil layaways.");
    }
    assertLayawayFulfilmentEligible({
      balanceAmount: Number(openSalesOrder.balanceAmount),
      policySnapshot: readJsonObject(openSalesOrder.layawayPolicySnapshotJson),
    });
  }
  const sourceTransactionId = openSalesOrder?.sourceTransactionId ?? requestedSourceTransactionId;

  if (!sourceTransactionId) {
    throw new Error("Choose a held sale or open sales order before checkout.");
  }

  const sourceTransaction = await tx.posTransaction.findFirst({
    where: {
      id: sourceTransactionId,
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      status: PosTransactionStatus.PARKED,
      transactionType: PosTransactionType.SALE as SyncPosTransactionType,
      deletedAt: null
    },
    select: {
      id: true,
      transactionNo: true,
      customerId: true,
      customerNameSnapshot: true,
      notes: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      payments: {
        orderBy: {
          receivedAt: "asc"
        },
        select: {
          id: true,
          method: true,
          tenderMethodCodeSnapshot: true,
          tenderMethodNameSnapshot: true,
          amount: true,
          reference: true
        }
      },
      lines: {
        orderBy: {
          createdAt: "asc"
        },
        select: {
          id: true,
          productId: true,
          productVariantId: true,
          productCodeSnapshot: true,
          productNameSnapshot: true,
          variantSizeSnapshot: true,
          variantColorSnapshot: true,
          variantAttributesSnapshot: true,
          quantity: true,
          sellingUnitOfMeasure: true,
          baseUnitOfMeasure: true,
          uomConversionFactor: true,
          baseQuantity: true,
          unitPrice: true,
          discountAmount: true,
          appliedPromotionCodeSnapshot: true,
          appliedPromotionNameSnapshot: true,
          taxAmount: true,
          lineTotal: true,
          lineNote: true,
          serialNumbersSnapshot: true,
          productVariant: {
            select: {
              id: true,
              code: true,
              displayName: true
            }
          },
          product: {
            select: {
              id: true,
              code: true,
              sku: true,
              name: true,
              shortName: true,
              productType: true,
              department: true,
              category: true,
              subcategory: true,
              unitOfMeasure: true,
              baseCostPrice: true,
              trackInventory: true,
              trackExpiry: true,
              isSerialized: true,
              taxProfile: {
                select: {
                  ratePercent: true,
                  isTaxInclusive: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!sourceTransaction) {
    throw new Error("Flash ERP could not find that held sale or open sales order basket.");
  }

  const promotions = await getOnlinePromotionPolicies(tx, session.retailOrgId);
  const promotionPolicyByCode = new Map(
    promotions.map((promotion) => [promotion.promotionCode, promotion] as const)
  );
  const persistedLines = sourceTransaction.lines.map((line) => ({
    product: {
      id: line.productId,
      code: line.product.code ?? line.productCodeSnapshot,
      sku: line.product.sku,
      name: line.productNameSnapshot,
      shortName: line.product.shortName,
      productType: line.product.productType,
      department: line.product.department,
      category: line.product.category,
      subcategory: line.product.subcategory,
      unitOfMeasure: line.product.unitOfMeasure,
      baseCostPrice: line.product.baseCostPrice,
      trackInventory: line.product.trackInventory,
      trackExpiry: line.product.trackExpiry,
      isSerialized: line.product.isSerialized,
      taxProfile: line.product.taxProfile
    },
    serialNumbers: readStringArrayJson(line.serialNumbersSnapshot) ?? [],
    sourceLineId: line.id,
    productVariant: line.productVariant,
    productId: line.productId,
    productCodeSnapshot: line.productCodeSnapshot,
    productNameSnapshot: line.productNameSnapshot,
    variantSize: line.variantSizeSnapshot,
    variantColor: line.variantColorSnapshot,
    quantity: toQuantity(line.quantity),
    sellingUnitOfMeasure: line.sellingUnitOfMeasure ?? line.product.unitOfMeasure,
    baseUnitOfMeasure: line.baseUnitOfMeasure ?? line.product.unitOfMeasure,
    uomConversionFactor: Number(line.uomConversionFactor ?? 1),
    baseQuantity: toQuantity(line.baseQuantity ?? line.quantity),
    unitPrice: Number(line.unitPrice),
    discountAmount: Number(line.discountAmount),
    appliedPromotionCode: line.appliedPromotionCodeSnapshot,
    appliedPromotionName: line.appliedPromotionNameSnapshot,
    appliedPromotionAllowWithLoyalty:
      line.appliedPromotionCodeSnapshot === null
        ? true
        : promotionPolicyByCode.get(line.appliedPromotionCodeSnapshot)?.allowWithLoyalty ?? true,
    taxAmount: Number(line.taxAmount),
    lineTotal: Number(line.lineTotal),
    lineNote: line.lineNote ?? null,
    skipAutomaticPromotion:
      Number(line.discountAmount) > 0 || Boolean(line.appliedPromotionCodeSnapshot)
  }));
  const sourceCustomer = await findOnlineStoreCustomer(
    tx,
    session.retailOrgId,
    sourceTransaction.customerId
  );
  const preparedLines = applyOnlineAutomaticPromotions({
    lines: persistedLines,
    promotions,
    storeCode: store.code,
    customer: sourceCustomer
  });
  const sourceTotals = summarizeOnlineStoreSaleLines(preparedLines);
  const salesLocation = await resolveOnlineStoreLocation({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    receiving: false,
    salesOrder: Boolean(openSalesOrder)
  });

  await assertOnlineStoreSaleStockAvailable(tx, context, salesLocation, preparedLines, "selling");

  const expiryProductIds = [
    ...new Set(
      preparedLines
        .filter((line) => tracksInventoryForSale(line.product) && line.product.trackExpiry)
        .map((line) => line.product.id)
    )
  ];
  const availableBatchRows = expiryProductIds.length
    ? await tx.inventoryBatch.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          inventoryLocationId: salesLocation.id,
          productId: { in: expiryProductIds },
          quantityOnHand: { gt: 0 }
        },
        orderBy: [{ expiryDate: "asc" }, { manufacturedAt: "asc" }, { batchNo: "asc" }],
        select: {
          id: true,
          productId: true,
          batchNo: true,
          manufacturedAt: true,
          expiryDate: true,
          quantityOnHand: true,
          status: true
        }
      })
    : [];
  const batchRowsByProduct = new Map<string, Array<{
    batchId: string;
    batchNo: string;
    manufacturedAt: string | null;
    expiryDate: string;
    quantityOnHand: number;
    status: string;
  }>>();

  for (const batch of availableBatchRows) {
    const rows = batchRowsByProduct.get(batch.productId) ?? [];
    rows.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      manufacturedAt: batch.manufacturedAt?.toISOString() ?? null,
      expiryDate: batch.expiryDate.toISOString(),
      quantityOnHand: toQuantity(batch.quantityOnHand),
      status: batch.status
    });
    batchRowsByProduct.set(batch.productId, rows);
  }

  const batchAllocationsBySourceLineId = new Map<string, ReturnType<typeof allocateInventoryBatchesFefo>>();

  for (const line of preparedLines) {
    if (!tracksInventoryForSale(line.product) || !line.product.trackExpiry) {
      continue;
    }

    const availableBatches = batchRowsByProduct.get(line.product.id) ?? [];
    const allocations = allocateInventoryBatchesFefo({
      productName: line.product.name,
      quantity: line.baseQuantity,
      batches: availableBatches
    });
    batchAllocationsBySourceLineId.set(line.sourceLineId, allocations);

    for (const allocation of allocations) {
      const batch = availableBatches.find((candidate) => candidate.batchId === allocation.batchId);
      if (batch) {
        batch.quantityOnHand = toQuantity(batch.quantityOnHand - allocation.quantity);
      }
    }
  }

  const { terminal, shift } = await ensureOnlineRegisterShift(tx, context);
  const loyaltyPolicy = await getOnlineLoyaltyPolicy(tx, session.retailOrgId);
  assertOnlinePromotionsAllowLoyalty({
    requestedPoints: input.loyaltyPointsRedeemed,
    requestedAmount: input.loyaltyRedemptionAmount,
    promotionLines: preparedLines
  });
  const loyaltyRedemption = resolveOnlineLoyaltyRedemption({
    customer: sourceCustomer,
    totalAmount: sourceTotals.totalAmount,
    loyaltyPolicy,
    requestedPoints: input.loyaltyPointsRedeemed,
    requestedAmount: input.loyaltyRedemptionAmount
  });
  const payableTotalAmount = toMoney(sourceTotals.totalAmount - loyaltyRedemption.amount);
  const depositCreditAmount = openSalesOrder
    ? Math.min(Number(openSalesOrder.paidAmount), payableTotalAmount)
    : 0;
  const settlementAmount = toMoney(Math.max(0, payableTotalAmount - depositCreditAmount));
  const paymentInputs = Array.isArray(input.payments) ? input.payments : [];
  const preparedPayments = await prepareOnlinePayments(
    tx,
    session.retailOrgId,
    paymentInputs,
    settlementAmount,
    {
      allowChange: true,
      settlementLabel: openSalesOrder ? "sales order fulfilment" : "held sale checkout",
      paymentPurpose: openSalesOrder?.orderType === "LAYAWAY"
        ? "LAYAWAY_INSTALLMENT"
        : openSalesOrder
          ? "SALES_ORDER_BALANCE"
          : "TRANSACTION_SETTLEMENT",
      receiptContext: {
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        terminalCode: onlineTerminalCode,
        cashierCode: user.loginId
      }
    }
  );
  const existingReceiptPayments = sourceTransaction.payments.map((payment) => ({
    method: String(payment.method),
    tenderMethodCode: payment.tenderMethodCodeSnapshot,
    tenderMethodName: payment.tenderMethodNameSnapshot,
    amount: Number(payment.amount),
    reference: payment.reference
  }));
  const preparedReceiptPayments = preparedPayments.payments.map((payment) => ({
    method: String(payment.method),
    tenderMethodCode: payment.tenderMethodCodeSnapshot ?? null,
    tenderMethodName: payment.tenderMethodNameSnapshot ?? null,
    amount: Number(payment.amount ?? 0),
    reference: payment.reference ?? null
  }));
  const paidAmount = toMoney(
    [...existingReceiptPayments, ...preparedReceiptPayments].reduce(
      (sum, payment) => sum + payment.amount,
      0
    )
  );
  const completedAt = new Date();
  const transactionNo = `WEB-${store.code.toUpperCase()}-${Date.now()}`;
  const completedNote = optionalText(input.note) ?? sourceTransaction.notes;
  const transactionReference = optionalText(input.reference);
  const saleSmsDetails = resolveSaleSmsDetails(input.details, completedNote);
  const transaction = await tx.posTransaction.update({
    where: {
      id: sourceTransaction.id
    },
    data: {
      terminalId: terminal.id,
      posShiftId: shift.id,
      transactionNo,
      status: PosTransactionStatus.COMPLETED,
      cashierCodeSnapshot: user.loginId,
      subtotalAmount: sourceTotals.subtotalAmount,
      discountAmount: sourceTotals.discountAmount,
      taxAmount: sourceTotals.taxAmount,
      paidAmount,
      changeAmount: preparedPayments.changeAmount,
      totalAmount: payableTotalAmount,
      notes: completedNote,
      completedAt,
      recordVersion: {
        increment: 1
      },
      payments: {
        create: preparedPayments.payments
      }
    },
    select: {
      id: true,
      transactionNo: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      completedAt: true
    }
  });

  const updatedSalesOrderLineIds = new Set<string>();

  for (const line of preparedLines) {
    await tx.posTransactionLine.update({
      where: { id: line.sourceLineId },
      data: {
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        appliedPromotionCodeSnapshot: line.appliedPromotionCode,
        appliedPromotionNameSnapshot: line.appliedPromotionName
      }
    });

    if (!openSalesOrder) {
      continue;
    }

    const salesOrderLine = await tx.salesOrderLine.findFirst({
      where: {
        salesOrderId: openSalesOrder.id,
        ...(updatedSalesOrderLineIds.size > 0
          ? { id: { notIn: [...updatedSalesOrderLineIds] } }
          : {}),
        productCodeSnapshot: line.productCodeSnapshot,
        productVariantCodeSnapshot: line.productVariant?.code ?? null,
        variantSizeSnapshot: line.variantSize,
        variantColorSnapshot: line.variantColor,
        quantity: line.quantity,
        unitPrice: line.unitPrice
      },
      orderBy: { id: "asc" },
      select: { id: true }
    });

    if (salesOrderLine) {
      updatedSalesOrderLineIds.add(salesOrderLine.id);
      await tx.salesOrderLine.update({
        where: { id: salesOrderLine.id },
        data: {
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          appliedPromotionCode: line.appliedPromotionCode,
          appliedPromotionName: line.appliedPromotionName
        }
      });
    }
  }

  await tx.posTransactionLine.updateMany({
    where: {
      posTransactionId: transaction.id,
      lineIntent: PosTransactionLineIntent.SALE
    },
    data: {
      inventoryLocationId: salesLocation.id
    }
  });

  assertNoDuplicateOnlineSaleSerials(persistedLines);

  for (const line of persistedLines) {
    if (line.serialNumbers.length === 0) {
      continue;
    }

    const serialUpdate = await tx.inventorySerialUnit.updateMany({
      where: {
        retailOrgId: session.retailOrgId,
        productId: line.product.id,
        serialNumber: { in: line.serialNumbers },
        status: SerialInventoryStatus.AVAILABLE
      },
      data: {
        status: SerialInventoryStatus.SOLD,
        storeId: store.id,
        inventoryLocationId: salesLocation.id,
        sourceReferenceType: "POS_TRANSACTION",
        sourceReferenceId: transaction.id,
        sourceReferenceLabel: transaction.transactionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        lastOccurredAt: transaction.completedAt ?? completedAt
      }
    });

    if (serialUpdate.count !== line.serialNumbers.length) {
      throw new Error(
        `Serial availability for ${line.product.name} changed before this held sale was completed. Recall the basket, re-scan the serial numbers, and retry.`
      );
    }
  }

  for (const [sourceLineId, allocations] of batchAllocationsBySourceLineId) {
    await tx.posTransactionLine.update({
      where: { id: sourceLineId },
      data: {
        batchAllocationsSnapshot: serializeJsonField(allocations)
      }
    });

    for (const allocation of allocations) {
      if (!allocation.batchId) {
        throw new Error(`Flash ERP could not resolve batch ${allocation.batchNo} during fulfilment.`);
      }

      const updated = await tx.inventoryBatch.updateMany({
        where: {
          id: allocation.batchId,
          quantityOnHand: { gte: allocation.quantity },
          status: "ACTIVE"
        },
        data: {
          quantityOnHand: { decrement: allocation.quantity },
          lastOccurredAt: transaction.completedAt ?? completedAt,
          sourceReferenceType: "POS_TRANSACTION",
          sourceReferenceId: transaction.id,
          sourceReferenceLabel: transaction.transactionNo
        }
      });

      if (updated.count !== 1) {
        throw new Error(
          `${allocation.batchNo} changed during fulfilment. Refresh the order and retry.`
        );
      }
    }
  }

  const customerAccount = await applyOnlineCustomerAccountPostingForSale(tx, context, {
    transactionId: transaction.id,
    transactionNo: transaction.transactionNo,
    sourceTransactionNo: sourceTransaction.transactionNo,
    terminalId: terminal.id,
    completedAt: transaction.completedAt ?? completedAt,
    customer: sourceCustomer,
    totalAmount: Number(transaction.totalAmount),
    payments: preparedPayments.payments,
    loyaltyPointsRedeemed: loyaltyRedemption.points,
    loyaltyRedemptionAmount: loyaltyRedemption.amount
  });

  const inventoryMovements = preparedLines.flatMap((line) => {
    if (!tracksInventoryForSale(line.product)) {
      return [];
    }

    const allocations = batchAllocationsBySourceLineId.get(line.sourceLineId);
    const movementAllocations = allocations?.length
      ? allocations
      : [{ batchId: null, batchNo: null, expiryDate: null, quantity: line.baseQuantity }];

    return movementAllocations.map((allocation) => ({
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      warehouseId: salesLocation.warehouseId,
      inventoryLocationId: salesLocation.id,
      productId: line.productId,
      productVariantId: line.productVariant?.id ?? null,
      inventoryBatchId: allocation.batchId,
      batchNoSnapshot: allocation.batchNo,
      expiryDateSnapshot: allocation.expiryDate ? new Date(allocation.expiryDate) : null,
      movementType: InventoryMovementType.SALE,
      quantity: allocation.quantity * -1,
      unitCost: line.product.baseCostPrice,
      referenceType: "POS_TRANSACTION",
      referenceId: transaction.id,
      externalReference: transaction.transactionNo,
      sourceNodeCode: "ONLINE_DIRECT",
      createdByUserId: user.id,
      occurredAt: transaction.completedAt ?? completedAt
    }));
  });

  if (inventoryMovements.length > 0) {
    await tx.inventoryLedgerEntry.createMany({
      data: inventoryMovements
    });
  }

  for (const line of preparedLines) {
    if (!line.productVariant || !isOnlineStoreStockManagedProduct(line.product)) {
      continue;
    }

    await tx.productMatrixVariant.update({
      where: {
        id: line.productVariant.id
      },
      data: {
        quantityOnHand: {
          decrement: line.baseQuantity
        }
      }
    });
  }

  const fuelTankReduction = await reduceOnlineFuelTankForSale(tx, {
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    inventoryLocationCode: salesLocation.code,
    inventoryLocationName: salesLocation.name,
    referenceNo: transaction.transactionNo,
    lines: preparedLines.map((line) => ({
      product: line.product,
      quantity: line.baseQuantity
    }))
  });
  await postPosTransactionAccountingInTransaction(tx, {
    retailOrgId: session.retailOrgId,
    transactionId: transaction.id,
    postedBy: "Online POS"
  });

  if (openSalesOrder) {
    const reservationConsumedAt = transaction.completedAt ?? completedAt;
    const ecommercePaymentProjection = deriveEcommercePaymentProjection({
      totalAmount: sourceTotals.totalAmount,
      paidAmount,
      balanceAmount: 0,
    });
    const consumedReservationCount = await tx.salesOrderInventoryReservation.updateMany({
      where: {
        salesOrderId: openSalesOrder.id,
        status: "ACTIVE",
      },
      data: {
        status: "CONSUMED",
        releaseReason:
          openSalesOrder.orderType === "LAYAWAY"
            ? "Consumed by layaway fulfilment."
            : "Consumed by ecommerce order fulfilment.",
        releasedAt: reservationConsumedAt,
      },
    });
    await tx.ecommerceFulfillment.updateMany({
      where: { salesOrderId: openSalesOrder.id },
      data: { status: "FULFILLED", fulfilledAt: reservationConsumedAt },
    });
    await tx.ecommerceFulfillmentLine.updateMany({
      where: { ecommerceFulfillment: { salesOrderId: openSalesOrder.id } },
      data: { status: "FULFILLED" },
    });
    await tx.salesOrder.update({
      where: {
        id: openSalesOrder.id
      },
      data: {
        status: SalesOrderStatus.FULFILLED,
        totalAmount: sourceTotals.totalAmount,
        paidAmount: ecommercePaymentProjection.paidAmount,
        balanceAmount: ecommercePaymentProjection.balanceAmount,
        ...(openSalesOrder.orderType === "LAYAWAY" || consumedReservationCount.count > 0
          ? {
              reservationStatus: "CONSUMED",
              reservationReleasedAt: reservationConsumedAt,
            }
          : {}),
        fulfilledTransactionId: transaction.id,
        fulfilledTransactionNo: transaction.transactionNo,
        fulfilledAt: transaction.completedAt ?? completedAt,
        recordVersion: {
          increment: 1
        }
      }
    });
    await tx.ecommerceOrder.updateMany({
      where: {
        retailOrgId: session.retailOrgId,
        salesOrderId: openSalesOrder.id,
      },
      data: {
        paidAmount: ecommercePaymentProjection.paidAmount,
        balanceAmount: ecommercePaymentProjection.balanceAmount,
        paymentStatus: ecommercePaymentProjection.paymentStatus,
      },
    });
  }

  await tx.securityLog.create({
    data: {
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "ONLINE_STORE",
      action: openSalesOrder ? "SALES_ORDER_FULFILLED" : "HELD_SALE_COMPLETED",
      actorLabel: user.loginId,
      targetType: openSalesOrder ? "Sales order" : "POS transaction",
      targetRef: openSalesOrder?.orderNo ?? transaction.transactionNo,
      sourceNodeCode: "ONLINE_DIRECT",
      message: openSalesOrder
        ? `${user.loginId} fulfilled online sales order ${openSalesOrder.orderNo} with ${transaction.transactionNo}.`
        : `${user.loginId} completed held online sale ${transaction.transactionNo} for ${store.code}.`,
      detailsJson: serializeJsonField({
        storeCode: store.code,
        shiftNo: shift.shiftNo,
        sourceTransactionNo: sourceTransaction.transactionNo,
        transactionNo: transaction.transactionNo,
        totalAmount: Number(transaction.totalAmount)
      } satisfies Prisma.InputJsonValue)
    }
  });

  await captureTransactionReference(tx, {
    retailOrgId: session.retailOrgId,
    reference: transactionReference,
    transactionNo: transaction.transactionNo,
    source: "ONLINE_STORE",
    customerName: sourceCustomer?.fullName ?? sourceTransaction.customerNameSnapshot ?? null,
    notes: completedNote
  });

  if (transactionReference) {
    await sendSaleSmsNotificationSafely({
      retailOrgId: session.retailOrgId,
      phoneReference: transactionReference,
      transactionNo: transaction.transactionNo,
      storeName: store.name,
      currencyCode: store.currencyCode,
      totalAmount: Number(transaction.totalAmount),
      details: saleSmsDetails
    });
  }

  return {
    transactionNo: transaction.transactionNo,
      totalAmount: Number(transaction.totalAmount),
      customerAccount,
      receipt: {
        ...buildOnlineStoreReceiptBranding(store),
        storeName: store.name,
        transactionNo: transaction.transactionNo,
        transactionType: "SALE",
      completedAt: (transaction.completedAt ?? completedAt).toISOString(),
      terminalCode: onlineTerminalCode,
      shiftNo: shift.shiftNo,
      cashierCode: user.loginId,
      currencyCode: store.currencyCode,
      timezone: store.timezone,
      receiptHeader: store.receiptHeader,
      receiptFooter: store.receiptFooter,
      customerName: sourceTransaction.customerNameSnapshot ?? "Walk-in",
      subtotalAmount: Number(transaction.subtotalAmount),
      discountAmount: Number(transaction.discountAmount),
      loyaltyRedemptionPoints: loyaltyRedemption.points,
      loyaltyRedemptionAmount: loyaltyRedemption.amount,
      taxAmount: Number(transaction.taxAmount),
      totalAmount: Number(transaction.totalAmount),
      paidAmount: Number(transaction.paidAmount),
      changeAmount: Number(transaction.changeAmount),
      reference: transactionReference,
      note: completedNote,
      lines: preparedLines.map((line) => ({
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variantSize: line.variantSize,
        variantColor: line.variantColor,
        lineNote: line.lineNote,
        quantity: line.quantity,
        sellingUnitOfMeasure: line.sellingUnitOfMeasure,
        baseUnitOfMeasure: line.baseUnitOfMeasure,
        uomConversionFactor: line.uomConversionFactor,
        baseQuantity: line.baseQuantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        appliedPromotionName: line.appliedPromotionName
      })),
      payments: [...existingReceiptPayments, ...preparedReceiptPayments]
    },
    message: [
      openSalesOrder
        ? `Flash ERP fulfilled ${openSalesOrder.orderNo} with ${transaction.transactionNo}.`
        : `Flash ERP completed ${transaction.transactionNo} directly in enterprise for ${store.code}.`,
      fuelTankReduction.adjustedProducts.length > 0
        ? `Fuel tank book quantity reduced for ${fuelTankReduction.adjustedProducts.join(", ")}.`
        : "",
      fuelTankReduction.skippedProducts.length > 0
        ? `Fuel tank reduction skipped for ${fuelTankReduction.skippedProducts.join(", ")} because no matching active tank exists.`
        : ""
    ].filter(Boolean).join(" "),
    serverProcessedAt: new Date().toISOString()
  };
}

export async function createOnlineStoreSale(
  input: CreateOnlineStoreSaleRequest
): Promise<CreateOnlineStoreSaleResponse> {
  const assignment = await getOnlineStoreAssignment({
    redirectOnMissingSession: false
  });

  if (!assignment.user?.homeStore) {
    throw new Error("Assign your user profile to a home store before using browser POS.");
  }

  if (!assignment.store) {
    throw new Error("Your home store is not configured as an Online POS shop.");
  }

  if (!assignment.store.salesEnabled) {
    throw new Error("This Online POS is not enabled for POS sales.");
  }

  const store = assignment.store;
  const user = assignment.user;
  const session = assignment.session;

  if (!sessionHasAllPermissions(session, ["pos.sale.process"])) {
    throw new Error("Flash ERP requires sale processing privileges before completing an Online POS sale.");
  }

  if (input.sourceTransactionId || input.salesOrderId) {
    const loyaltyRedemptionRequested =
      Number(input.loyaltyPointsRedeemed ?? 0) > 0 || Number(input.loyaltyRedemptionAmount ?? 0) > 0;

    if (loyaltyRedemptionRequested) {
      await requireOnlineManagerApproval({
        session,
        currentUser: user,
        store,
        managerOverride: input.managerOverride,
        permissionCodes: ["pos.loyalty.redeem"],
        purpose: "approving Online POS loyalty redemption",
        requireSupervisorEligible: false
      });
    }

    return prisma.$transaction((tx) =>
      completeOnlineStoreParkedTransaction(tx, {
        session,
        user,
        store
      }, {
        sourceTransactionId: input.sourceTransactionId ?? null,
        salesOrderId: input.salesOrderId ?? null,
        payments: input.payments ?? [],
        loyaltyPointsRedeemed: input.loyaltyPointsRedeemed ?? 0,
        loyaltyRedemptionAmount: input.loyaltyRedemptionAmount ?? 0,
        note: input.note,
        reference: input.reference,
        details: input.details
      })
    );
  }

  const lineInputs = Array.isArray(input.lines) ? input.lines : [];

  if (lineInputs.length === 0) {
    throw new Error("Add at least one product to the browser POS basket.");
  }

  const productIds = [...new Set(lineInputs.map((line) => line.productId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: {
      retailOrgId: session.retailOrgId,
      // Tolerate mobile outbox payloads keyed by product code (legacy caches).
      OR: [{ id: { in: productIds } }, { code: { in: productIds } }],
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      productType: true,
      department: true,
      category: true,
      subcategory: true,
      unitOfMeasure: true,
      baseUnitOfMeasure: { select: { code: true } },
      baseUnitPrice: true,
      storeProductSellingUnits: {
        where: {
          storeId: store.id,
          status: RecordStatus.ACTIVE
        },
        select: {
          productVariantId: true,
          unitOfMeasureCodeSnapshot: true,
          unitOfMeasureNameSnapshot: true,
          conversionFactor: true,
          unitPrice: true,
          barcode: true,
          isDefault: true,
          unitOfMeasure: {
            select: {
              allowFractionalSale: true,
              decimalPrecision: true
            }
          }
        }
      },
      storeProductPrices: {
        where: {
          storeId: store.id,
          status: RecordStatus.ACTIVE,
          productVariantId: null
        },
        take: 1,
        select: {
          unitPrice: true
        }
      },
      baseCostPrice: true,
      mustEnterPriceAtPos: true,
      trackSize: true,
      trackColor: true,
      isSerialized: true,
      matrixVariants: {
        where: {
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true,
          code: true,
          displayName: true,
          unitPrice: true,
          storeProductPrices: {
            where: {
              storeId: store.id,
              status: RecordStatus.ACTIVE
            },
            take: 1,
            select: {
              unitPrice: true
            }
          },
          quantityOnHand: true,
          values: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              valueLabelSnapshot: true,
              attribute: {
                select: {
                  name: true
                }
              },
              attributeValue: {
                select: {
                  label: true
                }
              }
            }
          }
        }
      },
      taxProfile: {
        select: {
          ratePercent: true,
          isTaxInclusive: true
        }
      },
      trackInventory: true,
      trackExpiry: true
    }
  });
  const productById = new Map<string, (typeof products)[number]>(products.map((product) => [product.id, product] as const));
  for (const product of products) {
    if (!productById.has(product.code)) productById.set(product.code, product);
  }
  const managerPermissionCodes = new Set<string>();
  const overrideNotes: string[] = [];
  const loyaltyRedemptionRequested =
    Number(input.loyaltyPointsRedeemed ?? 0) > 0 || Number(input.loyaltyRedemptionAmount ?? 0) > 0;

  if (loyaltyRedemptionRequested) {
    managerPermissionCodes.add("pos.loyalty.redeem");
    overrideNotes.push("Loyalty redemption requested");
  }

  const preparedLines = lineInputs.map((line) => {
    const product = productById.get(line.productId);

    if (!product) {
      throw new Error("One of the selected products is no longer available.");
    }

    const quantity = normalizeQuantity(line.quantity);
    const matrixVariant =
      product.productType === "MATRIX"
        ? product.matrixVariants.find(
            (variant) => variant.code === optionalText(line.productVariantCode)?.toUpperCase()
          ) ?? null
        : null;

    if (product.productType === "MATRIX" && !matrixVariant) {
      throw new Error(`Choose a matrix option for ${product.name}.`);
    }

    const baseUnitPrice = Number(product.storeProductPrices[0]?.unitPrice ?? product.baseUnitPrice);
    const effectiveBaseUnitPrice = matrixVariant
      ? Number(matrixVariant.storeProductPrices[0]?.unitPrice ?? matrixVariant.unitPrice)
      : baseUnitPrice;
    const sellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
      baseUnitPrice: effectiveBaseUnitPrice,
      quantity,
      selectedUnitOfMeasure: line.sellingUnitOfMeasure,
      sellingUnits: product.storeProductSellingUnits
        .filter(
          (sellingUnit) =>
            sellingUnit.productVariantId === null ||
            sellingUnit.productVariantId === matrixVariant?.id
        )
        .map((sellingUnit) => ({
          unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
          unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
          conversionFactor: Number(sellingUnit.conversionFactor),
          unitPrice: Number(sellingUnit.unitPrice),
          barcode: sellingUnit.barcode,
          isDefault: sellingUnit.isDefault,
          allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
          decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
        })),
      serialized: product.isSerialized
    });

    if (matrixVariant && Number(matrixVariant.quantityOnHand) < sellingUom.baseQuantity) {
      throw new Error(
        `Only ${formatNumberForMessage(Number(matrixVariant.quantityOnHand))} ${matrixVariant.displayName ?? matrixVariant.code} is available for ${product.name}.`
      );
    }

    const requestedPrice = Number(line.unitPrice ?? sellingUom.unitPrice);
    const normalizedRequestedPrice = Number.isFinite(requestedPrice)
      ? toMoney(requestedPrice)
      : toMoney(sellingUom.unitPrice);
    const manualPriceOverride =
      !product.mustEnterPriceAtPos &&
      line.unitPrice !== null &&
      line.unitPrice !== undefined &&
      normalizedRequestedPrice > 0 &&
      normalizedRequestedPrice !== toMoney(sellingUom.unitPrice);
    const overrideDiscountAmount =
      line.overrideDiscountAmount === null || line.overrideDiscountAmount === undefined
        ? 0
        : normalizeMoney(line.overrideDiscountAmount, "discount override");

    if (manualPriceOverride) {
      managerPermissionCodes.add("pos.override.price");
      overrideNotes.push(`${product.code} price ${sellingUom.unitPrice.toFixed(2)} -> ${normalizedRequestedPrice.toFixed(2)}`);
    }

    if (overrideDiscountAmount > 0) {
      managerPermissionCodes.add("pos.override.discount");
      overrideNotes.push(`${product.code} discount ${overrideDiscountAmount.toFixed(2)}`);
    }

    const unitPrice =
      (product.mustEnterPriceAtPos || manualPriceOverride) && normalizedRequestedPrice > 0
        ? normalizedRequestedPrice
        : toMoney(sellingUom.unitPrice);
    const matrixAttributeLabel =
      matrixVariant?.values
        .map((value) => `${value.attribute.name}: ${value.valueLabelSnapshot || value.attributeValue.label}`)
        .join(" / ") ?? null;
    const variantSize = product.trackSize ? optionalText(line.variantSize) : null;
    const variantColor = product.trackColor ? optionalText(line.variantColor) : null;
    const lineNote = optionalText(line.lineNote);

    const amounts = calculateOnlineSaleLineAmounts({
      quantity,
      unitPrice,
      discountAmount: overrideDiscountAmount,
      taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
      taxInclusive: product.taxProfile?.isTaxInclusive ?? false
    });

    return {
      product,
      productVariant: matrixVariant,
      variantAttributesSnapshot: matrixAttributeLabel,
      quantity,
      sellingUnitOfMeasure: sellingUom.sellingUnitOfMeasure,
      baseUnitOfMeasure: sellingUom.baseUnitOfMeasure,
      uomConversionFactor: sellingUom.uomConversionFactor,
      baseQuantity: sellingUom.baseQuantity,
      variantSize,
      variantColor,
      lineNote,
      preferredBatchId: optionalText(line.preferredBatchId),
      serialNumbers: validateOnlineSerializedSaleLine({
        isSerialized: product.isSerialized && tracksInventoryForSale(product),
        productName: product.name,
        baseQuantity: sellingUom.baseQuantity,
        serialNumbers: line.serialNumbers
      }),
      unitPrice,
      discountAmount: amounts.discountAmount,
      appliedPromotionCode: null as string | null,
      appliedPromotionName: null as string | null,
      taxAmount: amounts.taxAmount,
      lineTotal: amounts.lineTotal,
      skipAutomaticPromotion: manualPriceOverride || overrideDiscountAmount > 0,
      overrideNote: optionalText(line.overrideNote)
    };
  });
  const managerOverrideRequiresSupervisor = [...managerPermissionCodes].some((permissionCode) =>
    permissionCode.startsWith("pos.override.")
  );
  const managerApproval =
    managerPermissionCodes.size > 0
      ? await requireOnlineManagerApproval({
          session,
          currentUser: user,
          store,
          managerOverride: input.managerOverride,
          permissionCodes: [...managerPermissionCodes],
          purpose: "approving Online POS overrides",
          requireSupervisorEligible: managerOverrideRequiresSupervisor
        })
      : null;
  const customer = await findOnlineStoreCustomer(prisma, session.retailOrgId, optionalText(input.customerId));
  const promotions = await getOnlinePromotionPolicies(prisma, session.retailOrgId);
  const configuredPricedLines = applyOnlineConfiguredPosDiscounts(
    preparedLines,
    lineInputs,
    store.retailOrg.companySettingsJson
  );
  const pricedLines = applyOnlineAutomaticPromotions({
    lines: configuredPricedLines,
    promotions,
    storeCode: store.code,
    customer
  });
  const subtotalAmount = toMoney(
    pricedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  );
  const discountAmount = toMoney(pricedLines.reduce((sum, line) => sum + line.discountAmount, 0));
  const taxAmount = toMoney(pricedLines.reduce((sum, line) => sum + line.taxAmount, 0));
  const grossTotalAmount = toMoney(pricedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const loyaltyPolicy = await getOnlineLoyaltyPolicy(prisma, session.retailOrgId);
  assertOnlinePromotionsAllowLoyalty({
    requestedPoints: input.loyaltyPointsRedeemed,
    requestedAmount: input.loyaltyRedemptionAmount,
    promotionLines: pricedLines
  });
  const loyaltyRedemption = resolveOnlineLoyaltyRedemption({
    customer,
    totalAmount: grossTotalAmount,
    loyaltyPolicy,
    requestedPoints: input.loyaltyPointsRedeemed,
    requestedAmount: input.loyaltyRedemptionAmount
  });
  const totalAmount = toMoney(grossTotalAmount - loyaltyRedemption.amount);
  const paymentInputs = Array.isArray(input.payments)
    ? input.payments
    : input.paymentMethod
      ? [
          {
            paymentMethod: input.paymentMethod,
            amount: totalAmount,
            reference: input.paymentReference ?? null
          }
        ]
      : [];
  const serviceType = optionalText(input.serviceType)?.toUpperCase() ?? null;
  const serviceTypeNote = serviceType ? `Service type: ${serviceType.replace(/_/g, " ")}` : null;
  const note = [serviceTypeNote, optionalText(input.note)].filter(Boolean).join(" | ") || null;
  const saleSmsDetails = resolveSaleSmsDetails(input.details, note);

  const salesLocation = await resolveOnlineStoreLocation({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    receiving: false
  });

  return prisma.$transaction(async (tx) => {
    const trackedProductIds = [
      ...new Set(
        pricedLines
          .filter((line) => isOnlineStoreStockManagedProduct(line.product) && line.product.productType !== "MATRIX")
          .map((line) => line.product.id)
      )
    ];
    const requestedQuantityByProduct = new Map<string, number>();

    for (const line of pricedLines) {
      if (!isOnlineStoreStockManagedProduct(line.product) || line.product.productType === "MATRIX") {
        continue;
      }

      requestedQuantityByProduct.set(
        line.product.id,
        toQuantity((requestedQuantityByProduct.get(line.product.id) ?? 0) + line.baseQuantity)
      );
    }

    const stockPositions =
      trackedProductIds.length > 0
        ? await tx.inventoryLedgerEntry.groupBy({
            by: ["productId"],
            where: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              inventoryLocationId: salesLocation.id,
              productId: {
                in: trackedProductIds
              }
            },
            _sum: {
              quantity: true
            }
          })
        : [];
    const availableQuantityByProduct = new Map(
      stockPositions.map((position) => [position.productId, toQuantity(position._sum.quantity)] as const)
    );
    const insufficientLine = pricedLines.find((line) => {
      if (!isOnlineStoreStockManagedProduct(line.product) || line.product.productType === "MATRIX") {
        return false;
      }

      const requestedQuantity = requestedQuantityByProduct.get(line.product.id) ?? line.baseQuantity;
      const availableQuantity = availableQuantityByProduct.get(line.product.id) ?? 0;
      return availableQuantity < requestedQuantity;
    });

    if (insufficientLine) {
      const requestedQuantity =
        requestedQuantityByProduct.get(insufficientLine.product.id) ?? insufficientLine.baseQuantity;
      const availableQuantity = availableQuantityByProduct.get(insufficientLine.product.id) ?? 0;

      throw new Error(
        `Only ${formatNumberForMessage(availableQuantity)} ${insufficientLine.product.name} is available in ${salesLocation.code}. Receive or transfer stock into the Online POS sales location before selling ${formatNumberForMessage(requestedQuantity)}.`
      );
    }

    const expiryProductIds = [
      ...new Set(
        pricedLines
          .filter((line) => tracksInventoryForSale(line.product) && line.product.trackExpiry)
          .map((line) => line.product.id)
      )
    ];
    const availableBatchRows = expiryProductIds.length
      ? await tx.inventoryBatch.findMany({
          where: {
            retailOrgId: session.retailOrgId,
            inventoryLocationId: salesLocation.id,
            productId: { in: expiryProductIds },
            quantityOnHand: { gt: 0 }
          },
          orderBy: [{ expiryDate: "asc" }, { manufacturedAt: "asc" }, { batchNo: "asc" }],
          select: {
            id: true,
            productId: true,
            batchNo: true,
            manufacturedAt: true,
            expiryDate: true,
            quantityOnHand: true,
            status: true
          }
        })
      : [];
    const availableBatchesByProduct = new Map<string, Array<{
      batchId: string;
      batchNo: string;
      manufacturedAt: string | null;
      expiryDate: string;
      quantityOnHand: number;
      status: string;
    }>>();

    for (const batch of availableBatchRows) {
      const rows = availableBatchesByProduct.get(batch.productId) ?? [];
      rows.push({
        batchId: batch.id,
        batchNo: batch.batchNo,
        manufacturedAt: batch.manufacturedAt?.toISOString() ?? null,
        expiryDate: batch.expiryDate.toISOString(),
        quantityOnHand: toQuantity(batch.quantityOnHand),
        status: batch.status
      });
      availableBatchesByProduct.set(batch.productId, rows);
    }

    const batchAllocationsByLineIndex = new Map<number, ReturnType<typeof allocateInventoryBatchesFefo>>();

    pricedLines.forEach((line, lineIndex) => {
      if (!tracksInventoryForSale(line.product) || !line.product.trackExpiry) {
        return;
      }

      const availableBatches = availableBatchesByProduct.get(line.product.id) ?? [];
      const allocations = allocateInventoryBatchesFefo({
        productName: line.product.name,
        quantity: line.baseQuantity,
        preferredBatchId: line.preferredBatchId,
        batches: availableBatches
      });
      batchAllocationsByLineIndex.set(lineIndex, allocations);

      for (const allocation of allocations) {
        const batch = availableBatches.find((candidate) => candidate.batchId === allocation.batchId);
        if (batch) {
          batch.quantityOnHand = toQuantity(batch.quantityOnHand - allocation.quantity);
        }
      }
    });

    assertNoDuplicateOnlineSaleSerials(pricedLines);

    const serializedSaleLines = pricedLines.filter((line) => line.serialNumbers.length > 0);

    if (serializedSaleLines.length > 0) {
      const serialUnits = await tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          productId: { in: [...new Set(serializedSaleLines.map((line) => line.product.id))] },
          serialNumber: {
            in: [...new Set(serializedSaleLines.flatMap((line) => line.serialNumbers))]
          }
        },
        select: {
          id: true,
          productId: true,
          serialNumber: true,
          status: true,
          inventoryLocationId: true
        }
      });
      const serialUnitByKey = new Map(
        serialUnits.map(
          (unit) => [`${unit.productId}:${unit.serialNumber.toUpperCase()}`, unit] as const
        )
      );

      for (const line of serializedSaleLines) {
        for (const serialNumber of line.serialNumbers) {
          const unit = serialUnitByKey.get(`${line.product.id}:${serialNumber}`);

          if (!unit) {
            throw new Error(
              `Serial number ${serialNumber} is not registered for ${line.product.name} in this organisation.`
            );
          }

          if (unit.status !== SerialInventoryStatus.AVAILABLE) {
            throw new Error(
              `Serial number ${serialNumber} for ${line.product.name} is ${unit.status.toLowerCase().replace(/_/g, " ")} and cannot be sold.`
            );
          }

          if (unit.inventoryLocationId && unit.inventoryLocationId !== salesLocation.id) {
            throw new Error(
              `Serial number ${serialNumber} for ${line.product.name} is not held in the ${salesLocation.code} sales location.`
            );
          }
        }
      }
    }

    const { terminal, shift } = await ensureOnlineRegisterShift(tx, {
      session,
      user,
      store
    });
    const preparedPayments = await prepareOnlinePayments(tx, session.retailOrgId, paymentInputs, totalAmount, {
      allowChange: true,
      settlementLabel: "sale checkout",
      receiptContext: {
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        terminalCode: onlineTerminalCode,
        cashierCode: user.loginId
      }
    });
    const transactionNo = `WEB-${store.code.toUpperCase()}-${Date.now()}`;
    const transaction = await tx.posTransaction.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        posShiftId: shift.id,
        customerId: customer?.id ?? null,
        transactionNo,
        transactionType: PosTransactionType.SALE as SyncPosTransactionType,
        status: PosTransactionStatus.COMPLETED,
        customerNameSnapshot: customer?.fullName ?? null,
        cashierCodeSnapshot: user.loginId,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: preparedPayments.paymentTotal,
        changeAmount: preparedPayments.changeAmount,
        notes: note,
        originNodeCode: "ONLINE_DIRECT",
        completedAt: new Date(),
        lines: {
          create: pricedLines.map((line, lineIndex) => ({
            productId: line.product.id,
            productVariantId: line.productVariant?.id ?? null,
            inventoryLocationId: salesLocation.id,
            lineIntent: PosTransactionLineIntent.SALE,
            productCodeSnapshot: line.product.code,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantSize ?? line.variantAttributesSnapshot,
            variantColorSnapshot: line.variantColor,
            variantAttributesSnapshot: line.variantAttributesSnapshot,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            batchAllocationsSnapshot: batchAllocationsByLineIndex.has(lineIndex)
              ? serializeJsonField(batchAllocationsByLineIndex.get(lineIndex) ?? [])
              : null,
            serialNumbersSnapshot:
              line.serialNumbers.length > 0 ? serializeJsonField(line.serialNumbers) : null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            appliedPromotionCodeSnapshot: line.appliedPromotionCode,
            appliedPromotionNameSnapshot: line.appliedPromotionName,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            lineNote: line.lineNote
          }))
        },
        payments: {
          create: preparedPayments.payments
        }
      },
      select: {
        id: true,
        transactionNo: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        changeAmount: true,
        completedAt: true
      }
    });

    const customerAccount = await applyOnlineCustomerAccountPostingForSale(tx, {
      session,
      user,
      store
    }, {
      transactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      sourceTransactionNo: null,
      terminalId: terminal.id,
      completedAt: transaction.completedAt ?? new Date(),
      customer,
      totalAmount: Number(transaction.totalAmount),
      payments: preparedPayments.payments,
      loyaltyPointsRedeemed: loyaltyRedemption.points,
      loyaltyRedemptionAmount: loyaltyRedemption.amount
    });

    for (const line of pricedLines) {
      if (line.serialNumbers.length === 0) {
        continue;
      }

      const serialUpdate = await tx.inventorySerialUnit.updateMany({
        where: {
          retailOrgId: session.retailOrgId,
          productId: line.product.id,
          serialNumber: { in: line.serialNumbers },
          status: SerialInventoryStatus.AVAILABLE
        },
        data: {
          status: SerialInventoryStatus.SOLD,
          storeId: store.id,
          inventoryLocationId: salesLocation.id,
          sourceReferenceType: "POS_TRANSACTION",
          sourceReferenceId: transaction.id,
          sourceReferenceLabel: transaction.transactionNo,
          sourceNodeCode: "ONLINE_DIRECT",
          lastOccurredAt: transaction.completedAt ?? new Date()
        }
      });

      if (serialUpdate.count !== line.serialNumbers.length) {
        throw new Error(
          `Serial availability for ${line.product.name} changed during checkout. Refresh the basket and retry the sale.`
        );
      }
    }

    for (const allocations of batchAllocationsByLineIndex.values()) {
      for (const allocation of allocations) {
        if (!allocation.batchId) {
          throw new Error(`Flash ERP could not resolve batch ${allocation.batchNo} during checkout.`);
        }

        const updated = await tx.inventoryBatch.updateMany({
          where: {
            id: allocation.batchId,
            quantityOnHand: { gte: allocation.quantity },
            status: "ACTIVE"
          },
          data: {
            quantityOnHand: { decrement: allocation.quantity },
            lastOccurredAt: transaction.completedAt ?? new Date(),
            sourceReferenceType: "POS_TRANSACTION",
            sourceReferenceId: transaction.id,
            sourceReferenceLabel: transaction.transactionNo
          }
        });

        if (updated.count !== 1) {
          throw new Error(
            `${allocation.batchNo} changed during checkout. Refresh the basket and retry the sale.`
          );
        }
      }
    }

    const inventoryMovements = pricedLines.flatMap((line, lineIndex) => {
      if (!tracksInventoryForSale(line.product)) {
        return [];
      }

      const allocations = batchAllocationsByLineIndex.get(lineIndex);
      const movementAllocations = allocations?.length
        ? allocations
        : [{ batchId: null, batchNo: null, expiryDate: null, quantity: line.baseQuantity }];

      return movementAllocations.map((allocation) => ({
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          warehouseId: salesLocation.warehouseId,
          inventoryLocationId: salesLocation.id,
          productId: line.product.id,
          productVariantId: line.productVariant?.id ?? null,
          inventoryBatchId: allocation.batchId,
          batchNoSnapshot: allocation.batchNo,
          expiryDateSnapshot: allocation.expiryDate ? new Date(allocation.expiryDate) : null,
          movementType: InventoryMovementType.SALE,
          quantity: -allocation.quantity,
          unitCost: line.product.baseCostPrice,
          referenceType: "POS_TRANSACTION",
          referenceId: transaction.id,
          externalReference: transaction.transactionNo,
          sourceNodeCode: "ONLINE_DIRECT",
          createdByUserId: user.id,
          occurredAt: transaction.completedAt ?? new Date()
      }));
    });

    if (inventoryMovements.length > 0) {
      await tx.inventoryLedgerEntry.createMany({
        data: inventoryMovements
      });
    }
    const fuelTankReduction = await reduceOnlineFuelTankForSale(tx, {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      inventoryLocationCode: salesLocation.code,
      inventoryLocationName: salesLocation.name,
      referenceNo: transaction.transactionNo,
      lines: pricedLines.map((line) => ({
        product: line.product,
        quantity: line.baseQuantity
      }))
    });
    await postPosTransactionAccountingInTransaction(tx, {
      retailOrgId: session.retailOrgId,
      transactionId: transaction.id,
      postedBy: "Online POS"
    });

    for (const line of pricedLines) {
      if (!line.productVariant) {
        continue;
      }

      await tx.productMatrixVariant.update({
        where: {
          id: line.productVariant.id
        },
        data: {
          quantityOnHand: {
            decrement: line.baseQuantity
          }
        }
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "SALE_COMPLETED",
        actorLabel: user.loginId,
        targetType: "POS transaction",
        targetRef: transaction.transactionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} completed Online POS sale ${transaction.transactionNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          totalAmount,
          managerOverride:
            managerApproval === null
              ? null
              : {
                  approvalType: managerApproval.approvalType,
                  supervisorLoginId: managerApproval.supervisorLoginId,
                  supervisorDisplayName: managerApproval.supervisorDisplayName,
                  permissionCodes: managerApproval.permissionCodes,
                  note: managerApproval.note,
                  overrideNotes
                }
        } satisfies Prisma.InputJsonValue)
      }
    });

    const transactionReference = optionalText(input.reference);

    await captureTransactionReference(tx, {
      retailOrgId: session.retailOrgId,
      reference: transactionReference,
      transactionNo: transaction.transactionNo,
      source: "ONLINE_STORE",
      customerName: customer?.fullName ?? null,
      notes: note
    });

    if (transactionReference) {
      await sendSaleSmsNotificationSafely({
        retailOrgId: session.retailOrgId,
        phoneReference: transactionReference,
        transactionNo: transaction.transactionNo,
        storeName: store.name,
        currencyCode: store.currencyCode,
        totalAmount: Number(transaction.totalAmount),
        details: saleSmsDetails
      });
    }

    return {
      transactionNo: transaction.transactionNo,
      totalAmount: Number(transaction.totalAmount),
      customerAccount,
      receipt: {
        ...buildOnlineStoreReceiptBranding(store),
        storeName: store.name,
        transactionNo: transaction.transactionNo,
        transactionType: "SALE",
        completedAt: (transaction.completedAt ?? new Date()).toISOString(),
        terminalCode: onlineTerminalCode,
        shiftNo: shift.shiftNo,
        cashierCode: user.loginId,
        currencyCode: store.currencyCode,
        timezone: store.timezone,
        receiptHeader: store.receiptHeader,
        receiptFooter: store.receiptFooter,
        customerName: customer?.fullName ?? "Walk-in",
        subtotalAmount: Number(transaction.subtotalAmount),
        discountAmount: Number(transaction.discountAmount),
        loyaltyRedemptionPoints: loyaltyRedemption.points,
        loyaltyRedemptionAmount: loyaltyRedemption.amount,
        taxAmount: Number(transaction.taxAmount),
        totalAmount: Number(transaction.totalAmount),
        paidAmount: Number(transaction.paidAmount),
        changeAmount: Number(transaction.changeAmount),
        reference: transactionReference,
        note,
        lines: pricedLines.map((line) => ({
          productCode: line.product.code,
          productName: line.product.name,
          variantSize: line.variantSize,
          variantColor: line.variantColor,
          lineNote: line.lineNote,
          quantity: line.quantity,
          sellingUnitOfMeasure: line.sellingUnitOfMeasure,
          baseUnitOfMeasure: line.baseUnitOfMeasure,
          uomConversionFactor: line.uomConversionFactor,
          baseQuantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          appliedPromotionName: line.appliedPromotionName
        })),
        payments: preparedPayments.payments.map((payment) => ({
          method: String(payment.method),
          tenderMethodCode: payment.tenderMethodCodeSnapshot ?? null,
          tenderMethodName: payment.tenderMethodNameSnapshot ?? null,
          amount: Number(payment.amount),
          reference: payment.reference ?? null
        }))
      },
      message: [
        `Flash ERP completed ${transaction.transactionNo} directly in enterprise for ${store.code}.`,
        fuelTankReduction.adjustedProducts.length > 0
          ? `Fuel tank book quantity reduced for ${fuelTankReduction.adjustedProducts.join(", ")}.`
          : "",
        fuelTankReduction.skippedProducts.length > 0
          ? `Fuel tank reduction skipped for ${fuelTankReduction.skippedProducts.join(", ")} because no matching active tank exists.`
          : ""
      ].filter(Boolean).join(" "),
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createOnlineStoreHeldSale(
  input: CreateOnlineStoreHeldSaleRequest
): Promise<CreateOnlineStoreHeldSaleResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("holding an Online POS sale");

  if (!store.salesEnabled) {
    throw new Error("This Online POS is not enabled for POS sales.");
  }

  const lineInputs = Array.isArray(input.lines) ? input.lines : [];
  const note = optionalText(input.note);

  return prisma.$transaction(async (tx) => {
    const customer = await findOnlineStoreCustomer(tx, session.retailOrgId, optionalText(input.customerId));
    const preparedLines = await prepareOnlineStoreBasketLines(
      tx,
      session.retailOrgId,
      store.id,
      lineInputs,
      "Add at least one product before holding the browser POS basket."
    );
    const promotions = await getOnlinePromotionPolicies(tx, session.retailOrgId);
    const configuredPricedLines = applyOnlineConfiguredPosDiscounts(
      preparedLines,
      lineInputs,
      store.retailOrg.companySettingsJson
    );
    const pricedLines = applyOnlineAutomaticPromotions({
      lines: configuredPricedLines,
      promotions,
      storeCode: store.code,
      customer
    });
    const totals = summarizeOnlineStoreSaleLines(pricedLines);
    const salesOrderLocation = await resolveOnlineStoreLocation({
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      salesOrder: true
    });
    await assertOnlineStoreSaleStockAvailable(
      tx,
      { session, user, store },
      salesOrderLocation,
      pricedLines,
      "saving sales order"
    );
    const { terminal, shift } = await ensureOnlineRegisterShift(tx, {
      session,
      user,
      store
    });
    const transactionNo = `WEB-HLD-${store.code.toUpperCase()}-${Date.now()}`;
    const transaction = await tx.posTransaction.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        posShiftId: shift.id,
        customerId: customer?.id ?? null,
        transactionNo,
        transactionType: PosTransactionType.SALE as SyncPosTransactionType,
        status: PosTransactionStatus.PARKED,
        customerNameSnapshot: customer?.fullName ?? null,
        cashierCodeSnapshot: user.loginId,
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        changeAmount: 0,
        notes: note,
        originNodeCode: "ONLINE_DIRECT",
        lines: {
          create: pricedLines.map((line) => ({
            productId: line.product.id,
            productVariantId: line.productVariant?.id ?? null,
            inventoryLocationId: salesOrderLocation.id,
            lineIntent: PosTransactionLineIntent.SALE,
            productCodeSnapshot: line.product.code,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantSize ?? line.variantAttributesSnapshot,
            variantColorSnapshot: line.variantColor,
            variantAttributesSnapshot: line.variantAttributesSnapshot,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            appliedPromotionCodeSnapshot: line.appliedPromotionCode,
            appliedPromotionNameSnapshot: line.appliedPromotionName,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            lineNote: line.lineNote,
            serialNumbersSnapshot:
              line.serialNumbers.length > 0 ? serializeJsonField(line.serialNumbers) : null
          }))
        }
      },
      select: {
        id: true,
        transactionNo: true,
        transactionType: true,
        totalAmount: true,
        updatedAt: true
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "HELD_SALE_CREATED",
        actorLabel: user.loginId,
        targetType: "POS transaction",
        targetRef: transaction.transactionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} held online sale ${transaction.transactionNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          totalAmount: totals.totalAmount
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      heldSale: {
        transactionId: transaction.id,
        transactionNo: transaction.transactionNo,
        customerId: customer?.id ?? null,
        customerNo: customer?.customerNo ?? null,
        customerName: customer?.fullName ?? "Walk-in",
        transactionType: transaction.transactionType,
        totalAmount: Number(transaction.totalAmount),
        itemCount: toQuantity(pricedLines.reduce((sum, line) => sum + line.quantity, 0)),
        lineCount: pricedLines.length,
        updatedAt: transaction.updatedAt.toISOString(),
        lines: pricedLines.map((line) => ({
          productId: line.product.id,
          productCode: line.product.code,
          productName: line.product.name,
          variantSize: line.variantSize,
          variantColor: line.variantColor,
          lineNote: line.lineNote,
          quantity: line.quantity,
          sellingUnitOfMeasure: line.sellingUnitOfMeasure,
          baseUnitOfMeasure: line.baseUnitOfMeasure,
          uomConversionFactor: line.uomConversionFactor,
          baseQuantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          appliedPromotionName: line.appliedPromotionName,
          serialNumbers: line.serialNumbers
        }))
      },
      message: `${transaction.transactionNo} was held for later recall.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createOnlineStoreSalesOrder(
  input: CreateOnlineStoreSalesOrderRequest
): Promise<CreateOnlineStoreSalesOrderResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("saving an Online POS sales order");
  const orderType = input.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER";
  const isLayaway = orderType === "LAYAWAY";

  if (isLayaway && !sessionHasAllPermissions(session, ["pos.layaway.create"])) {
    throw new Error("Your role is not allowed to create layaways.");
  }
  if (
    isLayaway &&
    input.policyOverrideApproved === true &&
    !sessionHasAllPermissions(session, ["pos.layaway.policy.override"])
  ) {
    throw new Error("Your role is not allowed to override the layaway policy.");
  }

  if (!store.salesEnabled) {
    throw new Error("This Online POS is not enabled for POS orders.");
  }

  const lineInputs = Array.isArray(input.lines) ? input.lines : [];
  const serviceType = optionalText(input.serviceType)?.toUpperCase() ?? null;
  const serviceTypeNote = serviceType ? `Service type: ${serviceType.replace(/_/g, " ")}` : null;
  const note = [serviceTypeNote, optionalText(input.note)].filter(Boolean).join(" | ") || null;
  const customerId = optionalText(input.customerId);

  if (!customerId) {
    throw new Error("Attach a customer before saving a sales order.");
  }

  return prisma.$transaction(async (tx) => {
    const customer = await findOnlineStoreCustomer(tx, session.retailOrgId, customerId);
    const preparedLines = await prepareOnlineStoreBasketLines(
      tx,
      session.retailOrgId,
      store.id,
      lineInputs,
      "Add at least one product before saving a sales order."
    );
    const promotions = await getOnlinePromotionPolicies(tx, session.retailOrgId);
    const configuredPricedLines = applyOnlineConfiguredPosDiscounts(
      preparedLines,
      lineInputs,
      store.retailOrg.companySettingsJson
    );
    const pricedLines = applyOnlineAutomaticPromotions({
      lines: configuredPricedLines,
      promotions,
      storeCode: store.code,
      customer
    });
    const totals = summarizeOnlineStoreSaleLines(pricedLines);
    const { terminal, shift } = await ensureOnlineRegisterShift(tx, {
      session,
      user,
      store
    });
    const now = new Date();
    const transactionNo = `WEB-ORD-${store.code.toUpperCase()}-${Date.now()}`;
    const orderNo = `SO-${store.code.toUpperCase()}-${Date.now()}`;
    const suppliedPaymentInputs = Array.isArray(input.payments) ? input.payments : null;
    const legacyDepositAmount =
      input.depositAmount === null || input.depositAmount === undefined
        ? 0
        : normalizeMoney(input.depositAmount, `${isLayaway ? "layaway" : "sales order"} deposit`);
    const depositPaymentInputs = suppliedPaymentInputs ?? (
      legacyDepositAmount > 0
        ? [{
            tenderMethodCode: input.depositTenderMethodCode,
            amount: legacyDepositAmount,
            reference: input.depositReference,
          }]
        : []
    );
    const requestedDepositAmount = toMoney(
      depositPaymentInputs.reduce(
        (sum, payment, index) =>
          sum + normalizeMoney(payment.amount ?? 0, `deposit payment row ${index + 1}`),
        0,
      ),
    );

    if (requestedDepositAmount > totals.totalAmount) {
      throw new Error(`A ${isLayaway ? "layaway" : "sales order"} deposit cannot be greater than the order total.`);
    }

    const layawaySettings = normalizeLayawaySettings(
      readJsonObject(store.retailOrg.companySettingsJson).layawaySettings,
    );
    const layawayOpening = isLayaway
      ? evaluateLayawayOpening({
          totalAmount: totals.totalAmount,
          openingPaymentAmount: requestedDepositAmount,
          settings: layawaySettings,
          capturedAt: now.toISOString(),
          policyOverrideApproved: input.policyOverrideApproved === true,
        })
      : null;
    const layawayExpiresAtText = isLayaway ? optionalText(input.layawayExpiresAt) : null;
    const layawayExpiresAt = layawayExpiresAtText ? new Date(layawayExpiresAtText) : null;

    if (
      layawayExpiresAt &&
      (Number.isNaN(layawayExpiresAt.getTime()) || layawayExpiresAt.getTime() <= now.getTime())
    ) {
      throw new Error("Choose a future layaway expiry date and time.");
    }

    const preparedDepositPayments =
      requestedDepositAmount > 0
        ? await prepareOnlinePayments(
            tx,
            session.retailOrgId,
            depositPaymentInputs,
            requestedDepositAmount,
            {
              allowChange: false,
              settlementLabel: isLayaway ? "layaway deposit" : "sales order deposit",
              paymentPurpose: isLayaway ? "LAYAWAY_DEPOSIT" : "SALES_ORDER_DEPOSIT",
              receiptContext: {
                shiftId: shift.id,
                shiftNo: shift.shiftNo,
                terminalCode: onlineTerminalCode,
                cashierCode: user.loginId
              }
            }
          )
        : { paymentTotal: 0, changeAmount: 0, payments: [] as Prisma.PosPaymentCreateWithoutPosTransactionInput[] };
    const depositPayment = preparedDepositPayments.payments[0] ?? null;
    const depositAmount = preparedDepositPayments.paymentTotal;
    const paidAmount = layawayOpening?.paidAmount ?? depositAmount;
    const balanceAmount = layawayOpening?.balanceAmount ?? toMoney(totals.totalAmount - depositAmount);
    const salesOrderLines = pricedLines.map((line) => ({ id: randomUUID(), line }));
    const reservationLocation =
      layawayOpening?.reservationStatus === "ACTIVE"
        ? await tx.inventoryLocation.findFirst({
            where: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              status: RecordStatus.ACTIVE,
            },
            orderBy: [
              { useForSalesOrderDefault: "desc" },
              { useForSalesDefault: "desc" },
              { name: "asc" },
            ],
            select: { id: true, code: true },
          })
        : null;

    if (layawayOpening?.reservationStatus === "ACTIVE" && !reservationLocation) {
      throw new Error("Configure an active sales-order inventory location before reserving layaway stock.");
    }

    const reservableLines = reservationLocation
      ? salesOrderLines.filter(({ line }) => isOnlineStoreStockManagedProduct(line.product))
      : [];
    const reservationPositionKey = (productId: string, productVariantId?: string | null) =>
      `${productId}:${productVariantId ?? ""}`;
    const reservationSnapshotKey = (productCode: string, productVariantCode?: string | null) =>
      `${productCode.trim().toUpperCase()}:${productVariantCode?.trim().toUpperCase() ?? ""}`;
    const requestedByPosition = new Map<string, number>();

    for (const { line } of reservableLines) {
      const key = reservationPositionKey(line.product.id, line.productVariant?.id);
      requestedByPosition.set(
        key,
        toQuantity((requestedByPosition.get(key) ?? 0) + line.baseQuantity),
      );
    }

    const stockPositions = reservationLocation && reservableLines.length
      ? await tx.inventoryLedgerEntry.groupBy({
          by: ["productId", "productVariantId"],
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            inventoryLocationId: reservationLocation.id,
            productId: { in: [...new Set(reservableLines.map(({ line }) => line.product.id))] },
          },
          _sum: { quantity: true },
        })
      : [];
    const onHandByPosition = new Map(
      stockPositions.map((position) => [
        reservationPositionKey(position.productId, position.productVariantId),
        toQuantity(position._sum.quantity),
      ] as const),
    );
    const activeReservations = reservationLocation && reservableLines.length
      ? await tx.salesOrderInventoryReservation.findMany({
          where: {
            inventoryLocationId: reservationLocation.id,
            status: "ACTIVE",
            productCodeSnapshot: {
              in: [...new Set(reservableLines.map(({ line }) => line.product.code))],
            },
          },
          select: {
            productCodeSnapshot: true,
            productVariantCodeSnapshot: true,
            baseQuantity: true,
          },
        })
      : [];
    const activeReservedBySnapshot = new Map<string, number>();

    for (const reservation of activeReservations) {
      const key = reservationSnapshotKey(
        reservation.productCodeSnapshot,
        reservation.productVariantCodeSnapshot,
      );
      activeReservedBySnapshot.set(
        key,
        toQuantity((activeReservedBySnapshot.get(key) ?? 0) + Number(reservation.baseQuantity)),
      );
    }

    for (const { line } of reservableLines) {
      const positionKey = reservationPositionKey(line.product.id, line.productVariant?.id);
      const requestedBaseQuantity = requestedByPosition.get(positionKey) ?? line.baseQuantity;
      const availableBaseQuantity = calculateLayawayAvailableBaseQuantity({
        onHandBaseQuantity: onHandByPosition.get(positionKey) ?? 0,
        activeReservedBaseQuantity:
          activeReservedBySnapshot.get(
            reservationSnapshotKey(line.product.code, line.productVariant?.code),
          ) ?? 0,
      });

      if (requestedBaseQuantity > availableBaseQuantity + 0.0005) {
        throw new Error(
          `Only ${formatNumberForMessage(availableBaseQuantity)} ${line.product.name} is available after active layaway reservations.`,
        );
      }
    }

    const transaction = await tx.posTransaction.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        posShiftId: shift.id,
        customerId: customer?.id ?? null,
        transactionNo,
        transactionType: PosTransactionType.SALE as SyncPosTransactionType,
        status: PosTransactionStatus.PARKED,
        customerNameSnapshot: customer?.fullName ?? null,
        cashierCodeSnapshot: user.loginId,
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: depositAmount,
        changeAmount: 0,
        notes: note,
        originNodeCode: "ONLINE_DIRECT",
        lines: {
          create: pricedLines.map((line) => ({
            productId: line.product.id,
            productVariantId: line.productVariant?.id ?? null,
            lineIntent: PosTransactionLineIntent.SALE,
            productCodeSnapshot: line.product.code,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantSize ?? line.variantAttributesSnapshot,
            variantColorSnapshot: line.variantColor,
            variantAttributesSnapshot: line.variantAttributesSnapshot,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            appliedPromotionCodeSnapshot: line.appliedPromotionCode,
            appliedPromotionNameSnapshot: line.appliedPromotionName,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            lineNote: line.lineNote
          }))
        },
        ...(preparedDepositPayments.payments.length > 0
          ? {
              payments: {
                create: preparedDepositPayments.payments
              }
            }
          : {})
      },
      select: {
        id: true,
        transactionNo: true
      }
    });
    const order = await tx.salesOrder.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        customerId: customer?.id ?? null,
        orderNo,
        sourceTransactionId: transaction.id,
        sourceTransactionNo: transaction.transactionNo,
        customerNoSnapshot: customer?.customerNo ?? null,
        customerNameSnapshot: customer?.fullName ?? null,
        orderType,
        status: SalesOrderStatus.OPEN,
        totalAmount: totals.totalAmount,
        depositAmount,
        paidAmount,
        balanceAmount,
        depositTenderMethodCodeSnapshot: depositPayment?.tenderMethodCodeSnapshot ?? null,
        depositTenderMethodNameSnapshot: depositPayment?.tenderMethodNameSnapshot ?? null,
        depositPaymentMethodSnapshot: depositPayment?.method ?? null,
        depositReference: depositPayment?.reference ?? null,
        depositPaidAt: depositAmount > 0 ? now : null,
        layawayPolicySnapshotJson: layawayOpening
          ? serializeJsonField(layawayOpening.policySnapshot satisfies Prisma.InputJsonValue)
          : null,
        minimumDepositAmount: layawayOpening?.minimumDepositAmount ?? 0,
        reservationStatus: layawayOpening?.reservationStatus ?? "NOT_APPLICABLE",
        reservationCreatedAt:
          layawayOpening?.reservationStatus === "ACTIVE" ? now : null,
        layawayExpiresAt,
        operatorName: user.displayName ?? user.loginId,
        note,
        originNodeCode: "ONLINE_DIRECT",
        createdAt: now,
        lines: {
          create: salesOrderLines.map(({ id, line }) => ({
            id,
            productCodeSnapshot: line.product.code,
            productVariantCodeSnapshot: line.productVariant?.code ?? null,
            productNameSnapshot: line.product.name,
            variantSizeSnapshot: line.variantSize ?? line.variantAttributesSnapshot,
            variantColorSnapshot: line.variantColor,
            variantAttributesSnapshot: line.variantAttributesSnapshot,
            lineNote: line.lineNote,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            appliedPromotionCode: line.appliedPromotionCode,
            appliedPromotionName: line.appliedPromotionName
          }))
        }
      },
      select: {
        id: true,
        orderNo: true,
        status: true,
        orderType: true,
        totalAmount: true,
        depositAmount: true,
        paidAmount: true,
        balanceAmount: true,
        depositTenderMethodCodeSnapshot: true,
        depositTenderMethodNameSnapshot: true,
        depositPaymentMethodSnapshot: true,
        depositReference: true,
        depositPaidAt: true,
        minimumDepositAmount: true,
        layawayPolicySnapshotJson: true,
        reservationStatus: true,
        reservationCreatedAt: true,
        reservationReleasedAt: true,
        layawayExpiresAt: true,
        expiredAt: true,
        cancellationFeeAmount: true,
        refundedAmount: true,
        operatorName: true,
        note: true,
        createdAt: true
      }
    });

    if (reservationLocation && reservableLines.length > 0) {
      await tx.salesOrderInventoryReservation.createMany({
        data: reservableLines.map(({ id, line }) => ({
          salesOrderId: order.id,
          salesOrderLineId: id,
          inventoryLocationId: reservationLocation.id,
          inventoryLocationCodeSnapshot: reservationLocation.code,
          productCodeSnapshot: line.product.code,
          productVariantCodeSnapshot: line.productVariant?.code ?? null,
          baseUnitOfMeasure: line.baseUnitOfMeasure,
          baseQuantity: line.baseQuantity,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })),
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: isLayaway ? "LAYAWAY_CREATED" : "SALES_ORDER_CREATED",
        actorLabel: user.loginId,
        targetType: "Sales order",
        targetRef: order.orderNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} saved online ${isLayaway ? "layaway" : "sales order"} ${order.orderNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          sourceTransactionNo: transaction.transactionNo,
          totalAmount: totals.totalAmount,
          depositAmount,
          paidAmount,
          balanceAmount,
          reservationStatus: layawayOpening?.reservationStatus ?? "NOT_APPLICABLE",
        } satisfies Prisma.InputJsonValue)
      }
    });
    const receiptPayments = preparedDepositPayments.payments.map((payment) => ({
      method: String(payment.method),
      tenderMethodCode: payment.tenderMethodCodeSnapshot ?? null,
      tenderMethodName: payment.tenderMethodNameSnapshot ?? null,
      amount: Number(payment.amount ?? 0),
      reference: payment.reference ?? null
    }));

    return {
      salesOrder: {
        orderId: order.id,
        orderNo: order.orderNo,
        sourceTransactionId: transaction.id,
        sourceTransactionNo: transaction.transactionNo,
        customerId: customer?.id ?? null,
        customerNo: customer?.customerNo ?? null,
        customerName: customer?.fullName ?? "Customer",
        originStoreId: store.id,
        originStoreCode: store.code,
        originStoreName: store.name,
        isFulfilmentOrder: false,
        orderType: order.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER",
        status: order.status,
        totalAmount: Number(order.totalAmount),
        depositAmount: Number(order.depositAmount),
        paidAmount: Number(order.paidAmount),
        balanceAmount: Number(order.balanceAmount),
        depositTenderMethodCode: order.depositTenderMethodCodeSnapshot,
        depositTenderMethodName: order.depositTenderMethodNameSnapshot,
        depositPaymentMethod: order.depositPaymentMethodSnapshot,
      depositReference: order.depositReference,
      depositPaidAt: order.depositPaidAt?.toISOString() ?? null,
      minimumDepositAmount: Number(order.minimumDepositAmount),
      layawayPolicy:
        order.orderType === "LAYAWAY"
          ? normalizeLayawaySettings(order.layawayPolicySnapshotJson)
          : null,
      reservationStatus: order.reservationStatus,
        reservationCreatedAt: order.reservationCreatedAt?.toISOString() ?? null,
        reservationReleasedAt: order.reservationReleasedAt?.toISOString() ?? null,
        layawayExpiresAt: order.layawayExpiresAt?.toISOString() ?? null,
        expiredAt: order.expiredAt?.toISOString() ?? null,
        cancellationFeeAmount: Number(order.cancellationFeeAmount),
        refundedAmount: Number(order.refundedAmount),
        itemCount: toQuantity(pricedLines.reduce((sum, line) => sum + line.quantity, 0)),
        lineCount: pricedLines.length,
        operatorName: order.operatorName,
        note: order.note,
        fulfilledTransactionNo: null,
        createdAt: order.createdAt.toISOString(),
        fulfilledAt: null,
        cancelledAt: null,
        lines: pricedLines.map((line) => ({
          productId: line.product.id,
          productCode: line.product.code,
          productName: line.product.name,
          variantSize: line.variantSize,
          variantColor: line.variantColor,
          lineNote: line.lineNote,
          quantity: line.quantity,
          sellingUnitOfMeasure: line.sellingUnitOfMeasure,
          baseUnitOfMeasure: line.baseUnitOfMeasure,
          uomConversionFactor: line.uomConversionFactor,
          baseQuantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          appliedPromotionName: line.appliedPromotionName
        }))
      },
      receipt: {
        ...buildOnlineStoreReceiptBranding(store),
        storeName: store.name,
        transactionNo: order.orderNo,
        transactionType: isLayaway ? "LAYAWAY" : "SALES_ORDER",
        completedAt: now.toISOString(),
        terminalCode: onlineTerminalCode,
        shiftNo: shift.shiftNo,
        cashierCode: user.loginId,
        currencyCode: store.currencyCode,
        timezone: store.timezone,
        receiptHeader: store.receiptHeader,
        receiptFooter: store.receiptFooter,
        customerName: customer?.fullName ?? "Customer",
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        loyaltyRedemptionPoints: 0,
        loyaltyRedemptionAmount: 0,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: depositAmount,
        changeAmount: 0,
        note,
        lines: pricedLines.map((line) => ({
          productCode: line.product.code,
          productName: line.product.name,
          variantSize: line.variantSize,
          variantColor: line.variantColor,
          lineNote: line.lineNote,
          quantity: line.quantity,
          sellingUnitOfMeasure: line.sellingUnitOfMeasure,
          baseUnitOfMeasure: line.baseUnitOfMeasure,
          uomConversionFactor: line.uomConversionFactor,
          baseQuantity: line.baseQuantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          appliedPromotionName: line.appliedPromotionName
        })),
        payments: receiptPayments
      },
      message: `${order.orderNo} was saved as ${isLayaway ? "a layaway" : "a sales order"}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function cancelOnlineStoreSalesOrder(
  orderId: string,
  input: CancelOnlineStoreSalesOrderRequest = {},
): Promise<CancelOnlineStoreSalesOrderResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "cancelling an Online POS sales order",
  );
  const requestedOrderId = optionalText(orderId);

  if (!requestedOrderId) {
    throw new Error("Choose an open sales order before cancelling.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: {
        id: requestedOrderId,
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: SalesOrderStatus.OPEN,
      },
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        orderType: true,
        paidAmount: true,
        layawayPolicySnapshotJson: true,
        reservationStatus: true,
      },
    });

    if (!order) {
      throw new Error("Flash ERP could not find that open online sales order.");
    }

    const isLayaway = order.orderType === "LAYAWAY";

    if (isLayaway && !sessionHasAllPermissions(session, ["pos.layaway.cancel-refund"])) {
      throw new Error("Your role is not allowed to cancel and refund layaways.");
    }
    if (
      input.policyOverrideApproved === true &&
      !sessionHasAllPermissions(session, ["pos.layaway.policy.override"])
    ) {
      throw new Error("Your role is not allowed to override the layaway policy.");
    }

    const cancelledAt = new Date();
    const cancellationAmounts = isLayaway
      ? calculateLayawayCancellationAmounts({
          paidAmount: Number(order.paidAmount),
          policySnapshot: readJsonObject(order.layawayPolicySnapshotJson),
        })
      : { cancellationFeeAmount: 0, refundAmount: 0 };
    let refundPaymentCount = 0;

    if (cancellationAmounts.refundAmount > 0) {
      const { shift } = await ensureOnlineRegisterShift(tx, { session, user, store });
      const preparedRefund = await prepareOnlinePayments(
        tx,
        session.retailOrgId,
        Array.isArray(input.refundPayments) ? input.refundPayments : [],
        cancellationAmounts.refundAmount,
        {
          allowChange: false,
          refund: true,
          settlementLabel: "layaway cancellation refund",
          paymentPurpose: "LAYAWAY_REFUND",
          receiptContext: {
            shiftId: shift.id,
            shiftNo: shift.shiftNo,
            terminalCode: onlineTerminalCode,
            cashierCode: user.loginId,
          },
        },
      );
      refundPaymentCount = preparedRefund.payments.length;
      await tx.posTransaction.update({
        where: { id: order.sourceTransactionId },
        data: {
          payments: {
            create: preparedRefund.payments.map((payment) => ({
              ...payment,
              amount: -Math.abs(Number(payment.amount ?? 0)),
            })),
          },
        },
      });
    }

    await tx.salesOrderInventoryReservation.updateMany({
      where: { salesOrderId: order.id, status: "ACTIVE" },
      data: {
        status: "RELEASED",
        releaseReason: optionalText(input.note) ?? "Layaway cancelled.",
        releasedAt: cancelledAt,
      },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: SalesOrderStatus.CANCELLED,
        cancelledAt,
        reservationStatus:
          order.reservationStatus === "ACTIVE" ? "RELEASED" : order.reservationStatus,
        ...(order.reservationStatus === "ACTIVE"
          ? { reservationReleasedAt: cancelledAt }
          : {}),
        cancellationFeeAmount: cancellationAmounts.cancellationFeeAmount,
        refundedAmount: cancellationAmounts.refundAmount,
        ...(optionalText(input.note) ? { note: optionalText(input.note) } : {}),
        recordVersion: { increment: 1 },
      },
    });
    await tx.posTransaction.updateMany({
      where: {
        id: order.sourceTransactionId,
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: PosTransactionStatus.PARKED,
      },
      data: {
        status: PosTransactionStatus.VOIDED,
        recordVersion: { increment: 1 },
      },
    });
    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: isLayaway ? "LAYAWAY_CANCELLED" : "SALES_ORDER_CANCELLED",
        actorLabel: user.loginId,
        targetType: isLayaway ? "Layaway" : "Sales order",
        targetRef: order.orderNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} cancelled online ${isLayaway ? "layaway" : "sales order"} ${order.orderNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          orderNo: order.orderNo,
          cancellationFeeAmount: cancellationAmounts.cancellationFeeAmount,
          refundedAmount: cancellationAmounts.refundAmount,
          refundPaymentCount,
        } satisfies Prisma.InputJsonValue),
      },
    });

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      isLayaway,
      refundAmount: cancellationAmounts.refundAmount,
    };
  });
  const salesOrder = await getOnlineStoreSalesOrderSummaryById({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    orderId: result.orderId,
  });

  return {
    orderId: result.orderId,
    orderNo: result.orderNo,
    status: SalesOrderStatus.CANCELLED,
    salesOrder,
    message: result.isLayaway
      ? `${result.orderNo} was cancelled and ${result.refundAmount.toFixed(2)} was refunded.`
      : `${result.orderNo} was cancelled.`,
    serverProcessedAt: new Date().toISOString(),
  };
}

export async function receiveOnlineStoreLayawayPayment(
  orderId: string,
  input: ReceiveOnlineStoreLayawayPaymentRequest,
): Promise<OnlineStoreLayawayActionResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "receiving a layaway payment",
  );

  if (!sessionHasAllPermissions(session, ["pos.layaway.payment.receive"])) {
    throw new Error("Your role is not allowed to receive layaway payments.");
  }

  const requestedOrderId = optionalText(orderId);
  const paymentInputs = Array.isArray(input.payments) ? input.payments : [];
  const requestedAmount = toMoney(
    paymentInputs.reduce(
      (sum, payment, index) =>
        sum + normalizeMoney(payment.amount ?? 0, `layaway payment row ${index + 1}`),
      0,
    ),
  );

  if (!requestedOrderId || requestedAmount <= 0) {
    throw new Error("Add at least one payment before receiving a layaway installment.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: {
        id: requestedOrderId,
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: SalesOrderStatus.OPEN,
        orderType: "LAYAWAY",
      },
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
    });

    if (!order) {
      throw new Error("Flash ERP could not find that open layaway.");
    }
    if (requestedAmount > Number(order.balanceAmount) + 0.005) {
      throw new Error(
        `The payment exceeds the layaway balance by ${toMoney(requestedAmount - Number(order.balanceAmount)).toFixed(2)}.`,
      );
    }

    const { shift } = await ensureOnlineRegisterShift(tx, { session, user, store });
    const preparedPayments = await prepareOnlinePayments(
      tx,
      session.retailOrgId,
      paymentInputs,
      requestedAmount,
      {
        allowChange: false,
        settlementLabel: "layaway installment",
        paymentPurpose: "LAYAWAY_INSTALLMENT",
        receiptContext: {
          shiftId: shift.id,
          shiftNo: shift.shiftNo,
          terminalCode: onlineTerminalCode,
          cashierCode: user.loginId,
        },
      },
    );
    const paidAmount = toMoney(Number(order.paidAmount) + preparedPayments.paymentTotal);
    const balanceAmount = toMoney(Math.max(0, Number(order.totalAmount) - paidAmount));

    await tx.posTransaction.update({
      where: { id: order.sourceTransactionId },
      data: {
        paidAmount,
        payments: { create: preparedPayments.payments },
        recordVersion: { increment: 1 },
      },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        paidAmount,
        balanceAmount,
        ...(optionalText(input.note) ? { note: optionalText(input.note) } : {}),
        recordVersion: { increment: 1 },
      },
    });
    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "LAYAWAY_PAYMENT_RECEIVED",
        actorLabel: user.loginId,
        targetType: "Layaway",
        targetRef: order.orderNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} received ${preparedPayments.paymentTotal.toFixed(2)} for ${order.orderNo}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          orderNo: order.orderNo,
          amount: preparedPayments.paymentTotal,
          paidAmount,
          balanceAmount,
          shiftNo: shift.shiftNo,
        } satisfies Prisma.InputJsonValue),
      },
    });

    return { orderId: order.id, orderNo: order.orderNo, amount: preparedPayments.paymentTotal };
  });
  const salesOrder = await getOnlineStoreSalesOrderSummaryById({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    orderId: result.orderId,
  });

  return {
    salesOrder,
    message: `${result.amount.toFixed(2)} was received for ${result.orderNo}.`,
    serverProcessedAt: new Date().toISOString(),
  };
}

export async function releaseOnlineStoreLayawayReservation(
  orderId: string,
  input: { reason?: string | null },
): Promise<OnlineStoreLayawayActionResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "releasing a layaway stock reservation",
  );

  if (!sessionHasAllPermissions(session, ["pos.layaway.reservation.release"])) {
    throw new Error("Your role is not allowed to release layaway stock reservations.");
  }

  const requestedOrderId = optionalText(orderId);
  const reason = optionalText(input.reason);

  if (!requestedOrderId || !reason) {
    throw new Error("Enter a reason before releasing a layaway stock reservation.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: {
        id: requestedOrderId,
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: SalesOrderStatus.OPEN,
        orderType: "LAYAWAY",
      },
      select: { id: true, orderNo: true, reservationStatus: true },
    });

    if (!order || order.reservationStatus !== "ACTIVE") {
      throw new Error("Flash ERP could not find an active reservation for that open layaway.");
    }

    const releasedAt = new Date();
    await tx.salesOrderInventoryReservation.updateMany({
      where: { salesOrderId: order.id, status: "ACTIVE" },
      data: { status: "RELEASED", releaseReason: reason, releasedAt },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        reservationStatus: "RELEASED",
        reservationReleasedAt: releasedAt,
        recordVersion: { increment: 1 },
      },
    });
    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "LAYAWAY_RESERVATION_RELEASED",
        actorLabel: user.loginId,
        targetType: "Layaway",
        targetRef: order.orderNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} released the stock reservation for ${order.orderNo}.`,
        detailsJson: serializeJsonField({ storeCode: store.code, reason } satisfies Prisma.InputJsonValue),
      },
    });
    return { orderId: order.id, orderNo: order.orderNo };
  });
  const salesOrder = await getOnlineStoreSalesOrderSummaryById({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    orderId: result.orderId,
  });

  return {
    salesOrder,
    message: `${result.orderNo} stock reservation was released.`,
    serverProcessedAt: new Date().toISOString(),
  };
}

export async function expireOnlineStoreLayaway(
  orderId: string,
  input: { reason?: string | null },
): Promise<OnlineStoreLayawayActionResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("expiring a layaway");

  if (!sessionHasAllPermissions(session, ["pos.layaway.reservation.release"])) {
    throw new Error("Your role is not allowed to expire layaways.");
  }

  const requestedOrderId = optionalText(orderId);
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: {
        id: requestedOrderId ?? "",
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: SalesOrderStatus.OPEN,
        orderType: "LAYAWAY",
      },
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        layawayExpiresAt: true,
      },
    });

    if (!order?.layawayExpiresAt) {
      throw new Error("Flash ERP could not find an open layaway with an expiry date.");
    }

    const expiredAt = new Date();

    if (order.layawayExpiresAt.getTime() > expiredAt.getTime()) {
      throw new Error(`${order.orderNo} is not due to expire yet.`);
    }

    const reason = optionalText(input.reason) ?? "Layaway expired before fulfilment.";
    await tx.salesOrderInventoryReservation.updateMany({
      where: { salesOrderId: order.id, status: "ACTIVE" },
      data: { status: "EXPIRED", releaseReason: reason, releasedAt: expiredAt },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: "EXPIRED",
        reservationStatus: "EXPIRED",
        reservationReleasedAt: expiredAt,
        expiredAt,
        note: reason,
        recordVersion: { increment: 1 },
      },
    });
    await tx.posTransaction.updateMany({
      where: { id: order.sourceTransactionId, status: PosTransactionStatus.PARKED },
      data: { status: PosTransactionStatus.VOIDED, recordVersion: { increment: 1 } },
    });
    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "LAYAWAY_EXPIRED",
        actorLabel: user.loginId,
        targetType: "Layaway",
        targetRef: order.orderNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} expired ${order.orderNo}.`,
        detailsJson: serializeJsonField({ storeCode: store.code, reason } satisfies Prisma.InputJsonValue),
      },
    });
    return { orderId: order.id, orderNo: order.orderNo };
  });
  const salesOrder = await getOnlineStoreSalesOrderSummaryById({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    orderId: result.orderId,
  });

  return {
    salesOrder,
    message: `${result.orderNo} expired and its stock reservation was released.`,
    serverProcessedAt: new Date().toISOString(),
  };
}

export async function createOnlineStoreSalesOrderFulfilmentTransfers(
  input: CreateOnlineStoreSalesOrderFulfilmentTransferRequest
): Promise<CreateOnlineStoreSalesOrderFulfilmentTransferResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "creating sales order fulfilment transfer-outs"
  );

  if (!sessionHasAllPermissions(session, ["inventory.transfer.request"])) {
    throw new Error("Flash ERP requires transfer request privileges before creating sales order transfer-outs.");
  }

  const configuredFulfilmentStoreId = readOnlineSalesOrderFulfilmentStoreId(
    store.retailOrg.companySettingsJson
  );

  if (!configuredFulfilmentStoreId || configuredFulfilmentStoreId !== store.id) {
    throw new Error("This shop is not the configured sales order fulfilment shop.");
  }

  const requestedOrderIds = [
    ...new Set(
      (Array.isArray(input.salesOrderIds) ? input.salesOrderIds : [])
        .map((value) => optionalText(value))
        .filter((value): value is string => Boolean(value))
    )
  ];

  if (requestedOrderIds.length === 0) {
    throw new Error("Select at least one open sales order before creating transfer-outs.");
  }

  const operatorNote = optionalText(input.note);

  return prisma.$transaction(async (tx) => {
    const selectedOrders = await tx.salesOrder.findMany({
      where: {
        id: {
          in: requestedOrderIds
        },
        retailOrgId: session.retailOrgId,
        status: SalesOrderStatus.OPEN,
        storeId: {
          not: store.id
        }
      },
      orderBy: [{ storeId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        orderNo: true,
        sourceTransactionId: true,
        customerNameSnapshot: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });

    if (selectedOrders.length === 0) {
      throw new Error("Choose open sales orders from other shops before creating transfer-outs.");
    }

    const existingTransferRefs = await tx.interStoreTransfer.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        sourceStoreId: store.id,
        externalReference: {
          in: selectedOrders.map((order) => order.orderNo)
        },
        status: {
          not: InterStoreTransferStatus.CANCELLED
        }
      },
      select: {
        externalReference: true
      }
    });
    const alreadyRoutedOrderNos = new Set(
      existingTransferRefs.map((transfer) => transfer.externalReference).filter((value): value is string => Boolean(value))
    );
    const routableOrders = selectedOrders.filter((order) => !alreadyRoutedOrderNos.has(order.orderNo));

    if (routableOrders.length === 0) {
      throw new Error("The selected sales orders already have transfer-outs.");
    }

    const sourceLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        status: RecordStatus.ACTIVE
      },
      orderBy: [
        { useForSalesOrderDefault: "desc" },
        { useForSalesDefault: "desc" },
        { name: "asc" }
      ],
      select: {
        id: true,
        code: true,
        warehouseId: true
      }
    });

    if (!sourceLocation) {
      throw new Error("Flash ERP could not find an active source location for the fulfilment shop.");
    }

    const sourceTransactionIds = routableOrders.map((order) => order.sourceTransactionId);
    const orderLines = await tx.posTransactionLine.findMany({
      where: {
        posTransactionId: {
          in: sourceTransactionIds
        },
        lineIntent: PosTransactionLineIntent.SALE
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        posTransactionId: true,
        productCodeSnapshot: true,
        productNameSnapshot: true,
        quantity: true,
        sellingUnitOfMeasure: true,
        baseUnitOfMeasure: true,
        uomConversionFactor: true,
        baseQuantity: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            productType: true,
            trackInventory: true,
            isSerialized: true,
            baseCostPrice: true
          }
        }
      }
    });
    const linesBySourceTransactionId = new Map<string, typeof orderLines>();

    for (const line of orderLines) {
      linesBySourceTransactionId.set(line.posTransactionId, [
        ...(linesBySourceTransactionId.get(line.posTransactionId) ?? []),
        line
      ]);
    }

    const destinationStoreIds = [...new Set(routableOrders.map((order) => order.store.id))];
    const destinationLocations = new Map<string, {
      id: string;
      code: string;
      warehouseId: string | null;
    }>();

    for (const destinationStoreId of destinationStoreIds) {
      const destinationLocation = await tx.inventoryLocation.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          storeId: destinationStoreId,
          status: RecordStatus.ACTIVE
        },
        orderBy: [
          { useForReceivingDefault: "desc" },
          { useForSalesOrderDefault: "desc" },
          { useForSalesDefault: "desc" },
          { name: "asc" }
        ],
        select: {
          id: true,
          code: true,
          warehouseId: true
        }
      });

      if (!destinationLocation) {
        const destinationStore = routableOrders.find((order) => order.store.id === destinationStoreId)?.store;
        throw new Error(
          `Flash ERP could not find an active destination location for ${destinationStore?.name ?? "one selected shop"}.`
        );
      }

      destinationLocations.set(destinationStoreId, destinationLocation);
    }

    const now = new Date();
    const timestamp = now.getTime();
    const ordersByDestinationStoreId = new Map<string, typeof routableOrders>();

    for (const order of routableOrders) {
      ordersByDestinationStoreId.set(order.store.id, [
        ...(ordersByDestinationStoreId.get(order.store.id) ?? []),
        order
      ]);
    }

    const createdBatches: CreateOnlineStoreSalesOrderFulfilmentTransferResponse["createdBatches"] = [];
    const createdTransfers: CreateOnlineStoreSalesOrderFulfilmentTransferResponse["createdTransfers"] = [];
    let batchIndex = 0;

    for (const [destinationStoreId, destinationOrders] of ordersByDestinationStoreId.entries()) {
      const destinationLocation = destinationLocations.get(destinationStoreId);
      const destinationStore = destinationOrders[0]?.store;

      if (!destinationLocation || !destinationStore) {
        continue;
      }

      const transferLines = destinationOrders.flatMap((order) =>
        (linesBySourceTransactionId.get(order.sourceTransactionId) ?? [])
          .filter((line) => isOnlineStoreStockManagedProduct(line.product))
          .map((line) => ({
            order,
            line,
            quantity: toQuantity(line.baseQuantity ?? line.quantity)
          }))
      ).filter((entry) => entry.quantity > 0);

      if (transferLines.length === 0) {
        continue;
      }

      batchIndex += 1;
      const transferBatchNo = `SO-TRF-${store.code.toUpperCase()}-${destinationStore.code.toUpperCase()}-${timestamp}-${batchIndex}`;

      for (const [lineIndex, entry] of transferLines.entries()) {
        const transferNo = `${transferBatchNo}-${lineIndex + 1}`;
        const transfer = await tx.interStoreTransfer.create({
          data: {
            retailOrgId: session.retailOrgId,
            sourceStoreId: store.id,
            destinationStoreId: destinationStore.id,
            sourceInventoryLocationId: sourceLocation.id,
            destinationInventoryLocationId: destinationLocation.id,
            productId: entry.line.product.id,
            transferNo,
            transferBatchNo,
            lineNo: lineIndex + 1,
            externalReference: entry.order.orderNo,
            origin: InterStoreTransferOrigin.ENTERPRISE,
            status: InterStoreTransferStatus.REQUESTED,
            requestedQuantity: entry.quantity,
            requestedUnitOfMeasure:
              entry.line.sellingUnitOfMeasure ?? entry.line.baseUnitOfMeasure ?? "EA",
            requestedUnitQuantity: toQuantity(entry.line.quantity),
            uomConversionFactor: Number(entry.line.uomConversionFactor ?? 1),
            baseUnitOfMeasure:
              entry.line.baseUnitOfMeasure ?? entry.line.sellingUnitOfMeasure ?? "EA",
            unitCost: entry.line.product.baseCostPrice ? Number(entry.line.product.baseCostPrice) : null,
            requestNote:
              operatorNote ??
              `Sales order ${entry.order.orderNo} for ${entry.order.customerNameSnapshot ?? "Customer"}.`,
            requestOperatorName: user.displayName,
            requestedByNodeCode: "ONLINE_DIRECT",
            sourceNodeCode: "ONLINE_DIRECT",
            requestedAt: now
          },
          select: {
            id: true,
            transferNo: true,
            transferBatchNo: true
          }
        });

        createdTransfers.push({
          transferId: transfer.id,
          transferNo: transfer.transferNo,
          transferBatchNo: transfer.transferBatchNo ?? transferBatchNo,
          salesOrderNo: entry.order.orderNo,
          destinationStoreCode: destinationStore.code,
          productCode: entry.line.product.code,
          quantity: entry.quantity
        });

        await queueInterStoreTransferPublication(tx, {
          transferId: transfer.id,
          publishedAt: now
        });
      }

      createdBatches.push({
        transferBatchNo,
        destinationStoreId: destinationStore.id,
        destinationStoreCode: destinationStore.code,
        destinationStoreName: destinationStore.name,
        salesOrderNos: [...new Set(destinationOrders.map((order) => order.orderNo))],
        lineCount: transferLines.length,
        quantity: toQuantity(transferLines.reduce((sum, entry) => sum + entry.quantity, 0))
      });
    }

    if (createdTransfers.length === 0) {
      throw new Error("The selected sales orders do not have inventory-tracked lines to transfer.");
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "SALES_ORDER_TRANSFER_OUT_CREATED",
        actorLabel: user.loginId,
        targetType: "Sales order fulfilment",
        targetRef: createdBatches.map((batch) => batch.transferBatchNo).join(", "),
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} created ${createdBatches.length} sales order transfer-out batch(es) from ${store.code}.`,
        detailsJson: serializeJsonField({
          sourceStoreCode: store.code,
          batchCount: createdBatches.length,
          transferLineCount: createdTransfers.length,
          salesOrderNos: [...new Set(createdTransfers.map((transfer) => transfer.salesOrderNo))]
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      createdBatches,
      createdTransfers,
      message: `Flash ERP created ${createdBatches.length} transfer-out batch(es) for ${createdTransfers.length} sales order line(s).`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function recordOnlineStoreAccountPayment(
  input: RecordOnlineStoreAccountPaymentRequest
): Promise<RecordOnlineStoreAccountPaymentResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("recording an Online POS account payment");
  const customerId = optionalText(input.customerId);
  const tenderMethodCode = optionalText(input.tenderMethodCode);
  const amount = normalizeMoney(input.amount, "account payment");
  const reference = optionalText(input.reference);
  const note = optionalText(input.note);

  if (!customerId) {
    throw new Error("Choose a customer before recording an account payment.");
  }

  if (!tenderMethodCode) {
    throw new Error("Choose a tender method before recording an account payment.");
  }

  if (amount <= 0) {
    throw new Error("Enter an account payment amount greater than zero.");
  }

  if (!sessionHasAllPermissions(session, ["pos.customer.account.collect"])) {
    throw new Error("Flash ERP requires customer account collection privileges before recording account payments.");
  }

  return prisma.$transaction(async (tx) => {
    const customer = await findOnlineStoreCustomer(tx, session.retailOrgId, customerId);

    if (!customer) {
      throw new Error("Choose an active customer before recording an account payment.");
    }

    const currentBalance = Number(customer.receivableBalanceAmount);

    if (currentBalance + 0.0001 < amount) {
      throw new Error(`Flash ERP cannot collect more than ${customer.fullName}'s outstanding receivable balance.`);
    }

    const { terminal, shift } = await ensureOnlineRegisterShift(tx, {
      session,
      user,
      store
    });
    const preparedPayments = await prepareOnlinePayments(
      tx,
      session.retailOrgId,
      [
        {
          tenderMethodCode,
          bankAccountId: input.bankAccountId ?? null,
          amount,
          reference
        }
      ],
      amount,
      {
        allowChange: false,
        settlementLabel: "customer account payment"
      }
    );
    const payment = preparedPayments.payments[0];

    if (payment?.method === PaymentMethod.STORE_CREDIT) {
      throw new Error("Store Credit cannot be used to settle a customer receivable balance.");
    }

    const occurredAt = new Date();
    const resultingReceivableBalance = toMoney(currentBalance - amount);
    const entryNo = `WEB-ACP-${store.code.toUpperCase()}-${Date.now()}`;
    const noteParts = [
      `Collected through ${onlineTerminalCode}.`,
      `Shift ${shift.shiftNo}.`,
      `Cashier ${user.loginId}.`,
      payment?.tenderMethodNameSnapshot
        ? `Tender ${payment.tenderMethodNameSnapshot} (${payment.method}).`
        : `Tender ${tenderMethodCode}.`,
      reference ? `Reference ${reference}.` : null,
      note
    ].filter((value): value is string => Boolean(value));

    await tx.customer.update({
      where: {
        id: customer.id
      },
      data: {
        receivableBalanceAmount: resultingReceivableBalance,
        lastModifiedByNodeCode: "ONLINE_DIRECT",
        recordVersion: {
          increment: 1
        }
      }
    });

    const entry = await tx.customerAccountEntry.create({
      data: {
        retailOrgId: session.retailOrgId,
        customerId: customer.id,
        storeId: store.id,
        terminalId: terminal.id,
        posTransactionId: null,
        ...(input.bankAccountId && payment?.bankAccountNumberSnapshot
          ? {
              bankAccountId: input.bankAccountId
            }
          : {}),
        entryType: CustomerAccountEntryType.ACCOUNT_PAYMENT,
        transactionNoSnapshot: entryNo,
        sourceTransactionNoSnapshot: reference,
        bankCodeSnapshot: payment?.bankCodeSnapshot ?? null,
        bankNameSnapshot: payment?.bankNameSnapshot ?? null,
        bankBranchCodeSnapshot: payment?.bankBranchCodeSnapshot ?? null,
        bankBranchNameSnapshot: payment?.bankBranchNameSnapshot ?? null,
        bankAccountNumberSnapshot: payment?.bankAccountNumberSnapshot ?? null,
        bankAccountNameSnapshot: payment?.bankAccountNameSnapshot ?? null,
        receivableDeltaAmount: amount * -1,
        loyaltyPointsDelta: 0,
        resultingReceivableBalance,
        resultingLoyaltyPointsBalance: customer.loyaltyPointsBalance,
        note: noteParts.join(" "),
        originNodeCode: "ONLINE_DIRECT",
        occurredAt
      },
      select: {
        id: true,
        transactionNoSnapshot: true,
        sourceTransactionNoSnapshot: true,
        receivableDeltaAmount: true,
        note: true,
        occurredAt: true
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "ACCOUNT_PAYMENT_RECORDED",
        actorLabel: user.loginId,
        targetType: "Customer",
        targetRef: customer.customerNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} collected ${amount.toFixed(2)} from ${customer.fullName} through Online POS ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          entryNo,
          amount,
          resultingReceivableBalance
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      accountPayment: {
        entryId: entry.id,
        entryNo: entry.transactionNoSnapshot ?? entryNo,
        customerId: customer.id,
        customerNo: customer.customerNo,
        customerName: customer.fullName,
        amount: Math.abs(Number(entry.receivableDeltaAmount)),
        reference: entry.sourceTransactionNoSnapshot,
        note: entry.note,
        occurredAt: entry.occurredAt.toISOString()
      },
      receipt: {
        entryNo: entry.transactionNoSnapshot ?? entryNo,
        retailOrgName: readOnlineStoreBranding(store.retailOrg).tradingName,
        companyLogoUrl: readOnlineStoreBranding(store.retailOrg).companyLogoUrl,
        storeCode: store.code,
        storeName: store.name,
        storePhone: store.phone ?? null,
        storeLocation: store.location ?? null,
        storeAddress: store.addressLine1 ?? null,
        storeAddressLine2: store.addressLine2 ?? null,
        terminalCode: onlineTerminalCode,
        shiftNo: shift.shiftNo,
        customerNo: customer.customerNo,
        customerName: customer.fullName,
        cashierCode: user.loginId,
        paymentMethod: String(payment?.method ?? preparedPayments.payments[0]?.method ?? PaymentMethod.CASH),
        tenderMethodName: payment?.tenderMethodNameSnapshot ?? null,
        amount,
        remainingBalanceAmount: resultingReceivableBalance,
        reference,
        note,
        occurredAt: entry.occurredAt.toISOString(),
        currencyCode: store.currencyCode,
        timezone: store.timezone,
        receiptHeader: store.receiptHeader,
        receiptFooter: store.receiptFooter,
        accountPaymentReceiptTemplateHtml:
          store.accountPaymentReceiptTemplate?.templateHtml ??
          store.accountPaymentReceiptTemplateHtml ??
          defaultAccountPaymentReceiptTemplateHtml
      },
      message:
        resultingReceivableBalance <= 0
          ? `${entryNo} collected ${amount.toFixed(2)} from ${customer.fullName}. The receivable is fully settled.`
          : `${entryNo} collected ${amount.toFixed(2)} from ${customer.fullName}. Remaining receivable balance is ${resultingReceivableBalance.toFixed(2)}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

async function requireOnlineStoreForOperation(operationLabel: string) {
  await Promise.all([
    ensureInventoryLocationSalesOrderSchemaCompatibility(),
    ensureOperatingExpenseSchemaCompatibility(),
    ensureAlternateUomSellingSchemaCompatibility(),
    ensureLayawayLifecycleSchemaCompatibility(),
    ensureProductVariantSalesOrderDepositSchemaCompatibility()
  ]);

  const assignment = await getOnlineStoreAssignment({
    redirectOnMissingSession: false
  });

  if (!assignment.user?.homeStore) {
    throw new Error(`Assign your user profile to a home store before ${operationLabel}.`);
  }

  if (!assignment.store) {
    throw new Error(`Your home store must be an Online POS shop before ${operationLabel}.`);
  }

  await ensureOnlineStoreInventoryTopology(prisma, {
    retailOrgId: assignment.session.retailOrgId,
    store: assignment.store
  });

  return {
    session: assignment.session,
    user: assignment.user,
    store: assignment.store
  };
}

export async function unlockOnlineStoreScreen(
  input: OnlineStoreUnlockRequest
): Promise<OnlineStoreUnlockResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("unlocking the Online POS screen");
  const loginId = optionalText(input.loginId);
  const password = typeof input.password === "string" ? input.password : "";

  if (!loginId || !password) {
    throw new Error("Enter your login ID and password to unlock the Online POS.");
  }

  if (loginId.toUpperCase() !== user.loginId.toUpperCase()) {
    throw new Error("Unlock this browser with the signed-in Online POS operator.");
  }

  const operator = await prisma.retailUser.findFirst({
    where: {
      id: user.id,
      retailOrgId: session.retailOrgId,
      deletedAt: null
    },
    select: {
      loginId: true,
      displayName: true,
      passwordHash: true,
      accountStatus: true
    }
  });
  const passwordMatches = operator?.passwordHash ? await bcrypt.compare(password, operator.passwordHash) : false;

  if (!operator || operator.accountStatus !== UserAccountStatus.ACTIVE || !passwordMatches) {
    await prisma.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.WARNING,
        category: "ONLINE_STORE_LOCK",
        action: "SCREEN_UNLOCK_FAILED",
        actorLabel: user.loginId,
        targetType: "Online POS",
        targetRef: store.code,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} failed to unlock Online POS screen for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          attemptedLoginId: loginId
        } satisfies Prisma.InputJsonValue)
      }
    });
    throw new Error("Flash ERP could not unlock the screen with those credentials.");
  }

  await prisma.securityLog.create({
    data: {
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "ONLINE_STORE_LOCK",
      action: "SCREEN_UNLOCKED",
      actorLabel: user.loginId,
      targetType: "Online POS",
      targetRef: store.code,
      sourceNodeCode: "ONLINE_DIRECT",
      message: `${user.loginId} unlocked Online POS screen for ${store.code}.`,
      detailsJson: serializeJsonField({
        storeCode: store.code
      } satisfies Prisma.InputJsonValue)
    }
  });

  return {
    operator: {
      loginId: operator.loginId,
      displayName: operator.displayName
    },
    message: "Flash ERP unlocked the Online POS.",
    serverProcessedAt: new Date().toISOString()
  };
}

function assertOnlineStoreSupervisor(session: Awaited<ReturnType<typeof getOnlineStoreAssignment>>["session"]) {
  if (!sessionHasAllPermissions(session, [], { requireSupervisorEligible: true })) {
    throw new Error("Flash ERP needs an online-store supervisor before capturing store expenses.");
  }
}

export async function upsertOnlineStoreExpense(
  input: UpsertOnlineStoreExpenseRequest
): Promise<OnlineStoreExpenseMutationResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("capturing a store expense");
  assertOnlineStoreSupervisor(session);

  const expenseId = optionalText(input.expenseId);
  const category = optionalText(input.category)?.toUpperCase() ?? "GENERAL";
  const description = optionalText(input.description);
  const amount = toMoney(Number(input.amount ?? 0));
  const taxAmount = toMoney(Number(input.taxAmount ?? 0));
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();

  if (!description) {
    throw new Error("Enter the expense details before saving.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid expense amount greater than zero.");
  }

  if (!Number.isFinite(taxAmount) || taxAmount < 0) {
    throw new Error("Enter a valid tax amount or leave it at zero.");
  }

  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error("Choose a valid expense date.");
  }

  const now = new Date();
  const data = {
    expenseDate,
    category,
    description,
    supplierName: optionalText(input.supplierName),
    paymentMethod: optionalText(input.paymentMethod),
    externalReference: optionalText(input.externalReference),
    attachmentFileName: optionalText(input.attachmentFileName),
    attachmentUrl: optionalText(input.attachmentUrl),
    amount,
    taxAmount,
    note: optionalText(input.note)
  };

  const existingExpense = expenseId
    ? await prisma.operatingExpense.findFirst({
        where: {
          id: expenseId,
          retailOrgId: session.retailOrgId,
          storeId: store.id
        },
        select: {
          id: true,
          status: true
        }
      })
    : null;

  if (expenseId && !existingExpense) {
    throw new Error("Flash ERP could not find that draft store expense for this Online POS.");
  }

  if (existingExpense && existingExpense.status !== OperatingExpenseStatus.DRAFT) {
    throw new Error("Only draft store expenses can be edited from the Online POS.");
  }

  const expense = existingExpense
    ? await prisma.operatingExpense.update({
        where: {
          id: existingExpense.id
        },
        data,
        select: {
          id: true,
          expenseNo: true,
          status: true
        }
      })
    : await prisma.operatingExpense.create({
        data: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          expenseNo: `EXP-${store.code.toUpperCase()}-${Date.now()}`,
          status: OperatingExpenseStatus.DRAFT,
          ...data
        },
        select: {
          id: true,
          expenseNo: true,
          status: true
        }
      });

  await prisma.securityLog.create({
    data: {
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "ONLINE_STORE_EXPENSE",
      action: "EXPENSE_SAVED",
      actorLabel: user.loginId,
      targetType: "Operating expense",
      targetRef: expense.expenseNo,
      sourceNodeCode: "ONLINE_DIRECT",
      message: `${user.loginId} saved store expense ${expense.expenseNo} for ${store.code}.`,
      detailsJson: serializeJsonField({
        storeCode: store.code,
        amount,
        taxAmount,
        category
      } satisfies Prisma.InputJsonValue)
    }
  });

  return {
    expenseId: expense.id,
    expenseNo: expense.expenseNo,
    status: expense.status,
    message: `${expense.expenseNo} saved as a draft store expense.`,
    serverProcessedAt: now.toISOString()
  };
}

export async function confirmOnlineStoreExpense(
  expenseId: string
): Promise<OnlineStoreExpenseMutationResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("confirming a store expense");
  assertOnlineStoreSupervisor(session);
  const now = new Date();
  const expense = await prisma.operatingExpense.findFirst({
    where: {
      id: expenseId,
      retailOrgId: session.retailOrgId,
      storeId: store.id
    },
    select: {
      id: true,
      expenseNo: true,
      status: true
    }
  });

  if (!expense) {
    throw new Error("Flash ERP could not find that store expense.");
  }

  if (expense.status !== OperatingExpenseStatus.DRAFT) {
    throw new Error("Only draft store expenses can be confirmed from the Online POS.");
  }

  const confirmed = await prisma.operatingExpense.update({
    where: {
      id: expense.id
    },
    data: {
      status: OperatingExpenseStatus.APPROVED,
      confirmedBy: user.displayName,
      confirmedAt: now,
      approvedBy: user.displayName,
      approvedAt: now
    },
    select: {
      id: true,
      expenseNo: true,
      status: true
    }
  });

  await prisma.securityLog.create({
    data: {
      retailOrgId: session.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "ONLINE_STORE_EXPENSE",
      action: "EXPENSE_CONFIRMED",
      actorLabel: user.loginId,
      targetType: "Operating expense",
      targetRef: confirmed.expenseNo,
      sourceNodeCode: "ONLINE_DIRECT",
      message: `${user.loginId} confirmed store expense ${confirmed.expenseNo} for HQ finance review.`,
      detailsJson: serializeJsonField({
        storeCode: store.code
      } satisfies Prisma.InputJsonValue)
    }
  });

  return {
    expenseId: confirmed.id,
    expenseNo: confirmed.expenseNo,
    status: confirmed.status,
    message: `${confirmed.expenseNo} confirmed for HQ finance review.`,
    serverProcessedAt: now.toISOString()
  };
}

export async function lookupOnlineStoreRemoteInventory(
  input: OnlineStoreRemoteInventoryLookupRequest = {}
): Promise<OnlineStoreRemoteInventoryLookupResponse> {
  const { session, store } = await requireOnlineStoreForOperation("looking up HQ inventory");

  if (!sessionHasAllPermissions(session, ["inventory.view"])) {
    throw new Error("Flash ERP requires inventory visibility privileges before looking up HQ stock.");
  }

  const query = optionalText(input.query);
  const productCode = optionalText(input.productCode);
  const storeCode = optionalText(input.storeCode);
  const locationCode = optionalText(input.locationCode);
  const requestedLimit = Number(input.limit ?? 30);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, Math.trunc(requestedLimit)))
    : 30;
  const productWhere: Prisma.ProductWhereInput = {
    retailOrgId: session.retailOrgId,
    status: RecordStatus.ACTIVE,
    deletedAt: null
  };

  if (productCode) {
    productWhere.code = productCode;
  } else if (query) {
    productWhere.OR = [
      { code: { contains: query } },
      { sku: { contains: query } },
      { name: { contains: query } },
      { shortName: { contains: query } }
    ];
  }

  const [products, locations] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        code: true,
        name: true,
        department: true,
        category: true,
        subcategory: true,
        safetyStockLevel: true,
        baseUnitPrice: true,
        priceListEntries: {
          where: {
            priceList: {
              isDefault: true,
              status: RecordStatus.ACTIVE
            }
          },
          select: {
            unitPrice: true
          },
          take: 1
        }
      },
      orderBy: {
        name: "asc"
      },
      take: limit
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE,
        storeId: {
          not: store.id
        },
        store: {
          ...(storeCode ? { code: storeCode } : {}),
          status: RecordStatus.ACTIVE
        },
        ...(locationCode ? { code: locationCode } : {})
      },
      select: {
        id: true,
        code: true,
        name: true,
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    })
  ]);
  const productIds = products.map((product) => product.id);
  const locationIds = locations.map((location) => location.id);

  if (!productIds.length || !locationIds.length) {
    return {
      rows: [],
      serverProcessedAt: new Date().toISOString()
    };
  }

  const [balances, activeReservationGroups, ecommerceFulfillmentLocations] =
    await Promise.all([
      prisma.inventoryLedgerEntry.groupBy({
        by: ["inventoryLocationId", "productId"],
        where: {
          retailOrgId: session.retailOrgId,
          inventoryLocationId: {
            in: locationIds
          },
          productId: {
            in: productIds
          }
        },
        _sum: {
          quantity: true
        },
        _max: {
          occurredAt: true
        }
      }),
      prisma.salesOrderInventoryReservation.groupBy({
        by: ["inventoryLocationId", "productCodeSnapshot"],
        where: {
          inventoryLocationId: {
            in: locationIds
          },
          productCodeSnapshot: {
            in: products.map((product) => product.code)
          },
          status: "ACTIVE",
          salesOrder: {
            retailOrgId: session.retailOrgId
          }
        },
        _sum: {
          baseQuantity: true
        }
      }),
      prisma.ecommerceFulfillmentLocation.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          inventoryLocationId: {
            in: locationIds
          },
          status: RecordStatus.ACTIVE,
          storefrontStore: {
            status: RecordStatus.ACTIVE,
            ecommerceEnabled: true
          }
        },
        orderBy: [
          { inventoryLocationId: "asc" },
          { routingPriority: "asc" },
          { storefrontStore: { name: "asc" } }
        ],
        select: {
          inventoryLocationId: true,
          supportsPickup: true,
          supportsDelivery: true,
          routingPriority: true,
          storefrontStore: {
            select: {
              name: true
            }
          }
        }
      })
    ]);
  const productsById = new Map(products.map((product) => [product.id, product] as const));
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));
  const activeReservedByLocationProduct = new Map(
    activeReservationGroups.map((group) => [
      `${group.inventoryLocationId}:${group.productCodeSnapshot.trim().toUpperCase()}`,
      toQuantity(group._sum.baseQuantity)
    ] as const)
  );
  const ecommerceEligibilityByLocation = new Map<
    string,
    {
      supportsPickup: boolean;
      supportsDelivery: boolean;
      labels: string[];
    }
  >();

  for (const fulfillmentLocation of ecommerceFulfillmentLocations) {
    const current = ecommerceEligibilityByLocation.get(
      fulfillmentLocation.inventoryLocationId
    );
    const modes = [
      fulfillmentLocation.supportsPickup ? "pickup" : null,
      fulfillmentLocation.supportsDelivery ? "delivery" : null
    ].filter((value): value is string => Boolean(value));
    const label = `${fulfillmentLocation.storefrontStore.name}: ${modes.length ? modes.join(" + ") : "disabled"} (priority ${fulfillmentLocation.routingPriority})`;

    if (current) {
      current.supportsPickup ||= fulfillmentLocation.supportsPickup;
      current.supportsDelivery ||= fulfillmentLocation.supportsDelivery;
      current.labels.push(label);
    } else {
      ecommerceEligibilityByLocation.set(fulfillmentLocation.inventoryLocationId, {
        supportsPickup: fulfillmentLocation.supportsPickup,
        supportsDelivery: fulfillmentLocation.supportsDelivery,
        labels: [label]
      });
    }
  }
  const rowsByStoreAndProduct = new Map<
    string,
    OnlineStoreRemoteInventoryLookupResponse["rows"][number]
  >();

  for (const balance of balances) {
      const product = productsById.get(balance.productId);
      const location = locationsById.get(balance.inventoryLocationId);
      const quantityOnHand = toQuantity(balance._sum.quantity);

      if (!product || !location?.store) {
        continue;
      }

      const key = `${location.store.code}\u0000${product.code}`;
      const existing = rowsByStoreAndProduct.get(key);
      const updatedAt =
        balance._max.occurredAt?.toISOString() ?? new Date().toISOString();
      const activeReservedQuantity =
        activeReservedByLocationProduct.get(
          `${balance.inventoryLocationId}:${product.code.trim().toUpperCase()}`
        ) ?? 0;
      const safetyStockLevel = toQuantity(product.safetyStockLevel);
      const ecommerceEligibility = ecommerceEligibilityByLocation.get(
        balance.inventoryLocationId
      );
      const ecommerceEligible = Boolean(
        ecommerceEligibility?.supportsPickup || ecommerceEligibility?.supportsDelivery
      );
      const ecommerceSellableQuantity = ecommerceEligible
        ? toQuantity(
            Math.max(0, quantityOnHand - activeReservedQuantity - safetyStockLevel)
          )
        : 0;
      const locationBreakdown = {
        locationCode: location.code,
        locationName: location.name,
        quantityOnHand,
        activeReservedQuantity,
        safetyStockLevel,
        ecommerceSellableQuantity,
        ecommercePickupEligible: ecommerceEligibility?.supportsPickup ?? false,
        ecommerceDeliveryEligible: ecommerceEligibility?.supportsDelivery ?? false,
        ecommerceEligibilityLabel:
          ecommerceEligibility?.labels.join("; ") ??
          "Not configured for ecommerce fulfilment"
      };
      rowsByStoreAndProduct.set(key, {
        storeCode: location.store.code,
        storeName: location.store.name,
        locationCode: "",
        locationName: "All active locations",
        productCode: product.code,
        productName: product.name,
        departmentCode: product.department,
        categoryCode: product.category,
        subcategory: product.subcategory,
        quantityOnHand: toQuantity(
          (existing?.quantityOnHand ?? 0) + quantityOnHand
        ),
        activeReservedQuantity: toQuantity(
          (existing?.activeReservedQuantity ?? 0) + activeReservedQuantity
        ),
        safetyStockQuantity: toQuantity(
          (existing?.safetyStockQuantity ?? 0) +
            (ecommerceEligible ? safetyStockLevel : 0)
        ),
        ecommerceSellableQuantity: toQuantity(
          (existing?.ecommerceSellableQuantity ?? 0) +
            ecommerceSellableQuantity
        ),
        ecommercePickupEligible:
          (existing?.ecommercePickupEligible ?? false) ||
          (ecommerceEligibility?.supportsPickup ?? false),
        ecommerceDeliveryEligible:
          (existing?.ecommerceDeliveryEligible ?? false) ||
          (ecommerceEligibility?.supportsDelivery ?? false),
        locationBreakdown: [
          ...(existing?.locationBreakdown ?? []),
          locationBreakdown
        ],
        unitPrice: toMoney(Number(product.priceListEntries[0]?.unitPrice ?? product.baseUnitPrice)),
        updatedAt:
          !existing || new Date(updatedAt) > new Date(existing.updatedAt)
            ? updatedAt
            : existing.updatedAt
      });
  }

  const rows = Array.from(rowsByStoreAndProduct.values())
    .filter((row) => row.quantityOnHand > 0)
    .sort((left, right) => right.quantityOnHand - left.quantityOnHand)
    .slice(0, limit);

  return {
    rows,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function searchOnlineStoreTransactionReferences(
  input: OnlineStoreTransactionReferenceSearchRequest = {}
): Promise<OnlineStoreTransactionReferenceSummary[]> {
  const assignment = await getOnlineStoreAssignment({
    redirectOnMissingSession: false
  });

  if (!assignment.user?.homeStore || !assignment.store) {
    throw new Error("Open an assigned Online POS shop before searching saved transaction references.");
  }

  const { session } = assignment;
  const query = optionalText(input.query);

  if (!query || query.length < 2) {
    return [];
  }

  const parsedLimit = Number(input.limit);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 20)
    : 8;
  const normalizedQuery = query.replace(/\s+/g, " ").trim().toUpperCase();
  const rows = await prisma.transactionReferenceCapture.findMany({
    where: {
      retailOrgId: session.retailOrgId,
      OR: [
        { normalizedReference: { contains: normalizedQuery } },
        { referenceValue: { contains: query } },
        { customerName: { contains: query } },
        { notes: { contains: query } },
        { sourceTransactionNo: { contains: query } }
      ]
    },
    orderBy: [{ lastCapturedAt: "desc" }, { referenceValue: "asc" }],
    take: limit
  });

  return rows.map((row) => ({
    id: row.id,
    reference: row.referenceValue,
    details: row.notes,
    customerName: row.customerName,
    sourceTransactionNo: row.sourceTransactionNo,
    source: row.source,
    lastCapturedAt: row.lastCapturedAt.toISOString()
  }));
}

async function resolveOnlineStoreLocation(input: {
  retailOrgId: string;
  storeId: string;
  locationId?: string | null;
  receiving?: boolean;
  salesOrder?: boolean;
}) {
  const location = await prisma.inventoryLocation.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      status: RecordStatus.ACTIVE,
      ...(input.locationId ? { id: input.locationId } : {})
    },
    orderBy: input.locationId
      ? undefined
      : [
          input.receiving
            ? { useForReceivingDefault: "desc" }
            : input.salesOrder
              ? { useForSalesOrderDefault: "desc" }
              : { useForSalesDefault: "desc" },
          input.salesOrder ? { useForSalesDefault: "desc" } : { useForSalesOrderDefault: "desc" },
          { name: "asc" }
        ],
    select: {
      id: true,
      warehouseId: true,
      code: true,
      name: true,
      store: {
        select: {
          code: true
        }
      }
    }
  });

  if (!location) {
    throw new Error("Flash ERP could not find an active inventory location for this Online POS operation.");
  }

  return location;
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeReportDateStart(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeReportDateEnd(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOnlineReportId(value: unknown): OnlineStoreReportId {
  return value === "products" ||
    value === "serialsBatches" ||
    value === "orders" ||
    value === "layaways" ||
    value === "layawayPayments" ||
    value === "tenders" ||
    value === "inventory" ||
    value === "banking" ||
    value === "shifts"
    ? value
    : "sales";
}

function toPosShiftStatusFilter(value: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized === PosShiftStatus.OPEN || normalized === PosShiftStatus.CLOSED
    ? normalized
    : null;
}

function normalizeOnlineReportCriteria(
  input: OnlineStoreReportCriteria | undefined,
  options: {
    defaultCashierCode: string;
    supervisorScopeAllowed: boolean;
  }
): NormalizedOnlineReportCriteria {
  const today = formatDateInput(new Date());
  const limit = Math.min(Math.max(Math.trunc(Number(input?.limit ?? 100)), 1), 500);
  const requestedScope = input?.scope === "STORE" ? "STORE" : "CASHIER";
  const scope = options.supervisorScopeAllowed ? requestedScope : "CASHIER";
  const cashierCode =
    scope === "CASHIER"
      ? options.defaultCashierCode
      : optionalText(input?.cashierCode);

  return {
    reportId: normalizeOnlineReportId(input?.reportId),
    scope,
    dateFrom: optionalText(input?.dateFrom) ?? today,
    dateTo: optionalText(input?.dateTo) ?? today,
    cashierCode,
    shiftId: optionalText(input?.shiftId),
    searchQuery: optionalText(input?.searchQuery),
    customerQuery: optionalText(input?.customerQuery),
    productQuery: optionalText(input?.productQuery),
    tenderMethodCode: optionalText(input?.tenderMethodCode),
    locationId: optionalText(input?.locationId),
    limit
  };
}

async function buildOnlineReportMetadata(input: {
  retailOrgId: string;
  storeId: string;
  currentCashierCode: string;
  supervisorScopeAllowed: boolean;
  lastCriteria?: OnlineStoreReportCriteria;
}): Promise<OnlineStoreWorkspaceData["reporting"]> {
  const [cashiers, shifts, tenderMethods, locations, retailOrg] = await Promise.all([
    prisma.retailUser.findMany({
      where: {
        retailOrgId: input.retailOrgId,
        homeStoreId: input.storeId,
        accountStatus: UserAccountStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ displayName: "asc" }, { loginId: "asc" }],
      take: 80,
      select: {
        loginId: true,
        displayName: true
      }
    }),
    prisma.posShift.findMany({
      where: {
        retailOrgId: input.retailOrgId,
        storeId: input.storeId
      },
      orderBy: {
        openedAt: "desc"
      },
      take: 80,
      select: {
        id: true,
        shiftNo: true,
        status: true,
        cashierUser: {
          select: {
            loginId: true
          }
        }
      }
    }),
    getActiveTenderMethods(prisma, input.retailOrgId),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: input.retailOrgId,
        storeId: input.storeId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ useForSalesDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true
      }
    }),
    prisma.retailOrg.findUnique({
      where: {
        id: input.retailOrgId
      },
      select: {
        optionsSettingsJson: true
      }
    })
  ]);
  const scopeOptions = [
    { value: "CASHIER", label: "My cashier scope" },
    { value: "STORE", label: "Whole store" }
  ];
  const criteria = normalizeOnlineReportCriteria(input.lastCriteria, {
    defaultCashierCode: input.currentCashierCode,
    supervisorScopeAllowed: input.supervisorScopeAllowed
  });

  return {
    definitions: readOnlineReportDefinitions(retailOrg?.optionsSettingsJson),
    parameters: [
      { parameterId: "dateFrom", label: "From", inputType: "date" },
      { parameterId: "dateTo", label: "To", inputType: "date" },
      { parameterId: "scope", label: "Scope", inputType: "select", options: scopeOptions },
      {
        parameterId: "cashierCode",
        label: "Cashier",
        inputType: "select",
        options: [
          { value: "", label: "All cashiers" },
          ...cashiers.map((cashier) => ({
            value: cashier.loginId,
            label: `${cashier.displayName} (${cashier.loginId})`
          }))
        ]
      },
      {
        parameterId: "shiftId",
        label: "Shift",
        inputType: "select",
        options: [
          { value: "", label: "All shifts" },
          ...shifts.map((shift) => ({
            value: shift.id,
            label: `${shift.shiftNo} · ${shift.status} · ${shift.cashierUser.loginId}`
          }))
        ]
      },
      { parameterId: "customerQuery", label: "Customer", inputType: "text", placeholder: "Customer no or name" },
      { parameterId: "productQuery", label: "Product", inputType: "text", placeholder: "SKU or item name" },
      { parameterId: "searchQuery", label: "Search", inputType: "text", placeholder: "Document, shift, bank, or reference" },
      {
        parameterId: "tenderMethodCode",
        label: "Tender",
        inputType: "select",
        options: [
          { value: "", label: "All tenders" },
          ...tenderMethods.map((tender) => ({
            value: tender.code,
            label: tender.name
          }))
        ]
      },
      {
        parameterId: "locationId",
        label: "Location",
        inputType: "select",
        options: [
          { value: "", label: "All locations" },
          ...locations.map((location) => ({
            value: location.id,
            label: `${location.name} (${location.code})`
          }))
        ]
      },
      { parameterId: "limit", label: "Rows", inputType: "number", placeholder: "100" }
    ],
    lastCriteria: criteria
  };
}

function buildSourceLineAmounts(
  sourceLine: {
    quantity: Prisma.Decimal | number | string;
    unitPrice: Prisma.Decimal | number | string;
    discountAmount: Prisma.Decimal | number | string;
    taxAmount: Prisma.Decimal | number | string;
    lineTotal: Prisma.Decimal | number | string;
  },
  quantity: number
) {
  const soldQuantity = Math.max(0.001, toQuantity(sourceLine.quantity));
  const normalizedQuantity = toQuantity(quantity);

  return {
    quantity: normalizedQuantity,
    unitPrice: toMoney(Number(sourceLine.unitPrice)),
    discountAmount: toMoney((Number(sourceLine.discountAmount) / soldQuantity) * normalizedQuantity),
    taxAmount: toMoney((Number(sourceLine.taxAmount) / soldQuantity) * normalizedQuantity),
    lineTotal: toMoney((Number(sourceLine.lineTotal) / soldQuantity) * normalizedQuantity)
  };
}

function calculateOnlineSaleLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRatePercent: number;
  taxInclusive: boolean;
}) {
  const grossAmount = toMoney(input.quantity * input.unitPrice);
  const discountAmount = toMoney(Math.min(Math.max(0, input.discountAmount ?? 0), grossAmount));
  const grossBeforeTax = toMoney(grossAmount - discountAmount);
  const taxAmount = input.taxInclusive
    ? toMoney(grossBeforeTax - grossBeforeTax / (1 + input.taxRatePercent / 100))
    : toMoney(grossBeforeTax * (input.taxRatePercent / 100));
  const lineTotal = input.taxInclusive ? grossBeforeTax : toMoney(grossBeforeTax + taxAmount);

  return {
    discountAmount,
    taxAmount,
    lineTotal
  };
}

function deriveOnlineTransferStatus(input: {
  requestedQuantity: number;
  issuedQuantity: number;
  receivedQuantity: number;
  currentStatus?: InterStoreTransferStatus | string | null;
  closedAt?: Date | string | null;
}) {
  if (input.closedAt) {
    return InterStoreTransferStatus.CLOSED;
  }

  if (input.currentStatus === InterStoreTransferStatus.CANCELLED) {
    return InterStoreTransferStatus.CANCELLED;
  }

  if (input.receivedQuantity > 0) {
    return input.receivedQuantity + 0.0001 >= input.requestedQuantity
      ? InterStoreTransferStatus.RECEIVED
      : InterStoreTransferStatus.PART_RECEIVED;
  }

  if (input.issuedQuantity > 0) {
    return input.issuedQuantity + 0.0001 >= input.requestedQuantity
      ? InterStoreTransferStatus.ISSUED
      : InterStoreTransferStatus.PART_ISSUED;
  }

  return InterStoreTransferStatus.REQUESTED;
}

export async function createOnlineStoreCorrection(
  input: CreateOnlineStoreCorrectionRequest
): Promise<CreateOnlineStoreCorrectionResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("processing POS corrections online");

  if (!store.salesEnabled) {
    throw new Error("This Online POS is not enabled for POS returns or exchanges.");
  }

  const sourceTransactionNo = optionalText(input.sourceTransactionNo);
  const correctionType = input.correctionType === "EXCHANGE" ? PosTransactionType.EXCHANGE : PosTransactionType.RETURN;

  if (
    !sessionHasAllPermissions(session, [
      correctionType === PosTransactionType.EXCHANGE ? "pos.exchange.process" : "pos.return.process"
    ])
  ) {
    throw new Error(
      correctionType === PosTransactionType.EXCHANGE
        ? "Flash ERP requires exchange processing privileges before posting this correction."
        : "Flash ERP requires return processing privileges before posting this correction."
    );
  }

  const returnLineInputs = Array.isArray(input.returnLines) ? input.returnLines : [];
  const saleLineInputs = correctionType === PosTransactionType.EXCHANGE && Array.isArray(input.saleLines) ? input.saleLines : [];

  if (!sourceTransactionNo) {
    throw new Error("Choose the original receipt before processing a return or exchange.");
  }

  if (returnLineInputs.length === 0) {
    throw new Error("Select at least one original receipt line for the correction.");
  }

  if (correctionType === PosTransactionType.EXCHANGE && saleLineInputs.length === 0) {
    throw new Error("Add at least one replacement item before completing an exchange.");
  }

  const salesLocation = await resolveOnlineStoreLocation({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    receiving: false
  });
  const note = optionalText(input.note);
  const isVoidCorrection = note?.trim().toUpperCase().startsWith("VOID") ?? false;
  const correctionManagerPermissionCodes = new Set<string>(
    isVoidCorrection ? ["pos.override.no-receipt-return"] : []
  );
  const correctionOverrideNotes = isVoidCorrection ? [`Void correction requested for ${sourceTransactionNo}`] : [];

  return prisma.$transaction(async (tx) => {
    const sourceTransaction = await tx.posTransaction.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        transactionNo: sourceTransactionNo,
        status: PosTransactionStatus.COMPLETED,
        transactionType: {
          in: [PosTransactionType.SALE, PosTransactionType.EXCHANGE]
        },
        deletedAt: null
      },
      select: {
        id: true,
        transactionNo: true,
        customerId: true,
        customerNameSnapshot: true,
        payments: {
          select: {
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            bankAccountId: true,
            amount: true,
            reference: true
          }
        },
        lines: {
          where: {
            lineIntent: PosTransactionLineIntent.SALE
          },
          select: {
            id: true,
            productId: true,
            inventoryLocationId: true,
            productVariantId: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            quantity: true,
            sellingUnitOfMeasure: true,
            baseUnitOfMeasure: true,
            uomConversionFactor: true,
            baseQuantity: true,
            unitPrice: true,
            discountAmount: true,
            appliedPromotionNameSnapshot: true,
            taxAmount: true,
            lineTotal: true,
            lineNote: true,
            batchAllocationsSnapshot: true,
            product: {
              select: {
                id: true,
                productType: true,
                baseCostPrice: true,
                trackInventory: true,
                trackExpiry: true
              }
            }
          }
        }
      }
    });

    if (!sourceTransaction) {
      throw new Error("Flash ERP could not find a completed original sale receipt for this Online POS.");
    }

    const requestedReturnLineIds = returnLineInputs
      .map((line) => optionalText(line.sourceLineId))
      .filter((lineId): lineId is string => Boolean(lineId));
    const priorReturnedLines =
      requestedReturnLineIds.length > 0
        ? await tx.posTransactionLine.findMany({
            where: {
              sourceLineId: {
                in: requestedReturnLineIds
              },
              posTransaction: {
                retailOrgId: session.retailOrgId,
                status: PosTransactionStatus.COMPLETED,
                transactionType: {
                  in: [PosTransactionType.RETURN, PosTransactionType.EXCHANGE]
                }
              }
            },
            select: {
              sourceLineId: true,
              quantity: true,
              batchAllocationsSnapshot: true
            }
          })
        : [];
    const returnedQuantityByLineId = new Map<string, number>();
    const returnedBatchAllocationsByLineId = new Map<
      string,
      InventoryBatchAllocation[]
    >();

    for (const returnedLine of priorReturnedLines) {
      if (!returnedLine.sourceLineId) {
        continue;
      }

      returnedQuantityByLineId.set(
        returnedLine.sourceLineId,
        toQuantity(
          (returnedQuantityByLineId.get(returnedLine.sourceLineId) ?? 0) +
            Number(returnedLine.quantity)
        )
      );
      returnedBatchAllocationsByLineId.set(returnedLine.sourceLineId, [
        ...(returnedBatchAllocationsByLineId.get(returnedLine.sourceLineId) ?? []),
        ...readInventoryBatchAllocations(
          returnedLine.batchAllocationsSnapshot
        )
      ]);
    }
    const sourceLineById = new Map(sourceTransaction.lines.map((line) => [line.id, line] as const));
    const preparedReturnLines = returnLineInputs.map((lineInput) => {
      const sourceLineId = optionalText(lineInput.sourceLineId);
      const sourceLine = sourceLineId ? sourceLineById.get(sourceLineId) : null;

      if (!sourceLine || !sourceLineId) {
        throw new Error("One of the selected receipt lines is not eligible for correction.");
      }

      const quantity = normalizeQuantity(lineInput.quantity);
      const uomConversionFactor = Number(sourceLine.uomConversionFactor ?? 1);
      const baseQuantity = toQuantity(quantity * uomConversionFactor);
      const alreadyReturned = returnedQuantityByLineId.get(sourceLineId) ?? 0;
      const availableQuantity = toQuantity(Math.max(0, Number(sourceLine.quantity) - alreadyReturned));

      if (quantity > availableQuantity) {
        throw new Error(
          `Only ${formatNumberForMessage(availableQuantity)} ${sourceLine.productNameSnapshot} remain returnable from ${sourceTransaction.transactionNo}.`
        );
      }

      const sourceBatchAllocations = readInventoryBatchAllocations(
        sourceLine.batchAllocationsSnapshot
      );
      const batchAllocations = sourceLine.product.trackExpiry
        ? takeOutstandingInventoryBatchAllocations({
            productName: sourceLine.productNameSnapshot,
            quantity: baseQuantity,
            issued: sourceBatchAllocations,
            received:
              returnedBatchAllocationsByLineId.get(sourceLineId) ?? []
          })
        : [];

      return {
        sourceLine,
        sourceLineId,
        batchAllocations,
        sellingUnitOfMeasure: sourceLine.sellingUnitOfMeasure,
        baseUnitOfMeasure: sourceLine.baseUnitOfMeasure,
        uomConversionFactor,
        baseQuantity,
        ...buildSourceLineAmounts(sourceLine, quantity)
      };
    });
    const returnLocationIds = [
      ...new Set(
        preparedReturnLines
          .map((line) => line.sourceLine.inventoryLocationId)
          .filter((locationId): locationId is string => Boolean(locationId))
      )
    ];
    const returnLocations =
      returnLocationIds.length > 0
        ? await tx.inventoryLocation.findMany({
            where: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              id: {
                in: returnLocationIds
              }
            },
            select: {
              id: true,
              warehouseId: true
            }
          })
        : [];
    const returnLocationById = new Map(
      returnLocations.map((location) => [location.id, location] as const)
    );
    const saleProductIds = [...new Set(saleLineInputs.map((line) => line.productId).filter(Boolean))];
    const saleProducts =
      saleProductIds.length > 0
        ? await tx.product.findMany({
            where: {
              retailOrgId: session.retailOrgId,
              id: {
                in: saleProductIds
              },
              status: RecordStatus.ACTIVE,
              deletedAt: null
            },
            select: {
              id: true,
              code: true,
              name: true,
              productType: true,
              unitOfMeasure: true,
              baseUnitOfMeasure: { select: { code: true } },
              baseUnitPrice: true,
              storeProductSellingUnits: {
                where: {
                  storeId: store.id,
                  status: RecordStatus.ACTIVE
                },
                select: {
                  productVariantId: true,
                  unitOfMeasureCodeSnapshot: true,
                  unitOfMeasureNameSnapshot: true,
                  conversionFactor: true,
                  unitPrice: true,
                  barcode: true,
                  isDefault: true,
                  unitOfMeasure: {
                    select: {
                      allowFractionalSale: true,
                      decimalPrecision: true
                    }
                  }
                }
              },
              baseCostPrice: true,
              mustEnterPriceAtPos: true,
              trackInventory: true,
              trackExpiry: true,
              trackSize: true,
              trackColor: true,
              isSerialized: true,
              taxProfile: {
                select: {
                  ratePercent: true,
                  isTaxInclusive: true
                }
              }
            }
          })
        : [];
    const saleProductById = new Map(saleProducts.map((product) => [product.id, product] as const));
    const preparedSaleLines = saleLineInputs.map((lineInput) => {
      const product = saleProductById.get(lineInput.productId);

      if (!product) {
        throw new Error("One of the selected exchange replacement products is no longer available.");
      }

      const quantity = normalizeQuantity(lineInput.quantity);
      const baseUnitPrice = Number(product.baseUnitPrice);
      const sellingUom = resolvePosSellingUom({
        baseUnitOfMeasure: product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
        baseUnitPrice,
        quantity,
        selectedUnitOfMeasure: lineInput.sellingUnitOfMeasure,
        sellingUnits: product.storeProductSellingUnits
          .filter((sellingUnit) => sellingUnit.productVariantId === null)
          .map((sellingUnit) => ({
            unitOfMeasureCode: sellingUnit.unitOfMeasureCodeSnapshot,
            unitOfMeasureName: sellingUnit.unitOfMeasureNameSnapshot,
            conversionFactor: Number(sellingUnit.conversionFactor),
            unitPrice: Number(sellingUnit.unitPrice),
            barcode: sellingUnit.barcode,
            isDefault: sellingUnit.isDefault,
            allowFractionalSale: sellingUnit.unitOfMeasure.allowFractionalSale,
            decimalPrecision: sellingUnit.unitOfMeasure.decimalPrecision
          })),
        serialized: product.isSerialized
      });
      const requestedPrice = Number(lineInput.unitPrice ?? sellingUom.unitPrice);
      const normalizedRequestedPrice = Number.isFinite(requestedPrice)
        ? toMoney(requestedPrice)
        : toMoney(sellingUom.unitPrice);
      const manualPriceOverride =
        !product.mustEnterPriceAtPos &&
        lineInput.unitPrice !== null &&
        lineInput.unitPrice !== undefined &&
        normalizedRequestedPrice > 0 &&
        normalizedRequestedPrice !== toMoney(sellingUom.unitPrice);
      const overrideDiscountAmount =
        lineInput.overrideDiscountAmount === null || lineInput.overrideDiscountAmount === undefined
          ? 0
          : normalizeMoney(lineInput.overrideDiscountAmount, "discount override");

      if (manualPriceOverride) {
        correctionManagerPermissionCodes.add("pos.override.price");
        correctionOverrideNotes.push(`${product.code} replacement price ${sellingUom.unitPrice.toFixed(2)} -> ${normalizedRequestedPrice.toFixed(2)}`);
      }

      if (overrideDiscountAmount > 0) {
        correctionManagerPermissionCodes.add("pos.override.discount");
        correctionOverrideNotes.push(`${product.code} replacement discount ${overrideDiscountAmount.toFixed(2)}`);
      }

      const unitPrice =
        (product.mustEnterPriceAtPos || manualPriceOverride) && normalizedRequestedPrice > 0
          ? normalizedRequestedPrice
        : sellingUom.unitPrice;
      const variantSize = product.trackSize ? optionalText(lineInput.variantSize) : null;
      const variantColor = product.trackColor ? optionalText(lineInput.variantColor) : null;
      const lineNote = optionalText(lineInput.lineNote);

      const amounts = calculateOnlineSaleLineAmounts({
        quantity,
        unitPrice,
        discountAmount: overrideDiscountAmount,
        taxRatePercent: Number(product.taxProfile?.ratePercent ?? 0),
        taxInclusive: product.taxProfile?.isTaxInclusive ?? false
      });

      return {
        product,
        quantity,
        sellingUnitOfMeasure: sellingUom.sellingUnitOfMeasure,
        baseUnitOfMeasure: sellingUom.baseUnitOfMeasure,
        uomConversionFactor: sellingUom.uomConversionFactor,
        baseQuantity: sellingUom.baseQuantity,
        variantSize,
        variantColor,
        lineNote,
        unitPrice,
        appliedPromotionName: null as string | null,
        ...amounts,
        overrideNote: optionalText(lineInput.overrideNote)
      };
    });
    const managerApproval =
      correctionManagerPermissionCodes.size > 0
        ? await requireOnlineManagerApproval({
            session,
            currentUser: user,
            store,
            managerOverride: input.managerOverride,
            permissionCodes: [...correctionManagerPermissionCodes],
            purpose: isVoidCorrection ? "approving an Online POS void" : "approving Online POS correction overrides",
            requireSupervisorEligible: true
          })
        : null;
    const trackedSaleProductIds = [...new Set(preparedSaleLines.filter((line) => isOnlineStoreStockManagedProduct(line.product)).map((line) => line.product.id))];
    const requestedSaleQuantityByProduct = new Map<string, number>();

    for (const line of preparedSaleLines) {
      if (!isOnlineStoreStockManagedProduct(line.product)) {
        continue;
      }

      requestedSaleQuantityByProduct.set(
        line.product.id,
        toQuantity((requestedSaleQuantityByProduct.get(line.product.id) ?? 0) + line.baseQuantity)
      );
    }

    const stockPositions =
      trackedSaleProductIds.length > 0
        ? await tx.inventoryLedgerEntry.groupBy({
            by: ["productId"],
            where: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              inventoryLocationId: salesLocation.id,
              productId: {
                in: trackedSaleProductIds
              }
            },
            _sum: {
              quantity: true
            }
          })
        : [];
    const availableQuantityByProduct = new Map(
      stockPositions.map((position) => [position.productId, toQuantity(position._sum.quantity)] as const)
    );
    const insufficientLine = preparedSaleLines.find((line) => {
      if (!isOnlineStoreStockManagedProduct(line.product)) {
        return false;
      }

      const requestedQuantity = requestedSaleQuantityByProduct.get(line.product.id) ?? line.baseQuantity;
      const availableQuantity = availableQuantityByProduct.get(line.product.id) ?? 0;

      return availableQuantity < requestedQuantity;
    });

    if (insufficientLine) {
      throw new Error(
        `Only ${formatNumberForMessage(availableQuantityByProduct.get(insufficientLine.product.id) ?? 0)} ${insufficientLine.product.name} is available in ${salesLocation.code} for the exchange replacement.`
      );
    }

    const reservedBatchQuantityById = new Map<string, number>();
    const replacementBatchAllocations = await Promise.all(
      preparedSaleLines.map(async (line) => {
        if (!tracksInventoryForSale(line.product) || !line.product.trackExpiry) {
          return [] as InventoryBatchAllocation[];
        }

        const allocations = allocateInventoryBatchesFefo({
          productName: line.product.name,
          quantity: line.baseQuantity,
          batches: (
            await tx.inventoryBatch.findMany({
              where: {
                retailOrgId: session.retailOrgId,
                inventoryLocationId: salesLocation.id,
                productId: line.product.id,
                quantityOnHand: { gt: 0 }
              },
              orderBy: [
                { expiryDate: "asc" },
                { manufacturedAt: "asc" },
                { batchNo: "asc" }
              ],
              select: {
                id: true,
                batchNo: true,
                manufacturedAt: true,
                expiryDate: true,
                quantityOnHand: true,
                status: true
              }
            })
          ).map((batch) => ({
            batchId: batch.id,
            batchNo: batch.batchNo,
            manufacturedAt: batch.manufacturedAt?.toISOString() ?? null,
            expiryDate: batch.expiryDate.toISOString(),
            quantityOnHand: toQuantity(
              Number(batch.quantityOnHand) -
                (reservedBatchQuantityById.get(batch.id) ?? 0)
            ),
            status: batch.status
          }))
        });

        for (const allocation of allocations) {
          if (allocation.batchId) {
            reservedBatchQuantityById.set(
              allocation.batchId,
              toQuantity(
                (reservedBatchQuantityById.get(allocation.batchId) ?? 0) +
                  allocation.quantity
              )
            );
          }
        }

        return allocations;
      })
    );

    const returnSubtotal = toMoney(
      preparedReturnLines.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount, 0)
    );
    const returnDiscountAmount = toMoney(preparedReturnLines.reduce((sum, line) => sum + line.discountAmount, 0));
    const returnTaxAmount = toMoney(preparedReturnLines.reduce((sum, line) => sum + line.taxAmount, 0));
    const returnTotalAmount = toMoney(preparedReturnLines.reduce((sum, line) => sum + line.lineTotal, 0));
    const saleSubtotal = toMoney(
      preparedSaleLines.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount, 0)
    );
    const saleDiscountAmount = toMoney(preparedSaleLines.reduce((sum, line) => sum + line.discountAmount, 0));
    const saleTaxAmount = toMoney(preparedSaleLines.reduce((sum, line) => sum + line.taxAmount, 0));
    const saleTotalAmount = toMoney(preparedSaleLines.reduce((sum, line) => sum + line.lineTotal, 0));
    const subtotalAmount =
      correctionType === PosTransactionType.RETURN ? returnSubtotal : toMoney(saleSubtotal - returnSubtotal);
    const discountAmount =
      correctionType === PosTransactionType.RETURN
        ? returnDiscountAmount
        : toMoney(saleDiscountAmount - returnDiscountAmount);
    const taxAmount =
      correctionType === PosTransactionType.RETURN ? returnTaxAmount : toMoney(saleTaxAmount - returnTaxAmount);
    const totalAmount =
      correctionType === PosTransactionType.RETURN
        ? returnTotalAmount
        : toMoney(saleTotalAmount - returnTotalAmount);
    const settlementAmount = Math.abs(totalAmount);
    const sourcePaymentTotal = sourceTransaction.payments.reduce((sum, payment) => sum + Math.abs(Number(payment.amount)), 0);
    const defaultRefundPayments =
      settlementAmount > 0 && (correctionType === PosTransactionType.RETURN || totalAmount < 0) && sourcePaymentTotal > 0
        ? sourceTransaction.payments.map((payment, index) => {
            const amount =
              index === sourceTransaction.payments.length - 1
                ? toMoney(
                    settlementAmount -
                      sourceTransaction.payments
                        .slice(0, index)
                        .reduce((sum, prior) => sum + toMoney((Math.abs(Number(prior.amount)) / sourcePaymentTotal) * settlementAmount), 0)
                  )
                : toMoney((Math.abs(Number(payment.amount)) / sourcePaymentTotal) * settlementAmount);

            return {
              paymentMethod: payment.method,
              tenderMethodCode: payment.tenderMethodCodeSnapshot,
              bankAccountId: payment.bankAccountId,
              amount,
              reference: payment.reference
            };
          })
        : [];
    const paymentInputs = Array.isArray(input.payments) ? input.payments : defaultRefundPayments;
    const { terminal, shift } = await ensureOnlineRegisterShift(tx, {
      session,
      user,
      store
    });
    const preparedPayments = await prepareOnlinePayments(tx, session.retailOrgId, paymentInputs, settlementAmount, {
      allowChange: totalAmount > 0,
      refund: correctionType === PosTransactionType.RETURN || totalAmount < 0,
      settlementLabel: correctionType === PosTransactionType.RETURN ? "return refund" : "exchange settlement",
      receiptContext: {
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        terminalCode: onlineTerminalCode,
        cashierCode: user.loginId
      }
    });
    const transactionNo = `WEB-${correctionType === PosTransactionType.RETURN ? "RET" : "EXC"}-${store.code.toUpperCase()}-${Date.now()}`;
    const transaction = await tx.posTransaction.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        posShiftId: shift.id,
        customerId: sourceTransaction.customerId,
        sourceTransactionId: sourceTransaction.id,
        sourceTransactionNo: sourceTransaction.transactionNo,
        transactionNo,
        transactionType: correctionType,
        status: PosTransactionStatus.COMPLETED,
        customerNameSnapshot: sourceTransaction.customerNameSnapshot,
        cashierCodeSnapshot: user.loginId,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: preparedPayments.paymentTotal,
        changeAmount: preparedPayments.changeAmount,
        notes: note,
        originNodeCode: "ONLINE_DIRECT",
        completedAt: new Date(),
        lines: {
          create: [
            ...preparedReturnLines.map((line) => ({
              productId: line.sourceLine.productId,
              productVariantId: line.sourceLine.productVariantId,
              inventoryLocationId:
                line.sourceLine.inventoryLocationId ?? salesLocation.id,
              lineIntent: PosTransactionLineIntent.RETURN,
              sourceLineId: line.sourceLineId,
              productCodeSnapshot: line.sourceLine.productCodeSnapshot,
              productNameSnapshot: line.sourceLine.productNameSnapshot,
              variantSizeSnapshot: line.sourceLine.variantSizeSnapshot,
              variantColorSnapshot: line.sourceLine.variantColorSnapshot,
              sellingUnitOfMeasure: line.sellingUnitOfMeasure,
              baseUnitOfMeasure: line.baseUnitOfMeasure,
              uomConversionFactor: line.uomConversionFactor,
              baseQuantity: line.baseQuantity,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              lineNote: line.sourceLine.lineNote ?? null,
              ...(line.batchAllocations.length > 0
                ? {
                    batchAllocationsSnapshot: serializeJsonField(
                      line.batchAllocations
                    )
                  }
                : {})
            })),
            ...preparedSaleLines.map((line, lineIndex) => ({
              productId: line.product.id,
              inventoryLocationId: salesLocation.id,
              lineIntent: PosTransactionLineIntent.SALE,
              productCodeSnapshot: line.product.code,
              productNameSnapshot: line.product.name,
              variantSizeSnapshot: line.variantSize,
              variantColorSnapshot: line.variantColor,
              sellingUnitOfMeasure: line.sellingUnitOfMeasure,
              baseUnitOfMeasure: line.baseUnitOfMeasure,
              uomConversionFactor: line.uomConversionFactor,
              baseQuantity: line.baseQuantity,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              lineNote: line.lineNote,
              ...(replacementBatchAllocations[lineIndex]?.length
                ? {
                    batchAllocationsSnapshot: serializeJsonField(
                      replacementBatchAllocations[lineIndex]
                    )
                  }
                : {})
            }))
          ]
        },
        payments: {
          create: preparedPayments.payments
        }
      },
      select: {
        id: true,
        transactionNo: true,
        transactionType: true,
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        changeAmount: true,
        completedAt: true
      }
    });

    const occurredAt = transaction.completedAt ?? new Date();

    for (const line of preparedReturnLines) {
      const returnLocation = line.sourceLine.inventoryLocationId
        ? (returnLocationById.get(line.sourceLine.inventoryLocationId) ??
          salesLocation)
        : salesLocation;

      for (const allocation of line.batchAllocations) {
        const batch = await tx.inventoryBatch.findFirst({
          where: {
            retailOrgId: session.retailOrgId,
            inventoryLocationId: returnLocation.id,
            productId: line.sourceLine.productId,
            batchNo: allocation.batchNo
          },
          select: {
            id: true,
            productId: true,
            inventoryLocationId: true,
            expiryDate: true,
            quantityOnHand: true,
            status: true
          }
        });

        if (
          !batch ||
          batch.productId !== line.sourceLine.productId ||
          batch.inventoryLocationId !== returnLocation.id ||
          batch.expiryDate.toISOString().slice(0, 10) !==
            allocation.expiryDate.slice(0, 10)
        ) {
          throw new Error(
            `Flash ERP could not match returned batch ${allocation.batchNo} to the original sales location.`
          );
        }

        const nextQuantity = toQuantity(
          Number(batch.quantityOnHand) + allocation.quantity
        );
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantityOnHand: nextQuantity,
            status: deriveInventoryBatchStatus({
              expiryDate: batch.expiryDate,
              quantityOnHand: nextQuantity,
              status: batch.status,
              at: occurredAt
            }),
            sourceReferenceType: "POS_TRANSACTION",
            sourceReferenceId: transaction.id,
            sourceReferenceLabel: transaction.transactionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: occurredAt
          }
        });
      }
    }

    for (const [lineIndex, line] of preparedSaleLines.entries()) {
      for (const allocation of replacementBatchAllocations[lineIndex] ?? []) {
        if (!allocation.batchId) {
          throw new Error(
            `Flash ERP could not resolve replacement batch ${allocation.batchNo} for ${line.product.name}.`
          );
        }

        const batch = await tx.inventoryBatch.findUnique({
          where: { id: allocation.batchId },
          select: {
            id: true,
            expiryDate: true,
            quantityOnHand: true,
            status: true
          }
        });

        if (!batch || Number(batch.quantityOnHand) < allocation.quantity) {
          throw new Error(
            `Batch ${allocation.batchNo} no longer has enough ${line.product.name} for this exchange.`
          );
        }

        const nextQuantity = toQuantity(
          Number(batch.quantityOnHand) - allocation.quantity
        );
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantityOnHand: nextQuantity,
            status: deriveInventoryBatchStatus({
              expiryDate: batch.expiryDate,
              quantityOnHand: nextQuantity,
              status: batch.status,
              at: occurredAt
            }),
            sourceReferenceType: "POS_TRANSACTION",
            sourceReferenceId: transaction.id,
            sourceReferenceLabel: transaction.transactionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: occurredAt
          }
        });
      }
    }

    const inventoryMovements = [
      ...preparedReturnLines
        .filter((line) => tracksInventoryForSale(line.sourceLine.product))
        .flatMap((line) => {
          const returnLocation = line.sourceLine.inventoryLocationId
            ? (returnLocationById.get(line.sourceLine.inventoryLocationId) ?? salesLocation)
            : salesLocation;

          const batches = line.batchAllocations.length > 0
            ? line.batchAllocations
            : [null];
          return batches.map((batch) => ({
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            warehouseId: returnLocation.warehouseId,
            inventoryLocationId: returnLocation.id,
            productId: line.sourceLine.productId,
            inventoryBatchId: batch?.batchId ?? null,
            batchNoSnapshot: batch?.batchNo ?? null,
            expiryDateSnapshot: batch?.expiryDate
              ? new Date(batch.expiryDate)
              : null,
            movementType: InventoryMovementType.RETURN,
            quantity: batch?.quantity ?? line.baseQuantity,
            unitCost: line.sourceLine.product.baseCostPrice,
            referenceType: "POS_TRANSACTION",
            referenceId: transaction.id,
            externalReference: transaction.transactionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            createdByUserId: user.id,
            occurredAt
          }));
        }),
      ...preparedSaleLines
        .filter((line) => tracksInventoryForSale(line.product))
        .flatMap((line, lineIndex) => {
          const batches = replacementBatchAllocations[lineIndex]?.length
            ? replacementBatchAllocations[lineIndex]
            : [null];
          return batches.map((batch) => ({
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            warehouseId: salesLocation.warehouseId,
            inventoryLocationId: salesLocation.id,
            productId: line.product.id,
            inventoryBatchId: batch?.batchId ?? null,
            batchNoSnapshot: batch?.batchNo ?? null,
            expiryDateSnapshot: batch?.expiryDate
              ? new Date(batch.expiryDate)
              : null,
            movementType: InventoryMovementType.SALE,
            quantity: -(batch?.quantity ?? line.baseQuantity),
            unitCost: line.product.baseCostPrice,
            referenceType: "POS_TRANSACTION",
            referenceId: transaction.id,
            externalReference: transaction.transactionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            createdByUserId: user.id,
            occurredAt
          }));
        })
    ];

    if (inventoryMovements.length > 0) {
      await tx.inventoryLedgerEntry.createMany({
        data: inventoryMovements
      });
    }
    await postPosTransactionAccountingInTransaction(tx, {
      retailOrgId: session.retailOrgId,
      transactionId: transaction.id,
      postedBy: "Online POS"
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: correctionType === PosTransactionType.RETURN ? "RETURN_COMPLETED" : "EXCHANGE_COMPLETED",
        actorLabel: user.loginId,
        targetType: "POS transaction",
        targetRef: transaction.transactionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} completed Online POS ${correctionType.toLowerCase()} ${transaction.transactionNo} against ${sourceTransaction.transactionNo}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          sourceTransactionNo: sourceTransaction.transactionNo,
          totalAmount,
          managerOverride:
            managerApproval === null
              ? null
              : {
                  approvalType: managerApproval.approvalType,
                  supervisorLoginId: managerApproval.supervisorLoginId,
                  supervisorDisplayName: managerApproval.supervisorDisplayName,
                  permissionCodes: managerApproval.permissionCodes,
                  note: managerApproval.note,
                  overrideNotes: correctionOverrideNotes
                }
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      transactionNo: transaction.transactionNo,
      totalAmount: Number(transaction.totalAmount),
      receipt: {
        ...buildOnlineStoreReceiptBranding(store),
        storeName: store.name,
        transactionNo: transaction.transactionNo,
        transactionType: transaction.transactionType,
        completedAt: (transaction.completedAt ?? new Date()).toISOString(),
        terminalCode: onlineTerminalCode,
        shiftNo: shift.shiftNo,
        cashierCode: user.loginId,
        currencyCode: store.currencyCode,
        timezone: store.timezone,
        receiptHeader: store.receiptHeader,
        receiptFooter: store.receiptFooter,
        customerName: sourceTransaction.customerNameSnapshot ?? "Walk-in",
        subtotalAmount: Number(transaction.subtotalAmount),
        discountAmount: Number(transaction.discountAmount),
        loyaltyRedemptionPoints: 0,
        loyaltyRedemptionAmount: 0,
        taxAmount: Number(transaction.taxAmount),
        totalAmount: Number(transaction.totalAmount),
        paidAmount: Number(transaction.paidAmount),
        changeAmount: Number(transaction.changeAmount),
        note,
        lines: [
          ...preparedReturnLines.map((line) => ({
            productCode: line.sourceLine.productCodeSnapshot,
            productName: line.sourceLine.productNameSnapshot,
            variantSize: line.sourceLine.variantSizeSnapshot,
            variantColor: line.sourceLine.variantColorSnapshot,
            lineNote: line.sourceLine.lineNote ?? null,
            quantity: line.quantity,
            sellingUnitOfMeasure:
              line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA",
            baseUnitOfMeasure:
              line.baseUnitOfMeasure ?? line.sellingUnitOfMeasure ?? "EA",
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            appliedPromotionName: line.sourceLine.appliedPromotionNameSnapshot ?? null
          })),
          ...preparedSaleLines.map((line) => ({
            productCode: line.product.code,
            productName: line.product.name,
            variantSize: line.variantSize,
            variantColor: line.variantColor,
            lineNote: line.lineNote,
            quantity: line.quantity,
            sellingUnitOfMeasure: line.sellingUnitOfMeasure,
            baseUnitOfMeasure: line.baseUnitOfMeasure,
            uomConversionFactor: line.uomConversionFactor,
            baseQuantity: line.baseQuantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            appliedPromotionName: line.appliedPromotionName ?? null
          }))
        ],
        payments: preparedPayments.payments.map((payment) => ({
          method: String(payment.method),
          tenderMethodCode: payment.tenderMethodCodeSnapshot ?? null,
          tenderMethodName: payment.tenderMethodNameSnapshot ?? null,
          amount: Number(payment.amount),
          reference: payment.reference ?? null
        }))
      },
      message: `Flash ERP completed ${transaction.transactionNo} directly in enterprise for ${store.code}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function openOnlineStoreShift(
  input: OpenOnlineStoreShiftRequest = {}
): Promise<OpenOnlineStoreShiftResponse> {
  const context = await requireOnlineStoreForOperation("opening an Online POS shift");
  const { session, user, store } = context;
  const configuredOpeningFloat = readOnlineOptionSettings(store.retailOrg.optionsSettingsJson).shiftFloatPromptAmount;
  const openingFloatAmount = normalizeMoney(input.openingFloatAmount ?? configuredOpeningFloat, "opening float");
  const managerApproval = !sessionHasAllPermissions(session, ["pos.shift.open"])
    ? await requireOnlineManagerApproval({
        session,
        currentUser: user,
        store,
        managerOverride: input.managerOverride,
        permissionCodes: ["pos.shift.open"],
        purpose: "opening an Online POS shift"
      })
    : null;

  return prisma.$transaction(async (tx) => {
    const terminal = await ensureOnlineRegisterTerminal(tx, context);
    const existingOpenShift = await tx.posShift.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        cashierUserId: user.id,
        status: PosShiftStatus.OPEN
      },
      select: {
        shiftNo: true
      }
    });

    if (existingOpenShift) {
      throw new Error(`${existingOpenShift.shiftNo} is already open for this online register.`);
    }

    const baseShiftNo = `WEB-${buildBusinessDate()}-${sanitizeCodeSegment(user.loginId)}`;
    const priorShiftCount = await tx.posShift.count({
      where: {
        storeId: store.id,
        shiftNo: {
          startsWith: baseShiftNo
        }
      }
    });
    const shiftNo = priorShiftCount === 0 ? baseShiftNo : `${baseShiftNo}-${priorShiftCount + 1}`;
    const openedAt = new Date();
    const shift = await tx.posShift.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: terminal.id,
        cashierUserId: user.id,
        shiftNo,
        status: PosShiftStatus.OPEN,
        openingFloatAmount,
        originNodeCode: "ONLINE_DIRECT",
        openedAt
      },
      select: {
        id: true,
        shiftNo: true,
        status: true,
        openingFloatAmount: true,
        closingDeclaredCash: true,
        closingVariance: true,
        openedAt: true,
        closedAt: true,
        posTransactions: {
          where: {
            status: PosTransactionStatus.COMPLETED
          },
          select: {
            id: true,
            transactionType: true,
            totalAmount: true,
            changeAmount: true
          }
        },
        receivedPayments: {
          where: {
            posTransaction: {
              deletedAt: null
            }
          },
          select: {
            posTransactionId: true,
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            amount: true,
            posTransaction: {
              select: {
                transactionType: true,
                totalAmount: true
              }
            }
          }
        }
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "SHIFT_OPENED",
        actorLabel: user.loginId,
        targetType: "POS shift",
        targetRef: shift.shiftNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} opened Online POS shift ${shift.shiftNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          terminalCode: onlineTerminalCode,
          openingFloatAmount,
          configuredOpeningFloat,
          managerOverride:
            managerApproval === null
              ? null
              : {
                  approvalType: managerApproval.approvalType,
                  supervisorLoginId: managerApproval.supervisorLoginId,
                  supervisorDisplayName: managerApproval.supervisorDisplayName,
                  permissionCodes: managerApproval.permissionCodes,
                  note: managerApproval.note
                }
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      shift: summarizeOnlineShift(shift),
      message: `${shift.shiftNo} opened with ${openingFloatAmount.toFixed(2)} opening float.`,
      serverProcessedAt: openedAt.toISOString()
    };
  });
}

export async function recordOnlineStoreEod(
  input: RecordOnlineStoreEodRequest
): Promise<RecordOnlineStoreEodResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("recording Online POS EOD");
  const declaredCashAmount = normalizeMoney(input.declaredCashAmount, "declared cash");
  const shiftId = optionalText(input.shiftId);
  const note = optionalText(input.note);

  if (!sessionHasAllPermissions(session, ["pos.shift.close"])) {
    throw new Error("Flash ERP requires shift close privileges before closing an Online POS shift.");
  }

  return prisma.$transaction(async (tx) => {
    const shift = await tx.posShift.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        ...(shiftId
          ? { id: shiftId }
          : {
              status: {
                in: [PosShiftStatus.OPEN, PosShiftStatus.CLOSED]
              }
            })
      },
      orderBy: {
        openedAt: "desc"
      },
      select: {
        id: true,
        terminalId: true,
        shiftNo: true,
        status: true,
        openingFloatAmount: true,
        closingDeclaredCash: true,
        closingVariance: true,
        openedAt: true,
        closedAt: true,
        cashierUser: {
          select: {
            loginId: true,
            displayName: true
          }
        },
        posTransactions: {
          where: {
            status: PosTransactionStatus.COMPLETED
          },
          select: {
            id: true,
            transactionType: true,
            totalAmount: true,
            changeAmount: true
          }
        },
        receivedPayments: {
          where: {
            posTransaction: {
              deletedAt: null
            }
          },
          select: {
            posTransactionId: true,
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            amount: true,
            posTransaction: {
              select: {
                transactionType: true,
                totalAmount: true
              }
            }
          }
        }
      }
    });

    if (!shift) {
      throw new Error("Open and trade a browser POS shift before recording Online POS EOD.");
    }

    const existing = await tx.eodReconciliation.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        shiftId: shift.id
      },
      select: {
        reconciliationNo: true
      }
    });

    if (existing) {
      throw new Error(`${shift.shiftNo} has already been reconciled as ${existing.reconciliationNo}.`);
    }

    const shiftSummary = summarizeOnlineShift(shift);
    const varianceAmount = toMoney(declaredCashAmount - shiftSummary.expectedCashAmount);
    const timestamp = new Date();
    const sequence = await tx.eodReconciliation.count({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id
      }
    });
    const reconciliationNo = buildLocalDocumentNo("EOD", store.code, sequence + 1, timestamp);
    const reconciliation = await tx.eodReconciliation.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: shift.terminalId,
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        cashierCode: shift.cashierUser.loginId,
        reconciliationNo,
        expectedCashAmount: shiftSummary.expectedCashAmount,
        declaredCashAmount,
        varianceAmount,
        netSalesAmount: shiftSummary.netSalesAmount,
        cashTenderedAmount: shiftSummary.cashTenderedAmount,
        nonCashTenderedAmount: shiftSummary.nonCashTenderedAmount,
        transactionCount: shiftSummary.transactionCount,
        operatorName: user.displayName,
        note,
        originNodeCode: "ONLINE_DIRECT",
        reconciledAt: timestamp
      },
      select: {
        reconciliationNo: true
      }
    });

    if (shift.status === PosShiftStatus.OPEN) {
      await tx.posShift.update({
        where: {
          id: shift.id
        },
        data: {
          status: PosShiftStatus.CLOSED,
          closingDeclaredCash: declaredCashAmount,
          closingVariance: varianceAmount,
          closedAt: timestamp,
          recordVersion: {
            increment: 1
          }
        }
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "EOD_RECONCILED",
        actorLabel: user.loginId,
        targetType: "EOD reconciliation",
        targetRef: reconciliation.reconciliationNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} reconciled online shift ${shift.shiftNo} with variance ${varianceAmount.toFixed(2)}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          shiftNo: shift.shiftNo,
          cashierCode: shift.cashierUser.loginId,
          expectedCashAmount: shiftSummary.expectedCashAmount,
          declaredCashAmount,
          varianceAmount
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      reconciliationNo: reconciliation.reconciliationNo,
      varianceAmount,
      message: `${reconciliation.reconciliationNo} reconciled ${shift.shiftNo} with cash variance ${varianceAmount.toFixed(2)}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function recordOnlineStoreBanking(
  input: RecordOnlineStoreBankingRequest
): Promise<RecordOnlineStoreBankingResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("recording Online POS banking");
  const reconciliationId = optionalText(input.reconciliationId);
  const amount = normalizeMoney(input.amount, "banking deposit");
  const bankNameInput = optionalText(input.bankName);
  const reference = optionalText(input.reference);
  const note = optionalText(input.note);
  const managerApproval = await requireOnlineManagerApproval({
    session,
    currentUser: user,
    store,
    managerOverride: input.managerOverride,
    permissionCodes: ["pos.shift.close"],
    purpose: "recording Online POS banking",
    requireSupervisorEligible: true
  });

  if (!reconciliationId) {
    throw new Error("Select an EOD reconciliation before banking cash.");
  }

  if (amount <= 0) {
    throw new Error("Enter a banking deposit amount greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    const reconciliation = await tx.eodReconciliation.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        id: reconciliationId
      },
      select: {
        id: true,
        reconciliationNo: true,
        terminalId: true,
        shiftId: true,
        shiftNo: true,
        declaredCashAmount: true
      }
    });

    if (!reconciliation) {
      throw new Error("Choose a recorded EOD reconciliation before banking cash.");
    }

    const alreadyDeposited = await tx.bankingDeposit.aggregate({
      where: {
        retailOrgId: session.retailOrgId,
        reconciliationId: reconciliation.id
      },
      _sum: {
        amount: true
      }
    });
    const remainingCash = toMoney(Number(reconciliation.declaredCashAmount) - Number(alreadyDeposited._sum.amount ?? 0));

    if (amount > remainingCash) {
      throw new Error(`Flash ERP cannot bank more than the remaining declared cash balance of ${remainingCash.toFixed(2)}.`);
    }

    const bankAccounts = await getActiveBankAccounts(tx, session.retailOrgId);
    const bankAccountId = optionalText(input.bankAccountId);
    const bankAccount = bankAccountId ? bankAccounts.find((account) => account.id === bankAccountId) ?? null : null;

    if (bankAccounts.length > 0 && !bankAccount) {
      throw new Error("Select the bank, branch, and account number before recording the banking deposit.");
    }

    const timestamp = new Date();
    const sequence = await tx.bankingDeposit.count({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id
      }
    });
    const depositNo = buildLocalDocumentNo("BNK", store.code, sequence + 1, timestamp);
    const deposit = await tx.bankingDeposit.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        terminalId: reconciliation.terminalId,
        reconciliationId: reconciliation.id,
        bankAccountId: bankAccount?.id ?? null,
        depositNo,
        reconciliationNo: reconciliation.reconciliationNo,
        shiftId: reconciliation.shiftId,
        shiftNo: reconciliation.shiftNo,
        amount,
        bankName: bankAccount?.branch.bank.name ?? bankNameInput,
        bankCodeSnapshot: bankAccount?.branch.bank.code ?? null,
        bankNameSnapshot: bankAccount?.branch.bank.name ?? bankNameInput,
        bankBranchCodeSnapshot: bankAccount?.branch.code ?? null,
        bankBranchNameSnapshot: bankAccount?.branch.name ?? null,
        bankAccountNumberSnapshot: bankAccount?.accountNumber ?? null,
        bankAccountNameSnapshot: bankAccount?.accountName ?? null,
        reference,
        operatorName: user.displayName,
        note,
        originNodeCode: "ONLINE_DIRECT",
        depositedAt: timestamp
      },
      select: {
        depositNo: true
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "BANKING_DEPOSIT_RECORDED",
        actorLabel: user.loginId,
        targetType: "Banking deposit",
        targetRef: deposit.depositNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} banked ${amount.toFixed(2)} from ${reconciliation.reconciliationNo}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          reconciliationNo: reconciliation.reconciliationNo,
          amount,
          remainingCashAmount: toMoney(remainingCash - amount),
          managerOverride: {
            approvalType: managerApproval.approvalType,
            supervisorLoginId: managerApproval.supervisorLoginId,
            supervisorDisplayName: managerApproval.supervisorDisplayName,
            permissionCodes: managerApproval.permissionCodes,
            note: managerApproval.note
          }
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      depositNo: deposit.depositNo,
      remainingCashAmount: toMoney(remainingCash - amount),
      message: `${deposit.depositNo} banked ${amount.toFixed(2)} against ${reconciliation.reconciliationNo}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createOnlineStoreGoodsReceipt(
  input: CreateOnlineStoreGoodsReceiptRequest
): Promise<CreateOnlineStoreGoodsReceiptResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("receiving stock online");

  if (!store.warehouseEnabled) {
    throw new Error("This Online POS is not enabled for receiving or warehouse operations.");
  }

  if (!sessionHasAllPermissions(session, ["inventory.grn.receive"])) {
    throw new Error("Flash ERP requires goods-receipt privileges before receiving Online POS stock.");
  }

  const lineInputs = Array.isArray(input.lines) ? input.lines : [];

  if (lineInputs.length === 0) {
    throw new Error("Add at least one product before posting goods receipt.");
  }

  const location = await resolveOnlineStoreLocation({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    locationId: input.inventoryLocationId ?? null,
    receiving: true
  });
  const purchaseOrder = input.purchaseOrderId
    ? await prisma.purchaseOrder.findFirst({
        where: {
          id: input.purchaseOrderId,
          retailOrgId: session.retailOrgId,
          OR: [
            {
              storeId: store.id
            },
            {
              inventoryLocation: {
                storeId: store.id
              }
            }
          ],
          status: {
            in: [PurchaseOrderStatus.COMMITTED, PurchaseOrderStatus.PART_RECEIVED]
          }
        },
        select: {
          id: true,
          purchaseOrderNo: true,
          supplierId: true,
          inventoryLocationId: true,
          lines: {
            select: {
              id: true,
              productId: true,
              orderedQuantity: true,
              receivedQuantity: true,
              exceptionQuantity: true,
              unitCost: true
            }
          }
        }
      })
    : null;

  if (input.purchaseOrderId && !purchaseOrder) {
    throw new Error("Choose an open or part-received purchase order before posting receipt.");
  }

  if (purchaseOrder && purchaseOrder.inventoryLocationId !== location.id) {
    throw new Error(`${purchaseOrder.purchaseOrderNo} belongs to a different receiving location.`);
  }

  const productIds = [...new Set(lineInputs.map((line) => line.productId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: {
      retailOrgId: session.retailOrgId,
      // Tolerate mobile outbox payloads keyed by product code (legacy caches).
      OR: [{ id: { in: productIds } }, { code: { in: productIds } }],
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      department: true,
      category: true,
      subcategory: true,
      unitOfMeasure: true,
      baseCostPrice: true,
      isSerialized: true,
      trackExpiry: true,
      shelfLifeDays: true
    }
  });
  const productById = new Map<string, (typeof products)[number]>(products.map((product) => [product.id, product] as const));
  for (const product of products) {
    if (!productById.has(product.code)) productById.set(product.code, product);
  }
  const purchaseOrderLineById = new Map((purchaseOrder?.lines ?? []).map((line) => [line.id, line] as const));
  const preparedLines = lineInputs.map((line, index) => {
    const product = productById.get(line.productId);

    if (!product) {
      throw new Error("One of the selected receipt products is no longer available.");
    }

    const quantity = normalizeQuantity(line.quantity);
    const serialNumbers = normalizeSerialNumbers(line.serialNumbers);
    const purchaseOrderLine = line.purchaseOrderLineId ? purchaseOrderLineById.get(line.purchaseOrderLineId) : null;

    if (line.purchaseOrderLineId && !purchaseOrderLine) {
      throw new Error("One of the selected receipt lines no longer belongs to the purchase order.");
    }

    if (purchaseOrderLine && purchaseOrderLine.productId !== product.id) {
      throw new Error("One of the selected receipt lines does not match the purchase order product.");
    }

    if (purchaseOrderLine) {
      const outstandingQuantity = toQuantity(
        Number(purchaseOrderLine.orderedQuantity) -
          Number(purchaseOrderLine.receivedQuantity) -
          Number(purchaseOrderLine.exceptionQuantity)
      );

      if (quantity > outstandingQuantity) {
        throw new Error(
          `${product.name} has only ${formatNumberForMessage(outstandingQuantity)} outstanding on ${purchaseOrder?.purchaseOrderNo}.`
        );
      }
    }

    if (product.isSerialized) {
      if (!Number.isInteger(quantity)) {
        throw new Error(`${product.name} is serialized. Receive whole-unit quantities only.`);
      }

      if (serialNumbers.length !== quantity) {
        throw new Error(`${product.name} needs ${formatNumberForMessage(quantity)} serial number(s) before posting receipt.`);
      }
    } else if (serialNumbers.length > 0) {
      throw new Error(`${product.name} is not serialized, so the receipt should not include serials.`);
    }

    const requestedCost = Number(line.unitCost ?? purchaseOrderLine?.unitCost ?? product.baseCostPrice ?? 0);
    const unitCost = Number.isFinite(requestedCost) && requestedCost >= 0 ? toMoney(requestedCost) : 0;
    const batch = validateInventoryBatchReceipt({
      productName: product.name,
      trackExpiry: product.trackExpiry,
      batchNo: line.batchNo,
      manufacturedAt: line.manufacturedAt,
      expiryDate: line.expiryDate
    });

    return {
      lineNo: index + 1,
      product,
      purchaseOrderLineId: purchaseOrderLine?.id ?? null,
      quantity,
      unitCost,
      serialNumbers,
      batchNo: batch.batchNo,
      manufacturedAt: batch.manufacturedAt,
      expiryDate: batch.expiryDate
    };
  });
  const requestedSerialKeys = new Set<string>();

  for (const line of preparedLines) {
    for (const serialNumber of line.serialNumbers) {
      const key = `${line.product.id}:${serialNumber}`;

      if (requestedSerialKeys.has(key)) {
        throw new Error(`${serialNumber} was entered more than once for ${line.product.name}.`);
      }

      requestedSerialKeys.add(key);
    }
  }

  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const serializedReceiptLines = preparedLines.filter((line) => line.serialNumbers.length > 0);
    const postStockImmediately = await shouldPostStockImmediately(tx, session.retailOrgId, store.id);

    if (serializedReceiptLines.length > 0) {
      const existingSerials = await tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          OR: serializedReceiptLines.map((line) => ({
            productId: line.product.id,
            serialNumber: {
              in: line.serialNumbers
            }
          }))
        },
        select: {
          serialNumber: true,
          product: {
            select: {
              name: true
            }
          }
        }
      });

      if (existingSerials.length > 0) {
        const duplicateList = existingSerials
          .slice(0, 5)
          .map((serial) => `${serial.serialNumber} (${serial.product.name})`)
          .join(", ");

        throw new Error(`These serials already exist in Flash ERP: ${duplicateList}.`);
      }
    }

    const receiptNo = `WEB-GRN-${store.code.toUpperCase()}-${Date.now()}`;
    const receipt = await tx.goodsReceipt.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        purchaseOrderId: purchaseOrder?.id ?? null,
        supplierId: purchaseOrder?.supplierId ?? null,
        receiptNo,
        note,
        operatorName: user.displayName,
        stockUpdateStatus: postStockImmediately ? STOCK_UPDATE_STATUS_POSTED : STOCK_UPDATE_STATUS_PENDING,
        stockConfirmedAt: postStockImmediately ? now : null,
        stockConfirmedBy: postStockImmediately ? user.displayName : null,
        receivedAt: now,
        sourceNodeCode: "ONLINE_DIRECT",
        lines: {
          create: preparedLines.map((line) => ({
            lineNo: line.lineNo,
            productId: line.product.id,
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            batchNo: line.batchNo,
            manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            ...(line.serialNumbers.length > 0 ? { serialNumbersSnapshot: serializeJsonField(line.serialNumbers) } : {})
          }))
        }
      },
      select: {
        id: true,
        receiptNo: true
      }
    });

    for (const line of preparedLines) {
      if (!line.purchaseOrderLineId) {
        continue;
      }

      await tx.purchaseOrderLine.update({
        where: {
          id: line.purchaseOrderLineId
        },
        data: {
          receivedQuantity: {
            increment: line.quantity
          }
        }
      });
    }

    if (purchaseOrder) {
      const receivedByLineId = new Map<string, number>();

      for (const line of preparedLines) {
        if (!line.purchaseOrderLineId) {
          continue;
        }

        receivedByLineId.set(
          line.purchaseOrderLineId,
          toQuantity((receivedByLineId.get(line.purchaseOrderLineId) ?? 0) + line.quantity)
        );
      }

      const hasOutstandingQuantity = purchaseOrder.lines.some((line) => {
        const orderedQuantity = Number(line.orderedQuantity);
        const receivedQuantity = Number(line.receivedQuantity) + (receivedByLineId.get(line.id) ?? 0);
        const exceptionQuantity = Number(line.exceptionQuantity);

        return toQuantity(orderedQuantity - receivedQuantity - exceptionQuantity) > 0;
      });

      await tx.purchaseOrder.update({
        where: {
          id: purchaseOrder.id
        },
        data: {
          status: hasOutstandingQuantity ? PurchaseOrderStatus.PART_RECEIVED : PurchaseOrderStatus.RECEIVED
        }
      });
    }

    let fuelMirror: { deliveryNo: string | null; skippedProducts: string[] } = {
      deliveryNo: null,
      skippedProducts: []
    };

    if (postStockImmediately) {
      const inventoryBatchByLineNo = new Map<number, {
        id: string;
        batchNo: string;
        expiryDate: Date;
      }>();

      for (const line of preparedLines) {
        if (!line.batchNo || !line.expiryDate) {
          continue;
        }

        const existingBatch = await tx.inventoryBatch.findUnique({
          where: {
            retailOrgId_inventoryLocationId_productId_batchNo: {
              retailOrgId: session.retailOrgId,
              inventoryLocationId: location.id,
              productId: line.product.id,
              batchNo: line.batchNo
            }
          },
          select: { id: true, batchNo: true, expiryDate: true }
        });

        if (
          existingBatch &&
          existingBatch.expiryDate.toISOString().slice(0, 10) !== line.expiryDate
        ) {
          throw new Error(
            `${line.product.name} batch ${line.batchNo} is already registered with expiry ${existingBatch.expiryDate.toISOString().slice(0, 10)}.`
          );
        }

        const inventoryBatch = existingBatch
          ? await tx.inventoryBatch.update({
              where: { id: existingBatch.id },
              data: {
                quantityOnHand: { increment: line.quantity },
                status: "ACTIVE",
                manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : undefined,
                sourceReferenceType: "GOODS_RECEIPT",
                sourceReferenceId: receipt.id,
                sourceReferenceLabel: receipt.receiptNo,
                sourceNodeCode: "ONLINE_DIRECT",
                lastOccurredAt: now
              },
              select: { id: true, batchNo: true, expiryDate: true }
            })
          : await tx.inventoryBatch.create({
              data: {
                retailOrgId: session.retailOrgId,
                storeId: store.id,
                warehouseId: location.warehouseId,
                inventoryLocationId: location.id,
                productId: line.product.id,
                batchNo: line.batchNo,
                manufacturedAt: line.manufacturedAt ? new Date(line.manufacturedAt) : null,
                expiryDate: new Date(line.expiryDate),
                quantityOnHand: line.quantity,
                status: "ACTIVE",
                sourceReferenceType: "GOODS_RECEIPT",
                sourceReferenceId: receipt.id,
                sourceReferenceLabel: receipt.receiptNo,
                sourceNodeCode: "ONLINE_DIRECT",
                lastOccurredAt: now
              },
              select: { id: true, batchNo: true, expiryDate: true }
            });

        inventoryBatchByLineNo.set(line.lineNo, inventoryBatch);
      }

      await tx.inventoryLedgerEntry.createMany({
        data: preparedLines.map((line) => {
          const inventoryBatch = inventoryBatchByLineNo.get(line.lineNo);

          return {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            warehouseId: location.warehouseId,
            inventoryLocationId: location.id,
            productId: line.product.id,
            inventoryBatchId: inventoryBatch?.id ?? null,
            batchNoSnapshot: inventoryBatch?.batchNo ?? null,
            expiryDateSnapshot: inventoryBatch?.expiryDate ?? null,
            movementType: InventoryMovementType.GOODS_RECEIPT,
            quantity: line.quantity,
            unitCost: line.unitCost,
            referenceType: "GOODS_RECEIPT",
            referenceId: receipt.id,
            externalReference: receipt.receiptNo,
            sourceNodeCode: "ONLINE_DIRECT",
            createdByUserId: user.id,
            occurredAt: now
          };
        })
      });

      fuelMirror = await mirrorOnlineFuelReceiptToTank(tx, {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        inventoryLocationId: location.id,
        inventoryLocationCode: location.code,
        inventoryLocationName: location.name,
        referenceNo: receipt.receiptNo,
        sourceLabel: purchaseOrder?.purchaseOrderNo ?? "Online goods receipt",
        notes: purchaseOrder
          ? `Mirrored from online-store GRN ${receipt.receiptNo} for ${purchaseOrder.purchaseOrderNo}.`
          : `Mirrored from direct online-store GRN ${receipt.receiptNo}.`,
        occurredAt: now,
        lines: preparedLines.map((line) => ({
          product: line.product,
          quantity: line.quantity,
          unitCost: line.unitCost
        }))
      });

      const serialRows = serializedReceiptLines.flatMap((line) =>
        line.serialNumbers.map((serialNumber) => ({
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          warehouseId: location.warehouseId,
          inventoryLocationId: location.id,
          productId: line.product.id,
          serialNumber,
          status: SerialInventoryStatus.AVAILABLE,
          sourceReferenceType: "GOODS_RECEIPT",
          sourceReferenceId: receipt.id,
          sourceReferenceLabel: receipt.receiptNo,
          sourceNodeCode: "ONLINE_DIRECT",
          lastOccurredAt: now
        }))
      );

      if (serialRows.length > 0) {
        await tx.inventorySerialUnit.createMany({
          data: serialRows
        });
      }
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "GOODS_RECEIPT_POSTED",
        actorLabel: user.loginId,
        targetType: "Goods receipt",
        targetRef: receipt.receiptNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} posted online goods receipt ${receipt.receiptNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          locationCode: location.code,
          purchaseOrderNo: purchaseOrder?.purchaseOrderNo ?? null,
          lineCount: preparedLines.length
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      receiptNo: receipt.receiptNo,
      message: [
        postStockImmediately
          ? `Flash ERP posted ${receipt.receiptNo} directly in enterprise for ${store.code}.`
          : `Flash ERP saved ${receipt.receiptNo} for ${store.code}; stock update is pending HQ confirmation.`,
        fuelMirror.deliveryNo ? `Fuel tank receipt ${fuelMirror.deliveryNo} updated the matching tank book quantity.` : "",
        fuelMirror.skippedProducts.length > 0
          ? `Fuel tank mirror skipped for ${fuelMirror.skippedProducts.join(", ")} because no matching active tank exists.`
          : ""
      ].filter(Boolean).join(" "),
      serverProcessedAt: now.toISOString()
    };
  });
}

export async function createOnlineStoreSupplierReturn(
  input: CreateOnlineStoreSupplierReturnRequest
): Promise<CreateOnlineStoreSupplierReturnResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("posting online supplier return");

  if (!store.warehouseEnabled) {
    throw new Error("This Online POS is not enabled for supplier returns.");
  }

  if (!sessionHasAllPermissions(session, ["inventory.supplier-return.manage"])) {
    throw new Error("Flash ERP requires supplier-return privileges before posting supplier returns.");
  }

  const quantity = normalizeQuantity(input.quantity);
  const reason = toSupplierReturnReason(input.reason);
  const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
  const externalReference = optionalText(input.externalReference);
  const note = optionalText(input.note);

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.goodsReceipt.findFirst({
      where: {
        id: input.goodsReceiptId,
        retailOrgId: session.retailOrgId,
        storeId: store.id
      },
      select: {
        id: true,
        receiptNo: true,
        retailOrgId: true,
        storeId: true,
        warehouseId: true,
        inventoryLocationId: true,
        purchaseOrderId: true,
        supplierId: true,
        inventoryLocation: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        supplier: {
          select: {
            id: true,
            supplierNo: true,
            name: true
          }
        },
        lines: {
          where: {
            id: input.goodsReceiptLineId
          },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitCost: true,
            serialNumbersSnapshot: true,
            batchNo: true,
            expiryDate: true,
            product: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    });

    const line = receipt?.lines[0] ?? null;

    if (!receipt || !line) {
      throw new Error("Choose the original goods receipt and line before posting supplier return.");
    }

    if (!receipt.supplierId || !receipt.supplier) {
      throw new Error(`${receipt.receiptNo} does not have a supplier to return against.`);
    }

    const originalSerialNumbers = readStringArrayJson(line.serialNumbersSnapshot) ?? [];

    if (originalSerialNumbers.length > 0) {
      if (serialNumbers.length === 0) {
        throw new Error(`${line.product.name} is serialized. Select the returned serial number(s).`);
      }

      const allowedSerials = new Set(originalSerialNumbers.map((serial) => serial.toUpperCase()));
      const invalidSerials = serialNumbers.filter((serial) => !allowedSerials.has(serial));

      if (invalidSerials.length > 0) {
        throw new Error(`${invalidSerials.join(", ")} were not received on ${receipt.receiptNo}.`);
      }

      if (serialNumbers.length !== quantity) {
        throw new Error(`${line.product.name} needs ${quantity} returned serial number(s).`);
      }
    } else if (serialNumbers.length > 0) {
      throw new Error(`${line.product.name} is not serialized, so supplier return should not include serials.`);
    }

    const previousReturns = await tx.supplierReturnLine.aggregate({
      where: {
        goodsReceiptLineId: line.id,
        supplierReturn: {
          status: SupplierReturnStatus.POSTED
        }
      },
      _sum: {
        quantity: true
      }
    });
    const returnableQuantity = toQuantity(Number(line.quantity) - toQuantity(previousReturns._sum.quantity));

    if (quantity > returnableQuantity) {
      throw new Error(`${line.product.name} has only ${formatNumberForMessage(returnableQuantity)} returnable on ${receipt.receiptNo}.`);
    }

    const currentStock = await tx.inventoryLedgerEntry.aggregate({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        inventoryLocationId: receipt.inventoryLocationId,
        productId: line.productId
      },
      _sum: {
        quantity: true
      }
    });

    if (quantity > toQuantity(currentStock._sum.quantity)) {
      throw new Error(`${line.product.name} does not have enough on-hand quantity in ${receipt.inventoryLocation.name}.`);
    }

    const batch = line.batchNo && line.expiryDate
      ? await tx.inventoryBatch.findFirst({
          where: {
            retailOrgId: session.retailOrgId,
            inventoryLocationId: receipt.inventoryLocationId,
            productId: line.productId,
            batchNo: line.batchNo
          }
        })
      : null;
    const batchAllocations: InventoryBatchAllocation[] = batch
      ? [{
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate.toISOString().slice(0, 10),
          quantity
        }]
      : [];

    if (line.batchNo && (!batch || quantity > toQuantity(batch.quantityOnHand))) {
      throw new Error(
        `${line.product.name} batch ${line.batchNo} does not have ${formatNumberForMessage(quantity)} returnable unit(s) in ${receipt.inventoryLocation.name}.`
      );
    }

    const now = new Date();
    const supplierReturnNo = `WEB-SR-${store.code.toUpperCase()}-${Date.now()}`;
    const supplierReturn = await tx.supplierReturn.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        warehouseId: receipt.warehouseId,
        inventoryLocationId: receipt.inventoryLocationId,
        supplierId: receipt.supplierId,
        purchaseOrderId: receipt.purchaseOrderId,
        goodsReceiptId: receipt.id,
        supplierReturnNo,
        externalReference: externalReference ?? supplierReturnNo,
        reason,
        status: SupplierReturnStatus.POSTED,
        note,
        operatorName: user.displayName,
        returnedAt: now,
        postedAt: now,
        sourceNodeCode: "ONLINE_DIRECT",
        lines: {
          create: {
            lineNo: 1,
            goodsReceiptLineId: line.id,
            productId: line.productId,
            quantity,
            unitCost: line.unitCost,
            ...(serialNumbers.length > 0 ? { serialNumbersSnapshot: serializeJsonField(serialNumbers) } : {}),
            ...(batchAllocations.length > 0
              ? { batchAllocationsSnapshot: serializeJsonField(batchAllocations) }
              : {})
          }
        }
      },
      select: {
        id: true,
        supplierReturnNo: true
      }
    });

    if (batch) {
      const nextBatchQuantity = toQuantity(Number(batch.quantityOnHand) - quantity);
      const batchUpdate = await tx.inventoryBatch.updateMany({
        where: {
          id: batch.id,
          quantityOnHand: {
            gte: quantity
          }
        },
        data: {
          quantityOnHand: nextBatchQuantity,
          status: deriveInventoryBatchStatus({
            expiryDate: batch.expiryDate,
            quantityOnHand: nextBatchQuantity,
            status: batch.status
          }),
          sourceReferenceType: "SUPPLIER_RETURN",
          sourceReferenceId: supplierReturn.id,
          sourceReferenceLabel: supplierReturn.supplierReturnNo,
          sourceNodeCode: "ONLINE_DIRECT",
          lastOccurredAt: now
        }
      });

      if (batchUpdate.count !== 1) {
        throw new Error(`Flash ERP could not reserve ${line.product.name} batch ${batch.batchNo} for this supplier return.`);
      }
    }

    await tx.inventoryLedgerEntry.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        warehouseId: receipt.warehouseId,
        inventoryLocationId: receipt.inventoryLocationId,
        productId: line.productId,
        inventoryBatchId: batch?.id ?? null,
        batchNoSnapshot: batch?.batchNo ?? null,
        expiryDateSnapshot: batch?.expiryDate ?? null,
        movementType: InventoryMovementType.RETURN_TO_VENDOR,
        quantity: quantity * -1,
        unitCost: line.unitCost,
        referenceType: "SUPPLIER_RETURN",
        referenceId: supplierReturn.id,
        externalReference: supplierReturn.supplierReturnNo,
        sourceNodeCode: "ONLINE_DIRECT",
        createdByUserId: user.id,
        occurredAt: now
      }
    });

    if (serialNumbers.length > 0) {
      const serialUpdate = await tx.inventorySerialUnit.updateMany({
        where: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          inventoryLocationId: receipt.inventoryLocationId,
          productId: line.productId,
          serialNumber: {
            in: serialNumbers
          },
          status: SerialInventoryStatus.AVAILABLE
        },
        data: {
          status: SerialInventoryStatus.ADJUSTED_OUT,
          sourceReferenceType: "SUPPLIER_RETURN",
          sourceReferenceId: supplierReturn.id,
          sourceReferenceLabel: supplierReturn.supplierReturnNo,
          sourceNodeCode: "ONLINE_DIRECT",
          lastOccurredAt: now
        }
      });

      if (serialUpdate.count !== serialNumbers.length) {
        throw new Error(
          `Flash ERP could not mark every selected serial as returned. Refresh the GRN and choose currently available serials.`
        );
      }
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "SUPPLIER_RETURN_POSTED",
        actorLabel: user.loginId,
        targetType: "Supplier return",
        targetRef: supplierReturn.supplierReturnNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} posted online supplier return ${supplierReturn.supplierReturnNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          goodsReceiptNo: receipt.receiptNo,
          supplierNo: receipt.supplier.supplierNo,
          productCode: line.product.code,
          quantity,
          reason
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      supplierReturnNo: supplierReturn.supplierReturnNo,
      message: `Flash ERP posted ${supplierReturn.supplierReturnNo} against ${receipt.receiptNo}.`,
      serverProcessedAt: now.toISOString()
    };
  });
}

export async function createOnlineStoreStockCount(
  input: CreateOnlineStoreStockCountRequest
): Promise<CreateOnlineStoreStockCountResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("posting Online POS stock count");

  if (!store.warehouseEnabled) {
    throw new Error("This Online POS is not enabled for inventory count operations.");
  }

  if (!sessionHasAllPermissions(session, ["inventory.count.submit"])) {
    throw new Error("Flash ERP requires stock-count submission privileges before saving count rows.");
  }

  if (input.commitNow !== false && !sessionHasAllPermissions(session, ["inventory.count.commit"])) {
    throw new Error("Flash ERP requires stock-count commit privileges before committing count rows.");
  }

  const countedQuantity = normalizeNonNegativeQuantity(input.countedQuantity, "counted");
  const location = await resolveOnlineStoreLocation({
    retailOrgId: session.retailOrgId,
    storeId: store.id,
    locationId: input.inventoryLocationId ?? null,
    receiving: false
  });
  const product = await prisma.product.findFirst({
    where: {
      retailOrgId: session.retailOrgId,
      id: input.productId,
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      id: true,
      code: true,
      name: true,
      baseCostPrice: true,
      trackInventory: true,
      trackExpiry: true
    }
  });

  if (!product) {
    throw new Error("Choose an active product before posting a stock count.");
  }

  if (!product.trackInventory) {
    throw new Error(`${product.name} is not configured as an inventory-tracked product.`);
  }

  const note = optionalText(input.note);

  return prisma.$transaction(async (tx) => {
    const currentPosition = await tx.inventoryLedgerEntry.aggregate({
      where: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        inventoryLocationId: location.id,
        productId: product.id
      },
      _sum: {
        quantity: true
      }
    });
    const previousQuantity = toQuantity(currentPosition._sum.quantity);
    const varianceQuantity = toQuantity(countedQuantity - previousQuantity);
    const batchRows = product.trackExpiry
      ? await tx.inventoryBatch.findMany({
          where: {
            retailOrgId: session.retailOrgId,
            inventoryLocationId: location.id,
            productId: product.id,
            quantityOnHand: { gt: 0 }
          },
          orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }]
        })
      : [];
    const previousBatchQuantities: InventoryBatchAllocation[] = batchRows.map((batch) => ({
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate.toISOString().slice(0, 10),
      quantity: toQuantity(batch.quantityOnHand)
    }));
    const requestedBatchCounts = Array.isArray(input.batchCounts) ? input.batchCounts : [];
    const countedByBatchId = new Map<string, number>();

    for (const batchCount of requestedBatchCounts) {
      const batchId = optionalText(batchCount.batchId);

      if (!batchId || countedByBatchId.has(batchId)) {
        throw new Error(`Enter one counted quantity for each ${product.name} batch.`);
      }

      countedByBatchId.set(
        batchId,
        normalizeNonNegativeQuantity(batchCount.countedQuantity, "batch counted")
      );
    }

    if (product.trackExpiry) {
      if (countedQuantity > 0 && batchRows.length === 0) {
        throw new Error(`${product.name} has no batch register. Receive a valid batch before recording positive stock.`);
      }

      const missingBatch = batchRows.find((batch) => !countedByBatchId.has(batch.id));
      const unknownBatch = [...countedByBatchId.keys()].find((batchId) => !batchRows.some((batch) => batch.id === batchId));

      if (missingBatch || unknownBatch) {
        throw new Error(`Count every active batch of ${product.name} before saving the stock count.`);
      }
    }

    const countedBatchQuantities: InventoryBatchAllocation[] = batchRows.map((batch) => ({
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate.toISOString().slice(0, 10),
      quantity: countedByBatchId.get(batch.id) ?? 0
    }));
    const countedBatchTotal = toQuantity(
      countedBatchQuantities.reduce((sum, batch) => sum + batch.quantity, 0)
    );

    if (product.trackExpiry && Math.abs(countedBatchTotal - countedQuantity) > 0.0001) {
      throw new Error(
        `${product.name} batch counts total ${formatNumberForMessage(countedBatchTotal)}, not ${formatNumberForMessage(countedQuantity)}.`
      );
    }
    const requestedSheetNo = optionalText(input.sheetNo)?.toUpperCase() ?? null;
    const requestedLineNo = Math.max(1, Math.trunc(Number(input.lineNo ?? 1)));
    const sessionNo = requestedSheetNo
      ? `${requestedSheetNo}-L${String(requestedLineNo).padStart(3, "0")}`
      : `WEB-CNT-${store.code.toUpperCase()}-${Date.now()}`;
    const now = new Date();
    const commitNow = input.commitNow !== false;
    const countSession = await tx.stockCountSession.create({
      data: {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        productId: product.id,
        sessionNo,
        status: commitNow ? StockCountSessionStatus.COMMITTED : StockCountSessionStatus.SUBMITTED,
        previousQuantity,
        countedQuantity,
        varianceQuantity,
        previousBatchQuantitiesSnapshot: product.trackExpiry
          ? serializeJsonField(previousBatchQuantities)
          : null,
        countedBatchQuantitiesSnapshot: product.trackExpiry
          ? serializeJsonField(countedBatchQuantities)
          : null,
        note,
        operatorName: user.displayName,
        submittedByNodeCode: "ONLINE_DIRECT",
        committedByNodeCode: commitNow ? "ONLINE_DIRECT" : null,
        submittedAt: now,
        committedAt: commitNow ? now : null
      },
      select: {
        id: true,
        sessionNo: true,
        status: true
      }
    });

    if (commitNow && product.trackExpiry) {
      for (const countedBatch of countedBatchQuantities) {
        const previousBatch = previousBatchQuantities.find((batch) => batch.batchId === countedBatch.batchId);
        const batch = batchRows.find((candidate) => candidate.id === countedBatch.batchId);

        if (!previousBatch || !batch) {
          throw new Error(`Flash ERP could not verify every ${product.name} batch during count commit.`);
        }

        const batchVariance = toQuantity(countedBatch.quantity - previousBatch.quantity);
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantityOnHand: countedBatch.quantity,
            status: deriveInventoryBatchStatus({
              expiryDate: batch.expiryDate,
              quantityOnHand: countedBatch.quantity,
              status: batch.status
            }),
            sourceReferenceType: "STOCK_COUNT",
            sourceReferenceId: countSession.id,
            sourceReferenceLabel: countSession.sessionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: now
          }
        });

        if (batchVariance !== 0) {
          await tx.inventoryLedgerEntry.create({
            data: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              warehouseId: location.warehouseId,
              inventoryLocationId: location.id,
              productId: product.id,
              inventoryBatchId: batch.id,
              batchNoSnapshot: batch.batchNo,
              expiryDateSnapshot: batch.expiryDate,
              movementType: InventoryMovementType.COUNT_VARIANCE,
              quantity: batchVariance,
              unitCost: product.baseCostPrice,
              referenceType: "STOCK_COUNT",
              referenceId: countSession.id,
              externalReference: countSession.sessionNo,
              sourceNodeCode: "ONLINE_DIRECT",
              createdByUserId: user.id,
              occurredAt: now
            }
          });
        }
      }
    } else if (commitNow && varianceQuantity !== 0) {
      await tx.inventoryLedgerEntry.create({
        data: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          warehouseId: location.warehouseId,
          inventoryLocationId: location.id,
          productId: product.id,
          movementType: InventoryMovementType.COUNT_VARIANCE,
          quantity: varianceQuantity,
          unitCost: product.baseCostPrice,
          referenceType: "STOCK_COUNT",
          referenceId: countSession.id,
          externalReference: countSession.sessionNo,
          sourceNodeCode: "ONLINE_DIRECT",
          createdByUserId: user.id,
          occurredAt: now
        }
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: commitNow ? "STOCK_COUNT_COMMITTED" : "STOCK_COUNT_SUBMITTED",
        actorLabel: user.loginId,
        targetType: "Stock count",
        targetRef: countSession.sessionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} ${commitNow ? "committed" : "saved"} online stock count ${countSession.sessionNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          locationCode: location.code,
          productCode: product.code,
          previousQuantity,
          countedQuantity,
          varianceQuantity
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      sessionId: countSession.id,
      sessionNo: countSession.sessionNo,
      status: countSession.status,
      previousQuantity,
      countedQuantity,
      varianceQuantity,
      message: commitNow
        ? `${countSession.sessionNo} counted ${product.name} at ${formatNumberForMessage(countedQuantity)} with variance ${formatNumberForMessage(varianceQuantity)}.`
        : `${countSession.sessionNo} was saved for review with variance ${formatNumberForMessage(varianceQuantity)}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function commitOnlineStoreStockCount(
  input: { sessionId?: string | null; sessionNo?: string | null }
): Promise<CommitOnlineStoreStockCountResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation("committing Online POS stock count");
  const sessionId = optionalText(input.sessionId);
  const sessionNo = optionalText(input.sessionNo);

  if (!sessionHasAllPermissions(session, ["inventory.count.commit"])) {
    throw new Error("Flash ERP requires stock-count commit privileges before committing count sessions.");
  }

  if (!sessionId && !sessionNo) {
    throw new Error("Choose a stock count session before committing.");
  }

  const countSession = await prisma.stockCountSession.findFirst({
    where: {
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      ...(sessionId ? { id: sessionId } : { sessionNo: sessionNo ?? "" })
    },
    select: {
      id: true,
      sessionNo: true,
      status: true,
      previousQuantity: true,
      countedQuantity: true,
      varianceQuantity: true,
      previousBatchQuantitiesSnapshot: true,
      countedBatchQuantitiesSnapshot: true,
      inventoryLocationId: true,
      warehouseId: true,
      productId: true,
      inventoryLocation: {
        select: {
          code: true
        }
      },
      product: {
        select: {
          code: true,
          name: true,
          baseCostPrice: true,
          trackExpiry: true
        }
      }
    }
  });

  if (!countSession) {
    throw new Error("Flash ERP could not find that online stock count session.");
  }

  if (countSession.status === StockCountSessionStatus.COMMITTED) {
    throw new Error(`${countSession.sessionNo} is already committed.`);
  }

  if (countSession.status === StockCountSessionStatus.CANCELLED) {
    throw new Error(`${countSession.sessionNo} is cancelled and cannot be committed.`);
  }

  const varianceQuantity = toQuantity(countSession.varianceQuantity);
  const previousBatchQuantities = readInventoryBatchAllocations(
    countSession.previousBatchQuantitiesSnapshot
  );
  const countedBatchQuantities = readInventoryBatchAllocations(
    countSession.countedBatchQuantitiesSnapshot
  );
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    if (countSession.product.trackExpiry) {
      if (previousBatchQuantities.length !== countedBatchQuantities.length) {
        throw new Error(
          `${countSession.sessionNo} has incomplete batch-count details and cannot be committed.`
        );
      }

      for (const countedBatch of countedBatchQuantities) {
        const previousBatch = previousBatchQuantities.find(
          (batch) => batch.batchId === countedBatch.batchId
        );

        if (!previousBatch?.batchId) {
          throw new Error(`${countSession.sessionNo} has an invalid batch-count line.`);
        }

        const batch = await tx.inventoryBatch.findUnique({
          where: { id: previousBatch.batchId }
        });

        if (!batch || Math.abs(toQuantity(batch.quantityOnHand) - previousBatch.quantity) > 0.0001) {
          throw new Error(
            `${countSession.sessionNo} is stale because batch ${previousBatch.batchNo} changed after submission. Recount the item.`
          );
        }

        const batchVariance = toQuantity(countedBatch.quantity - previousBatch.quantity);
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantityOnHand: countedBatch.quantity,
            status: deriveInventoryBatchStatus({
              expiryDate: batch.expiryDate,
              quantityOnHand: countedBatch.quantity,
              status: batch.status
            }),
            sourceReferenceType: "STOCK_COUNT",
            sourceReferenceId: countSession.id,
            sourceReferenceLabel: countSession.sessionNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: now
          }
        });

        if (batchVariance !== 0) {
          await tx.inventoryLedgerEntry.create({
            data: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              warehouseId: countSession.warehouseId,
              inventoryLocationId: countSession.inventoryLocationId,
              productId: countSession.productId,
              inventoryBatchId: batch.id,
              batchNoSnapshot: batch.batchNo,
              expiryDateSnapshot: batch.expiryDate,
              movementType: InventoryMovementType.COUNT_VARIANCE,
              quantity: batchVariance,
              unitCost: countSession.product.baseCostPrice,
              referenceType: "STOCK_COUNT",
              referenceId: countSession.id,
              externalReference: countSession.sessionNo,
              sourceNodeCode: "ONLINE_DIRECT",
              createdByUserId: user.id,
              occurredAt: now
            }
          });
        }
      }
    } else if (varianceQuantity !== 0) {
      await tx.inventoryLedgerEntry.create({
        data: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          warehouseId: countSession.warehouseId,
          inventoryLocationId: countSession.inventoryLocationId,
          productId: countSession.productId,
          movementType: InventoryMovementType.COUNT_VARIANCE,
          quantity: varianceQuantity,
          unitCost: countSession.product.baseCostPrice,
          referenceType: "STOCK_COUNT",
          referenceId: countSession.id,
          externalReference: countSession.sessionNo,
          sourceNodeCode: "ONLINE_DIRECT",
          createdByUserId: user.id,
          occurredAt: now
        }
      });
    }

    await tx.stockCountSession.update({
      where: {
        id: countSession.id
      },
      data: {
        status: StockCountSessionStatus.COMMITTED,
        committedByNodeCode: "ONLINE_DIRECT",
        committedAt: now
      }
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "STOCK_COUNT_COMMITTED",
        actorLabel: user.loginId,
        targetType: "Stock count",
        targetRef: countSession.sessionNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} committed online stock count ${countSession.sessionNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          locationCode: countSession.inventoryLocation.code,
          productCode: countSession.product.code,
          previousQuantity: Number(countSession.previousQuantity),
          countedQuantity: Number(countSession.countedQuantity),
          varianceQuantity
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      sessionNo: countSession.sessionNo,
      previousQuantity: Number(countSession.previousQuantity),
      countedQuantity: Number(countSession.countedQuantity),
      varianceQuantity,
      message: `${countSession.sessionNo} was committed with variance ${formatNumberForMessage(varianceQuantity)}.`,
      serverProcessedAt: now.toISOString()
    };
  });
}

export async function createOnlineStoreTransferRequest(
  input: CreateOnlineStoreTransferRequest
): Promise<CreateOnlineStoreTransferResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "requesting an inter-store transfer online"
  );

  if (!sessionHasAllPermissions(session, ["inventory.transfer.request"])) {
    throw new Error("Flash ERP requires transfer request privileges before requesting stock.");
  }

  const lineInputs =
    Array.isArray(input.lines) && input.lines.length > 0
      ? input.lines
      : input.productId
        ? [{ productId: input.productId, quantity: input.quantity ?? 0 }]
        : [];
  const preparedLineInputs = lineInputs.map((line) => ({
    productId: optionalText(line.productId),
    quantity: normalizeQuantity(line.quantity),
    unitOfMeasure: optionalText(line.unitOfMeasure)
  }));
  const productIds = [...new Set(preparedLineInputs.map((line) => line.productId).filter((value): value is string => Boolean(value)))];

  if (preparedLineInputs.length === 0 || productIds.length === 0) {
    throw new Error("Add at least one item before creating a transfer request.");
  }

  const [sourceStore, products, destinationLocation] = await Promise.all([
    prisma.store.findFirst({
      where: {
        retailOrgId: session.retailOrgId,
        id: input.sourceStoreId,
        status: RecordStatus.ACTIVE,
        NOT: {
          id: store.id
        }
      },
      select: {
        id: true,
        code: true,
        inventoryLocations: {
          where: {
            status: RecordStatus.ACTIVE
          },
          orderBy: [
            { useForSalesDefault: "desc" },
            { useForReceivingDefault: "desc" },
            { name: "asc" }
          ],
          take: 1,
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        id: {
          in: productIds
        },
        status: RecordStatus.ACTIVE,
        deletedAt: null
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        shortName: true,
        department: true,
        category: true,
        subcategory: true,
        baseCostPrice: true,
        unitOfMeasure: true,
        baseUnitOfMeasure: { select: { code: true } },
        uomSchedule: {
          select: {
            baseUnitOfMeasure: { select: { code: true } },
            lines: {
              select: {
                conversionFactor: true,
                unitOfMeasure: { select: { code: true } }
              }
            }
          }
        }
      }
    }),
    resolveOnlineStoreLocation({
      retailOrgId: session.retailOrgId,
      storeId: store.id,
      locationId: input.destinationInventoryLocationId ?? null,
      receiving: true
    })
  ]);

  if (!sourceStore?.inventoryLocations[0]) {
    throw new Error("Choose an active source store with an inventory location.");
  }

  if (products.length !== productIds.length) {
    throw new Error("Choose active products for every transfer request line.");
  }

  const productById = new Map(products.map((product) => [product.id, product] as const));
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  const externalReference = optionalText(input.externalReference);
  const requiredAt = optionalText(input.requiredAt);
  const requiredAtDate = requiredAt ? new Date(`${requiredAt}T00:00:00`) : null;
  const requestedTransferBatchNo = optionalText(input.transferBatchNo);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const timestamp = now.getTime();
    const existingDrafts = requestedTransferBatchNo
      ? await tx.interStoreTransfer.findMany({
          where: {
            retailOrgId: session.retailOrgId,
            transferBatchNo: requestedTransferBatchNo
          },
          select: {
            id: true,
            destinationStoreId: true,
            origin: true,
            status: true
          }
        })
      : [];

    if (requestedTransferBatchNo && existingDrafts.length === 0) {
      throw new Error("Flash ERP could not find that online transfer request draft.");
    }

    if (
      existingDrafts.some(
        (draft) =>
          draft.destinationStoreId !== store.id ||
          draft.origin !== InterStoreTransferOrigin.STORE_REQUEST ||
          draft.status !== InterStoreTransferStatus.DRAFT
      )
    ) {
      throw new Error(
        `${requestedTransferBatchNo} is not an amendable draft for this Online POS shop.`
      );
    }

    if (existingDrafts.length > 0) {
      await tx.interStoreTransfer.deleteMany({
        where: {
          id: { in: existingDrafts.map((draft) => draft.id) }
        }
      });
    }

    const transferBatchNo =
      requestedTransferBatchNo ??
      `WEB-TRF-${store.code.toUpperCase()}-${timestamp}`;
    const createdTransfers = [];

    for (const [index, lineInput] of preparedLineInputs.entries()) {
      const product = lineInput.productId ? productById.get(lineInput.productId) : null;

      if (!product) {
        throw new Error("Choose active products for every transfer request line.");
      }

      const transferUom = resolveOnlineTransferUom(
        product,
        lineInput.quantity,
        lineInput.unitOfMeasure
      );

      const transferNo = `${transferBatchNo}-${index + 1}`;
      const transfer = await tx.interStoreTransfer.create({
        data: {
          retailOrgId: session.retailOrgId,
          sourceStoreId: sourceStore.id,
          destinationStoreId: store.id,
          sourceInventoryLocationId: sourceStore.inventoryLocations[0].id,
          destinationInventoryLocationId: destinationLocation.id,
          productId: product.id,
          transferNo,
          transferBatchNo,
          lineNo: index + 1,
          externalReference,
          workflowType: isFuelTransferProduct(product) ? "FUEL_TRANSFER" : null,
          origin: InterStoreTransferOrigin.STORE_REQUEST,
          status: InterStoreTransferStatus.DRAFT,
          requestedQuantity: transferUom.baseQuantity,
          requestedUnitOfMeasure: transferUom.requestedUnitOfMeasure,
          requestedUnitQuantity: transferUom.requestedUnitQuantity,
          uomConversionFactor: transferUom.uomConversionFactor,
          baseUnitOfMeasure: transferUom.baseUnitOfMeasure,
          unitCost: product.baseCostPrice ? Number(product.baseCostPrice) : null,
          transporterName: optionalText(input.transporterName),
          vehicleRegistrationNo: optionalText(input.vehicleRegistrationNo),
          driverName: optionalText(input.driverName),
          driverContact: optionalText(input.driverContact),
          deliveryNoteNo: optionalText(input.deliveryNoteNo),
          requestNote: note,
          requestOperatorName: user.displayName,
          requestedByNodeCode: "ONLINE_DIRECT",
          destinationNodeCode: "ONLINE_DIRECT",
          requiredAt: requiredAtDate && Number.isFinite(requiredAtDate.getTime()) ? requiredAtDate : null
        },
        select: {
          id: true,
          transferNo: true,
          transferBatchNo: true,
          productId: true,
          requestedQuantity: true
        }
      });

      createdTransfers.push({
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        productId: transfer.productId,
        quantity: toQuantity(transfer.requestedQuantity)
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: existingDrafts.length > 0 ? "TRANSFER_DRAFT_AMENDED" : "TRANSFER_DRAFT_SAVED",
        actorLabel: user.loginId,
        targetType: "Inter-store transfer",
        targetRef: transferBatchNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} ${existingDrafts.length > 0 ? "amended" : "saved"} online transfer draft ${transferBatchNo} for ${store.code}.`,
        detailsJson: serializeJsonField({
          sourceStoreCode: sourceStore.code,
          destinationStoreCode: store.code,
          lineCount: createdTransfers.length,
          quantity: toQuantity(createdTransfers.reduce((sum, line) => sum + line.quantity, 0))
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      transferNo: createdTransfers[0]?.transferNo ?? transferBatchNo,
      transferBatchNo,
      createdTransfers,
      message: `${transferBatchNo} was ${existingDrafts.length > 0 ? "updated" : "saved"} as a ${createdTransfers.length}-line draft. Send it when it is ready for the source shop.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function submitOnlineStoreTransferRequest(
  transferBatchNoInput: string
): Promise<CreateOnlineStoreTransferResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    "sending an inter-store transfer request online"
  );

  if (!sessionHasAllPermissions(session, ["inventory.transfer.request"])) {
    throw new Error("Flash ERP requires transfer request privileges before sending stock requests.");
  }

  const transferBatchNo = optionalText(transferBatchNoInput);

  if (!transferBatchNo) {
    throw new Error("Choose a saved transfer request draft before sending it.");
  }

  return prisma.$transaction(async (tx) => {
    const drafts = await tx.interStoreTransfer.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        destinationStoreId: store.id,
        transferBatchNo
      },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        productId: true,
        requestedQuantity: true,
        origin: true,
        status: true
      }
    });

    if (drafts.length === 0) {
      throw new Error("Flash ERP could not find that online transfer request draft.");
    }

    if (
      drafts.some(
        (draft) =>
          draft.origin !== InterStoreTransferOrigin.STORE_REQUEST ||
          draft.status !== InterStoreTransferStatus.DRAFT
      )
    ) {
      throw new Error(`${transferBatchNo} has already been sent and cannot be sent again.`);
    }

    const now = new Date();
    await tx.interStoreTransfer.updateMany({
      where: { id: { in: drafts.map((draft) => draft.id) } },
      data: {
        status: InterStoreTransferStatus.REQUESTED,
        requestedAt: now,
        requestedByNodeCode: "ONLINE_DIRECT",
        destinationNodeCode: "ONLINE_DIRECT"
      }
    });

    for (const transfer of drafts) {
      await queueInterStoreTransferPublication(tx, {
        transferId: transfer.id,
        publishedAt: now
      });
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "TRANSFER_REQUEST_SENT",
        actorLabel: user.loginId,
        targetType: "Inter-store transfer",
        targetRef: transferBatchNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} sent online transfer request ${transferBatchNo} from ${store.code}.`,
        detailsJson: serializeJsonField({
          destinationStoreCode: store.code,
          lineCount: drafts.length,
          quantity: toQuantity(
            drafts.reduce(
              (sum, transfer) => sum + Number(transfer.requestedQuantity),
              0
            )
          )
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      transferNo: drafts[0]?.transferNo ?? transferBatchNo,
      transferBatchNo,
      createdTransfers: drafts.map((transfer) => ({
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        productId: transfer.productId,
        quantity: toQuantity(transfer.requestedQuantity)
      })),
      message: `${transferBatchNo} was sent with ${drafts.length} line(s) and is now pending issue by the source shop.`,
      serverProcessedAt: now.toISOString()
    };
  });
}

export async function processOnlineStoreTransfer(
  input: {
    transferId?: string | null;
    action: "ISSUE" | "RECEIVE";
    sourceInventoryLocationId?: string | null;
    quantity: number;
    serialNumbers?: string[] | null;
    transporterName?: string | null;
    vehicleRegistrationNo?: string | null;
    driverName?: string | null;
    driverContact?: string | null;
    deliveryNoteNo?: string | null;
    note?: string | null;
  }
): Promise<ProcessOnlineStoreTransferResponse> {
  const { session, user, store } = await requireOnlineStoreForOperation(
    input.action === "ISSUE" ? "issuing an inter-store transfer online" : "receiving an inter-store transfer online"
  );
  const requiredPermission = input.action === "ISSUE" ? "inventory.transfer.issue" : "inventory.transfer.receive";

  if (!sessionHasAllPermissions(session, [requiredPermission])) {
    throw new Error(
      input.action === "ISSUE"
        ? "Flash ERP requires transfer issue privileges before issuing stock."
        : "Flash ERP requires transfer receipt privileges before receiving stock."
    );
  }

  const transferId = optionalText(input.transferId);
  const quantity = normalizeQuantity(input.quantity);
  const requestedSourceLocationId = optionalText(
    input.sourceInventoryLocationId
  );
  const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
  const note = optionalText(input.note);
  const transporterName = optionalText(input.transporterName);
  const vehicleRegistrationNo = optionalText(input.vehicleRegistrationNo);
  const driverName = optionalText(input.driverName);
  const driverContact = optionalText(input.driverContact);
  const deliveryNoteNo = optionalText(input.deliveryNoteNo);

  if (!transferId) {
    throw new Error("Choose an inter-store transfer before processing stock.");
  }

  const transfer = await prisma.interStoreTransfer.findFirst({
    where: {
      id: transferId,
      retailOrgId: session.retailOrgId,
      OR: [
        { sourceStoreId: store.id },
        { destinationStoreId: store.id }
      ]
    },
    select: {
      id: true,
      transferNo: true,
      status: true,
      requestedQuantity: true,
      issuedQuantity: true,
      receivedQuantity: true,
      unitCost: true,
      issuedSerialNumbersSnapshot: true,
      receivedSerialNumbersSnapshot: true,
      issuedBatchAllocationsSnapshot: true,
      receivedBatchAllocationsSnapshot: true,
      sourceStoreId: true,
      destinationStoreId: true,
      sourceInventoryLocationId: true,
      destinationInventoryLocationId: true,
      closedAt: true,
      sourceInventoryLocation: {
        select: {
          code: true,
          name: true,
          warehouseId: true
        }
      },
      destinationInventoryLocation: {
        select: {
          code: true,
          name: true,
          warehouseId: true
        }
      },
      product: {
        select: {
          id: true,
          code: true,
          sku: true,
          name: true,
          shortName: true,
          department: true,
          category: true,
          subcategory: true,
          unitOfMeasure: true,
          baseCostPrice: true,
          isSerialized: true,
          trackExpiry: true
        }
      }
    }
  });

  if (!transfer) {
    throw new Error("Flash ERP could not find that inter-store transfer for this Online POS.");
  }

  const requestedQuantity = toQuantity(transfer.requestedQuantity);
  const issuedQuantity = toQuantity(transfer.issuedQuantity);
  const receivedQuantity = toQuantity(transfer.receivedQuantity);
  const issuedSerialNumbers = readStringArrayJson(transfer.issuedSerialNumbersSnapshot) ?? [];
  const receivedSerialNumbers = readStringArrayJson(transfer.receivedSerialNumbersSnapshot) ?? [];
  const issuedBatchAllocations = readInventoryBatchAllocations(transfer.issuedBatchAllocationsSnapshot);
  const receivedBatchAllocations = readInventoryBatchAllocations(transfer.receivedBatchAllocationsSnapshot);
  const now = new Date();

  if (transfer.product.isSerialized) {
    if (!Number.isInteger(quantity) || serialNumbers.length !== quantity) {
      throw new Error(`Serialized transfer ${transfer.transferNo} needs ${formatNumberForMessage(quantity)} serial number(s).`);
    }
  } else if (serialNumbers.length > 0) {
    throw new Error(`${transfer.product.name} is not serialized, so this transfer cannot include serial numbers.`);
  }

  return prisma.$transaction(async (tx) => {
    if (input.action === "ISSUE") {
      const postStockImmediately = await shouldPostStockImmediately(tx, session.retailOrgId, store.id);

      if (transfer.sourceStoreId !== store.id) {
        throw new Error(`${transfer.transferNo} is not waiting for issue from this Online POS.`);
      }

      if (
        transfer.status !== InterStoreTransferStatus.REQUESTED &&
        transfer.status !== InterStoreTransferStatus.PART_ISSUED &&
        transfer.status !== InterStoreTransferStatus.PART_RECEIVED
      ) {
        throw new Error(`${transfer.transferNo} is ${String(transfer.status).toLowerCase().replace(/_/g, " ")} and cannot issue more stock.`);
      }

      const selectedSourceLocation = requestedSourceLocationId
        ? await tx.inventoryLocation.findFirst({
            where: {
              id: requestedSourceLocationId,
              retailOrgId: session.retailOrgId,
              storeId: transfer.sourceStoreId,
              status: RecordStatus.ACTIVE
            },
            select: {
              id: true,
              code: true,
              name: true,
              warehouseId: true
            }
          })
        : null;

      if (!selectedSourceLocation) {
        throw new Error(
          "Choose the dispatch location in this source shop before issuing stock."
        );
      }

      if (
        issuedQuantity > 0 &&
        selectedSourceLocation.id !== transfer.sourceInventoryLocationId
      ) {
        throw new Error(
          `${transfer.transferNo} has already started issuing from ${transfer.sourceInventoryLocation.name}; complete it from the same location.`
        );
      }

      if (
        issuedQuantity <= 0 &&
        selectedSourceLocation.id !== transfer.sourceInventoryLocationId
      ) {
        await tx.interStoreTransfer.update({
          where: { id: transfer.id },
          data: {
            sourceInventoryLocationId: selectedSourceLocation.id
          }
        });
      }

      const outstandingIssueQuantity = toQuantity(Math.max(0, requestedQuantity - issuedQuantity));

      if (quantity - outstandingIssueQuantity > 0.0001) {
        throw new Error(`Only ${formatNumberForMessage(outstandingIssueQuantity)} unit(s) remain to issue on ${transfer.transferNo}.`);
      }

      const sourcePosition = await tx.inventoryLedgerEntry.aggregate({
        where: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          inventoryLocationId: selectedSourceLocation.id,
          productId: transfer.product.id
        },
        _sum: {
          quantity: true
        }
      });
      const availableQuantity = toQuantity(sourcePosition._sum.quantity);

      if (quantity - availableQuantity > 0.0001) {
        throw new Error(`Only ${formatNumberForMessage(availableQuantity)} ${transfer.product.name} is available in ${selectedSourceLocation.code}.`);
      }

      const issueBatchAllocations = transfer.product.trackExpiry
        ? allocateInventoryBatchesFefo({
            productName: transfer.product.name,
            quantity,
            batches: (await tx.inventoryBatch.findMany({
              where: {
                retailOrgId: session.retailOrgId,
                inventoryLocationId: selectedSourceLocation.id,
                productId: transfer.product.id,
                quantityOnHand: { gt: 0 }
              },
              orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }]
            })).map((batch) => ({
              batchId: batch.id,
              batchNo: batch.batchNo,
              manufacturedAt: batch.manufacturedAt?.toISOString() ?? null,
              expiryDate: batch.expiryDate.toISOString(),
              quantityOnHand: toQuantity(batch.quantityOnHand),
              status: batch.status
            }))
          })
        : [];

      const nextIssuedQuantity = toQuantity(issuedQuantity + quantity);
      const nextStatus = deriveOnlineTransferStatus({
        requestedQuantity,
        issuedQuantity: nextIssuedQuantity,
        receivedQuantity,
        currentStatus: transfer.status,
        closedAt: transfer.closedAt
      });
      const nextIssuedSerialNumbers = normalizeSerialNumbers([...issuedSerialNumbers, ...serialNumbers]);

      if (transfer.product.isSerialized) {
        const availableSerialCount = await tx.inventorySerialUnit.count({
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            inventoryLocationId: selectedSourceLocation.id,
            productId: transfer.product.id,
            serialNumber: {
              in: serialNumbers
            },
            status: SerialInventoryStatus.AVAILABLE
          }
        });

        if (availableSerialCount !== serialNumbers.length) {
          throw new Error(`Refresh the transfer and choose serials available at ${selectedSourceLocation.code}.`);
        }
      }

      if (postStockImmediately && transfer.product.isSerialized) {
        const serialUpdate = await tx.inventorySerialUnit.updateMany({
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            inventoryLocationId: selectedSourceLocation.id,
            productId: transfer.product.id,
            serialNumber: {
              in: serialNumbers
            },
            status: SerialInventoryStatus.AVAILABLE
          },
          data: {
            storeId: null,
            inventoryLocationId: null,
            status: SerialInventoryStatus.IN_TRANSIT,
            sourceReferenceType: "INTER_STORE_TRANSFER",
            sourceReferenceId: transfer.id,
            sourceReferenceLabel: transfer.transferNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: now
          }
        });

        if (serialUpdate.count !== serialNumbers.length) {
          throw new Error(`Flash ERP could not mark every selected serial as in transit. Refresh the transfer and choose available serials.`);
        }
      }

      if (postStockImmediately) {
        for (const allocation of issueBatchAllocations) {
          const batch = await tx.inventoryBatch.findUniqueOrThrow({
            where: { id: allocation.batchId ?? "" }
          });
          const nextQuantity = toQuantity(Number(batch.quantityOnHand) - allocation.quantity);
          const updated = await tx.inventoryBatch.updateMany({
            where: {
              id: batch.id,
              quantityOnHand: { gte: allocation.quantity }
            },
            data: {
              quantityOnHand: nextQuantity,
              status: deriveInventoryBatchStatus({
                expiryDate: batch.expiryDate,
                quantityOnHand: nextQuantity,
                status: batch.status
              }),
              sourceReferenceType: "INTER_STORE_TRANSFER",
              sourceReferenceId: transfer.id,
              sourceReferenceLabel: transfer.transferNo,
              sourceNodeCode: "ONLINE_DIRECT",
              lastOccurredAt: now
            }
          });

          if (updated.count !== 1) {
            throw new Error(`Flash ERP could not reserve batch ${allocation.batchNo} for ${transfer.transferNo}.`);
          }
        }

        const issueLedgerAllocations = issueBatchAllocations.length
          ? issueBatchAllocations
          : [{ batchId: null, batchNo: "", expiryDate: "", quantity }];

        for (const allocation of issueLedgerAllocations) {
          await tx.inventoryLedgerEntry.create({
            data: {
              retailOrgId: session.retailOrgId,
              storeId: store.id,
              warehouseId: selectedSourceLocation.warehouseId,
              inventoryLocationId: selectedSourceLocation.id,
              productId: transfer.product.id,
              inventoryBatchId: allocation.batchId,
              batchNoSnapshot: allocation.batchNo || null,
              expiryDateSnapshot: allocation.expiryDate ? new Date(allocation.expiryDate) : null,
              movementType: InventoryMovementType.STOCK_TRANSFER_OUT,
              quantity: allocation.quantity * -1,
              unitCost: transfer.unitCost ?? transfer.product.baseCostPrice,
              referenceType: "INTER_STORE_TRANSFER",
              referenceId: transfer.id,
              externalReference: transfer.transferNo,
              sourceNodeCode: "ONLINE_DIRECT",
              createdByUserId: user.id,
              occurredAt: now
            }
          });
        }
      }

      await tx.interStoreTransfer.update({
        where: {
          id: transfer.id
        },
        data: {
          status: nextStatus,
          issuedQuantity: nextIssuedQuantity,
          issuedSerialNumbersSnapshot: serializeJsonField(nextIssuedSerialNumbers.length ? nextIssuedSerialNumbers : null),
          transporterName: transporterName ?? undefined,
          vehicleRegistrationNo: vehicleRegistrationNo ?? undefined,
          driverName: driverName ?? undefined,
          driverContact: driverContact ?? undefined,
          deliveryNoteNo: deliveryNoteNo ?? undefined,
          workflowType: isFuelTransferProduct(transfer.product) ? "FUEL_TRANSFER" : undefined,
          issuedBatchAllocationsSnapshot: serializeJsonField(
            issueBatchAllocations.length ? [...issuedBatchAllocations, ...issueBatchAllocations] : null
          ),
          issueNote: note ?? `Issued ${formatNumberForMessage(quantity)} unit(s) from ${selectedSourceLocation.code}.`,
          issueOperatorName: user.displayName,
          issueStockUpdateStatus: postStockImmediately ? STOCK_UPDATE_STATUS_POSTED : STOCK_UPDATE_STATUS_PENDING,
          issueStockConfirmedAt: postStockImmediately ? now : null,
          issueStockConfirmedBy: postStockImmediately ? user.displayName : null,
          sourceNodeCode: "ONLINE_DIRECT",
          issuedAt: now
        }
      });

      await queueInterStoreTransferPublication(tx, {
        transferId: transfer.id,
        publishedAt: now
      });

      await tx.securityLog.create({
        data: {
          retailOrgId: session.retailOrgId,
          kind: SecurityLogKind.AUDIT,
          severity: SecurityLogSeverity.INFO,
          category: "ONLINE_STORE",
          action: "TRANSFER_ISSUED",
          actorLabel: user.loginId,
          targetType: "Inter-store transfer",
          targetRef: transfer.transferNo,
          sourceNodeCode: "ONLINE_DIRECT",
          message: `${user.loginId} issued ${transfer.transferNo} from ${store.code}.`,
          detailsJson: serializeJsonField({
            storeCode: store.code,
            productCode: transfer.product.code,
            quantity
          } satisfies Prisma.InputJsonValue)
        }
      });

      return {
        transferNo: transfer.transferNo,
        status: nextStatus,
        issuedQuantity: nextIssuedQuantity,
        receivedQuantity,
        outstandingIssueQuantity: toQuantity(Math.max(0, requestedQuantity - nextIssuedQuantity)),
        outstandingReceiptQuantity: toQuantity(Math.max(0, nextIssuedQuantity - receivedQuantity)),
        message: postStockImmediately
          ? `${transfer.transferNo} issued ${formatNumberForMessage(quantity)} unit(s).`
          : `${transfer.transferNo} issued ${formatNumberForMessage(quantity)} unit(s); source stock update is pending HQ confirmation.`,
        serverProcessedAt: now.toISOString()
      };
    }

    if (transfer.destinationStoreId !== store.id) {
      throw new Error(`${transfer.transferNo} is not waiting for receipt into this Online POS.`);
    }

    if (
      transfer.status !== InterStoreTransferStatus.PART_ISSUED &&
      transfer.status !== InterStoreTransferStatus.ISSUED &&
      transfer.status !== InterStoreTransferStatus.PART_RECEIVED
    ) {
      throw new Error(`${transfer.transferNo} is ${String(transfer.status).toLowerCase().replace(/_/g, " ")} and cannot be received yet.`);
    }

    const outstandingReceiptQuantity = toQuantity(Math.max(0, issuedQuantity - receivedQuantity));

    if (quantity - outstandingReceiptQuantity > 0.0001) {
      throw new Error(`Only ${formatNumberForMessage(outstandingReceiptQuantity)} unit(s) remain to receive on ${transfer.transferNo}.`);
    }

    if (transfer.product.trackExpiry && issuedBatchAllocations.length === 0) {
      throw new Error(
        `${transfer.transferNo} has no issued batch traceability for ${transfer.product.name}. Reissue the transfer after syncing the expiry-control update.`
      );
    }

    const receiptBatchAllocations = transfer.product.trackExpiry
      ? takeOutstandingInventoryBatchAllocations({
          productName: transfer.product.name,
          quantity,
          issued: issuedBatchAllocations,
          received: receivedBatchAllocations
        })
      : [];

    const nextReceivedQuantity = toQuantity(receivedQuantity + quantity);
    const nextStatus = deriveOnlineTransferStatus({
      requestedQuantity,
      issuedQuantity,
      receivedQuantity: nextReceivedQuantity,
      currentStatus: transfer.status,
      closedAt: transfer.closedAt
    });
    const nextReceivedSerialNumbers = normalizeSerialNumbers([...receivedSerialNumbers, ...serialNumbers]);

    const postStockImmediately = await shouldPostStockImmediately(tx, session.retailOrgId, store.id);

    if (transfer.product.isSerialized) {
      const issuedKeys = new Set(issuedSerialNumbers.map((serial) => serial.toUpperCase()));
      const receivedKeys = new Set(receivedSerialNumbers.map((serial) => serial.toUpperCase()));
      const invalidSerials = serialNumbers.filter(
        (serial) => !issuedKeys.has(serial.toUpperCase()) || receivedKeys.has(serial.toUpperCase())
      );

      if (invalidSerials.length > 0) {
        throw new Error(`Serial number(s) ${invalidSerials.join(", ")} are not outstanding on ${transfer.transferNo}.`);
      }
    }

    if (postStockImmediately && transfer.product.isSerialized) {
      const serialUpdate = await tx.inventorySerialUnit.updateMany({
        where: {
          retailOrgId: session.retailOrgId,
          productId: transfer.product.id,
          serialNumber: {
            in: serialNumbers
          },
          status: SerialInventoryStatus.IN_TRANSIT
        },
        data: {
          storeId: store.id,
          warehouseId: transfer.destinationInventoryLocation.warehouseId,
          inventoryLocationId: transfer.destinationInventoryLocationId,
          status: SerialInventoryStatus.AVAILABLE,
          sourceReferenceType: "INTER_STORE_TRANSFER",
          sourceReferenceId: transfer.id,
          sourceReferenceLabel: transfer.transferNo,
          sourceNodeCode: "ONLINE_DIRECT",
          lastOccurredAt: now
        }
      });

      if (serialUpdate.count !== serialNumbers.length) {
        throw new Error(`Flash ERP could not mark every selected serial as received. Refresh the transfer and choose in-transit serials.`);
      }
    }

    let fuelMirror: { deliveryNo: string | null; skippedProducts: string[] } = {
      deliveryNo: null,
      skippedProducts: []
    };

    if (postStockImmediately) {
      for (const allocation of receiptBatchAllocations) {
        const status = deriveInventoryBatchStatus({
          expiryDate: allocation.expiryDate,
          quantityOnHand: allocation.quantity
        });
        const destinationBatch = await tx.inventoryBatch.upsert({
          where: {
            retailOrgId_inventoryLocationId_productId_batchNo: {
              retailOrgId: session.retailOrgId,
              inventoryLocationId: transfer.destinationInventoryLocationId,
              productId: transfer.product.id,
              batchNo: allocation.batchNo
            }
          },
          create: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            warehouseId: transfer.destinationInventoryLocation.warehouseId,
            inventoryLocationId: transfer.destinationInventoryLocationId,
            productId: transfer.product.id,
            batchNo: allocation.batchNo,
            expiryDate: new Date(allocation.expiryDate),
            quantityOnHand: allocation.quantity,
            status,
            sourceReferenceType: "INTER_STORE_TRANSFER",
            sourceReferenceId: transfer.id,
            sourceReferenceLabel: transfer.transferNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: now
          },
          update: {
            expiryDate: new Date(allocation.expiryDate),
            quantityOnHand: { increment: allocation.quantity },
            status,
            sourceReferenceType: "INTER_STORE_TRANSFER",
            sourceReferenceId: transfer.id,
            sourceReferenceLabel: transfer.transferNo,
            sourceNodeCode: "ONLINE_DIRECT",
            lastOccurredAt: now
          }
        });
        allocation.batchId = destinationBatch.id;
      }

      const receiptLedgerAllocations = receiptBatchAllocations.length
        ? receiptBatchAllocations
        : [{ batchId: null, batchNo: "", expiryDate: "", quantity }];

      for (const allocation of receiptLedgerAllocations) {
        await tx.inventoryLedgerEntry.create({
          data: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            warehouseId: transfer.destinationInventoryLocation.warehouseId,
            inventoryLocationId: transfer.destinationInventoryLocationId,
            productId: transfer.product.id,
            inventoryBatchId: allocation.batchId,
            batchNoSnapshot: allocation.batchNo || null,
            expiryDateSnapshot: allocation.expiryDate ? new Date(allocation.expiryDate) : null,
            movementType: InventoryMovementType.STOCK_TRANSFER_IN,
            quantity: allocation.quantity,
            unitCost: transfer.unitCost ?? transfer.product.baseCostPrice,
            referenceType: "INTER_STORE_TRANSFER",
            referenceId: transfer.id,
            externalReference: transfer.transferNo,
            sourceNodeCode: "ONLINE_DIRECT",
            createdByUserId: user.id,
            occurredAt: now
          }
        });
      }

      fuelMirror = await mirrorOnlineFuelReceiptToTank(tx, {
        retailOrgId: session.retailOrgId,
        storeId: store.id,
        inventoryLocationId: transfer.destinationInventoryLocationId,
        inventoryLocationCode: transfer.destinationInventoryLocation.code,
        inventoryLocationName: transfer.destinationInventoryLocation.name,
        referenceNo: transfer.transferNo,
        sourceLabel: "Inter-store transfer",
        notes: `Mirrored from online-store transfer receipt ${transfer.transferNo}.`,
        occurredAt: now,
        lines: [
          {
            product: transfer.product,
            quantity,
            unitCost: transfer.unitCost === null
              ? Number(transfer.product.baseCostPrice ?? 0)
              : Number(transfer.unitCost)
          }
        ]
      });
    }

    await tx.interStoreTransfer.update({
      where: {
        id: transfer.id
      },
      data: {
        status: nextStatus,
        receivedQuantity: nextReceivedQuantity,
        receivedSerialNumbersSnapshot: serializeJsonField(nextReceivedSerialNumbers.length ? nextReceivedSerialNumbers : null),
        receivedBatchAllocationsSnapshot: serializeJsonField(
          receiptBatchAllocations.length ? [...receivedBatchAllocations, ...receiptBatchAllocations] : null
        ),
        receiptNote: note ?? `Received ${formatNumberForMessage(quantity)} unit(s) into ${transfer.destinationInventoryLocation.code}.`,
        receiptOperatorName: user.displayName,
        receiptStockUpdateStatus: postStockImmediately ? STOCK_UPDATE_STATUS_POSTED : STOCK_UPDATE_STATUS_PENDING,
        receiptStockConfirmedAt: postStockImmediately ? now : null,
        receiptStockConfirmedBy: postStockImmediately ? user.displayName : null,
        destinationNodeCode: "ONLINE_DIRECT",
        receivedAt: now
      }
    });

    await queueInterStoreTransferPublication(tx, {
      transferId: transfer.id,
      publishedAt: now
    });

    await tx.securityLog.create({
      data: {
        retailOrgId: session.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "ONLINE_STORE",
        action: "TRANSFER_RECEIVED",
        actorLabel: user.loginId,
        targetType: "Inter-store transfer",
        targetRef: transfer.transferNo,
        sourceNodeCode: "ONLINE_DIRECT",
        message: `${user.loginId} received ${transfer.transferNo} into ${store.code}.`,
        detailsJson: serializeJsonField({
          storeCode: store.code,
          productCode: transfer.product.code,
          quantity
        } satisfies Prisma.InputJsonValue)
      }
    });

    return {
      transferNo: transfer.transferNo,
      status: nextStatus,
      issuedQuantity,
      receivedQuantity: nextReceivedQuantity,
      outstandingIssueQuantity: toQuantity(Math.max(0, requestedQuantity - issuedQuantity)),
      outstandingReceiptQuantity: toQuantity(Math.max(0, issuedQuantity - nextReceivedQuantity)),
      message: [
        postStockImmediately
          ? `${transfer.transferNo} received ${formatNumberForMessage(quantity)} unit(s).`
          : `${transfer.transferNo} received ${formatNumberForMessage(quantity)} unit(s); destination stock update is pending HQ confirmation.`,
        fuelMirror.deliveryNo ? `Fuel tank receipt ${fuelMirror.deliveryNo} updated the matching tank book quantity.` : "",
        fuelMirror.skippedProducts.length > 0
          ? `Fuel tank mirror skipped for ${fuelMirror.skippedProducts.join(", ")} because no matching active tank exists.`
          : ""
      ].filter(Boolean).join(" "),
      serverProcessedAt: now.toISOString()
    };
  });
}

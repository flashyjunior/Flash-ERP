import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  normalizeTrialBusinessType,
  trialBusinessTypeLabel,
  trialSampleCatalog,
  trialSampleDepartment,
} from "./trial-sample-catalog";

const sampleCatalogCode = "TRIAL-STARTER";
const sampleReferenceType = "trial-sample-opening";

export class TrialSampleDataError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "TRIAL_SAMPLE_DATA_INVALID",
  ) {
    super(message);
    this.name = "TrialSampleDataError";
  }
}

export function isTrialSampleDataEnabled() {
  return process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE === "true";
}

type TrialSampleDataInput = {
  database: PrismaClient;
  retailOrgId: string;
  userId: string;
  actorLabel: string;
  businessType: string | null | undefined;
  permittedRuntimeStatuses: readonly string[];
};

function deterministicId(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function categoryCode(departmentCode: string, category: string) {
  const suffix = category
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${departmentCode}-${suffix || "GENERAL"}`;
}

function productDescription(name: string, category: string, brand: string) {
  return `<p>${name} by ${brand}. Sample ${category.toLowerCase()} stock supplied for exploring Flash ERP. Replace or remove it whenever you are ready.</p>`;
}

async function reconcileTrialSampleData(input: TrialSampleDataInput) {
  const runtime = await input.database.trialWorkspaceRuntime.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, requestNo: true, status: true, trialExpiresAt: true },
  });
  if (
    !runtime ||
    !input.permittedRuntimeStatuses.includes(runtime.status) ||
    runtime.trialExpiresAt.getTime() <= Date.now()
  ) {
    throw new TrialSampleDataError(
      "This trial is not active, so Flash ERP did not create sample data.",
      403,
    );
  }

  const businessType = normalizeTrialBusinessType(input.businessType);
  const sampleProducts = trialSampleCatalog(businessType);
  const department = trialSampleDepartment(businessType);
  const sampleCodes = sampleProducts.map((product) => product.code);
  const [existingCatalog, productCount, existingSampleCount] = await Promise.all([
    input.database.inventoryCatalog.findUnique({
      where: {
        retailOrgId_code: { retailOrgId: input.retailOrgId, code: sampleCatalogCode },
      },
      select: { id: true },
    }),
    input.database.product.count({ where: { retailOrgId: input.retailOrgId } }),
    input.database.product.count({
      where: { retailOrgId: input.retailOrgId, code: { in: sampleCodes } },
    }),
  ]);

  if (!existingCatalog && productCount > 0) {
    throw new TrialSampleDataError(
      "Sample data is available only before you create your own products. Your existing catalogue was left unchanged.",
      409,
      "TRIAL_CATALOGUE_NOT_EMPTY",
    );
  }

  const result = await input.database.$transaction(async (tx) => {
    const [retailOrg, enterpriseNode, stores, locations] = await Promise.all([
      tx.retailOrg.findUnique({
        where: { id: input.retailOrgId },
        select: { id: true, baseCurrencyCode: true },
      }),
      tx.syncNode.findFirst({
        where: {
          retailOrgId: input.retailOrgId,
          nodeType: "ENTERPRISE",
          isPrimary: true,
        },
        select: { code: true },
      }),
      tx.store.findMany({
        where: {
          retailOrgId: input.retailOrgId,
          code: { in: ["MAIN", "ONLINE"] },
          status: "ACTIVE",
        },
        select: { id: true, code: true, ecommerceSlug: true },
      }),
      tx.inventoryLocation.findMany({
        where: {
          retailOrgId: input.retailOrgId,
          code: { in: ["MAIN-SALES", "ONLINE-SALES"] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          code: true,
          storeId: true,
          warehouseId: true,
        },
      }),
    ]);
    if (!retailOrg || !enterpriseNode) {
      throw new TrialSampleDataError(
        "The trial workspace is missing its enterprise organization or primary node.",
        409,
      );
    }

    const storeByCode = new Map(stores.map((store) => [store.code, store]));
    const locationByCode = new Map(
      locations.map((location) => [location.code, location]),
    );
    const mainStore = storeByCode.get("MAIN");
    const onlineStore = storeByCode.get("ONLINE");
    const mainLocation = locationByCode.get("MAIN-SALES");
    const onlineLocation = locationByCode.get("ONLINE-SALES");
    if (!mainStore || !onlineStore || !mainLocation || !onlineLocation) {
      throw new TrialSampleDataError(
        "The trial workspace is missing its Main or Online Store stock location.",
        409,
      );
    }

    const unitDefinitions = [
      {
        code: "EA",
        name: "Each",
        decimalPrecision: 0,
        allowFractionalSale: false,
      },
      {
        code: "L",
        name: "Litre",
        decimalPrecision: 3,
        allowFractionalSale: true,
      },
    ] as const;
    const units = new Map<string, { id: string; code: string; name: string }>();
    const schedules = new Map<string, { id: string }>();
    for (const unitDefinition of unitDefinitions) {
      const unit = await tx.unitOfMeasure.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: unitDefinition.code,
          },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          ...unitDefinition,
          description: "Trial starter catalogue unit.",
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: { id: true, code: true, name: true },
      });
      units.set(unit.code, unit);

      const schedule = await tx.unitOfMeasureSchedule.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: `TRIAL-${unit.code}`,
          },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          code: `TRIAL-${unit.code}`,
          name: `${unit.name} Trial Schedule`,
          description: "Trial starter catalogue base-unit schedule.",
          baseUnitOfMeasureId: unit.id,
          isDefaultForStock: unit.code === "EA",
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: { id: true },
      });
      schedules.set(unit.code, schedule);
      await tx.unitOfMeasureScheduleLine.upsert({
        where: {
          scheduleId_unitOfMeasureId: {
            scheduleId: schedule.id,
            unitOfMeasureId: unit.id,
          },
        },
        update: {},
        create: {
          scheduleId: schedule.id,
          unitOfMeasureId: unit.id,
          conversionFactor: "1.000000",
          isBaseUnit: true,
          allowSale: true,
          allowPurchase: true,
          sortOrder: 1,
        },
      });
    }

    const departmentRecord = await tx.productDepartment.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: department.code,
        },
      },
      update: {},
      create: {
        retailOrgId: retailOrg.id,
        code: department.code,
        name: department.name,
        description: "Industry starter products created by the trial owner.",
        sortOrder: 1,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code,
      },
      select: { id: true },
    });
    for (const [index, category] of [
      ...new Set(sampleProducts.map((product) => product.category)),
    ].entries()) {
      await tx.productCategory.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: categoryCode(department.code, category),
          },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          departmentId: departmentRecord.id,
          code: categoryCode(department.code, category),
          name: category,
          description: "Trial starter catalogue category.",
          sortOrder: index + 1,
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
      });
    }

    const catalog = await tx.inventoryCatalog.upsert({
      where: {
        retailOrgId_code: { retailOrgId: retailOrg.id, code: sampleCatalogCode },
      },
      update: {},
      create: {
        retailOrgId: retailOrg.id,
        code: sampleCatalogCode,
        name: `${trialBusinessTypeLabel(businessType)} Starter Catalogue`,
        description:
          "Optional sample products and opening stock for exploring Flash ERP.",
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code,
      },
      select: { id: true },
    });
    const priceList = await tx.priceList.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: "TRIAL-RETAIL",
        },
      },
      update: {},
      create: {
        retailOrgId: retailOrg.id,
        code: "TRIAL-RETAIL",
        name: "Trial Retail Prices",
        currencyCode: retailOrg.baseCurrencyCode,
        isDefault: true,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    for (const store of [mainStore, onlineStore]) {
      await tx.inventoryCatalogStore.upsert({
        where: {
          catalogId_storeId: { catalogId: catalog.id, storeId: store.id },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          catalogId: catalog.id,
          storeId: store.id,
        },
      });
    }

    for (const location of [onlineLocation, mainLocation]) {
      await tx.ecommerceFulfillmentLocation.upsert({
        where: {
          storefrontStoreId_inventoryLocationId: {
            storefrontStoreId: onlineStore.id,
            inventoryLocationId: location.id,
          },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          storefrontStoreId: onlineStore.id,
          storeId: location.storeId ?? onlineStore.id,
          inventoryLocationId: location.id,
          status: "ACTIVE",
          supportsPickup: true,
          supportsDelivery: true,
          routingPriority: location.id === onlineLocation.id ? 1 : 2,
        },
      });
    }

    for (const sample of sampleProducts) {
      const unit = units.get(sample.unitCode ?? "EA");
      const schedule = schedules.get(sample.unitCode ?? "EA");
      if (!unit || !schedule) {
        throw new TrialSampleDataError(
          `Flash ERP could not prepare the ${sample.unitCode} sample unit.`,
          409,
        );
      }
      const description = productDescription(
        sample.name,
        sample.category,
        sample.brand,
      );
      const safetyStock = Math.max(2, Math.floor(sample.stock * 0.05));
      const product = await tx.product.upsert({
        where: {
          retailOrgId_code: { retailOrgId: retailOrg.id, code: sample.code },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          baseUnitOfMeasureId: unit.id,
          uomScheduleId: schedule.id,
          code: sample.code,
          sku: sample.sku,
          name: sample.name,
          shortName: sample.name.slice(0, 80),
          description,
          ecommerceDescription: description,
          productType: "STOCK",
          department: department.name,
          category: sample.category,
          subcategory: sample.category,
          brand: sample.brand,
          unitOfMeasure: unit.code,
          taxable: false,
          trackInventory: true,
          isSerialized: false,
          trackExpiry: false,
          trackSize: false,
          trackColor: false,
          mustEnterPriceAtPos: false,
          ecommercePublished: true,
          ecommerceFeatured: sample.sortOrder <= 8,
          ecommerceSortOrder: sample.sortOrder,
          ecommerceSpecificationsJson: JSON.stringify([
            { name: "Brand", value: sample.brand },
            { name: "Category", value: sample.category },
            { name: "Sample data", value: "Yes" },
          ]),
          minStockLevel: String(safetyStock),
          reorderPoint: String(safetyStock * 2),
          reorderQuantity: String(Math.max(5, Math.floor(sample.stock * 0.25))),
          safetyStockLevel: String(safetyStock),
          baseUnitPrice: sample.price.toFixed(2),
          baseCostPrice: sample.cost.toFixed(2),
          status: "ACTIVE",
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code,
        },
        select: { id: true },
      });

      const existingBarcode = await tx.barcode.findUnique({
        where: { code: sample.barcode },
        select: { productId: true },
      });
      if (existingBarcode && existingBarcode.productId !== product.id) {
        throw new TrialSampleDataError(
          `Sample barcode ${sample.barcode} is already assigned to another product.`,
          409,
        );
      }
      if (!existingBarcode) {
        await tx.barcode.create({
          data: {
            productId: product.id,
            productVariantId: null,
            code: sample.barcode,
            barcodeType: "EAN13",
          },
        });
      }

      await tx.priceListEntry.upsert({
        where: {
          priceListId_productId: {
            priceListId: priceList.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          priceListId: priceList.id,
          productId: product.id,
          unitPrice: sample.price.toFixed(2),
        },
      });
      await tx.inventoryCatalogProduct.upsert({
        where: {
          catalogId_productId: { catalogId: catalog.id, productId: product.id },
        },
        update: {},
        create: {
          retailOrgId: retailOrg.id,
          catalogId: catalog.id,
          productId: product.id,
          sortOrder: sample.sortOrder,
        },
      });

      for (const store of [mainStore, onlineStore]) {
        await tx.storeProductSellingUnit.upsert({
          where: {
            configurationKey: `trial-sample:${store.code}:${sample.code}:${unit.code}`,
          },
          update: {},
          create: {
            configurationKey: `trial-sample:${store.code}:${sample.code}:${unit.code}`,
            retailOrgId: retailOrg.id,
            storeId: store.id,
            productId: product.id,
            productVariantId: null,
            unitOfMeasureId: unit.id,
            unitOfMeasureCodeSnapshot: unit.code,
            unitOfMeasureNameSnapshot: unit.name,
            conversionFactor: "1.000000",
            unitPrice: sample.price.toFixed(2),
            barcode: sample.barcode,
            isDefault: true,
            status: "ACTIVE",
          },
        });
      }

      const mainQuantity = Number((sample.stock * 0.6).toFixed(3));
      const stockAllocations = [
        { store: mainStore, location: mainLocation, quantity: mainQuantity },
        {
          store: onlineStore,
          location: onlineLocation,
          quantity: Number((sample.stock - mainQuantity).toFixed(3)),
        },
      ];
      for (const allocation of stockAllocations) {
        await tx.inventoryLedgerEntry.upsert({
          where: {
            id: deterministicId(
              `${sampleReferenceType}:${retailOrg.id}:${allocation.location.id}:${sample.code}`,
            ),
          },
          update: {},
          create: {
            id: deterministicId(
              `${sampleReferenceType}:${retailOrg.id}:${allocation.location.id}:${sample.code}`,
            ),
            retailOrgId: retailOrg.id,
            storeId: allocation.store.id,
            warehouseId: allocation.location.warehouseId,
            inventoryLocationId: allocation.location.id,
            productId: product.id,
            movementType: "OPENING_BALANCE",
            quantity: allocation.quantity.toFixed(3),
            unitCost: sample.cost.toFixed(2),
            referenceType: sampleReferenceType,
            referenceId: sample.code,
            externalReference: `${runtime.requestNo} starter catalogue`,
            sourceNodeCode: enterpriseNode.code,
            createdByUserId: input.userId,
            occurredAt: new Date(),
          },
        });
      }
    }

    await tx.securityLog.create({
      data: {
        retailOrgId: retailOrg.id,
        kind: "AUDIT",
        severity: "INFO",
        category: "TRIAL",
        action:
          existingSampleCount > 0
            ? "TRIAL_SAMPLE_DATA_RECONCILED"
            : "TRIAL_SAMPLE_DATA_CREATED",
        actorLabel: input.actorLabel,
        targetType: "Inventory catalog",
        targetRef: sampleCatalogCode,
        sourceNodeCode: enterpriseNode.code,
        message: `${trialBusinessTypeLabel(businessType)} trial sample data is ready.`,
        detailsJson: JSON.stringify({
          businessType,
          productCount: sampleProducts.length,
          openingBalanceLocations: [mainLocation.code, onlineLocation.code],
        }),
      },
    });

    return {
      businessType,
      businessTypeLabel: trialBusinessTypeLabel(businessType),
      createdProductCount: Math.max(0, sampleProducts.length - existingSampleCount),
      productCount: sampleProducts.length,
      storefrontSlug: onlineStore.ecommerceSlug,
    };
  }, {
    maxWait: 60_000,
    timeout: 60_000,
  });

  return {
    ...result,
    message:
      result.createdProductCount > 0
        ? `${result.productCount} ${result.businessTypeLabel} sample products are ready in Enterprise, Online Store, and the public storefront.`
        : "The trial sample catalogue was already created. Flash ERP verified its products, stock, pricing, and storefront links.",
  };
}

export async function createTrialSampleData(input: {
  retailOrgId: string;
  userId: string;
  actorLabel: string;
}) {
  if (!isTrialSampleDataEnabled()) {
    throw new TrialSampleDataError(
      "Sample data can only be created inside an active Flash ERP trial workspace.",
      403,
    );
  }

  const [{ prisma }, { invalidateEnterpriseReadCache }] = await Promise.all([
    import("@/lib/db/prisma"),
    import("@/server/performance/enterprise-read-cache"),
  ]);
  const result = await reconcileTrialSampleData({
    ...input,
    database: prisma,
    businessType: process.env.FLASH_ERP_TRIAL_BUSINESS_TYPE,
    permittedRuntimeStatuses: ["ACTIVE"],
  });
  invalidateEnterpriseReadCache();
  return result;
}

export function provisionTrialSampleData(input: {
  database: PrismaClient;
  retailOrgId: string;
  userId: string;
  actorLabel: string;
  businessType: string | null | undefined;
}) {
  return reconcileTrialSampleData({
    ...input,
    permittedRuntimeStatuses: ["PROVISIONING", "ACTIVE"],
  });
}

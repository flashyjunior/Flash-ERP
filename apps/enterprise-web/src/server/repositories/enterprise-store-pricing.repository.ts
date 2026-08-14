import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import {
  ensureAlternateUomSellingSchemaCompatibility,
  ensureProductVariantSalesOrderDepositSchemaCompatibility
} from "@/server/repositories/schema-compatibility.repository";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type StorePriceProductTarget = {
  targetId: string;
  productCode: string;
  productName: string;
  productType: string;
  productVariantCode: string | null;
  productVariantName: string | null;
  baseUnitPrice: number;
  baseUnitOfMeasure: string;
  sellingUnitOptions: Array<{
    unitOfMeasureId: string;
    unitOfMeasureCode: string;
    unitOfMeasureName: string;
    conversionFactor: number;
    allowFractionalSale: boolean;
    decimalPrecision: number;
  }>;
};

export type EnterpriseStorePricingWorkspaceData = {
  currencyCode: string;
  targets: StorePriceProductTarget[];
  stores: Array<{
    storeCode: string;
    storeName: string;
    storeMode: string;
  }>;
  priceRows: Array<{
    priceId: string;
    productCode: string;
    productName: string;
    productVariantCode: string | null;
    productVariantName: string | null;
    storeCode: string;
    storeName: string;
    unitPrice: number;
    baseUnitPrice: number;
    status: string;
    updatedAt: string;
  }>;
  sellingUnitRows: Array<{
    sellingUnitId: string;
    productCode: string;
    productName: string;
    productVariantCode: string | null;
    productVariantName: string | null;
    storeCode: string;
    storeName: string;
    unitOfMeasureCode: string;
    unitOfMeasureName: string;
    baseUnitOfMeasure: string;
    conversionFactor: number;
    unitPrice: number;
    barcode: string | null;
    isDefault: boolean;
    status: string;
    updatedAt: string;
  }>;
  metrics: {
    targets: number;
    stores: number;
    activeOverrides: number;
    activeSellingUnits: number;
  };
  refreshedAt: string;
};

export type UpdateStoreProductPricesRequest = {
  targetId: string;
  unitPrice: number;
  storeCodes: unknown;
};

export type UpdateStoreProductPricesResponse = {
  message: string;
  appliedCount: number;
  targetLabel: string;
  serverProcessedAt: string;
};

export type UpdateStoreProductSellingUnitsRequest = {
  targetId: string;
  unitOfMeasureCode: string;
  unitPrice: number;
  barcode?: string | null;
  isDefault?: boolean;
  storeCodes: unknown;
};

function normalizeStoreCode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupKey(value: string) {
  return value.trim().toUpperCase();
}

function normalizeStoreCodes(value: unknown) {
  const normalizeList = (values: unknown[]) => {
    const seen = new Set<string>();
    const storeCodes: string[] = [];

    for (const value of values) {
      const storeCode = normalizeStoreCode(value);
      const lookupKey = normalizeLookupKey(storeCode);

      if (!storeCode || seen.has(lookupKey)) {
        continue;
      }

      seen.add(lookupKey);
      storeCodes.push(storeCode);
    }

    return storeCodes;
  };

  if (Array.isArray(value)) {
    return normalizeList(value);
  }

  if (typeof value === "string") {
    return normalizeList(value.split(/\r?\n|,/));
  }

  return [];
}

function parseTargetId(value: string) {
  const [productCode, productVariantCode] = value
    .trim()
    .toUpperCase()
    .split("::")
    .map((part) => part.trim());

  if (!productCode) {
    throw new Error("Choose a product or matrix option before saving shop prices.");
  }

  return {
    productCode,
    productVariantCode: productVariantCode || null
  };
}

function targetIdFor(productCode: string, productVariantCode: string | null) {
  return productVariantCode ? `${productCode}::${productVariantCode}` : productCode;
}

function targetLabelFor(input: {
  productCode: string;
  productName: string;
  productVariantCode: string | null;
  productVariantName: string | null;
}) {
  return input.productVariantCode
    ? `${input.productName} / ${input.productVariantName ?? input.productVariantCode}`
    : input.productName;
}

function rowBasePrice(row: {
  product: { baseUnitPrice: Prisma.Decimal | number | string };
  productVariant: { unitPrice: Prisma.Decimal | number | string } | null;
}) {
  return Number(row.productVariant?.unitPrice ?? row.product.baseUnitPrice);
}

export async function getEnterpriseStorePricingWorkspace(): Promise<EnterpriseStorePricingWorkspaceData> {
  await Promise.all([
    ensureProductVariantSalesOrderDepositSchemaCompatibility(),
    ensureAlternateUomSellingSchemaCompatibility()
  ]);
  const session = await assertEnterprisePermission(["master.product.manage"]);
  const [org, products, stores, priceRows, sellingUnitRows, activeUnits] = await Promise.all([
    prisma.retailOrg.findUnique({
      where: { id: session.retailOrgId },
      select: { baseCurrencyCode: true }
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        productType: true,
        baseUnitPrice: true,
        unitOfMeasure: true,
        baseUnitOfMeasure: {
          select: {
            id: true,
            code: true,
            name: true,
            allowFractionalSale: true,
            decimalPrecision: true
          }
        },
        uomSchedule: {
          select: {
            lines: {
              where: {
                allowSale: true,
                unitOfMeasure: {
                  status: RecordStatus.ACTIVE
                }
              },
              orderBy: [{ sortOrder: "asc" }],
              select: {
                conversionFactor: true,
                unitOfMeasure: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    allowFractionalSale: true,
                    decimalPrecision: true
                  }
                }
              }
            }
          }
        },
        matrixVariants: {
          where: { status: RecordStatus.ACTIVE },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          select: {
            code: true,
            displayName: true,
            unitPrice: true
          }
        }
      }
    }),
    prisma.store.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        storeMode: true
      }
    }),
    prisma.storeProductPrice.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
      select: {
        id: true,
        unitPrice: true,
        status: true,
        updatedAt: true,
        store: {
          select: {
            code: true,
            name: true
          }
        },
        product: {
          select: {
            code: true,
            name: true,
            baseUnitPrice: true
          }
        },
        productVariant: {
          select: {
            code: true,
            displayName: true,
            unitPrice: true
          }
        }
      }
    }),
    prisma.storeProductSellingUnit.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [
        { store: { name: "asc" } },
        { product: { name: "asc" } },
        { unitOfMeasureCodeSnapshot: "asc" }
      ],
      select: {
        id: true,
        unitOfMeasureCodeSnapshot: true,
        unitOfMeasureNameSnapshot: true,
        conversionFactor: true,
        unitPrice: true,
        barcode: true,
        isDefault: true,
        status: true,
        updatedAt: true,
        store: {
          select: {
            code: true,
            name: true
          }
        },
        product: {
          select: {
            code: true,
            name: true,
            unitOfMeasure: true,
            baseUnitOfMeasure: {
              select: { code: true }
            }
          }
        },
        productVariant: {
          select: {
            code: true,
            displayName: true
          }
        }
      }
    }),
    prisma.unitOfMeasure.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      select: {
        id: true,
        code: true,
        name: true,
        allowFractionalSale: true,
        decimalPrecision: true
      }
    })
  ]);
  const activeUnitsByCode = new Map(
    activeUnits.map((unit) => [normalizeLookupKey(unit.code), unit])
  );
  const targets: StorePriceProductTarget[] = products.flatMap<StorePriceProductTarget>((product) => {
    const fallbackBaseUnit =
      product.baseUnitOfMeasure ??
      activeUnitsByCode.get(normalizeLookupKey(product.unitOfMeasure)) ??
      null;
    const scheduleUnits =
      product.uomSchedule?.lines.map((line) => ({
        unitOfMeasureId: line.unitOfMeasure.id,
        unitOfMeasureCode: line.unitOfMeasure.code,
        unitOfMeasureName: line.unitOfMeasure.name,
        conversionFactor: Number(line.conversionFactor),
        allowFractionalSale: line.unitOfMeasure.allowFractionalSale,
        decimalPrecision: line.unitOfMeasure.decimalPrecision
      })) ?? [];
    const sellingUnitOptions =
      scheduleUnits.length > 0
        ? scheduleUnits
        : fallbackBaseUnit
          ? [
              {
                unitOfMeasureId: fallbackBaseUnit.id,
                unitOfMeasureCode: fallbackBaseUnit.code,
                unitOfMeasureName: fallbackBaseUnit.name,
                conversionFactor: 1,
                allowFractionalSale: fallbackBaseUnit.allowFractionalSale,
                decimalPrecision: fallbackBaseUnit.decimalPrecision
              }
            ]
          : [];
    const baseUnitOfMeasure = fallbackBaseUnit?.code ?? product.unitOfMeasure;

    if (product.productType === "MATRIX" && product.matrixVariants.length > 0) {
      return product.matrixVariants.map((variant) => ({
        targetId: targetIdFor(product.code, variant.code),
        productCode: product.code,
        productName: product.name,
        productType: product.productType,
        productVariantCode: variant.code,
        productVariantName: variant.displayName,
        baseUnitPrice: Number(variant.unitPrice),
        baseUnitOfMeasure,
        sellingUnitOptions
      }));
    }

    return [
      {
        targetId: targetIdFor(product.code, null),
        productCode: product.code,
        productName: product.name,
        productType: product.productType,
        productVariantCode: null,
        productVariantName: null,
        baseUnitPrice: Number(product.baseUnitPrice),
        baseUnitOfMeasure,
        sellingUnitOptions
      }
    ];
  });

  return {
    currencyCode: org?.baseCurrencyCode ?? "GHS",
    targets,
    stores: stores.map((store) => ({
      storeCode: store.code,
      storeName: store.name,
      storeMode: store.storeMode
    })),
    priceRows: priceRows.map((row) => ({
      priceId: row.id,
      productCode: row.product.code,
      productName: row.product.name,
      productVariantCode: row.productVariant?.code ?? null,
      productVariantName: row.productVariant?.displayName ?? null,
      storeCode: row.store.code,
      storeName: row.store.name,
      unitPrice: Number(row.unitPrice),
      baseUnitPrice: rowBasePrice(row),
      status: row.status,
      updatedAt: row.updatedAt.toISOString()
    })),
    sellingUnitRows: sellingUnitRows.map((row) => ({
      sellingUnitId: row.id,
      productCode: row.product.code,
      productName: row.product.name,
      productVariantCode: row.productVariant?.code ?? null,
      productVariantName: row.productVariant?.displayName ?? null,
      storeCode: row.store.code,
      storeName: row.store.name,
      unitOfMeasureCode: row.unitOfMeasureCodeSnapshot,
      unitOfMeasureName: row.unitOfMeasureNameSnapshot,
      baseUnitOfMeasure: row.product.baseUnitOfMeasure?.code ?? row.product.unitOfMeasure,
      conversionFactor: Number(row.conversionFactor),
      unitPrice: Number(row.unitPrice),
      barcode: row.barcode,
      isDefault: row.isDefault,
      status: row.status,
      updatedAt: row.updatedAt.toISOString()
    })),
    metrics: {
      targets: targets.length,
      stores: stores.length,
      activeOverrides: priceRows.length,
      activeSellingUnits: sellingUnitRows.length
    },
    refreshedAt: new Date().toISOString()
  };
}

export async function updateStoreProductSellingUnits(
  input: UpdateStoreProductSellingUnitsRequest
): Promise<UpdateStoreProductPricesResponse> {
  await Promise.all([
    ensureProductVariantSalesOrderDepositSchemaCompatibility(),
    ensureAlternateUomSellingSchemaCompatibility()
  ]);
  const session = await assertEnterprisePermission(["master.product.manage"]);
  const { productCode, productVariantCode } = parseTargetId(input.targetId);
  const storeCodes = normalizeStoreCodes(input.storeCodes);
  const unitOfMeasureCode = normalizeLookupKey(input.unitOfMeasureCode);
  const barcode = String(input.barcode ?? "").trim() || null;
  const unitPrice = Number(Number(input.unitPrice).toFixed(2));

  if (!unitOfMeasureCode) {
    throw new Error("Choose a selling unit of measure.");
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Enter a valid selling-unit price greater than zero.");
  }

  if (barcode && barcode.length > 450) {
    throw new Error("The selling-unit barcode cannot exceed 450 characters.");
  }

  if (storeCodes.length === 0) {
    throw new Error("Select at least one shop for this selling unit.");
  }

  return prisma.$transaction(async (tx) => {
    const [enterpriseNode, product, activeStores] = await Promise.all([
      tx.syncNode.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE
        },
        select: { code: true }
      }),
      tx.product.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          code: productCode,
          status: RecordStatus.ACTIVE,
          deletedAt: null
        },
        select: {
          id: true,
          code: true,
          name: true,
          unitOfMeasure: true,
          baseUnitOfMeasure: {
            select: { id: true, code: true, name: true }
          },
          uomSchedule: {
            select: {
              lines: {
                where: {
                  allowSale: true,
                  unitOfMeasure: { status: RecordStatus.ACTIVE }
                },
                select: {
                  conversionFactor: true,
                  unitOfMeasure: {
                    select: { id: true, code: true, name: true }
                  }
                }
              }
            }
          },
          matrixVariants: {
            where: productVariantCode
              ? { code: productVariantCode, status: RecordStatus.ACTIVE }
              : { status: RecordStatus.ACTIVE },
            select: { id: true, code: true, displayName: true }
          }
        }
      }),
      tx.store.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          status: RecordStatus.ACTIVE
        },
        select: { id: true, code: true, name: true }
      })
    ]);

    if (!product) {
      throw new Error(`Flash ERP could not find active product "${productCode}".`);
    }

    const productVariant = productVariantCode
      ? (product.matrixVariants.find((variant) => variant.code === productVariantCode) ?? null)
      : null;

    if (productVariantCode && !productVariant) {
      throw new Error(`Flash ERP could not find active matrix option "${productVariantCode}".`);
    }

    const scheduledUnit = product.uomSchedule?.lines.find(
      (line) => normalizeLookupKey(line.unitOfMeasure.code) === unitOfMeasureCode
    );
    let resolvedUnit = scheduledUnit
      ? {
          ...scheduledUnit.unitOfMeasure,
          conversionFactor: Number(scheduledUnit.conversionFactor)
        }
      : null;

    if (!resolvedUnit) {
      const baseCode = normalizeLookupKey(
        product.baseUnitOfMeasure?.code ?? product.unitOfMeasure
      );

      if (baseCode === unitOfMeasureCode) {
        const baseUnit =
          product.baseUnitOfMeasure ??
          (await tx.unitOfMeasure.findFirst({
            where: {
              retailOrgId: session.retailOrgId,
              code: unitOfMeasureCode,
              status: RecordStatus.ACTIVE
            },
            select: { id: true, code: true, name: true }
          }));

        if (baseUnit) {
          resolvedUnit = { ...baseUnit, conversionFactor: 1 };
        }
      }
    }

    if (!resolvedUnit) {
      throw new Error(
        `${unitOfMeasureCode} is not an active sale unit on ${product.name}'s UOM schedule.`
      );
    }

    if (!Number.isFinite(resolvedUnit.conversionFactor) || resolvedUnit.conversionFactor <= 0) {
      throw new Error("The selected UOM has an invalid conversion factor.");
    }

    const storesByCode = new Map(
      activeStores.map((store) => [normalizeLookupKey(store.code), store])
    );
    const stores = storeCodes
      .map((storeCode) => storesByCode.get(normalizeLookupKey(storeCode)) ?? null)
      .filter((store): store is (typeof activeStores)[number] => Boolean(store));
    const missingStores = storeCodes.filter(
      (storeCode) => !storesByCode.has(normalizeLookupKey(storeCode))
    );

    if (missingStores.length > 0) {
      throw new Error(`Flash ERP could not find active shop(s): ${missingStores.join(", ")}.`);
    }

    for (const store of stores) {
      if (barcode) {
        const duplicateBarcode = await tx.storeProductSellingUnit.findFirst({
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            barcode,
            NOT: {
              productId: product.id,
              productVariantId: productVariant?.id ?? null,
              unitOfMeasureId: resolvedUnit.id
            }
          },
          select: { unitOfMeasureCodeSnapshot: true, product: { select: { name: true } } }
        });

        if (duplicateBarcode) {
          throw new Error(
            `Barcode ${barcode} already sells ${duplicateBarcode.product.name} as ${duplicateBarcode.unitOfMeasureCodeSnapshot} in ${store.name}.`
          );
        }
      }

      if (input.isDefault === true) {
        await tx.storeProductSellingUnit.updateMany({
          where: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            productId: product.id,
            productVariantId: productVariant?.id ?? null,
            isDefault: true
          },
          data: { isDefault: false }
        });
      }

      const configurationKey = [
        store.id,
        product.id,
        productVariant?.id ?? "BASE",
        resolvedUnit.id
      ].join(":");

      await tx.storeProductSellingUnit.upsert({
        where: { configurationKey },
        create: {
          configurationKey,
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          productId: product.id,
          productVariantId: productVariant?.id ?? null,
          unitOfMeasureId: resolvedUnit.id,
          unitOfMeasureCodeSnapshot: resolvedUnit.code,
          unitOfMeasureNameSnapshot: resolvedUnit.name,
          conversionFactor: resolvedUnit.conversionFactor,
          unitPrice,
          barcode,
          isDefault: input.isDefault === true,
          status: RecordStatus.ACTIVE
        },
        update: {
          unitOfMeasureCodeSnapshot: resolvedUnit.code,
          unitOfMeasureNameSnapshot: resolvedUnit.name,
          conversionFactor: resolvedUnit.conversionFactor,
          unitPrice,
          barcode,
          isDefault: input.isDefault === true,
          status: RecordStatus.ACTIVE,
          recordVersion: { increment: 1 }
        }
      });
    }

    await tx.product.update({
      where: { id: product.id },
      data: {
        lastModifiedByNodeCode: enterpriseNode?.code ?? "HQ",
        recordVersion: { increment: 1 }
      }
    });

    return {
      message: `Flash ERP saved ${resolvedUnit.code} as a selling unit for ${stores.length} shop${stores.length === 1 ? "" : "s"}.`,
      appliedCount: stores.length,
      targetLabel: targetLabelFor({
        productCode: product.code,
        productName: product.name,
        productVariantCode: productVariant?.code ?? null,
        productVariantName: productVariant?.displayName ?? null
      }),
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function deleteStoreProductSellingUnit(sellingUnitId: string) {
  await ensureAlternateUomSellingSchemaCompatibility();
  const session = await assertEnterprisePermission(["master.product.manage"]);

  return prisma.$transaction(async (tx) => {
    const sellingUnit = await tx.storeProductSellingUnit.findFirst({
      where: { id: sellingUnitId, retailOrgId: session.retailOrgId },
      select: {
        id: true,
        productId: true,
        unitOfMeasureCodeSnapshot: true,
        product: { select: { name: true } },
        store: { select: { name: true } }
      }
    });

    if (!sellingUnit) {
      throw new Error("Flash ERP could not find that shop selling unit.");
    }

    await tx.storeProductSellingUnit.delete({ where: { id: sellingUnit.id } });
    await tx.product.update({
      where: { id: sellingUnit.productId },
      data: { recordVersion: { increment: 1 } }
    });

    return {
      message: `Flash ERP removed ${sellingUnit.unitOfMeasureCodeSnapshot} for ${sellingUnit.product.name} from ${sellingUnit.store.name}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function updateStoreProductPrices(
  input: UpdateStoreProductPricesRequest
): Promise<UpdateStoreProductPricesResponse> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();
  const session = await assertEnterprisePermission(["master.product.manage"]);
  const { productCode, productVariantCode } = parseTargetId(input.targetId);
  const storeCodes = normalizeStoreCodes(input.storeCodes);
  const unitPrice = Number(Number(input.unitPrice).toFixed(2));

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Enter a valid shop price greater than zero.");
  }

  if (storeCodes.length === 0) {
    throw new Error("Select at least one shop for this price.");
  }

  return prisma.$transaction(async (tx) => {
    const [enterpriseNode, product, activeStores] = await Promise.all([
      tx.syncNode.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE
        },
        select: { code: true }
      }),
      tx.product.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          code: productCode,
          status: RecordStatus.ACTIVE,
          deletedAt: null
        },
        select: {
          id: true,
          code: true,
          name: true,
          productType: true,
          matrixVariants: {
            where: productVariantCode
              ? {
                  code: productVariantCode,
                  status: RecordStatus.ACTIVE
                }
              : {
                  status: RecordStatus.ACTIVE
                },
            select: {
              id: true,
              code: true,
              displayName: true
            }
          }
        }
      }),
      tx.store.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          status: RecordStatus.ACTIVE
        },
        select: {
          id: true,
          code: true,
          name: true
        }
      })
    ]);

    if (!product) {
      throw new Error(`Flash ERP could not find active product "${productCode}".`);
    }

    const productVariant = productVariantCode
      ? (product.matrixVariants.find((variant) => variant.code === productVariantCode) ?? null)
      : null;

    if (productVariantCode && !productVariant) {
      throw new Error(`Flash ERP could not find active matrix option "${productVariantCode}".`);
    }

    const storesByCode = new Map(
      activeStores.map((store) => [normalizeLookupKey(store.code), store])
    );
    const stores = storeCodes
      .map((storeCode) => storesByCode.get(normalizeLookupKey(storeCode)) ?? null)
      .filter((store): store is (typeof activeStores)[number] => Boolean(store));
    const missingStores = storeCodes.filter(
      (storeCode) => !storesByCode.has(normalizeLookupKey(storeCode))
    );

    if (missingStores.length > 0) {
      throw new Error(`Flash ERP could not find active shop(s): ${missingStores.join(", ")}.`);
    }

    for (const store of stores) {
      const existing = await tx.storeProductPrice.findFirst({
        where: {
          retailOrgId: session.retailOrgId,
          storeId: store.id,
          productId: product.id,
          productVariantId: productVariant?.id ?? null
        },
        select: {
          id: true
        }
      });

      if (existing) {
        await tx.storeProductPrice.update({
          where: { id: existing.id },
          data: {
            unitPrice,
            status: RecordStatus.ACTIVE
          }
        });
      } else {
        await tx.storeProductPrice.create({
          data: {
            retailOrgId: session.retailOrgId,
            storeId: store.id,
            productId: product.id,
            productVariantId: productVariant?.id ?? null,
            unitPrice,
            status: RecordStatus.ACTIVE
          }
        });
      }
    }

    await tx.product.update({
      where: { id: product.id },
      data: {
        lastModifiedByNodeCode: enterpriseNode?.code ?? "HQ",
        recordVersion: {
          increment: 1
        }
      }
    });

    return {
      message: `Flash ERP saved ${unitPrice.toFixed(2)} for ${stores.length} shop${stores.length === 1 ? "" : "s"}.`,
      appliedCount: stores.length,
      targetLabel: targetLabelFor({
        productCode: product.code,
        productName: product.name,
        productVariantCode: productVariant?.code ?? null,
        productVariantName: productVariant?.displayName ?? null
      }),
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function deleteStoreProductPrice(priceId: string) {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();
  const session = await assertEnterprisePermission(["master.product.manage"]);

  return prisma.$transaction(async (tx) => {
    const price = await tx.storeProductPrice.findFirst({
      where: {
        id: priceId,
        retailOrgId: session.retailOrgId
      },
      select: {
        id: true,
        productId: true,
        product: {
          select: {
            code: true,
            name: true
          }
        },
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });

    if (!price) {
      throw new Error("Flash ERP could not find that shop price.");
    }

    await tx.storeProductPrice.delete({
      where: {
        id: price.id
      }
    });
    await tx.product.update({
      where: { id: price.productId },
      data: {
        recordVersion: {
          increment: 1
        }
      }
    });

    return {
      message: `Flash ERP removed the ${price.store.name} override for ${price.product.name}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { ensureProductVariantSalesOrderDepositSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type StorePriceProductTarget = {
  targetId: string;
  productCode: string;
  productName: string;
  productType: string;
  productVariantCode: string | null;
  productVariantName: string | null;
  baseUnitPrice: number;
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
  metrics: {
    targets: number;
    stores: number;
    activeOverrides: number;
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
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();
  const session = await assertEnterprisePermission(["master.product.manage"]);
  const [org, products, stores, priceRows] = await Promise.all([
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
    })
  ]);
  const targets: StorePriceProductTarget[] = products.flatMap<StorePriceProductTarget>((product) => {
    if (product.productType === "MATRIX" && product.matrixVariants.length > 0) {
      return product.matrixVariants.map((variant) => ({
        targetId: targetIdFor(product.code, variant.code),
        productCode: product.code,
        productName: product.name,
        productType: product.productType,
        productVariantCode: variant.code,
        productVariantName: variant.displayName,
        baseUnitPrice: Number(variant.unitPrice)
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
        baseUnitPrice: Number(product.baseUnitPrice)
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
    metrics: {
      targets: targets.length,
      stores: stores.length,
      activeOverrides: priceRows.length
    },
    refreshedAt: new Date().toISOString()
  };
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

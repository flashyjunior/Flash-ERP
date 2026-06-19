import { readJsonObject, readJsonStringArray } from "./json-field";


import { prisma } from "@/lib/db/prisma";
import {
  defaultGoodsReceiptTemplateHtml,
  defaultPurchaseOrderTemplateHtml
} from "@/lib/templates/thermal-receipt-templates";
import { resolveEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  getPredictivePurchaseOrderSnapshot,
  type PredictivePurchaseOrderRow
} from "@/server/repositories/enterprise-predictive-purchasing.repository";
import {
  ensureEnterpriseGoodsReceiptTemplate,
  ensureEnterprisePurchaseOrderTemplate
} from "@/server/repositories/receipt-template-support";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";


function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export type EnterprisePurchasesWorkspaceData = {
  currencyCode: string;
  retailOrgName: string;
  companyLogoUrl: string | null;
  documentTemplates: {
    purchaseOrder: {
      code: string;
      name: string;
      templateHtml: string;
    };
    goodsReceipt: {
      code: string;
      name: string;
      templateHtml: string;
    };
  };
  metrics: {
    openPurchaseOrders: number;
    draftPurchaseOrders: number;
    receivedPurchaseOrders: number;
    goodsReceipts: number;
    openOrderValue: number;
    receivedQuantity: number;
    predictiveRecommendations: number;
    predictiveCritical: number;
  };
  supplierOptions: Array<{
    supplierNo: string;
    supplierName: string;
  }>;
  shopOptions: Array<{
    storeCode: string;
    storeName: string;
    defaultReceivingLocationCode: string | null;
  }>;
  locationOptions: Array<{
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
  }>;
  productOptions: Array<{
    productCode: string;
    sku: string | null;
    productName: string;
    unitCost: number | null;
  }>;
  purchaseOrderRows: Array<{
    purchaseOrderId: string;
    purchaseOrderNo: string;
    status: string;
    statusLabel: string;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    externalReference: string | null;
    note: string | null;
    operatorName: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
    exceptionQuantity: number;
    outstandingQuantity: number;
    subtotalAmount: number;
    discountAmount: number;
    shippingAmount: number;
    freightAmount: number;
    otherChargesAmount: number;
    taxAmount: number;
    grandTotalAmount: number;
    lineCount: number;
    committedAt: string | null;
    committedAtLabel: string;
    updatedAt: string;
    updatedAtLabel: string;
    lines: Array<{
      purchaseOrderLineId: string;
      lineNo: number;
      productCode: string;
      productName: string;
      orderedQuantity: number;
      receivedQuantity: number;
      exceptionQuantity: number;
      outstandingQuantity: number;
      unitCost: number | null;
      lineTotal: number;
    }>;
  }>;
  goodsReceiptRows: Array<{
    goodsReceiptId: string;
    goodsReceiptNo: string;
    purchaseOrderId: string | null;
    purchaseOrderNo: string | null;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    externalReference: string | null;
    note: string | null;
    operatorName: string | null;
    sourceNodeCode: string | null;
    totalQuantity: number;
    lineCount: number;
    receivedAt: string;
    receivedAtLabel: string;
    postedAt: string;
    postedAtLabel: string;
    lines: Array<{
      goodsReceiptLineId: string;
      lineNo: number;
      productCode: string;
      productName: string;
      orderedQuantity: number | null;
      quantity: number;
      unitCost: number | null;
      lineTotal: number;
      serialNumbers: string[];
    }>;
  }>;
  predictiveRows: PredictivePurchaseOrderRow[];
  postureMessages: string[];
  refreshedAt: string;
};

export function buildUnavailableEnterprisePurchasesWorkspace(
  reason: string,
  currencyCode = "USD"
): EnterprisePurchasesWorkspaceData {
  return {
    currencyCode,
    retailOrgName: "Flash ERP",
    companyLogoUrl: null,
    documentTemplates: {
      purchaseOrder: {
        code: "a4-purchase-order-starter",
        name: "Flash ERP Purchase Order",
        templateHtml: defaultPurchaseOrderTemplateHtml
      },
      goodsReceipt: {
        code: "thermal-goods-receipt-starter",
        name: "Flash ERP Goods Receipt Note",
        templateHtml: defaultGoodsReceiptTemplateHtml
      }
    },
    metrics: {
      openPurchaseOrders: 0,
      draftPurchaseOrders: 0,
      receivedPurchaseOrders: 0,
      goodsReceipts: 0,
      openOrderValue: 0,
      receivedQuantity: 0,
      predictiveRecommendations: 0,
      predictiveCritical: 0
    },
    supplierOptions: [],
    shopOptions: [],
    locationOptions: [],
    productOptions: [],
    purchaseOrderRows: [],
    goodsReceiptRows: [],
    predictiveRows: [],
    postureMessages: [
      reason,
      "Once the enterprise database is available, Flash ERP will load PO history, supplier options, and synced goods receipts here."
    ],
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterprisePurchasesWorkspace(): Promise<EnterprisePurchasesWorkspaceData> {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      retailOrg: {
        select: {
          baseCurrencyCode: true,
          companySettingsJson: true,
          name: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return buildUnavailableEnterprisePurchasesWorkspace(
      "No primary enterprise sync node is provisioned yet."
    );
  }

  await ensureEnterpriseGoodsReceiptTemplate(prisma, enterpriseNode.retailOrgId);
  await ensureEnterprisePurchaseOrderTemplate(prisma, enterpriseNode.retailOrgId);

  const [
    suppliers,
    shops,
    locations,
    products,
    purchaseOrders,
    goodsReceipts,
    predictiveSnapshot,
    documentTemplates
  ] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        supplierNo: true,
        name: true,
        status: true
      }
    }),
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        inventoryLocations: {
          orderBy: [{ useForReceivingDefault: "desc" }, { name: "asc" }],
          select: {
            code: true,
            status: true
          }
        }
      }
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        storeId: {
          not: null
        }
      },
      orderBy: [{ store: { name: "asc" } }, { useForReceivingDefault: "desc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        status: true,
        useForReceivingDefault: true,
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        trackInventory: true
      },
      orderBy: [{ name: "asc" }],
      take: 400,
      select: {
        code: true,
        sku: true,
        name: true,
        baseCostPrice: true
      }
    }),
    prisma.purchaseOrder.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ updatedAt: "desc" }, { purchaseOrderNo: "desc" }],
      take: 160,
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        externalReference: true,
        note: true,
        operatorName: true,
        subtotalAmount: true,
        discountAmount: true,
        shippingAmount: true,
        freightAmount: true,
        otherChargesAmount: true,
        taxAmount: true,
        grandTotalAmount: true,
        committedAt: true,
        updatedAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        inventoryLocation: {
          select: {
            code: true,
            name: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
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
    prisma.goodsReceipt.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ postedAt: "desc" }, { receiptNo: "desc" }],
      take: 160,
      select: {
        id: true,
        receiptNo: true,
        externalReference: true,
        note: true,
        operatorName: true,
        sourceNodeCode: true,
        receivedAt: true,
        postedAt: true,
        purchaseOrder: {
          select: {
            id: true,
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
            name: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          select: {
            id: true,
            lineNo: true,
            quantity: true,
            unitCost: true,
            serialNumbersSnapshot: true,
            purchaseOrderLine: {
              select: {
                orderedQuantity: true
              }
            },
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
    getPredictivePurchaseOrderSnapshot({ limit: 120 }),
    prisma.receiptTemplate.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        code: {
          in: ["a4-purchase-order-starter", "thermal-goods-receipt-starter"]
        }
      },
      select: {
        code: true,
        name: true,
        templateHtml: true
      }
    })
  ]);

  const purchaseOrderRows = purchaseOrders.map((purchaseOrder) => {
    const lines = purchaseOrder.lines.map((line) => {
      const orderedQuantity = Number(Number(line.orderedQuantity).toFixed(3));
      const receivedQuantity = Number(Number(line.receivedQuantity).toFixed(3));
      const exceptionQuantity = Number(Number(line.exceptionQuantity).toFixed(3));
      const outstandingQuantity = Number(
        Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(3)
      );
      const unitCost = line.unitCost === null ? null : Number(line.unitCost);

      return {
        purchaseOrderLineId: line.id,
        lineNo: line.lineNo,
        productCode: line.product.code,
        productName: line.product.name,
        orderedQuantity,
        receivedQuantity,
        exceptionQuantity,
        outstandingQuantity,
        unitCost,
        lineTotal: Number((orderedQuantity * (unitCost ?? 0)).toFixed(2))
      };
    });
    const orderedQuantity = Number(
      lines.reduce((sum, line) => sum + line.orderedQuantity, 0).toFixed(3)
    );
    const receivedQuantity = Number(
      lines.reduce((sum, line) => sum + line.receivedQuantity, 0).toFixed(3)
    );
    const exceptionQuantity = Number(
      lines.reduce((sum, line) => sum + line.exceptionQuantity, 0).toFixed(3)
    );

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      status: purchaseOrder.status,
      statusLabel: formatEnumLabel(purchaseOrder.status),
      supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
      supplierName: purchaseOrder.supplier?.name ?? null,
      locationCode: purchaseOrder.inventoryLocation.code,
      locationName: purchaseOrder.inventoryLocation.name,
      storeCode: purchaseOrder.inventoryLocation.store?.code ?? null,
      storeName: purchaseOrder.inventoryLocation.store?.name ?? null,
      externalReference: purchaseOrder.externalReference,
      note: purchaseOrder.note,
      operatorName: purchaseOrder.operatorName,
      orderedQuantity,
      receivedQuantity,
      exceptionQuantity,
      outstandingQuantity: Number(
        Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(3)
      ),
      subtotalAmount: Number(purchaseOrder.subtotalAmount),
      discountAmount: Number(purchaseOrder.discountAmount),
      shippingAmount: Number(purchaseOrder.shippingAmount),
      freightAmount: Number(purchaseOrder.freightAmount),
      otherChargesAmount: Number(purchaseOrder.otherChargesAmount),
      taxAmount: Number(purchaseOrder.taxAmount),
      grandTotalAmount: Number(purchaseOrder.grandTotalAmount),
      lineCount: lines.length,
      committedAt: toIsoString(purchaseOrder.committedAt),
      committedAtLabel: formatRelativeTime(purchaseOrder.committedAt),
      updatedAt: purchaseOrder.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(purchaseOrder.updatedAt),
      lines
    };
  });

  const goodsReceiptRows = goodsReceipts.map((receipt) => {
    const lines = receipt.lines.map((line) => {
      const quantity = Number(Number(line.quantity).toFixed(3));
      const unitCost = line.unitCost === null ? null : Number(line.unitCost);

      return {
        goodsReceiptLineId: line.id,
        lineNo: line.lineNo,
        productCode: line.product.code,
        productName: line.product.name,
        orderedQuantity:
          line.purchaseOrderLine?.orderedQuantity === undefined ||
          line.purchaseOrderLine?.orderedQuantity === null
            ? null
            : Number(Number(line.purchaseOrderLine.orderedQuantity).toFixed(3)),
        quantity,
        unitCost,
        lineTotal: Number((quantity * (unitCost ?? 0)).toFixed(2)),
        serialNumbers: Array.isArray(line.serialNumbersSnapshot)
          ? line.serialNumbersSnapshot.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          : []
      };
    });

    return {
      goodsReceiptId: receipt.id,
      goodsReceiptNo: receipt.receiptNo,
      purchaseOrderId: receipt.purchaseOrder?.id ?? null,
      purchaseOrderNo: receipt.purchaseOrder?.purchaseOrderNo ?? null,
      supplierNo: receipt.supplier?.supplierNo ?? null,
      supplierName: receipt.supplier?.name ?? null,
      locationCode: receipt.inventoryLocation.code,
      locationName: receipt.inventoryLocation.name,
      storeCode: receipt.inventoryLocation.store?.code ?? null,
      storeName: receipt.inventoryLocation.store?.name ?? null,
      externalReference: receipt.externalReference,
      note: receipt.note,
      operatorName: receipt.operatorName,
      sourceNodeCode: receipt.sourceNodeCode,
      totalQuantity: Number(lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)),
      lineCount: lines.length,
      receivedAt: receipt.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(receipt.receivedAt),
      postedAt: receipt.postedAt.toISOString(),
      postedAtLabel: formatRelativeTime(receipt.postedAt),
      lines
    };
  });
  const openPurchaseOrders = purchaseOrderRows.filter((row) =>
    ["COMMITTED", "PART_RECEIVED"].includes(row.status)
  ).length;
  const currencyCode = resolveEnterpriseCurrencyCode(enterpriseNode.retailOrg);
  const companySettings = readObject(enterpriseNode.retailOrg.companySettingsJson);
  const companyLogoUrl = readOptionalString(companySettings, "companyLogoUrl");
  const documentTemplateByCode = new Map(
    documentTemplates.map((template) => [template.code, template] as const)
  );
  const purchaseOrderTemplate = documentTemplateByCode.get("a4-purchase-order-starter");
  const goodsReceiptTemplate = documentTemplateByCode.get("thermal-goods-receipt-starter");
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === RecordStatus.ACTIVE);
  const selectableSuppliers = activeSuppliers.length > 0 ? activeSuppliers : suppliers;
  const activeLocations = locations.filter((location) => location.status === RecordStatus.ACTIVE);
  const selectableLocations = activeLocations.length > 0 ? activeLocations : locations;

  return {
    currencyCode,
    retailOrgName: enterpriseNode.retailOrg.name,
    companyLogoUrl,
    documentTemplates: {
      purchaseOrder: {
        code: purchaseOrderTemplate?.code ?? "a4-purchase-order-starter",
        name: purchaseOrderTemplate?.name ?? "Flash ERP Purchase Order",
        templateHtml: purchaseOrderTemplate?.templateHtml ?? defaultPurchaseOrderTemplateHtml
      },
      goodsReceipt: {
        code: goodsReceiptTemplate?.code ?? "thermal-goods-receipt-starter",
        name: goodsReceiptTemplate?.name ?? "Flash ERP Goods Receipt Note",
        templateHtml: goodsReceiptTemplate?.templateHtml ?? defaultGoodsReceiptTemplateHtml
      }
    },
    metrics: {
      openPurchaseOrders,
      draftPurchaseOrders: purchaseOrderRows.filter((row) => row.status === "DRAFT").length,
      receivedPurchaseOrders: purchaseOrderRows.filter((row) => row.status === "RECEIVED").length,
      goodsReceipts: goodsReceiptRows.length,
      openOrderValue: Number(
        purchaseOrderRows
          .filter((row) => ["DRAFT", "COMMITTED", "PART_RECEIVED"].includes(row.status))
          .reduce((sum, row) => sum + row.grandTotalAmount, 0)
          .toFixed(2)
      ),
      receivedQuantity: Number(
        goodsReceiptRows.reduce((sum, row) => sum + row.totalQuantity, 0).toFixed(3)
      ),
      predictiveRecommendations: predictiveSnapshot.summary.recommendations,
      predictiveCritical: predictiveSnapshot.summary.critical
    },
    supplierOptions: selectableSuppliers.map((supplier) => ({
      supplierNo: supplier.supplierNo,
      supplierName: supplier.name
    })),
    shopOptions: shops.map((shop) => {
      const activeReceivingLocation =
        shop.inventoryLocations.find((location) => location.status === RecordStatus.ACTIVE) ??
        shop.inventoryLocations[0] ??
        null;

      return {
        storeCode: shop.code,
        storeName: shop.name,
        defaultReceivingLocationCode: activeReceivingLocation?.code ?? null
      };
    }),
    locationOptions: selectableLocations.map((location) => ({
      locationCode: location.code,
      locationName: location.name,
      storeCode: location.store?.code ?? null,
      storeName: location.store?.name ?? null
    })),
    productOptions: products.map((product) => ({
      productCode: product.code,
      sku: product.sku,
      productName: product.name,
      unitCost: product.baseCostPrice === null ? null : Number(product.baseCostPrice)
    })),
    purchaseOrderRows,
    goodsReceiptRows,
    predictiveRows: predictiveSnapshot.rows,
    postureMessages: [
      `${purchaseOrderRows.length} purchase order(s), ${openPurchaseOrders} open PO(s), and ${goodsReceiptRows.length} synced goods receipt(s) are visible across ${enterpriseNode.retailOrg.name}.`,
      selectableSuppliers.length > 0
        ? `${selectableSuppliers.length} supplier(s) are available for mandatory PO selection.`
        : "Create active suppliers before raising purchase orders."
    ],
    refreshedAt: new Date().toISOString()
  };
}

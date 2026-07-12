import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { readJsonObject, readJsonStringArray, serializeRequiredJsonField } from "./json-field";


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
import {
  createErpOperationalDocument,
  postErpOperationalDocument
} from "@/server/repositories/erp-operational-documents.repository";
import {
  shouldPostStockImmediately,
  STOCK_UPDATE_STATUS_PENDING,
  STOCK_UPDATE_STATUS_POSTED
} from "@/server/repositories/inventory-stock-policy.repository";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  InventoryMovementType,
  PurchaseOrderStatus,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


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

function toMoneyString(value: number) {
  return value.toFixed(2);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function toQuantityString(value: number) {
  return value.toFixed(3);
}

function buildGoodsReceiptNo(locationCode: string, now: Date) {
  const compactTimestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `GRN-${locationCode}-${compactTimestamp}`;
}

function normalizeFuelProductCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isFuelCatalogProduct(product: {
  code: string;
  sku?: string | null;
  name: string;
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
  ].map(normalizeFuelProductCode);
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
    "NAPHTA",
    "NAPHTHA",
    "KEROSENE",
    "ATK",
    "JETFUEL"
  ]);

  if (values.some((value) => exactFuelCodes.has(value))) {
    return true;
  }

  return values.some((value) =>
    ["FUEL", "PETROL", "DIESEL", "GASOIL", "GASOLINE", "LPG", "NAPHT"].some((keyword) =>
      value.includes(keyword)
    )
  );
}

async function ensureFuelProductProfileFromCatalogProduct(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
    product: {
      code: string;
      name: string;
      shortName?: string | null;
      unitOfMeasure: string;
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
      variantName: input.product.shortName,
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
      variantName: input.product.shortName,
      defaultUomCode: input.product.unitOfMeasure || "LTR",
      trackingMode: "BULK_LIQUID",
      status: RecordStatus.ACTIVE
    }
  });
}

function derivePurchaseOrderStatus(input: {
  currentStatus: string;
  committedAt: Date | null;
  closedAt: Date | null;
  lines: Array<{
    orderedQuantity: number;
    receivedQuantity: number;
    exceptionQuantity: number;
  }>;
}) {
  if (input.currentStatus === PurchaseOrderStatus.CANCELLED) {
    return PurchaseOrderStatus.CANCELLED;
  }

  if (input.closedAt || input.currentStatus === PurchaseOrderStatus.CLOSED) {
    return PurchaseOrderStatus.CLOSED;
  }

  if (!input.committedAt && input.currentStatus === PurchaseOrderStatus.DRAFT) {
    return PurchaseOrderStatus.DRAFT;
  }

  const orderedQuantity = input.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
  const receivedQuantity = input.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const exceptionQuantity = input.lines.reduce((sum, line) => sum + line.exceptionQuantity, 0);

  if (orderedQuantity > 0 && receivedQuantity + exceptionQuantity + 0.0001 >= orderedQuantity) {
    return PurchaseOrderStatus.RECEIVED;
  }

  if (receivedQuantity > 0 || exceptionQuantity > 0) {
    return PurchaseOrderStatus.PART_RECEIVED;
  }

  return PurchaseOrderStatus.COMMITTED;
}

async function ensureFuelDeliverySequence(
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
    throw new Error("Flash ERP needs an open fiscal year before it can mirror a fuel GRN.");
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
    stockUpdateStatus: string;
    stockUpdateStatusLabel: string;
    stockConfirmedAt: string | null;
    stockConfirmedAtLabel: string;
    stockConfirmedBy: string | null;
    totalQuantity: number;
    lineCount: number;
    receivedAt: string;
    receivedAtLabel: string;
    postedAt: string;
    postedAtLabel: string;
    apInvoiceDocumentId: string | null;
    apInvoiceNo: string | null;
    apInvoiceStatus: string;
    apInvoiceTotalAmount: number | null;
    apJournalEntryId: string | null;
    apJournalNo: string | null;
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

export type CreateHqGoodsReceiptRequest = {
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string | null;
  receivedAt?: string | null;
  lines?: Array<{
    purchaseOrderLineId?: string | null;
    quantity?: number | string | null;
  }> | null;
};

export type CreateHqGoodsReceiptResponse = {
  goodsReceiptId: string;
  goodsReceiptNo: string;
  purchaseOrderId: string;
  purchaseOrderNo: string;
  locationCode: string;
  receivedQuantity: number;
  mirroredFuelDeliveryNo: string | null;
  message: string;
  serverProcessedAt: string;
};

export type GenerateGoodsReceiptSupplierInvoiceResponse = {
  goodsReceiptId: string;
  goodsReceiptNo: string;
  supplierInvoiceId: string;
  supplierInvoiceNo: string;
  supplierInvoiceStatus: string;
  journalEntryId: string | null;
  journalNo: string | null;
  message: string;
  serverProcessedAt: string;
};

function buildGoodsReceiptInvoiceReference(receiptNo: string) {
  return `GRN:${receiptNo}`;
}

function dateInputFromDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function allocateHeaderAmount(totalAmount: number, lineIndex: number, lineAmounts: number[]) {
  if (totalAmount <= 0 || lineAmounts.length === 0) {
    return 0;
  }

  const lineTotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);

  if (lineTotal <= 0) {
    return 0;
  }

  if (lineIndex === lineAmounts.length - 1) {
    const previousAllocations = lineAmounts
      .slice(0, -1)
      .reduce((sum, amount) => sum + roundMoney((amount / lineTotal) * totalAmount), 0);
    return roundMoney(totalAmount - previousAllocations);
  }

  return roundMoney((lineAmounts[lineIndex] / lineTotal) * totalAmount);
}

export async function generateSupplierInvoiceForGoodsReceipt(
  goodsReceiptId: string
): Promise<GenerateGoodsReceiptSupplierInvoiceResponse> {
  const receipt = await prisma.goodsReceipt.findUnique({
    where: {
      id: goodsReceiptId
    },
    include: {
      supplier: {
        select: {
          supplierNo: true,
          name: true
        }
      },
      purchaseOrder: {
        select: {
          purchaseOrderNo: true,
          subtotalAmount: true,
          discountAmount: true,
          shippingAmount: true,
          freightAmount: true,
          otherChargesAmount: true,
          taxAmount: true
        }
      },
      lines: {
        orderBy: {
          lineNo: "asc"
        },
        include: {
          product: {
            select: {
              code: true,
              name: true,
              baseCostPrice: true
            }
          }
        }
      }
    }
  });

  if (!receipt) {
    throw new Error("Flash ERP cannot find that goods receipt.");
  }

  if (!receipt.supplier) {
    throw new Error(`${receipt.receiptNo} needs a supplier before Flash ERP can generate an AP invoice.`);
  }

  if (receipt.lines.length === 0) {
    throw new Error(`${receipt.receiptNo} has no receipt lines to invoice.`);
  }

  const invoiceReference = buildGoodsReceiptInvoiceReference(receipt.receiptNo);
  const existingInvoice = await prisma.erpOperationalDocument.findFirst({
    where: {
      retailOrgId: receipt.retailOrgId,
      documentType: "SUPPLIER_INVOICE",
      externalReference: {
        in: [invoiceReference, receipt.receiptNo]
      },
      status: {
        not: RecordStatus.DELETED
      }
    },
    include: {
      postingJournalEntry: {
        select: {
          id: true,
          journalNo: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (existingInvoice) {
    if (existingInvoice.status === "DRAFT") {
      const postedInvoice = await postErpOperationalDocument(existingInvoice.id);

      return {
        goodsReceiptId: receipt.id,
        goodsReceiptNo: receipt.receiptNo,
        supplierInvoiceId: postedInvoice.documentId ?? existingInvoice.id,
        supplierInvoiceNo: postedInvoice.documentNo ?? existingInvoice.documentNo,
        supplierInvoiceStatus: "POSTED",
        journalEntryId: postedInvoice.journalEntryId ?? null,
        journalNo: postedInvoice.journalNo ?? null,
        message: `${receipt.receiptNo} AP invoice ${postedInvoice.documentNo ?? existingInvoice.documentNo} was posted through journal ${postedInvoice.journalNo ?? "the GL engine"}.`,
        serverProcessedAt: new Date().toISOString()
      };
    }

    return {
      goodsReceiptId: receipt.id,
      goodsReceiptNo: receipt.receiptNo,
      supplierInvoiceId: existingInvoice.id,
      supplierInvoiceNo: existingInvoice.documentNo,
      supplierInvoiceStatus: existingInvoice.status,
      journalEntryId: existingInvoice.postingJournalEntry?.id ?? null,
      journalNo: existingInvoice.postingJournalEntry?.journalNo ?? null,
      message: `${receipt.receiptNo} already has AP invoice ${existingInvoice.documentNo}.`,
      serverProcessedAt: new Date().toISOString()
    };
  }

  const company = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId: receipt.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    include: {
      accountingSettings: true
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });

  if (!company) {
    throw new Error("Create a Finance company before generating supplier invoices from GRNs.");
  }

  const inventoryAccountCode = company.accountingSettings?.inventoryControlAccountCode ?? "1200";
  const lineAmounts = receipt.lines.map((line) => {
    const unitCost =
      line.unitCost === null
        ? line.product.baseCostPrice === null
          ? null
          : Number(line.product.baseCostPrice)
        : Number(line.unitCost);

    if (unitCost === null || unitCost <= 0) {
      throw new Error(
        `${receipt.receiptNo} line ${line.lineNo} (${line.product.code}) needs a positive unit cost before AP invoice posting.`
      );
    }

    return roundMoney(Number(line.quantity) * unitCost);
  });
  const receiptSubtotal = roundMoney(lineAmounts.reduce((sum, amount) => sum + amount, 0));

  if (receiptSubtotal <= 0) {
    throw new Error(`${receipt.receiptNo} needs a positive receipt value before AP invoice posting.`);
  }

  const purchaseOrderSubtotal = roundMoney(Number(receipt.purchaseOrder?.subtotalAmount ?? 0));
  const receiptHeaderShare =
    purchaseOrderSubtotal > 0 ? Math.min(1, roundMoney(receiptSubtotal / purchaseOrderSubtotal)) : 1;
  const purchaseOrderDiscount = roundMoney(Number(receipt.purchaseOrder?.discountAmount ?? 0) * receiptHeaderShare);
  const purchaseOrderCharges = roundMoney(
    (Number(receipt.purchaseOrder?.shippingAmount ?? 0) +
      Number(receipt.purchaseOrder?.freightAmount ?? 0) +
      Number(receipt.purchaseOrder?.otherChargesAmount ?? 0)) *
      receiptHeaderShare
  );
  const purchaseOrderTax = roundMoney(
    Number(receipt.purchaseOrder?.taxAmount ?? 0) * receiptHeaderShare
  );
  const documentDate = receipt.receivedAt;
  const dueDate = addDays(documentDate, 30);
  const draftInvoice = await createErpOperationalDocument({
    documentType: "SUPPLIER_INVOICE",
    documentDate: dateInputFromDate(documentDate),
    postingDate: dateInputFromDate(documentDate),
    dueDate: dateInputFromDate(dueDate),
    partyNo: receipt.supplier.supplierNo,
    partyName: receipt.supplier.name,
    currencyCode: company.baseCurrencyCode,
    exchangeRate: 1,
    externalReference: invoiceReference,
    memo: `Supplier invoice generated from GRN ${receipt.receiptNo}${
      receipt.purchaseOrder?.purchaseOrderNo ? ` for PO ${receipt.purchaseOrder.purchaseOrderNo}` : ""
    }.`,
    lines: receipt.lines.map((line, index) => {
      const unitCost =
        line.unitCost === null
          ? Number(line.product.baseCostPrice)
          : Number(line.unitCost);

      return {
        itemCode: line.product.code,
        description: `${line.product.code} - ${line.product.name}`,
        quantity: Number(line.quantity),
        unitPrice: unitCost,
        discountAmount: allocateHeaderAmount(purchaseOrderDiscount, index, lineAmounts),
        taxAmount: allocateHeaderAmount(purchaseOrderTax, index, lineAmounts),
        chargeAmount: allocateHeaderAmount(purchaseOrderCharges, index, lineAmounts),
        postingAccountCode: inventoryAccountCode
      };
    })
  });

  if (!draftInvoice.documentId) {
    throw new Error("Flash ERP could not create the draft supplier invoice for this GRN.");
  }

  const postedInvoice = await postErpOperationalDocument(draftInvoice.documentId);

  return {
    goodsReceiptId: receipt.id,
    goodsReceiptNo: receipt.receiptNo,
    supplierInvoiceId: postedInvoice.documentId ?? draftInvoice.documentId ?? "",
    supplierInvoiceNo: postedInvoice.documentNo ?? draftInvoice.documentNo ?? "",
    supplierInvoiceStatus: "POSTED",
    journalEntryId: postedInvoice.journalEntryId ?? null,
    journalNo: postedInvoice.journalNo ?? null,
    message: `${receipt.receiptNo} generated AP invoice ${postedInvoice.documentNo ?? draftInvoice.documentNo} and posted it through journal ${postedInvoice.journalNo ?? "the GL engine"}.`,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function createHqGoodsReceiptFromPurchaseOrder(
  purchaseOrderId: string,
  input: CreateHqGoodsReceiptRequest
): Promise<CreateHqGoodsReceiptResponse> {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId
      },
      include: {
        supplier: true,
        inventoryLocation: {
          include: {
            store: true,
            warehouse: true
          }
        },
        lines: {
          include: {
            product: true
          },
          orderBy: {
            lineNo: "asc"
          }
        }
      }
    });

    if (!purchaseOrder) {
      throw new Error("Flash ERP could not find that purchase order.");
    }

    if (
      purchaseOrder.status === PurchaseOrderStatus.DRAFT ||
      purchaseOrder.status === PurchaseOrderStatus.CANCELLED ||
      purchaseOrder.status === PurchaseOrderStatus.CLOSED ||
      purchaseOrder.status === PurchaseOrderStatus.RECEIVED
    ) {
      throw new Error(`${purchaseOrder.purchaseOrderNo} is not open for HQ receiving.`);
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: purchaseOrder.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE
      },
      select: {
        id: true,
        code: true
      }
    });

    if (!enterpriseNode) {
      throw new Error("Flash ERP needs a primary enterprise node before posting an HQ GRN.");
    }

    const lineInputById = new Map(
      (input.lines ?? [])
        .filter((line) => typeof line.purchaseOrderLineId === "string")
        .map((line) => [line.purchaseOrderLineId as string, line] as const)
    );
    const requestedLines =
      lineInputById.size > 0
        ? purchaseOrder.lines
            .map((line) => ({ line, requested: lineInputById.get(line.id) ?? null }))
            .filter((entry) => entry.requested !== null)
        : purchaseOrder.lines.map((line) => ({ line, requested: null }));
    const lineMetrics = new Map(
      purchaseOrder.lines.map((line) => [
        line.id,
        {
          orderedQuantity: Number(line.orderedQuantity),
          receivedQuantity: Number(line.receivedQuantity),
          exceptionQuantity: Number(line.exceptionQuantity)
        }
      ])
    );
    const receiptLines = requestedLines
      .map(({ line, requested }) => {
        const metrics = lineMetrics.get(line.id);
        const outstandingQuantity = metrics
          ? Number(
              Math.max(
                0,
                metrics.orderedQuantity - metrics.receivedQuantity - metrics.exceptionQuantity
              ).toFixed(3)
            )
          : 0;
        const quantity =
          requested && requested.quantity !== undefined && requested.quantity !== null
            ? Number(requested.quantity)
            : outstandingQuantity;

        return { line, quantity, outstandingQuantity };
      })
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0);

    if (receiptLines.length === 0) {
      throw new Error("Flash ERP could not find any outstanding PO line quantity to receive.");
    }

    for (const receiptLine of receiptLines) {
      if (receiptLine.line.product.isSerialized) {
        throw new Error(
          `Serialized product ${receiptLine.line.product.code} still needs the store serial-number GRN flow.`
        );
      }

      if (receiptLine.quantity - receiptLine.outstandingQuantity > 0.0001) {
        throw new Error(
          `${purchaseOrder.purchaseOrderNo} cannot receive more than ${receiptLine.outstandingQuantity.toFixed(3)} on ${receiptLine.line.product.code}.`
        );
      }

      const metrics = lineMetrics.get(receiptLine.line.id);

      if (metrics) {
        metrics.receivedQuantity = Number((metrics.receivedQuantity + receiptLine.quantity).toFixed(3));
      }
    }

    const now = new Date();
    const receivedAtRaw = input.receivedAt?.trim();
    const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : now;

    if (Number.isNaN(receivedAt.getTime())) {
      throw new Error("Flash ERP needs a valid HQ GRN received date.");
    }

    const goodsReceiptId = randomUUID();
    const receiptNo = buildGoodsReceiptNo(purchaseOrder.inventoryLocation.code, now);
    const externalReference = input.externalReference?.trim() || receiptNo;
    const operatorName = input.operatorName?.trim() || "HQ receiving";
    const receiptNote =
      input.note?.trim() ||
      `HQ goods receipt for ${purchaseOrder.purchaseOrderNo} into ${purchaseOrder.inventoryLocation.name}.`;
    const postStockImmediately = await shouldPostStockImmediately(
      tx,
      purchaseOrder.retailOrgId,
      purchaseOrder.storeId
    );

    await tx.goodsReceipt.create({
      data: {
        id: goodsReceiptId,
        retailOrgId: purchaseOrder.retailOrgId,
        storeId: purchaseOrder.storeId,
        warehouseId: purchaseOrder.warehouseId,
        inventoryLocationId: purchaseOrder.inventoryLocationId,
        purchaseOrderId: purchaseOrder.id,
        supplierId: purchaseOrder.supplierId,
        receiptNo,
        externalReference,
        note: receiptNote,
        operatorName,
        stockUpdateStatus: postStockImmediately ? STOCK_UPDATE_STATUS_POSTED : STOCK_UPDATE_STATUS_PENDING,
        stockConfirmedAt: postStockImmediately ? now : null,
        stockConfirmedBy: postStockImmediately ? operatorName : null,
        receivedAt,
        postedAt: now,
        sourceNodeCode: enterpriseNode.code
      }
    });

    const targetStoreNode =
      purchaseOrder.storeId === null
        ? null
        : await tx.syncNode.findFirst({
            where: {
              retailOrgId: purchaseOrder.retailOrgId,
              storeId: purchaseOrder.storeId,
              nodeType: SyncNodeType.STORE_DESKTOP,
              status: RecordStatus.ACTIVE
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              code: true,
              terminal: {
                select: {
                  code: true
                }
              }
            }
          });

    for (const [index, receiptLine] of receiptLines.entries()) {
      const ledgerEntryId = randomUUID();
      const quantity = Number(receiptLine.quantity.toFixed(3));
      const unitCost =
        receiptLine.line.unitCost === null
          ? receiptLine.line.product.baseCostPrice === null
            ? null
            : Number(receiptLine.line.product.baseCostPrice)
          : Number(receiptLine.line.unitCost);

      await tx.goodsReceiptLine.create({
        data: {
          goodsReceiptId,
          purchaseOrderLineId: receiptLine.line.id,
          productId: receiptLine.line.productId,
          lineNo: index + 1,
          quantity: toQuantityString(quantity),
          unitCost: unitCost === null ? null : toMoneyString(unitCost)
        }
      });

      if (postStockImmediately) {
        await tx.inventoryLedgerEntry.create({
          data: {
            id: ledgerEntryId,
            retailOrgId: purchaseOrder.retailOrgId,
            storeId: purchaseOrder.storeId,
            warehouseId: purchaseOrder.warehouseId,
            inventoryLocationId: purchaseOrder.inventoryLocationId,
            productId: receiptLine.line.productId,
            movementType: InventoryMovementType.GOODS_RECEIPT,
            quantity: toQuantityString(quantity),
            unitCost: unitCost === null ? null : toMoneyString(unitCost),
            referenceType: "GOODS_RECEIPT",
            referenceId: goodsReceiptId,
            externalReference,
            sourceNodeCode: enterpriseNode.code,
            occurredAt: receivedAt
          }
        });
      }

      if (
        postStockImmediately &&
        purchaseOrder.inventoryLocation.store &&
        targetStoreNode?.terminal?.code
      ) {
        await tx.syncOutboxEvent.create({
          data: {
            id: randomUUID(),
            syncNodeId: enterpriseNode.id,
            targetNodeCode: targetStoreNode.code,
            aggregateType: "inventoryLedgerEntry",
            aggregateId: ledgerEntryId,
            eventType: "inventory.ledger.published",
            idempotencyKey: `${enterpriseNode.code}:inventoryLedgerEntry:hq-grn:${ledgerEntryId}`,
            payload: serializeRequiredJsonField({
              ledgerEntryId,
              storeCode: purchaseOrder.inventoryLocation.store.code,
              terminalCode: targetStoreNode.terminal.code,
              inventoryLocationCode: purchaseOrder.inventoryLocation.code,
              productCode: receiptLine.line.product.code,
              movementType: "GOODS_RECEIPT",
              quantity,
              unitCost,
              referenceType: "GOODS_RECEIPT",
              referenceId: goodsReceiptId,
              externalReference,
              occurredAt: receivedAt.toISOString()
            }),
            status: SyncEventStatus.PENDING
          }
        });
      }
    }

    for (const [purchaseOrderLineId, metrics] of lineMetrics.entries()) {
      await tx.purchaseOrderLine.update({
        where: {
          id: purchaseOrderLineId
        },
        data: {
          receivedQuantity: toQuantityString(metrics.receivedQuantity),
          exceptionQuantity: toQuantityString(metrics.exceptionQuantity)
        }
      });
    }

    await tx.purchaseOrder.update({
      where: {
        id: purchaseOrder.id
      },
      data: {
        status: derivePurchaseOrderStatus({
          currentStatus: purchaseOrder.status,
          committedAt: purchaseOrder.committedAt,
          closedAt: purchaseOrder.closedAt,
          lines: [...lineMetrics.values()]
        })
      }
    });

    const primaryCompany = await tx.erpCompany.findFirst({
      where: {
        retailOrgId: purchaseOrder.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
    });
    let mirroredFuelDeliveryNo: string | null = null;
    const skippedFuelMirrorProducts: string[] = [];

    if (primaryCompany && postStockImmediately) {
      const fuelLineCandidates = [];

      for (const receiptLine of receiptLines) {
        if (!isFuelCatalogProduct(receiptLine.line.product)) {
          continue;
        }

        const profile = await ensureFuelProductProfileFromCatalogProduct(tx, {
          retailOrgId: purchaseOrder.retailOrgId,
          companyId: primaryCompany.id,
          product: receiptLine.line.product
        });

        fuelLineCandidates.push({ receiptLine, profile });
      }

      if (fuelLineCandidates.length > 0) {
        const siblingLocationFilters = [
          ...(purchaseOrder.inventoryLocation.storeId
            ? [{ storeId: purchaseOrder.inventoryLocation.storeId }]
            : []),
          ...(purchaseOrder.inventoryLocation.warehouseId
            ? [{ warehouseId: purchaseOrder.inventoryLocation.warehouseId }]
            : [])
        ];
        const siblingLocations =
          siblingLocationFilters.length > 0
            ? await tx.inventoryLocation.findMany({
                where: {
                  retailOrgId: purchaseOrder.retailOrgId,
                  status: RecordStatus.ACTIVE,
                  OR: siblingLocationFilters
                },
                select: {
                  code: true,
                  useForReceivingDefault: true,
                  useForSalesDefault: true,
                  useForSalesOrderDefault: true
                }
              })
            : [];
        const candidateSiteCodes = [
          purchaseOrder.inventoryLocation.code,
          purchaseOrder.inventoryLocation.store?.code ?? "",
          ...siblingLocations
            .filter((location) => location.useForReceivingDefault)
            .map((location) => location.code),
          ...siblingLocations
            .filter((location) => location.useForSalesDefault)
            .map((location) => location.code),
          ...siblingLocations
            .filter((location) => location.useForSalesOrderDefault)
            .map((location) => location.code),
          ...siblingLocations.map((location) => location.code)
        ].filter((code, index, codes): code is string => code.length > 0 && codes.indexOf(code) === index);
        const site =
          (await tx.erpOperatingSite.findFirst({
            where: {
              retailOrgId: purchaseOrder.retailOrgId,
              companyId: primaryCompany.id,
              code: purchaseOrder.inventoryLocation.code
            }
          })) ??
          (await tx.erpOperatingSite.create({
            data: {
              retailOrgId: purchaseOrder.retailOrgId,
              companyId: primaryCompany.id,
              code: purchaseOrder.inventoryLocation.code,
              name: purchaseOrder.inventoryLocation.name,
              siteType: "FUEL_SITE",
              status: RecordStatus.ACTIVE
            }
          }));
        const candidateSiteRows = await tx.erpOperatingSite.findMany({
          where: {
            retailOrgId: purchaseOrder.retailOrgId,
            companyId: primaryCompany.id,
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
        const fuelLines = [];

        for (const { receiptLine, profile } of fuelLineCandidates) {
          let tank: Awaited<ReturnType<typeof tx.erpFuelTank.findFirst>> = null;
          let tankSite: { id: string; code: string } | null = null;

          for (const candidateSite of candidateSites) {
            tank = await tx.erpFuelTank.findFirst({
              where: {
                companyId: primaryCompany.id,
                operatingSiteId: candidateSite.id,
                productProfileId: profile.id,
                status: RecordStatus.ACTIVE
              },
              orderBy: [{ code: "asc" }]
            });

            if (tank) {
              tankSite = candidateSite;
              break;
            }
          }

          if (!tank) {
            skippedFuelMirrorProducts.push(`${profile.code} at ${site.code}`);
            continue;
          }

          const quantity = Number(receiptLine.quantity.toFixed(3));
          const unitCost =
            receiptLine.line.unitCost === null
              ? receiptLine.line.product.baseCostPrice === null
                ? 0
                : Number(receiptLine.line.product.baseCostPrice)
              : Number(receiptLine.line.unitCost);

          fuelLines.push({ tank, profile, quantity, unitCost, site: tankSite ?? site });
        }

        if (fuelLines.length > 0) {
          await ensureFuelDeliverySequence(tx, {
            retailOrgId: purchaseOrder.retailOrgId,
            companyId: primaryCompany.id
          });
          const reserved = await reserveErpDocumentNumberInTransaction(tx, {
            retailOrgId: purchaseOrder.retailOrgId,
            companyId: primaryCompany.id,
            documentType: "FUEL_DELIVERY"
          });
          const mirrorSite = fuelLines[0]?.site ?? site;
          const delivery = await tx.erpFuelDelivery.create({
            data: {
              retailOrgId: purchaseOrder.retailOrgId,
              companyId: primaryCompany.id,
              operatingSiteId: mirrorSite.id,
              deliveryNo: reserved.documentNo,
              supplierName: purchaseOrder.supplier?.name ?? purchaseOrder.supplier?.supplierNo ?? null,
              supplierDocumentNo: receiptNo,
              deliveryDate: receivedAt,
              currencyCode: primaryCompany.baseCurrencyCode,
              totalOrderedQuantity: toQuantityString(
                Number(fuelLines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3))
              ),
              totalDeliveredQuantity: toQuantityString(
                Number(fuelLines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3))
              ),
              totalAcceptedQuantity: toQuantityString(
                Number(fuelLines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3))
              ),
              totalVarianceQuantity: toQuantityString(0),
              totalCostAmount: toMoneyString(
                Number(fuelLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0).toFixed(2))
              ),
              notes: `Mirrored from HQ GRN ${receiptNo} for ${purchaseOrder.purchaseOrderNo}.`,
              status: "POSTED",
              lines: {
                create: fuelLines.map((line) => ({
                  retailOrgId: purchaseOrder.retailOrgId,
                  companyId: primaryCompany.id,
                  tankId: line.tank.id,
                  productProfileId: line.profile.id,
                  orderedQuantity: toQuantityString(line.quantity),
                  deliveredQuantity: toQuantityString(line.quantity),
                  acceptedQuantity: toQuantityString(line.quantity),
                  varianceQuantity: toQuantityString(0),
                  unitCost: line.unitCost.toFixed(4),
                  lineCostAmount: toMoneyString(line.quantity * line.unitCost),
                  notes: `HQ GRN ${receiptNo}`
                }))
              }
            }
          });

          mirroredFuelDeliveryNo = delivery.deliveryNo;

          for (const line of fuelLines) {
            await tx.erpFuelTank.update({
              where: {
                id: line.tank.id
              },
              data: {
                currentBookQuantity: toQuantityString(
                  Number((Number(line.tank.currentBookQuantity) + line.quantity).toFixed(3))
                )
              }
            });
          }
        }
      }
    }

    const receivedQuantity = Number(
      receiptLines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)
    );

    return {
      goodsReceiptId,
      goodsReceiptNo: receiptNo,
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      locationCode: purchaseOrder.inventoryLocation.code,
      receivedQuantity,
      mirroredFuelDeliveryNo,
      message: [
        !postStockImmediately
          ? `Flash ERP saved HQ GRN ${receiptNo} into ${purchaseOrder.inventoryLocation.name}; stock update is pending HQ confirmation.`
          : mirroredFuelDeliveryNo
          ? `Flash ERP posted HQ GRN ${receiptNo} into ${purchaseOrder.inventoryLocation.name} and mirrored fuel receipt ${mirroredFuelDeliveryNo}.`
          : `Flash ERP posted HQ GRN ${receiptNo} into ${purchaseOrder.inventoryLocation.name}.`,
        skippedFuelMirrorProducts.length > 0
          ? `Fuel tank mirror skipped for ${skippedFuelMirrorProducts.join(", ")} because no matching active tank exists there.`
          : ""
      ]
        .filter(Boolean)
        .join(" "),
      serverProcessedAt: new Date().toISOString()
    };
  });
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
        stockUpdateStatus: true,
        stockConfirmedAt: true,
        stockConfirmedBy: true,
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

  const goodsReceiptReferences = goodsReceipts.flatMap((receipt) => [
    buildGoodsReceiptInvoiceReference(receipt.receiptNo),
    receipt.receiptNo
  ]);
  const goodsReceiptInvoices =
    goodsReceiptReferences.length > 0
      ? await prisma.erpOperationalDocument.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            documentType: "SUPPLIER_INVOICE",
            externalReference: {
              in: goodsReceiptReferences
            },
            status: {
              not: RecordStatus.DELETED
            }
          },
          include: {
            postingJournalEntry: {
              select: {
                id: true,
                journalNo: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        })
      : [];
  const goodsReceiptInvoiceByReceiptNo = new Map<string, (typeof goodsReceiptInvoices)[number]>();

  for (const invoice of goodsReceiptInvoices) {
    const receiptNo = invoice.externalReference?.startsWith("GRN:")
      ? invoice.externalReference.slice(4)
      : invoice.externalReference ?? "";

    if (receiptNo && !goodsReceiptInvoiceByReceiptNo.has(receiptNo)) {
      goodsReceiptInvoiceByReceiptNo.set(receiptNo, invoice);
    }
  }

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
    const apInvoice = goodsReceiptInvoiceByReceiptNo.get(receipt.receiptNo) ?? null;
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
      stockUpdateStatus: receipt.stockUpdateStatus,
      stockUpdateStatusLabel: formatEnumLabel(receipt.stockUpdateStatus),
      stockConfirmedAt: toIsoString(receipt.stockConfirmedAt),
      stockConfirmedAtLabel: formatRelativeTime(receipt.stockConfirmedAt),
      stockConfirmedBy: receipt.stockConfirmedBy,
      totalQuantity: Number(lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)),
      lineCount: lines.length,
      receivedAt: receipt.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(receipt.receivedAt),
      postedAt: receipt.postedAt.toISOString(),
      postedAtLabel: formatRelativeTime(receipt.postedAt),
      apInvoiceDocumentId: apInvoice?.id ?? null,
      apInvoiceNo: apInvoice?.documentNo ?? null,
      apInvoiceStatus: apInvoice?.status ?? "NOT_INVOICED",
      apInvoiceTotalAmount: apInvoice ? Number(apInvoice.totalAmount) : null,
      apJournalEntryId: apInvoice?.postingJournalEntry?.id ?? null,
      apJournalNo: apInvoice?.postingJournalEntry?.journalNo ?? null,
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

import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getEnterpriseFinanceWorkspace } from "@/server/repositories/enterprise-finance.repository";
import { getPredictivePurchaseOrderSnapshot } from "@/server/repositories/enterprise-predictive-purchasing.repository";
import {
  CustomerType,
  OperatingExpenseStatus,
  PaymentMethod,
  PosTransactionStatus,
  PurchaseOrderStatus,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


type QueryInput = {
  searchParams: URLSearchParams;
};

function clampLimit(value: string | null, fallback = 100, max = 500) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function buildDateRange(searchParams: URLSearchParams) {
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"), true);

  if (!from && !to) {
    return null;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {})
  };
}

function buildStoreFilter(storeCode: string | null) {
  return storeCode?.trim()
    ? {
        store: {
          code: {
            equals: storeCode.trim()
          }
        }
      }
    : {};
}

function buildStoreCodeFilter(storeCode: string | null) {
  const normalized = storeCode?.trim() ?? "";

  return normalized
    ? {
        store: {
          code: {
            equals: normalized
          }
        }
      }
    : {};
}

function parsePaymentMethod(value: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";

  return Object.values(PaymentMethod).includes(normalized as PaymentMethod)
    ? (normalized as PaymentMethod)
    : null;
}

function parsePurchaseOrderStatus(value: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";

  return Object.values(PurchaseOrderStatus).includes(normalized as PurchaseOrderStatus)
    ? (normalized as PurchaseOrderStatus)
    : null;
}

function parseOperatingExpenseStatus(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";

  return Object.values(OperatingExpenseStatus).includes(normalized as OperatingExpenseStatus)
    ? (normalized as OperatingExpenseStatus)
    : null;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRequiredText(value: unknown, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(`Flash ERP needs ${label}.`);
  }

  return normalized;
}

function normalizeMoney(value: unknown, label: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Flash ERP needs a valid non-negative ${label}.`);
  }

  return Number(parsed.toFixed(2));
}

async function getPrimaryRetailOrgId() {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("Flash ERP enterprise node is not configured yet.");
  }

  return enterpriseNode.retailOrgId;
}

export async function getIntegrationInventoryLedger({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const occurredAt = buildDateRange(searchParams);
  const productCode = searchParams.get("productCode")?.trim() ?? "";
  const ledgerRows = await prisma.inventoryLedgerEntry.findMany({
    where: {
      retailOrgId,
      ...(occurredAt ? { occurredAt } : {}),
      ...buildStoreFilter(searchParams.get("shop")),
      ...(productCode
        ? {
            product: {
              code: {
                equals: productCode
              }
            }
          }
        : {})
    },
    orderBy: {
      occurredAt: "desc"
    },
    take: limit,
    select: {
      id: true,
      movementType: true,
      quantity: true,
      unitCost: true,
      referenceType: true,
      referenceId: true,
      externalReference: true,
      sourceNodeCode: true,
      occurredAt: true,
      createdAt: true,
      store: {
        select: {
          code: true,
          name: true
        }
      },
      inventoryLocation: {
        select: {
          code: true,
          name: true
        }
      },
      product: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  return {
    data: ledgerRows.map((row) => ({
      ledgerEntryId: row.id,
      movementType: row.movementType,
      quantity: Number(row.quantity),
      unitCost: row.unitCost === null ? null : Number(row.unitCost),
      productCode: row.product.code,
      productName: row.product.name,
      storeCode: row.store?.code ?? null,
      storeName: row.store?.name ?? null,
      locationCode: row.inventoryLocation.code,
      locationName: row.inventoryLocation.name,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      externalReference: row.externalReference,
      sourceNodeCode: row.sourceNodeCode,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    })),
    count: ledgerRows.length,
    limit
  };
}

function parseCustomerType(value: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";

  return Object.values(CustomerType).includes(normalized as CustomerType)
    ? (normalized as CustomerType)
    : null;
}

export async function getIntegrationPriceListRows({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const productCode = searchParams.get("productCode")?.trim() ?? "";
  const priceListCode = searchParams.get("priceListCode")?.trim() ?? "";
  const loyaltyTier = searchParams.get("loyaltyTier")?.trim() ?? "";
  const customerType = parseCustomerType(searchParams.get("customerType"));
  const priceListWhere: Prisma.PriceListWhereInput = {
    retailOrgId,
    status: RecordStatus.ACTIVE,
    ...(priceListCode
      ? {
          code: {
            equals: priceListCode
          }
        }
      : {}),
    ...(customerType ? { customerType } : {}),
    ...(loyaltyTier
      ? {
          loyaltyTier: {
            equals: loyaltyTier
          }
        }
      : {})
  };
  const rows = await prisma.priceListEntry.findMany({
    where: {
      priceList: priceListWhere,
      ...(productCode
        ? {
            product: {
              code: {
                equals: productCode
              }
            }
          }
        : {})
    },
    orderBy: [
      {
        priceList: {
          code: "asc"
        }
      },
      {
        product: {
          code: "asc"
        }
      }
    ],
    take: limit,
    select: {
      unitPrice: true,
      updatedAt: true,
      priceList: {
        select: {
          code: true,
          name: true,
          currencyCode: true,
          isDefault: true,
          customerType: true,
          loyaltyTier: true
        }
      },
      product: {
        select: {
          code: true,
          name: true,
          sku: true
        }
      }
    }
  });

  return {
    data: rows.map((row) => ({
      priceListCode: row.priceList.code,
      priceListName: row.priceList.name,
      currencyCode: row.priceList.currencyCode,
      isDefault: row.priceList.isDefault,
      customerType: row.priceList.customerType,
      loyaltyTier: row.priceList.loyaltyTier,
      productCode: row.product.code,
      productName: row.product.name,
      sku: row.product.sku,
      unitPrice: Number(row.unitPrice),
      updatedAt: row.updatedAt.toISOString()
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationDemandForecast({ searchParams }: QueryInput) {
  const snapshot = await getPredictivePurchaseOrderSnapshot({
    storeCode: searchParams.get("shop"),
    limit: clampLimit(searchParams.get("limit"), 100, 300)
  });

  return {
    currencyCode: snapshot.currencyCode,
    data: snapshot.rows,
    summary: snapshot.summary,
    refreshedAt: snapshot.refreshedAt
  };
}

export async function getIntegrationGlJournal({ searchParams }: QueryInput) {
  const workspace = await getEnterpriseFinanceWorkspace({
    dateFrom: searchParams.get("from"),
    dateTo: searchParams.get("to"),
    storeCode: searchParams.get("shop")
  });

  return {
    currencyCode: workspace.currencyCode,
    filters: workspace.filters,
    journals: workspace.journalRows,
    lines: workspace.journalLineRows,
    trialBalance: workspace.trialBalanceRows,
    postingCoverage: workspace.postingCoverageRows,
    metrics: workspace.metrics,
    refreshedAt: workspace.refreshedAt
  };
}

export async function getIntegrationCustomers({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const query = searchParams.get("q")?.trim() ?? "";
  const customerType = parseCustomerType(searchParams.get("customerType"));
  const rows = await prisma.customer.findMany({
    where: {
      retailOrgId,
      deletedAt: null,
      ...(customerType ? { customerType } : {}),
      ...(query
        ? {
            OR: [
              { customerNo: { contains: query } },
              { fullName: { contains: query } },
              { phone: { contains: query } },
              { email: { contains: query } }
            ]
          }
        : {})
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit,
    select: {
      id: true,
      customerNo: true,
      customerType: true,
      fullName: true,
      phone: true,
      email: true,
      city: true,
      countryCode: true,
      loyaltyEnrolled: true,
      loyaltyTier: true,
      loyaltyPointsBalance: true,
      allowCreditSales: true,
      creditLimitAmount: true,
      receivableBalanceAmount: true,
      status: true,
      updatedAt: true,
      store: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  return {
    data: rows.map((row) => ({
      customerId: row.id,
      customerNo: row.customerNo,
      customerType: row.customerType,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      city: row.city,
      countryCode: row.countryCode,
      storeCode: row.store?.code ?? null,
      storeName: row.store?.name ?? null,
      loyaltyEnrolled: row.loyaltyEnrolled,
      loyaltyTier: row.loyaltyTier,
      loyaltyPointsBalance: row.loyaltyPointsBalance,
      allowCreditSales: row.allowCreditSales,
      creditLimitAmount:
        row.creditLimitAmount === null ? null : Number(row.creditLimitAmount),
      receivableBalanceAmount: Number(row.receivableBalanceAmount),
      status: row.status,
      updatedAt: row.updatedAt.toISOString()
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationSuppliers({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const query = searchParams.get("q")?.trim() ?? "";
  const rows = await prisma.supplier.findMany({
    where: {
      retailOrgId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { supplierNo: { contains: query } },
              { name: { contains: query } },
              { contactName: { contains: query } },
              { phone: { contains: query } },
              { email: { contains: query } }
            ]
          }
        : {})
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit,
    select: {
      id: true,
      supplierNo: true,
      name: true,
      contactName: true,
      phone: true,
      email: true,
      city: true,
      countryCode: true,
      leadTimeDays: true,
      status: true,
      updatedAt: true,
      productSuppliers: {
        where: {
          isPrimary: true
        },
        select: {
          minimumOrderQuantity: true,
          packCostPrice: true,
          product: {
            select: {
              code: true,
              name: true
            }
          }
        },
        take: 10
      }
    }
  });

  return {
    data: rows.map((row) => ({
      supplierId: row.id,
      supplierNo: row.supplierNo,
      supplierName: row.name,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      city: row.city,
      countryCode: row.countryCode,
      leadTimeDays: row.leadTimeDays,
      status: row.status,
      primaryProducts: row.productSuppliers.map((link) => ({
        productCode: link.product.code,
        productName: link.product.name,
        minimumOrderQuantity:
          link.minimumOrderQuantity === null ? null : Number(link.minimumOrderQuantity),
        packCostPrice: link.packCostPrice === null ? null : Number(link.packCostPrice)
      })),
      updatedAt: row.updatedAt.toISOString()
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationTenderMethods({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const paymentMethod = parsePaymentMethod(searchParams.get("paymentMethod"));
  const gatewayOnly = searchParams.get("gatewayOnly") === "true";
  const rows = await prisma.tenderMethod.findMany({
    where: {
      retailOrgId,
      deletedAt: null,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(gatewayOnly
        ? {
            gatewayProvider: {
              not: null
            }
          }
        : {})
    },
    orderBy: [
      {
        sortOrder: "asc"
      },
      {
        name: "asc"
      }
    ],
    take: limit,
    select: {
      id: true,
      code: true,
      name: true,
      paymentMethod: true,
      gatewayProvider: true,
      gatewayMode: true,
      gatewayMerchantId: true,
      gatewayPublicKey: true,
      gatewayCallbackUrl: true,
      gatewayActive: true,
      gatewayStatus: true,
      requiresReference: true,
      allowChange: true,
      allowRefund: true,
      allowOpenCashDrawer: true,
      status: true,
      updatedAt: true
    }
  });

  return {
    data: rows.map((row) => ({
      tenderMethodId: row.id,
      tenderMethodCode: row.code,
      tenderMethodName: row.name,
      paymentMethod: row.paymentMethod,
      gatewayProvider: row.gatewayProvider,
      gatewayMode: row.gatewayMode,
      gatewayMerchantId: row.gatewayMerchantId,
      gatewayPublicKey: row.gatewayPublicKey,
      gatewayCallbackUrl: row.gatewayCallbackUrl,
      gatewayActive: row.gatewayActive,
      gatewayStatus: row.gatewayStatus,
      requiresReference: row.requiresReference,
      allowChange: row.allowChange,
      allowRefund: row.allowRefund,
      allowOpenCashDrawer: row.allowOpenCashDrawer,
      status: row.status,
      updatedAt: row.updatedAt.toISOString()
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationSalesTransactions({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const completedAt = buildDateRange(searchParams);
  const rows = await prisma.posTransaction.findMany({
    where: {
      retailOrgId,
      deletedAt: null,
      status: PosTransactionStatus.COMPLETED,
      ...(completedAt ? { completedAt } : {}),
      ...buildStoreCodeFilter(searchParams.get("shop"))
    },
    orderBy: {
      completedAt: "desc"
    },
    take: limit,
    select: {
      id: true,
      transactionNo: true,
      sourceTransactionNo: true,
      transactionType: true,
      completedAt: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      customerNameSnapshot: true,
      cashierCodeSnapshot: true,
      store: {
        select: {
          code: true,
          name: true
        }
      },
      terminal: {
        select: {
          code: true,
          name: true
        }
      },
      customer: {
        select: {
          customerNo: true,
          fullName: true
        }
      },
      lines: {
        select: {
          productCodeSnapshot: true,
          productNameSnapshot: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          taxAmount: true,
          lineTotal: true
        }
      },
      payments: {
        select: {
          method: true,
          tenderMethodCodeSnapshot: true,
          tenderMethodNameSnapshot: true,
          amount: true,
          reference: true,
          receivedAt: true
        }
      }
    }
  });

  return {
    data: rows.map((row) => ({
      transactionId: row.id,
      transactionNo: row.transactionNo,
      sourceTransactionNo: row.sourceTransactionNo,
      transactionType: row.transactionType,
      completedAt: row.completedAt?.toISOString() ?? null,
      storeCode: row.store.code,
      storeName: row.store.name,
      terminalCode: row.terminal.code,
      terminalName: row.terminal.name,
      customerNo: row.customer?.customerNo ?? null,
      customerName: row.customer?.fullName ?? row.customerNameSnapshot,
      cashierCode: row.cashierCodeSnapshot,
      subtotalAmount: Number(row.subtotalAmount),
      discountAmount: Number(row.discountAmount),
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      changeAmount: Number(row.changeAmount),
      lines: row.lines.map((line) => ({
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        taxAmount: Number(line.taxAmount),
        lineTotal: Number(line.lineTotal)
      })),
      payments: row.payments.map((payment) => ({
        paymentMethod: payment.method,
        tenderMethodCode: payment.tenderMethodCodeSnapshot,
        tenderMethodName: payment.tenderMethodNameSnapshot,
        amount: Number(payment.amount),
        reference: payment.reference,
        receivedAt: payment.receivedAt.toISOString()
      }))
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationPurchaseOrders({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const status = parsePurchaseOrderStatus(searchParams.get("status"));
  const createdAt = buildDateRange(searchParams);
  const supplierNo = searchParams.get("supplierNo")?.trim() ?? "";
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      retailOrgId,
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...buildStoreCodeFilter(searchParams.get("shop")),
      ...(supplierNo
        ? {
            supplier: {
              supplierNo: {
                equals: supplierNo
              }
            }
          }
        : {})
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: limit,
    select: {
      id: true,
      purchaseOrderNo: true,
      externalReference: true,
      status: true,
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
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      store: {
        select: {
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
  });

  return {
    data: rows.map((row) => ({
      purchaseOrderId: row.id,
      purchaseOrderNo: row.purchaseOrderNo,
      externalReference: row.externalReference,
      status: row.status,
      storeCode: row.store?.code ?? null,
      storeName: row.store?.name ?? null,
      supplierNo: row.supplier?.supplierNo ?? null,
      supplierName: row.supplier?.name ?? null,
      locationCode: row.inventoryLocation.code,
      locationName: row.inventoryLocation.name,
      subtotalAmount: Number(row.subtotalAmount),
      discountAmount: Number(row.discountAmount),
      shippingAmount: Number(row.shippingAmount),
      freightAmount: Number(row.freightAmount),
      otherChargesAmount: Number(row.otherChargesAmount),
      taxAmount: Number(row.taxAmount),
      grandTotalAmount: Number(row.grandTotalAmount),
      note: row.note,
      operatorName: row.operatorName,
      committedAt: row.committedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lines: row.lines.map((line) => ({
        lineNo: line.lineNo,
        productCode: line.product.code,
        productName: line.product.name,
        orderedQuantity: Number(line.orderedQuantity),
        receivedQuantity: Number(line.receivedQuantity),
        exceptionQuantity: Number(line.exceptionQuantity),
        unitCost: line.unitCost === null ? null : Number(line.unitCost)
      }))
    })),
    count: rows.length,
    limit
  };
}

export async function getIntegrationOperatingExpenses({ searchParams }: QueryInput) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const limit = clampLimit(searchParams.get("limit"));
  const expenseDate = buildDateRange(searchParams);
  const status = parseOperatingExpenseStatus(searchParams.get("status"));
  const rows = await prisma.operatingExpense.findMany({
    where: {
      retailOrgId,
      ...(expenseDate ? { expenseDate } : {}),
      ...(status ? { status } : {}),
      ...buildStoreCodeFilter(searchParams.get("shop"))
    },
    orderBy: {
      expenseDate: "desc"
    },
    take: limit,
    select: {
      id: true,
      expenseNo: true,
      expenseDate: true,
      category: true,
      description: true,
      supplierName: true,
      paymentMethod: true,
      externalReference: true,
      amount: true,
      taxAmount: true,
      status: true,
      approvedBy: true,
      approvedAt: true,
      postedAt: true,
      note: true,
      store: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  return {
    data: rows.map((row) => ({
      expenseId: row.id,
      expenseNo: row.expenseNo,
      expenseDate: row.expenseDate.toISOString(),
      storeCode: row.store?.code ?? null,
      storeName: row.store?.name ?? null,
      category: row.category,
      description: row.description,
      supplierName: row.supplierName,
      paymentMethod: row.paymentMethod,
      externalReference: row.externalReference,
      amount: Number(row.amount),
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.amount) + Number(row.taxAmount),
      status: row.status,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      postedAt: row.postedAt?.toISOString() ?? null,
      note: row.note
    })),
    count: rows.length,
    limit
  };
}

export async function createIntegrationOperatingExpense(payload: unknown) {
  const retailOrgId = await getPrimaryRetailOrgId();
  const input = (payload ?? {}) as Record<string, unknown>;
  const storeCode = normalizeOptionalText(input.storeCode);
  const paymentMethod = parsePaymentMethod(normalizeOptionalText(input.paymentMethod));
  const status = parseOperatingExpenseStatus(input.status) ?? OperatingExpenseStatus.APPROVED;
  const expenseDateInput = normalizeOptionalText(input.expenseDate);
  const expenseDate = expenseDateInput ? new Date(expenseDateInput) : new Date();

  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error("Flash ERP needs a valid expense date.");
  }

  const store = storeCode
    ? await prisma.store.findFirst({
        where: {
          retailOrgId,
          code: {
            equals: storeCode
          }
        },
        select: {
          id: true,
          code: true,
          name: true
        }
      })
    : null;

  if (storeCode && !store) {
    throw new Error("Flash ERP could not find that shop for the operating expense.");
  }

  const approvedAt =
    status === OperatingExpenseStatus.DRAFT || status === OperatingExpenseStatus.VOIDED
      ? null
      : new Date();
  const created = await prisma.operatingExpense.create({
    data: {
      retailOrgId,
      storeId: store?.id ?? null,
      expenseNo: normalizeOptionalText(input.expenseNo) ?? `EXP-${Date.now()}`,
      expenseDate,
      category: normalizeRequiredText(input.category, "an expense category"),
      description: normalizeRequiredText(input.description, "an expense description"),
      supplierName: normalizeOptionalText(input.supplierName),
      paymentMethod,
      externalReference: normalizeOptionalText(input.externalReference),
      amount: normalizeMoney(input.amount, "expense amount"),
      taxAmount: normalizeMoney(input.taxAmount ?? 0, "tax amount"),
      status,
      approvedBy: normalizeOptionalText(input.approvedBy),
      approvedAt,
      postedAt: status === OperatingExpenseStatus.POSTED ? new Date() : null,
      note: normalizeOptionalText(input.note)
    },
    select: {
      id: true,
      expenseNo: true,
      expenseDate: true,
      category: true,
      description: true,
      supplierName: true,
      paymentMethod: true,
      externalReference: true,
      amount: true,
      taxAmount: true,
      status: true,
      approvedBy: true,
      approvedAt: true,
      postedAt: true,
      note: true
    }
  });

  return {
    expenseId: created.id,
    expenseNo: created.expenseNo,
    expenseDate: created.expenseDate.toISOString(),
    storeCode: store?.code ?? null,
    storeName: store?.name ?? null,
    category: created.category,
    description: created.description,
    supplierName: created.supplierName,
    paymentMethod: created.paymentMethod,
    externalReference: created.externalReference,
    amount: Number(created.amount),
    taxAmount: Number(created.taxAmount),
    totalAmount: Number(created.amount) + Number(created.taxAmount),
    status: created.status,
    approvedBy: created.approvedBy,
    approvedAt: created.approvedAt?.toISOString() ?? null,
    postedAt: created.postedAt?.toISOString() ?? null,
    note: created.note
  };
}

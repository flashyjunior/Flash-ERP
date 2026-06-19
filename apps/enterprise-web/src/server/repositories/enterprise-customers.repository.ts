import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ensureReferenceCaptureTable } from "@/server/repositories/sale-sms.repository";
import {
  CustomerAccountEntryType,
  CustomerType,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


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

function normalizeRequiredText(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function toMoneyString(value: number) {
  return value.toFixed(2);
}

function normalizeCustomerType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? CustomerType.INDIVIDUAL;

  if (Object.values(CustomerType).includes(normalized as CustomerType)) {
    return normalized as CustomerType;
  }

  throw new Error("Flash ERP does not recognize that customer type.");
}

function normalizeRecordStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? RecordStatus.ACTIVE;

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error("Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED status values here.");
}

function normalizeOptionalWholeNumber(value: number | null | undefined, fieldLabel: string) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Math.trunc(Number(value));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeMoney(value: number | null | undefined, fieldLabel: string) {
  const normalized = Number(Number(value ?? 0).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeOptionalMoney(value: number | null | undefined, fieldLabel: string) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalized = Number(Number(value).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be zero or greater.`);
  }

  return normalized;
}

function normalizeSignedMoney(value: number | null | undefined, fieldLabel: string) {
  const normalized = Number(Number(value ?? 0).toFixed(2));

  if (!Number.isFinite(normalized)) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be a valid amount.`);
  }

  return normalized;
}

function normalizeSignedWholeNumber(value: number | null | undefined, fieldLabel: string) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    throw new Error(`Flash ERP needs ${fieldLabel}.`);
  }

  const normalized = Math.trunc(Number(value));

  if (!Number.isFinite(normalized)) {
    throw new Error(`Flash ERP needs ${fieldLabel} to be a valid whole number.`);
  }

  return normalized;
}

function toCustomerMutationError(error: unknown, fallbackMessage: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That customer number already exists in Flash ERP enterprise.");
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
};

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true
    }
  });
}

async function getWritableEnterpriseNode(tx: Prisma.TransactionClient) {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      code: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for customer changes.");
  }

  return enterpriseNode;
}

export type EnterpriseCustomerWorkspaceData = {
  metrics: {
    activeCustomers: number;
    loyaltyCustomers: number;
    creditEnabledCustomers: number;
    receivableExposureAmount: number;
    customersWithHomeStore: number;
    capturedProspects: number;
  };
  availableStores: Array<{
    storeCode: string;
    name: string;
    status: string;
  }>;
  customerRows: Array<{
    customerNo: string;
    fullName: string;
    customerType: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    countryCode: string | null;
    homeStoreCode: string | null;
    homeStoreName: string | null;
    loyaltyEnrolled: boolean;
    loyaltyTier: string | null;
    loyaltyPointsBalance: number;
    allowCreditSales: boolean;
    creditLimitAmount: number | null;
    receivableBalanceAmount: number;
    status: string;
    transactionCount: number;
    lastTransactionNo: string | null;
    lastTransactionAt: string | null;
    lastTransactionAtLabel: string;
    updatedAt: string;
    updatedAtLabel: string;
    note: string | null;
  }>;
  referenceCaptureRows: Array<{
    captureId: string;
    referenceValue: string;
    phoneNumber: string | null;
    customerName: string | null;
    notes: string | null;
    source: string;
    sourceTransactionNo: string | null;
    firstCapturedAt: string;
    lastCapturedAt: string;
    lastCapturedAtLabel: string;
  }>;
  recentActivityRows: Array<{
    entryId: string;
    customerNo: string;
    fullName: string;
    entryType: string;
    transactionNo: string | null;
    sourceTransactionNo: string | null;
    storeCode: string | null;
    storeName: string | null;
    receivableDeltaAmount: number;
    loyaltyPointsDelta: number;
    resultingReceivableBalance: number;
    resultingLoyaltyPointsBalance: number;
    note: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  creditStatementRows: Array<{
    entryId: string;
    customerNo: string;
    fullName: string;
    activityLabel: string;
    transactionNo: string | null;
    sourceTransactionNo: string | null;
    storeCode: string | null;
    storeName: string | null;
    debitAmount: number;
    creditAmount: number;
    resultingReceivableBalance: number;
    note: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export type CreateEnterpriseCustomerRequest = {
  customerNo: string;
  fullName: string;
  customerType?: string;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  countryCode?: string | null;
  homeStoreCode?: string | null;
  loyaltyEnrolled?: boolean;
  loyaltyTier?: string | null;
  loyaltyPointsBalance?: number | null;
  allowCreditSales?: boolean;
  creditLimitAmount?: number | null;
  receivableBalanceAmount?: number | null;
  note?: string | null;
  status?: string;
  sourceReferenceCaptureId?: string | null;
};

export type EnterpriseCustomerMutationResponse = {
  customerNo: string;
  message: string;
};

export type RecordEnterpriseCustomerAccountEntryRequest = {
  entryMode: "ACCOUNT_PAYMENT" | "RECEIVABLE_ADJUSTMENT" | "LOYALTY_ADJUSTMENT";
  amount?: number | null;
  loyaltyPoints?: number | null;
  storeCode?: string | null;
  reference?: string | null;
  note?: string | null;
};

export type EnterpriseCustomerAccountEntryMutationResponse = {
  customerNo: string;
  message: string;
};

export function buildUnavailableEnterpriseCustomerWorkspace(
  reason: string
): EnterpriseCustomerWorkspaceData {
  return {
    metrics: {
      activeCustomers: 0,
      loyaltyCustomers: 0,
      creditEnabledCustomers: 0,
      receivableExposureAmount: 0,
      customersWithHomeStore: 0,
      capturedProspects: 0
    },
    availableStores: [],
    customerRows: [],
    referenceCaptureRows: [],
    recentActivityRows: [],
    creditStatementRows: [],
    postureMessages: [
      "Enterprise customer accounts will appear here once Flash ERP can read the control-plane database.",
      "This workspace is intended to own receivable posture, loyalty enrollment, and customer identity before stores trade locally."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Create customer accounts before rolling out receivables, loyalty, or enterprise-driven customer sync.",
      "Refresh this page once the enterprise node is available."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseCustomerWorkspace(): Promise<EnterpriseCustomerWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseCustomerWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read customer accounts."
    );
  }

  await ensureReferenceCaptureTable(prisma);

  const [stores, customers, recentActivity, referenceCaptures] = await Promise.all([
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ name: "asc" }],
      select: {
        code: true,
        name: true,
        status: true
      }
    }),
    prisma.customer.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ fullName: "asc" }, { customerNo: "asc" }],
      select: {
        customerNo: true,
        fullName: true,
        customerType: true,
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
        note: true,
        store: {
          select: {
            code: true,
            name: true
          }
        },
        posTransactions: {
          where: {
            completedAt: {
              not: null
            },
            deletedAt: null
          },
          orderBy: [{ completedAt: "desc" }],
          take: 1,
          select: {
            transactionNo: true,
            completedAt: true
          }
        },
        _count: {
          select: {
            posTransactions: true
          }
        }
      }
    }),
    prisma.customerAccountEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 120,
      select: {
        id: true,
        entryType: true,
        transactionNoSnapshot: true,
        sourceTransactionNoSnapshot: true,
        receivableDeltaAmount: true,
        loyaltyPointsDelta: true,
        resultingReceivableBalance: true,
        resultingLoyaltyPointsBalance: true,
        note: true,
        occurredAt: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        },
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.transactionReferenceCapture.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        source: {
          not: "CUSTOMER_CONVERSION"
        }
      },
      orderBy: [{ lastCapturedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        referenceValue: true,
        phoneNumber: true,
        customerName: true,
        notes: true,
        source: true,
        sourceTransactionNo: true,
        firstCapturedAt: true,
        lastCapturedAt: true
      }
    })
  ]);

  const customerRows = customers.map((customer) => {
    const lastTransaction = customer.posTransactions[0] ?? null;
    const receivableBalanceAmount = Number(customer.receivableBalanceAmount);

    return {
      customerNo: customer.customerNo,
      fullName: customer.fullName,
      customerType: customer.customerType,
      phone: customer.phone,
      email: customer.email,
      city: customer.city,
      countryCode: customer.countryCode,
      homeStoreCode: customer.store?.code ?? null,
      homeStoreName: customer.store?.name ?? null,
      loyaltyEnrolled: customer.loyaltyEnrolled,
      loyaltyTier: customer.loyaltyTier,
      loyaltyPointsBalance: customer.loyaltyPointsBalance,
      allowCreditSales: customer.allowCreditSales,
      creditLimitAmount:
        customer.creditLimitAmount === null ? null : Number(customer.creditLimitAmount),
      receivableBalanceAmount,
      status: customer.status,
      transactionCount: customer._count.posTransactions,
      lastTransactionNo: lastTransaction?.transactionNo ?? null,
      lastTransactionAt: lastTransaction?.completedAt?.toISOString() ?? null,
      lastTransactionAtLabel: formatRelativeTime(lastTransaction?.completedAt ?? null),
      updatedAt: customer.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(customer.updatedAt),
      note: customer.note
    };
  });

  const activeCustomers = customerRows.filter((customer) => customer.status === RecordStatus.ACTIVE);
  const loyaltyCustomers = customerRows.filter((customer) => customer.loyaltyEnrolled).length;
  const creditEnabledCustomers = customerRows.filter((customer) => customer.allowCreditSales).length;
  const receivableExposureAmount = Number(
    customerRows.reduce((sum, customer) => sum + customer.receivableBalanceAmount, 0).toFixed(2)
  );
  const customersWithHomeStore = customerRows.filter((customer) => customer.homeStoreCode).length;
  const referenceCaptureRows = referenceCaptures.map((capture) => ({
    captureId: capture.id,
    referenceValue: capture.referenceValue,
    phoneNumber: capture.phoneNumber,
    customerName: capture.customerName,
    notes: capture.notes,
    source: capture.source,
    sourceTransactionNo: capture.sourceTransactionNo,
    firstCapturedAt: capture.firstCapturedAt.toISOString(),
    lastCapturedAt: capture.lastCapturedAt.toISOString(),
    lastCapturedAtLabel: formatRelativeTime(capture.lastCapturedAt)
  }));

  const postureMessages = [
    activeCustomers.length > 0
      ? `${activeCustomers.length} customer account${activeCustomers.length === 1 ? "" : "s"} are active for enterprise-led identity, loyalty, and receivable controls.`
      : "No active customer accounts are configured yet, so Flash ERP is still operating without enterprise customer governance.",
    loyaltyCustomers > 0
      ? `${loyaltyCustomers} customer${loyaltyCustomers === 1 ? "" : "s"} are already enrolled in loyalty and can sync that posture down to stores.`
      : "No customers are currently loyalty-enabled.",
    receivableExposureAmount > 0
      ? `Customer receivable exposure currently stands at ${receivableExposureAmount.toFixed(2)} across the enterprise account base.`
      : "There is no customer receivable exposure recorded right now."
  ];

  const priorities = [
    creditEnabledCustomers > 0
      ? `${creditEnabledCustomers} customer${creditEnabledCustomers === 1 ? "" : "s"} are credit-enabled and should stay governed against clear limits and follow-up.`
      : "No customers are currently marked as credit-enabled.",
    customersWithHomeStore > 0
      ? `${customersWithHomeStore} customer${customersWithHomeStore === 1 ? "" : "s"} are already linked to a home store for local familiarity and targeting.`
      : "No customers are linked to a home store yet.",
    activeCustomers.some((customer) => customer.loyaltyEnrolled && !customer.loyaltyTier)
      ? "Fill loyalty tiers for enrolled customers so Flash ERP can distinguish membership posture beyond raw point balance."
      : "Loyalty-enrolled customers already carry a tier or there are none enrolled yet."
  ];
  const recentActivityRows = recentActivity.map((entry) => ({
    entryId: entry.id,
    customerNo: entry.customer.customerNo,
    fullName: entry.customer.fullName,
    entryType: entry.entryType,
    transactionNo: entry.transactionNoSnapshot,
    sourceTransactionNo: entry.sourceTransactionNoSnapshot,
    storeCode: entry.store?.code ?? null,
    storeName: entry.store?.name ?? null,
    receivableDeltaAmount: Number(entry.receivableDeltaAmount),
    loyaltyPointsDelta: entry.loyaltyPointsDelta,
    resultingReceivableBalance: Number(entry.resultingReceivableBalance),
    resultingLoyaltyPointsBalance: entry.resultingLoyaltyPointsBalance,
    note: entry.note,
    occurredAt: entry.occurredAt.toISOString(),
    occurredAtLabel: formatRelativeTime(entry.occurredAt)
  }));
  const creditStatementRows = recentActivity
    .filter((entry) => Number(entry.receivableDeltaAmount) !== 0)
    .map((entry) => {
      const receivableDeltaAmount = Number(entry.receivableDeltaAmount);
      const isPayment =
        entry.entryType === CustomerAccountEntryType.ACCOUNT_PAYMENT ||
        entry.entryType === CustomerAccountEntryType.POS_RECEIVABLE_SETTLEMENT;
      const isAdjustment = entry.entryType === CustomerAccountEntryType.MANUAL_RECEIVABLE_ADJUSTMENT;
      const activityLabel = isPayment
        ? "Credit payment"
        : isAdjustment
          ? "Account adjustment"
          : "Credit sale invoice";

      return {
        entryId: entry.id,
        customerNo: entry.customer.customerNo,
        fullName: entry.customer.fullName,
        activityLabel,
        transactionNo: entry.transactionNoSnapshot,
        sourceTransactionNo: entry.sourceTransactionNoSnapshot,
        storeCode: entry.store?.code ?? null,
        storeName: entry.store?.name ?? null,
        debitAmount: receivableDeltaAmount > 0 ? receivableDeltaAmount : 0,
        creditAmount: receivableDeltaAmount < 0 ? Math.abs(receivableDeltaAmount) : 0,
        resultingReceivableBalance: Number(entry.resultingReceivableBalance),
        note: entry.note,
        occurredAt: entry.occurredAt.toISOString(),
        occurredAtLabel: formatRelativeTime(entry.occurredAt)
      };
    });
  const storesWithCreditActivity = new Set(
    creditStatementRows.map((row) => row.storeCode).filter((value): value is string => Boolean(value))
  ).size;

  if (storesWithCreditActivity > 0) {
    postureMessages.push(
      `${storesWithCreditActivity} branch${storesWithCreditActivity === 1 ? "" : "es"} have already posted customer credit invoice or payment activity into the same enterprise account ledger.`
    );
  }

  return {
    metrics: {
      activeCustomers: activeCustomers.length,
      loyaltyCustomers,
      creditEnabledCustomers,
      receivableExposureAmount,
      customersWithHomeStore,
      capturedProspects: referenceCaptureRows.length
    },
    availableStores: stores.map((store) => ({
      storeCode: store.code,
      name: store.name,
      status: store.status
    })),
    customerRows,
    referenceCaptureRows,
    recentActivityRows,
    creditStatementRows,
    postureMessages,
    priorities,
    statusMessage: `Customer accounts are live for ${enterpriseNode.name}, so Flash ERP can manage identity, credit limits, cross-branch receivable consolidation, and loyalty posture from one enterprise lane.`,
    refreshedAt: new Date().toISOString()
  };
}

export async function createEnterpriseCustomer(
  input: CreateEnterpriseCustomerRequest
): Promise<EnterpriseCustomerMutationResponse> {
  try {
    const customerNo = normalizeCode(input.customerNo, "customer number");
    const fullName = normalizeRequiredText(input.fullName, "customer name");
    const customerType = normalizeCustomerType(input.customerType);
    const phone = normalizeOptionalText(input.phone);
    const email = normalizeOptionalText(input.email);
    const addressLine1 = normalizeOptionalText(input.addressLine1);
    const city = normalizeOptionalText(input.city);
    const countryCode = normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
    const loyaltyEnrolled = input.loyaltyEnrolled ?? false;
    const loyaltyTier = normalizeOptionalText(input.loyaltyTier);
    const loyaltyPointsBalance =
      normalizeOptionalWholeNumber(input.loyaltyPointsBalance, "loyalty points") ?? 0;
    const allowCreditSales = input.allowCreditSales ?? false;
    const creditLimitAmount = normalizeOptionalMoney(input.creditLimitAmount, "credit limit");
    const receivableBalanceAmount = normalizeMoney(
      input.receivableBalanceAmount ?? 0,
      "receivable balance"
    );
    const note = normalizeOptionalText(input.note);
    const status = normalizeRecordStatus(input.status);
    const homeStoreCode = normalizeOptionalText(input.homeStoreCode);

    const customer = await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const homeStore = homeStoreCode
        ? await tx.store.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: homeStoreCode
            },
            select: {
              id: true
            }
          })
        : null;

      if (homeStoreCode && !homeStore) {
        throw new Error(`Flash ERP could not find home store "${homeStoreCode}".`);
      }

      const createdCustomer = await tx.customer.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          storeId: homeStore?.id ?? null,
          customerNo,
          fullName,
          customerType,
          phone,
          email,
          addressLine1,
          city,
          countryCode,
          loyaltyEnrolled,
          loyaltyTier,
          loyaltyPointsBalance,
          allowCreditSales,
          creditLimitAmount,
          receivableBalanceAmount,
          note,
          status,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        select: {
          id: true,
          customerNo: true
        }
      });

      const openingEntries: Prisma.CustomerAccountEntryCreateManyInput[] = [];
      const occurredAt = new Date();

      if (receivableBalanceAmount > 0) {
        openingEntries.push({
          id: randomUUID(),
          retailOrgId: enterpriseNode.retailOrgId,
          customerId: createdCustomer.id,
          storeId: homeStore?.id ?? null,
          terminalId: null,
          posTransactionId: null,
          entryType: CustomerAccountEntryType.MANUAL_RECEIVABLE_ADJUSTMENT,
          transactionNoSnapshot: "OPENING-BAL",
          sourceTransactionNoSnapshot: null,
          receivableDeltaAmount: toMoneyString(receivableBalanceAmount),
          loyaltyPointsDelta: 0,
          resultingReceivableBalance: toMoneyString(receivableBalanceAmount),
          resultingLoyaltyPointsBalance: loyaltyPointsBalance,
          note: "Opening receivable balance recorded at customer creation.",
          originNodeCode: enterpriseNode.code,
          occurredAt
        });
      }

      if (loyaltyPointsBalance > 0) {
        openingEntries.push({
          id: randomUUID(),
          retailOrgId: enterpriseNode.retailOrgId,
          customerId: createdCustomer.id,
          storeId: homeStore?.id ?? null,
          terminalId: null,
          posTransactionId: null,
          entryType: CustomerAccountEntryType.MANUAL_LOYALTY_ADJUSTMENT,
          transactionNoSnapshot: "OPENING-BAL",
          sourceTransactionNoSnapshot: null,
          receivableDeltaAmount: toMoneyString(0),
          loyaltyPointsDelta: loyaltyPointsBalance,
          resultingReceivableBalance: toMoneyString(receivableBalanceAmount),
          resultingLoyaltyPointsBalance: loyaltyPointsBalance,
          note: "Opening loyalty balance recorded at customer creation.",
          originNodeCode: enterpriseNode.code,
          occurredAt
        });
      }

      if (openingEntries.length > 0) {
        await tx.customerAccountEntry.createMany({
          data: openingEntries
        });
      }

      const sourceReferenceCaptureId = normalizeOptionalText(input.sourceReferenceCaptureId);

      if (sourceReferenceCaptureId) {
        await tx.transactionReferenceCapture.updateMany({
          where: {
            id: sourceReferenceCaptureId,
            retailOrgId: enterpriseNode.retailOrgId,
            source: {
              not: "CUSTOMER_CONVERSION"
            }
          },
          data: {
            source: "CUSTOMER_CONVERSION",
            customerName: fullName,
            phoneNumber: phone
          }
        });
      }

      return createdCustomer;
    });

    return {
      customerNo: customer.customerNo,
      message: `Customer ${customer.customerNo} is now available for enterprise and store workflows in Flash ERP.`
    };
  } catch (error) {
    throw toCustomerMutationError(error, "Flash ERP could not create that customer.");
  }
}

export async function updateEnterpriseCustomer(
  customerNo: string,
  input: CreateEnterpriseCustomerRequest
): Promise<EnterpriseCustomerMutationResponse> {
  try {
    const normalizedCustomerNo = normalizeCode(customerNo, "customer number");
    const fullName = normalizeRequiredText(input.fullName, "customer name");
    const customerType = normalizeCustomerType(input.customerType);
    const phone = normalizeOptionalText(input.phone);
    const email = normalizeOptionalText(input.email);
    const addressLine1 = normalizeOptionalText(input.addressLine1);
    const city = normalizeOptionalText(input.city);
    const countryCode = normalizeOptionalText(input.countryCode)?.toUpperCase() ?? null;
    const loyaltyEnrolled = input.loyaltyEnrolled ?? false;
    const loyaltyTier = normalizeOptionalText(input.loyaltyTier);
    const loyaltyPointsBalance =
      normalizeOptionalWholeNumber(input.loyaltyPointsBalance, "loyalty points") ?? 0;
    const allowCreditSales = input.allowCreditSales ?? false;
    const creditLimitAmount = normalizeOptionalMoney(input.creditLimitAmount, "credit limit");
    const receivableBalanceAmount = normalizeMoney(
      input.receivableBalanceAmount ?? 0,
      "receivable balance"
    );
    const note = normalizeOptionalText(input.note);
    const status = normalizeRecordStatus(input.status);
    const homeStoreCode = normalizeOptionalText(input.homeStoreCode);

    const customer = await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const existingCustomer = await tx.customer.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          customerNo: normalizedCustomerNo,
          deletedAt: null
        },
        select: {
          id: true,
          customerNo: true,
          receivableBalanceAmount: true,
          loyaltyPointsBalance: true
        }
      });

      if (!existingCustomer) {
        throw new Error(`Customer ${normalizedCustomerNo} does not exist in Flash ERP enterprise.`);
      }

      if (
        Number(existingCustomer.receivableBalanceAmount) !== receivableBalanceAmount ||
        existingCustomer.loyaltyPointsBalance !== loyaltyPointsBalance
      ) {
        throw new Error(
          "Use the customer account activity workflow to adjust receivable or loyalty balances so Flash ERP maintains a full enterprise statement."
        );
      }

      const homeStore = homeStoreCode
        ? await tx.store.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: homeStoreCode
            },
            select: {
              id: true
            }
          })
        : null;

      if (homeStoreCode && !homeStore) {
        throw new Error(`Flash ERP could not find home store "${homeStoreCode}".`);
      }

      return tx.customer.update({
        where: {
          id: existingCustomer.id
        },
        data: {
          storeId: homeStore?.id ?? null,
          fullName,
          customerType,
          phone,
          email,
          addressLine1,
          city,
          countryCode,
          loyaltyEnrolled,
          loyaltyTier,
          loyaltyPointsBalance,
          allowCreditSales,
          creditLimitAmount,
          receivableBalanceAmount,
          note,
          status,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        },
        select: {
          customerNo: true
        }
      });
    });

    return {
      customerNo: customer.customerNo,
      message: `Customer ${customer.customerNo} has been updated in Flash ERP enterprise.`
    };
  } catch (error) {
    throw toCustomerMutationError(error, "Flash ERP could not update that customer.");
  }
}

export async function recordEnterpriseCustomerAccountEntry(
  customerNo: string,
  input: RecordEnterpriseCustomerAccountEntryRequest
): Promise<EnterpriseCustomerAccountEntryMutationResponse> {
  try {
    const normalizedCustomerNo = normalizeCode(customerNo, "customer number");
    const entryMode = input.entryMode;

    if (
      entryMode !== "ACCOUNT_PAYMENT" &&
      entryMode !== "RECEIVABLE_ADJUSTMENT" &&
      entryMode !== "LOYALTY_ADJUSTMENT"
    ) {
      throw new Error("Flash ERP does not recognize that customer account activity type.");
    }

    const note = normalizeOptionalText(input.note);
    const reference = normalizeOptionalText(input.reference);
    const storeCode = normalizeOptionalText(input.storeCode);

    const response = await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const customer = await tx.customer.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          customerNo: normalizedCustomerNo,
          deletedAt: null
        },
        select: {
          id: true,
          customerNo: true,
          fullName: true,
          receivableBalanceAmount: true,
          loyaltyPointsBalance: true
        }
      });

      if (!customer) {
        throw new Error(`Customer ${normalizedCustomerNo} does not exist in Flash ERP enterprise.`);
      }

      const store = storeCode
        ? await tx.store.findFirst({
            where: {
              retailOrgId: enterpriseNode.retailOrgId,
              code: storeCode
            },
            select: {
              id: true,
              code: true,
              name: true
            }
          })
        : null;

      if (storeCode && !store) {
        throw new Error(`Flash ERP could not find store "${storeCode}" for this account activity.`);
      }

      let entryType: CustomerAccountEntryType;
      let receivableDeltaAmount = 0;
      let loyaltyPointsDelta = 0;
      let resultingReceivableBalance = Number(customer.receivableBalanceAmount);
      let resultingLoyaltyPointsBalance = customer.loyaltyPointsBalance;
      let activityNote = note;

      if (entryMode === "ACCOUNT_PAYMENT") {
        const amount = normalizeMoney(input.amount, "payment amount");

        if (amount <= 0) {
          throw new Error("Flash ERP needs a payment amount greater than zero.");
        }

        if (Number(customer.receivableBalanceAmount) + 0.0001 < amount) {
          throw new Error(
            `Flash ERP cannot collect more than ${customer.fullName}'s outstanding receivable balance.`
          );
        }

        entryType = CustomerAccountEntryType.ACCOUNT_PAYMENT;
        receivableDeltaAmount = Number((amount * -1).toFixed(2));
        resultingReceivableBalance = Number(
          (Number(customer.receivableBalanceAmount) + receivableDeltaAmount).toFixed(2)
        );
        activityNote =
          activityNote ??
          `Customer payment collected against receivables${reference ? ` (${reference})` : ""}.`;
      } else if (entryMode === "RECEIVABLE_ADJUSTMENT") {
        const amount = normalizeSignedMoney(input.amount, "receivable adjustment amount");

        if (amount === 0) {
          throw new Error("Flash ERP needs a non-zero receivable adjustment amount.");
        }

        if (!note) {
          throw new Error(
            "Flash ERP needs a note before posting a manual receivable adjustment."
          );
        }

        resultingReceivableBalance = Number(
          (Number(customer.receivableBalanceAmount) + amount).toFixed(2)
        );

        if (resultingReceivableBalance < 0) {
          throw new Error(
            `Flash ERP cannot reduce ${customer.fullName}'s receivable balance below zero.`
          );
        }

        entryType = CustomerAccountEntryType.MANUAL_RECEIVABLE_ADJUSTMENT;
        receivableDeltaAmount = amount;
      } else {
        const points = normalizeSignedWholeNumber(input.loyaltyPoints, "loyalty points adjustment");

        if (points === 0) {
          throw new Error("Flash ERP needs a non-zero loyalty points adjustment.");
        }

        if (!note) {
          throw new Error(
            "Flash ERP needs a note before posting a manual loyalty adjustment."
          );
        }

        resultingLoyaltyPointsBalance = customer.loyaltyPointsBalance + points;

        if (resultingLoyaltyPointsBalance < 0) {
          throw new Error(
            `Flash ERP cannot reduce ${customer.fullName}'s loyalty balance below zero.`
          );
        }

        entryType = CustomerAccountEntryType.MANUAL_LOYALTY_ADJUSTMENT;
        loyaltyPointsDelta = points;
      }

      const occurredAt = new Date();

      await tx.customer.update({
        where: {
          id: customer.id
        },
        data: {
          receivableBalanceAmount: resultingReceivableBalance,
          loyaltyPointsBalance: resultingLoyaltyPointsBalance,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      await tx.customerAccountEntry.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          customerId: customer.id,
          storeId: store?.id ?? null,
          terminalId: null,
          posTransactionId: null,
          entryType,
          transactionNoSnapshot: reference,
          sourceTransactionNoSnapshot: null,
          receivableDeltaAmount,
          loyaltyPointsDelta,
          resultingReceivableBalance,
          resultingLoyaltyPointsBalance,
          note: activityNote,
          originNodeCode: enterpriseNode.code,
          occurredAt
        }
      });

      return {
        customerNo: customer.customerNo,
        message:
          entryMode === "ACCOUNT_PAYMENT"
            ? `Payment posted to ${customer.customerNo}. The updated receivable balance will sync to stores automatically.`
            : entryMode === "RECEIVABLE_ADJUSTMENT"
              ? `Receivable adjustment posted to ${customer.customerNo}.`
              : `Loyalty adjustment posted to ${customer.customerNo}.`
      };
    });

    return response;
  } catch (error) {
    throw toCustomerMutationError(
      error,
      "Flash ERP could not post that customer account activity."
    );
  }
}

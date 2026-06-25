import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { defaultAccountPaymentReceiptTemplateHtml } from "@/lib/templates/thermal-receipt-templates";
import { ensureEnterpriseAccountPaymentReceiptTemplate } from "@/server/repositories/receipt-template-support";
import { ensureReferenceCaptureTable } from "@/server/repositories/sale-sms.repository";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import {
  CustomerAccountEntryType,
  CustomerType,
  PaymentMethod,
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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readString(payload: Record<string, unknown>, key: string, fallback = "") {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
    companySettingsJson: Prisma.JsonValue | null;
  };
};

const defaultPaymentTerms = ["DUE-ON-RECEIPT", "NET-7", "NET-15", "NET-30", "NET-60"];

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
      retailOrgId: true,
      retailOrg: {
        select: {
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true,
          companySettingsJson: true
        }
      }
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
      code: true,
      retailOrg: {
        select: {
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true,
          companySettingsJson: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for customer changes.");
  }

  return enterpriseNode;
}

async function getPrimaryFinanceCompany(tx: Prisma.TransactionClient, retailOrgId: string) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      baseCurrencyCode: true,
      accountingSettings: {
        select: {
          arControlAccountCode: true
        }
      }
    }
  });
}

async function syncCustomerFinanceProfile(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    customerId: string;
    customerNo: string;
    fullName: string;
    allowCreditSales: boolean;
    paymentTermsCode: string | null;
    creditLimitAmount: number | null;
  }
) {
  const company = await getPrimaryFinanceCompany(tx, input.retailOrgId);

  if (!company) {
    return;
  }

  const postingProfile = await tx.erpArApPostingProfile.findFirst({
    where: {
      companyId: company.id,
      profileType: "CUSTOMER",
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });
  const paymentTermsCode =
    input.paymentTermsCode ?? (input.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT");
  const creditLimitAmount =
    input.creditLimitAmount === null ? null : toMoneyString(input.creditLimitAmount);

  await tx.erpPartyAccountingProfile.upsert({
    where: {
      companyId_partyType_partyNo: {
        companyId: company.id,
        partyType: "CUSTOMER",
        partyNo: input.customerNo
      }
    },
    update: {
      partyName: input.fullName,
      customerId: input.customerId,
      postingProfileId: postingProfile?.id ?? null,
      creditTermsCode: paymentTermsCode,
      paymentTermsCode,
      creditLimitAmount,
      allowCredit: input.allowCreditSales,
      creditStatus: input.allowCreditSales ? "ACTIVE" : "CASH_ONLY",
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: company.id,
      partyType: "CUSTOMER",
      partyNo: input.customerNo,
      partyName: input.fullName,
      customerId: input.customerId,
      postingProfileId: postingProfile?.id ?? null,
      creditTermsCode: paymentTermsCode,
      paymentTermsCode,
      creditLimitAmount,
      allowCredit: input.allowCreditSales,
      creditStatus: input.allowCreditSales ? "ACTIVE" : "CASH_ONLY",
      status: RecordStatus.ACTIVE
    }
  });
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
  paymentTermOptions: Array<{
    code: string;
    label: string;
  }>;
  tenderOptions: Array<{
    tenderMethodCode: string;
    name: string;
    paymentMethod: string;
    requiresReference: boolean;
    cashbookAccountId: string | null;
    cashbookAccountCode: string | null;
    cashbookAccountName: string | null;
    glAccountCode: string | null;
    label: string;
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
    paymentTermsCode: string | null;
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
    originalAmount: number;
    appliedAmount: number;
    openAmount: number;
    invoiceStatus: string;
    allocationSummary: string | null;
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
  paymentTermsCode?: string | null;
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
  tenderMethodCode?: string | null;
  allocations?: Array<{
    invoiceEntryId: string;
    amount?: number | null;
  }>;
  storeCode?: string | null;
  reference?: string | null;
  note?: string | null;
};

export type EnterpriseAccountPaymentReceipt = {
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

export type EnterpriseCustomerAccountEntryMutationResponse = {
  customerNo: string;
  message: string;
  accountPayment?: {
    entryId: string;
    entryNo: string;
    amount: number;
    allocatedAmount: number;
    journalEntryId: string | null;
    journalNo: string | null;
    cashbookEntryNo: string | null;
  };
  receipt?: EnterpriseAccountPaymentReceipt;
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
    paymentTermOptions: [],
    tenderOptions: [],
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

type CustomerCreditEntry = Prisma.CustomerAccountEntryGetPayload<{
  include: {
    customer: {
      select: {
        customerNo: true;
        fullName: true;
      };
    };
    store: {
      select: {
        code: true;
        name: true;
      };
    };
    invoicePaymentAllocations: {
      include: {
        paymentEntry: {
          select: {
            transactionNoSnapshot: true;
            sourceTransactionNoSnapshot: true;
          };
        };
      };
    };
    paymentInvoiceAllocations: {
      include: {
        invoiceEntry: {
          select: {
            transactionNoSnapshot: true;
            sourceTransactionNoSnapshot: true;
          };
        };
      };
    };
  };
}>;

function customerAccountReference(entry: Pick<CustomerCreditEntry, "id" | "transactionNoSnapshot">) {
  return entry.transactionNoSnapshot ?? `CAE-${entry.id.slice(0, 8).toUpperCase()}`;
}

function buildCreditStatementRows(entries: CustomerCreditEntry[]) {
  const sorted = [...entries].sort(
    (left, right) =>
      left.customer.customerNo.localeCompare(right.customer.customerNo) ||
      left.occurredAt.getTime() - right.occurredAt.getTime() ||
      left.createdAt.getTime() - right.createdAt.getTime()
  );
  const chargeStateById = new Map<
    string,
    {
      originalAmount: number;
      remainingAmount: number;
    }
  >();
  const explicitPaymentEntryIds = new Set<string>();

  for (const entry of sorted) {
    for (const allocation of entry.paymentInvoiceAllocations) {
      explicitPaymentEntryIds.add(allocation.paymentEntryId);
    }
  }

  for (const entry of sorted) {
    const delta = roundMoney(Number(entry.receivableDeltaAmount));

    if (delta > 0) {
      const explicitSettled = roundMoney(
        entry.invoicePaymentAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
      );
      chargeStateById.set(entry.id, {
        originalAmount: delta,
        remainingAmount: roundMoney(Math.max(0, delta - explicitSettled))
      });
      continue;
    }

    if (delta >= 0 || explicitPaymentEntryIds.has(entry.id)) {
      continue;
    }

    let creditAmount = Math.abs(delta);

    for (const charge of sorted.filter(
      (candidate) =>
        candidate.customerId === entry.customerId &&
        Number(candidate.receivableDeltaAmount) > 0 &&
        (chargeStateById.get(candidate.id)?.remainingAmount ?? 0) > 0
    )) {
      if (creditAmount <= 0) {
        break;
      }

      const state = chargeStateById.get(charge.id);

      if (!state) {
        continue;
      }

      const appliedAmount = Math.min(state.remainingAmount, creditAmount);
      state.remainingAmount = roundMoney(state.remainingAmount - appliedAmount);
      creditAmount = roundMoney(creditAmount - appliedAmount);
    }
  }

  return [...sorted]
    .reverse()
    .map((entry) => {
      const receivableDeltaAmount = roundMoney(Number(entry.receivableDeltaAmount));
      const isPayment =
        entry.entryType === CustomerAccountEntryType.ACCOUNT_PAYMENT ||
        entry.entryType === CustomerAccountEntryType.POS_RECEIVABLE_SETTLEMENT;
      const isAdjustment = entry.entryType === CustomerAccountEntryType.MANUAL_RECEIVABLE_ADJUSTMENT;
      const activityLabel = isPayment
        ? "Credit payment"
        : isAdjustment
          ? "Account adjustment"
          : "Credit sale invoice";
      const chargeState = chargeStateById.get(entry.id);
      const originalAmount = chargeState?.originalAmount ?? Math.abs(receivableDeltaAmount);
      const openAmount =
        receivableDeltaAmount > 0 ? roundMoney(chargeState?.remainingAmount ?? receivableDeltaAmount) : 0;
      const appliedAmount =
        receivableDeltaAmount > 0
          ? roundMoney(originalAmount - openAmount)
          : roundMoney(
              entry.paymentInvoiceAllocations.reduce(
                (sum, allocation) => sum + Number(allocation.amount),
                0
              )
            );
      const invoiceStatus =
        receivableDeltaAmount <= 0
          ? "PAYMENT"
          : openAmount <= 0
            ? "SETTLED"
            : appliedAmount > 0
              ? "PART_PAID"
              : "OPEN";
      const allocationSummary =
        receivableDeltaAmount > 0
          ? entry.invoicePaymentAllocations
              .map((allocation) => {
                const reference =
                  allocation.paymentEntry.transactionNoSnapshot ??
                  allocation.paymentEntry.sourceTransactionNoSnapshot ??
                  "Payment";
                return `${reference} ${Number(allocation.amount).toFixed(2)}`;
              })
              .join(", ") || null
          : entry.paymentInvoiceAllocations
              .map((allocation) => {
                const reference =
                  allocation.invoiceEntry.transactionNoSnapshot ??
                  allocation.invoiceEntry.sourceTransactionNoSnapshot ??
                  "Invoice";
                return `${reference} ${Number(allocation.amount).toFixed(2)}`;
              })
              .join(", ") || null;

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
        originalAmount,
        appliedAmount,
        openAmount,
        invoiceStatus,
        allocationSummary,
        resultingReceivableBalance: Number(entry.resultingReceivableBalance),
        note: entry.note,
        occurredAt: entry.occurredAt.toISOString(),
        occurredAtLabel: formatRelativeTime(entry.occurredAt)
      };
    });
}

export async function getEnterpriseCustomerWorkspace(): Promise<EnterpriseCustomerWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseCustomerWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read customer accounts."
    );
  }

  await ensureReferenceCaptureTable(prisma);
  const company = await prisma.erpCompany.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      status: RecordStatus.ACTIVE
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  const [
    stores,
    customers,
    recentActivity,
    creditActivity,
    referenceCaptures,
    customerProfiles,
    tenderMethods
  ] = await Promise.all([
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
    prisma.customerAccountEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        receivableDeltaAmount: {
          not: 0
        }
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      include: {
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
        },
        invoicePaymentAllocations: {
          include: {
            paymentEntry: {
              select: {
                transactionNoSnapshot: true,
                sourceTransactionNoSnapshot: true
              }
            }
          }
        },
        paymentInvoiceAllocations: {
          include: {
            invoiceEntry: {
              select: {
                transactionNoSnapshot: true,
                sourceTransactionNoSnapshot: true
              }
            }
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
    }),
    company
      ? prisma.erpPartyAccountingProfile.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            companyId: company.id,
            partyType: "CUSTOMER",
            status: RecordStatus.ACTIVE
          },
          select: {
            partyNo: true,
            paymentTermsCode: true,
            creditLimitAmount: true
          }
        })
      : Promise.resolve([]),
    prisma.tenderMethod.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        paymentMethod: {
          not: PaymentMethod.STORE_CREDIT
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        cashbookAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            glAccountCode: true,
            accountType: true
          }
        }
      }
    })
  ]);

  const customerProfileByNo = new Map(
    customerProfiles.map((profile) => [profile.partyNo, profile] as const)
  );
  const paymentTermCodes = Array.from(
    new Set([
      ...defaultPaymentTerms,
      ...customerProfiles
        .map((profile) => profile.paymentTermsCode)
        .filter((code): code is string => Boolean(code))
    ])
  ).sort();
  const customerRows = customers.map((customer) => {
    const lastTransaction = customer.posTransactions[0] ?? null;
    const receivableBalanceAmount = Number(customer.receivableBalanceAmount);
    const financeProfile = customerProfileByNo.get(customer.customerNo) ?? null;

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
      paymentTermsCode:
        financeProfile?.paymentTermsCode ??
        (customer.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT"),
      creditLimitAmount:
        financeProfile?.creditLimitAmount === null || financeProfile?.creditLimitAmount === undefined
          ? customer.creditLimitAmount === null
            ? null
            : Number(customer.creditLimitAmount)
          : Number(financeProfile.creditLimitAmount),
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
  const creditStatementRows = buildCreditStatementRows(creditActivity);
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
    paymentTermOptions: paymentTermCodes.map((code) => ({
      code,
      label: code
    })),
    tenderOptions: tenderMethods.map((method) => {
      const account = method.cashbookAccount;
      const accountLabel = account
        ? `${account.code} - ${account.name}${account.glAccountCode ? ` (${account.glAccountCode})` : ""}`
        : "No Finance cashbook account";

      return {
        tenderMethodCode: method.code,
        name: method.name,
        paymentMethod: method.paymentMethod,
        requiresReference: method.requiresReference,
        cashbookAccountId: method.cashbookAccountId,
        cashbookAccountCode: account?.code ?? null,
        cashbookAccountName: account?.name ?? null,
        glAccountCode: account?.glAccountCode ?? null,
        label: `${method.name} (${method.paymentMethod}) - ${accountLabel}`
      };
    }),
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
    const paymentTermsCode =
      normalizeOptionalText(input.paymentTermsCode) ??
      (allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT");
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

      await syncCustomerFinanceProfile(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        customerId: createdCustomer.id,
        customerNo,
        fullName,
        allowCreditSales,
        paymentTermsCode,
        creditLimitAmount
      });

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
    const paymentTermsCode =
      normalizeOptionalText(input.paymentTermsCode) ??
      (allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT");
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

      const updatedCustomer = await tx.customer.update({
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
          id: true,
          customerNo: true
        }
      });

      await syncCustomerFinanceProfile(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        customerId: updatedCustomer.id,
        customerNo: updatedCustomer.customerNo,
        fullName,
        allowCreditSales,
        paymentTermsCode,
        creditLimitAmount
      });

      return updatedCustomer;
    });

    return {
      customerNo: customer.customerNo,
      message: `Customer ${customer.customerNo} has been updated in Flash ERP enterprise.`
    };
  } catch (error) {
    throw toCustomerMutationError(error, "Flash ERP could not update that customer.");
  }
}

async function ensureCustomerCashbookEntrySequence(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
  }
) {
  const today = new Date();
  const fiscalYear =
    (await tx.erpFiscalYear.findFirst({
      where: {
        companyId: input.companyId,
        startsOn: {
          lte: today
        },
        endsOn: {
          gte: today
        },
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
    })) ??
    (await tx.erpFiscalYear.findFirst({
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
    }));

  if (!fiscalYear) {
    throw new Error("Flash ERP needs an open fiscal year before customer payments can post to cashbook.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: input.companyId,
        documentType: "CASHBOOK_ENTRY",
        fiscalYearId: fiscalYear.id
      }
    },
    update: {
      prefix: "CB",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      companyId: input.companyId,
      fiscalYearId: fiscalYear.id,
      documentType: "CASHBOOK_ENTRY",
      prefix: "CB",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: RecordStatus.ACTIVE
    }
  });
}

async function resolveCustomerPaymentTender(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    companyId: string;
    tenderMethodCode: string | null;
    reference: string | null;
  }
) {
  if (!input.tenderMethodCode) {
    throw new Error("Choose the tender method used to collect this account payment.");
  }

  const tender = await tx.tenderMethod.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      code: input.tenderMethodCode,
      status: RecordStatus.ACTIVE,
      deletedAt: null
    },
    include: {
      cashbookAccount: true
    }
  });

  if (!tender) {
    throw new Error("Flash ERP could not find the selected tender method.");
  }

  if (tender.paymentMethod === PaymentMethod.STORE_CREDIT) {
    throw new Error("Store Credit cannot be used to settle a customer receivable balance.");
  }

  if (tender.requiresReference && !input.reference) {
    throw new Error(`Flash ERP needs a payment reference for ${tender.name}.`);
  }

  const cashbookAccount = tender.cashbookAccount;

  if (!tender.cashbookAccountId || !cashbookAccount) {
    throw new Error(`${tender.name} is not mapped to a Finance cashbook account.`);
  }

  if (cashbookAccount.companyId !== input.companyId || cashbookAccount.status !== RecordStatus.ACTIVE) {
    throw new Error(`${tender.name}'s Finance cashbook account is not active for this company.`);
  }

  if (!cashbookAccount.glAccountCode?.trim()) {
    throw new Error(`${tender.name}'s Finance cashbook account has no mapped GL account.`);
  }

  return {
    ...tender,
    cashbookAccount
  };
}

async function resolveCustomerPaymentAllocations(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    customerId: string;
    allocations: RecordEnterpriseCustomerAccountEntryRequest["allocations"];
    expectedAmount: number | null;
  }
) {
  const requestedAllocations = new Map<string, number>();

  for (const allocation of input.allocations ?? []) {
    const invoiceEntryId = normalizeRequiredText(allocation.invoiceEntryId, "invoice");
    const amount = normalizeMoney(allocation.amount, "allocation amount");

    if (amount <= 0) {
      continue;
    }

    requestedAllocations.set(
      invoiceEntryId,
      roundMoney((requestedAllocations.get(invoiceEntryId) ?? 0) + amount)
    );
  }

  if (requestedAllocations.size === 0) {
    throw new Error("Select at least one open invoice and enter the amount to apply.");
  }

  const customerEntries = await tx.customerAccountEntry.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      customerId: input.customerId,
      receivableDeltaAmount: {
        not: 0
      }
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    include: {
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
      },
      invoicePaymentAllocations: {
        include: {
          paymentEntry: {
            select: {
              transactionNoSnapshot: true,
              sourceTransactionNoSnapshot: true
            }
          }
        }
      },
      paymentInvoiceAllocations: {
        include: {
          invoiceEntry: {
            select: {
              transactionNoSnapshot: true,
              sourceTransactionNoSnapshot: true
            }
          }
        }
      }
    }
  });
  const openInvoiceRows = buildCreditStatementRows(customerEntries)
    .filter((row) => row.debitAmount > 0 && row.openAmount > 0)
    .map((row) => [row.entryId, row] as const);
  const openInvoiceById = new Map(openInvoiceRows);
  const normalizedAllocations = Array.from(requestedAllocations.entries()).map(
    ([invoiceEntryId, amount]) => {
      const invoice = openInvoiceById.get(invoiceEntryId);

      if (!invoice) {
        throw new Error("One of the selected invoices is no longer open for this customer.");
      }

      if (amount > invoice.openAmount + 0.0001) {
        throw new Error(
          `${invoice.transactionNo ?? invoice.entryId} only has ${invoice.openAmount.toFixed(2)} open.`
        );
      }

      return {
        invoiceEntryId,
        invoiceNo: invoice.transactionNo ?? customerAccountReference({ id: invoice.entryId, transactionNoSnapshot: null }),
        amount
      };
    }
  );
  const allocatedAmount = roundMoney(
    normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  );

  if (input.expectedAmount !== null && Math.abs(input.expectedAmount - allocatedAmount) > 0.01) {
    throw new Error("The payment amount must match the invoice allocations.");
  }

  return {
    allocatedAmount,
    allocations: normalizedAllocations
  };
}

function buildCustomerPaymentReceipt(input: {
  enterpriseNode: Awaited<ReturnType<typeof getWritableEnterpriseNode>>;
  company: NonNullable<Awaited<ReturnType<typeof getPrimaryFinanceCompany>>>;
  customer: {
    customerNo: string;
    fullName: string;
  };
  store: {
    code: string;
    name: string;
    phone?: string | null;
    location?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    receiptHeader?: string | null;
    receiptFooter?: string | null;
    accountPaymentReceiptTemplateHtml?: string | null;
  } | null;
  tender: {
    paymentMethod: string;
    name: string;
  };
  entryNo: string;
  amount: number;
  resultingReceivableBalance: number;
  reference: string | null;
  note: string | null;
  occurredAt: Date;
  templateHtml: string | null | undefined;
}): EnterpriseAccountPaymentReceipt {
  const companySettings = readJsonObject(input.enterpriseNode.retailOrg.companySettingsJson);
  const tradingName =
    readString(companySettings, "tradingName") ||
    input.company.tradingName ||
    input.company.legalName ||
    input.enterpriseNode.retailOrg.name;

  return {
    entryNo: input.entryNo,
    retailOrgName: tradingName,
    companyLogoUrl: readString(companySettings, "companyLogoUrl") || null,
    storeCode: input.store?.code ?? input.enterpriseNode.code,
    storeName: input.store?.name ?? tradingName,
    storePhone: input.store?.phone ?? (readString(companySettings, "phone") || null),
    storeLocation: input.store?.location ?? (readString(companySettings, "city") || null),
    storeAddress: input.store?.addressLine1 ?? (readString(companySettings, "addressLine1") || null),
    storeAddressLine2:
      input.store?.addressLine2 ?? (readString(companySettings, "addressLine2") || null),
    terminalCode: "HQ",
    shiftNo: null,
    customerNo: input.customer.customerNo,
    customerName: input.customer.fullName,
    cashierCode: "Flash ERP",
    paymentMethod: input.tender.paymentMethod,
    tenderMethodName: input.tender.name,
    amount: input.amount,
    remainingBalanceAmount: input.resultingReceivableBalance,
    reference: input.reference,
    note: input.note,
    occurredAt: input.occurredAt.toISOString(),
    currencyCode: input.company.baseCurrencyCode || input.enterpriseNode.retailOrg.baseCurrencyCode,
    timezone: input.enterpriseNode.retailOrg.timezone,
    receiptHeader: input.store?.receiptHeader ?? null,
    receiptFooter: input.store?.receiptFooter ?? null,
    accountPaymentReceiptTemplateHtml:
      input.store?.accountPaymentReceiptTemplateHtml?.trim() ||
      input.templateHtml?.trim() ||
      defaultAccountPaymentReceiptTemplateHtml
  };
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
              name: true,
              phone: true,
              location: true,
              addressLine1: true,
              addressLine2: true,
              receiptHeader: true,
              receiptFooter: true,
              accountPaymentReceiptTemplateHtml: true
            }
          })
        : null;

      if (storeCode && !store) {
        throw new Error(`Flash ERP could not find store "${storeCode}" for this account activity.`);
      }

      if (entryMode === "ACCOUNT_PAYMENT") {
        const requestedAmount =
          input.amount === null || input.amount === undefined
            ? null
            : normalizeMoney(input.amount, "payment amount");
        const company = await getPrimaryFinanceCompany(tx, enterpriseNode.retailOrgId);

        if (!company) {
          throw new Error("Create a company in Finance foundation before posting customer payments.");
        }

        if (!company.accountingSettings) {
          throw new Error("Configure Finance accounting settings before posting customer payments.");
        }

        const tender = await resolveCustomerPaymentTender(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          companyId: company.id,
          tenderMethodCode: normalizeOptionalText(input.tenderMethodCode),
          reference
        });
        const allocationResult = await resolveCustomerPaymentAllocations(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          customerId: customer.id,
          allocations: input.allocations,
          expectedAmount: requestedAmount
        });
        const amount = allocationResult.allocatedAmount;

        if (amount <= 0) {
          throw new Error("Flash ERP needs a payment amount greater than zero.");
        }

        if (Number(customer.receivableBalanceAmount) + 0.0001 < amount) {
          throw new Error(
            `Flash ERP cannot collect more than ${customer.fullName}'s outstanding receivable balance.`
          );
        }

        await ensureCustomerCashbookEntrySequence(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          companyId: company.id
        });
        const entryNo = (
          await reserveErpDocumentNumberInTransaction(tx, {
            retailOrgId: enterpriseNode.retailOrgId,
            companyId: company.id,
            documentType: "RECEIPT_VOUCHER"
          })
        ).documentNo;
        const receivableDeltaAmount = roundMoney(amount * -1);
        const resultingReceivableBalance = roundMoney(
          Number(customer.receivableBalanceAmount) + receivableDeltaAmount
        );
        const resultingLoyaltyPointsBalance = customer.loyaltyPointsBalance;
        const invoiceSummary = allocationResult.allocations
          .map((allocation) => `${allocation.invoiceNo} ${allocation.amount.toFixed(2)}`)
          .join(", ");
        const activityNote =
          note ??
          `Customer payment collected through ${tender.name} against invoice(s): ${invoiceSummary}.`;
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

        const entry = await tx.customerAccountEntry.create({
          data: {
            retailOrgId: enterpriseNode.retailOrgId,
            customerId: customer.id,
            storeId: store?.id ?? null,
            terminalId: null,
            posTransactionId: null,
            entryType: CustomerAccountEntryType.ACCOUNT_PAYMENT,
            transactionNoSnapshot: entryNo,
            sourceTransactionNoSnapshot: reference,
            receivableDeltaAmount,
            loyaltyPointsDelta: 0,
            resultingReceivableBalance,
            resultingLoyaltyPointsBalance,
            note: activityNote,
            originNodeCode: enterpriseNode.code,
            occurredAt
          },
          select: {
            id: true,
            transactionNoSnapshot: true
          }
        });
        await tx.customerAccountPaymentAllocation.createMany({
          data: allocationResult.allocations.map((allocation) => ({
            retailOrgId: enterpriseNode.retailOrgId,
            customerId: customer.id,
            paymentEntryId: entry.id,
            invoiceEntryId: allocation.invoiceEntryId,
            amount: allocation.amount,
            note: reference
          }))
        });

        const arAccountCode = normalizeRequiredText(
          company.accountingSettings.arControlAccountCode ?? "1100",
          "AR control account"
        );
        const postingLines: PostAccountingDocumentLine[] = [
          {
            accountCode: tender.cashbookAccount.glAccountCode,
            debitAmount: amount,
            creditAmount: 0,
            memo: `${entryNo} ${tender.name} account payment`
          },
          {
            accountCode: arAccountCode,
            debitAmount: 0,
            creditAmount: amount,
            memo: `${entryNo} customer receivable settlement`
          }
        ];
        const journal = await postAccountingDocumentInTransaction(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          companyId: company.id,
          documentType: "JOURNAL",
          batchSourceType: "CUSTOMER_ACCOUNT_PAYMENT",
          journalType: "CUSTOMER_PAYMENT",
          sourceType: "CUSTOMER_ACCOUNT_PAYMENT",
          sourceId: entry.id,
          sourceReference: entryNo,
          postingDate: occurredAt,
          description: `${entryNo} customer account payment from ${customer.fullName}`,
          postedBy: "Customer Accounts",
          lines: postingLines
        });
        const cashbookEntryNo = (
          await reserveErpDocumentNumberInTransaction(tx, {
            retailOrgId: enterpriseNode.retailOrgId,
            companyId: company.id,
            documentType: "CASHBOOK_ENTRY"
          })
        ).documentNo;
        await tx.erpCashbookEntry.create({
          data: {
            retailOrgId: enterpriseNode.retailOrgId,
            companyId: company.id,
            cashbookAccountId: tender.cashbookAccount.id,
            postingJournalEntryId: journal.journalEntryId,
            entryNo: cashbookEntryNo,
            entryType: "RECEIPT",
            direction: "INFLOW",
            entryDate: occurredAt,
            postingDate: occurredAt,
            valueDate: occurredAt,
            currencyCode: tender.cashbookAccount.currencyCode || company.baseCurrencyCode,
            amount,
            offsetAccountCode: arAccountCode,
            counterpartyName: customer.fullName,
            workflowType: "CUSTOMER_ACCOUNT_PAYMENT",
            workflowReference: entryNo,
            providerReference: reference,
            externalReference: entryNo,
            memo: activityNote,
            reconciliationStatus: "UNRECONCILED",
            status: "POSTED",
            postedAt: occurredAt,
            postedBy: "Customer Accounts"
          }
        });
        const receiptTemplate = await ensureEnterpriseAccountPaymentReceiptTemplate(
          tx,
          enterpriseNode.retailOrgId
        );

        return {
          customerNo: customer.customerNo,
          message:
            resultingReceivableBalance <= 0
              ? `${entryNo} collected ${amount.toFixed(2)} from ${customer.fullName}. The receivable is fully settled.`
              : `${entryNo} collected ${amount.toFixed(2)} from ${customer.fullName}. Remaining receivable balance is ${resultingReceivableBalance.toFixed(2)}.`,
          accountPayment: {
            entryId: entry.id,
            entryNo,
            amount,
            allocatedAmount: allocationResult.allocatedAmount,
            journalEntryId: journal.journalEntryId,
            journalNo: journal.journalNo,
            cashbookEntryNo
          },
          receipt: buildCustomerPaymentReceipt({
            enterpriseNode,
            company,
            customer,
            store,
            tender,
            entryNo,
            amount,
            resultingReceivableBalance,
            reference,
            note: activityNote,
            occurredAt,
            templateHtml: receiptTemplate?.templateHtml
          })
        };
      }

      let entryType: CustomerAccountEntryType;
      let receivableDeltaAmount = 0;
      let loyaltyPointsDelta = 0;
      let resultingReceivableBalance = Number(customer.receivableBalanceAmount);
      let resultingLoyaltyPointsBalance = customer.loyaltyPointsBalance;
      let activityNote = note;

      if (entryMode === "RECEIVABLE_ADJUSTMENT") {
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
          entryMode === "RECEIVABLE_ADJUSTMENT"
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

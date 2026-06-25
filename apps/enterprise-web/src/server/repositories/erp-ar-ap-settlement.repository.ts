import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type SettlementContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type SettlementDocument = Prisma.ErpOperationalDocumentGetPayload<{
  include: {
    postingJournalEntry: {
      select: {
        journalNo: true;
      };
    };
    partyProfile: {
      include: {
        postingProfile: true;
      };
    };
    company: {
      include: {
        accountingSettings: true;
      };
    };
    settlementAllocations: {
      include: {
        postingJournalEntry: {
          select: {
            journalNo: true;
          };
        };
      };
    };
  };
}>;

type SettlementCustomerAccountEntry = Prisma.CustomerAccountEntryGetPayload<{
  include: {
    customer: {
      select: {
        customerNo: true;
        fullName: true;
      };
    };
    invoicePaymentAllocations: true;
    paymentInvoiceAllocations: true;
  };
}>;

type CustomerAccountJournalLink = {
  id: string;
  journalNo: string;
};

export type CreateErpSettlementAllocationRequest = {
  operationalDocumentId?: string | null;
  allocationDate?: string | null;
  postingDate?: string | null;
  paymentAccountCode?: string | null;
  amount?: number | string | null;
  discountAmount?: number | string | null;
  writeOffAmount?: number | string | null;
  memo?: string | null;
};

export type ErpSettlementAllocationMutationResponse = {
  message: string;
  allocationId?: string;
  allocationNo?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpArApSettlementWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultAllocationDate: string;
  defaultPostingDate: string;
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  metrics: {
    openItems: number;
    arOpenAmount: number;
    apOpenAmount: number;
    overdueAmount: number;
    pendingAllocationAmount: number;
    draftAllocations: number;
    postedAllocations: number;
  };
  openItemRows: Array<{
    sourceType: string;
    documentId: string;
    documentNo: string;
    documentType: string;
    documentDirection: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    documentDate: string;
    postingDate: string;
    dueDate: string | null;
    currencyCode: string;
    journalEntryId: string | null;
    journalNo: string | null;
    originalAmount: number;
    postedAllocationAmount: number;
    pendingAllocationAmount: number;
    openAmount: number;
    availableAmount: number;
    daysOverdue: number;
    agingBucket: string;
    status: string;
  }>;
  allocationRows: Array<{
    allocationId: string;
    allocationNo: string;
    allocationType: string;
    documentId: string;
    documentNo: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    allocationDate: string;
    postingDate: string;
    currencyCode: string;
    paymentAccountCode: string;
    amount: number;
    discountAmount: number;
    writeOffAmount: number;
    reductionAmount: number;
    memo: string | null;
    status: string;
    postedAt: string | null;
    postedBy: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  return normalized;
}

function normalizeCode(value: string | null | undefined, label: string) {
  const normalized = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!normalized) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return normalized;
}

function parseDate(value: string | null | undefined, label: string) {
  const normalized = normalizeRequiredText(value, label);
  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  return Math.floor((endUtc - startUtc) / 86_400_000);
}

function agingBucket(daysOverdue: number) {
  if (daysOverdue <= 0) {
    return "Current";
  }

  if (daysOverdue <= 30) {
    return "1-30";
  }

  if (daysOverdue <= 60) {
    return "31-60";
  }

  if (daysOverdue <= 90) {
    return "61-90";
  }

  return "90+";
}

function allocationDocumentType(documentDirection: string) {
  return documentDirection === "PURCHASE" ? "PAYMENT_VOUCHER" : "RECEIPT_VOUCHER";
}

function allocationType(documentDirection: string) {
  return documentDirection === "PURCHASE" ? "SUPPLIER_PAYMENT" : "CUSTOMER_RECEIPT";
}

function sourceTypeForAllocation(type: string) {
  return type === "SUPPLIER_PAYMENT" ? "ERP-SUPPLIER-PAYMENT" : "ERP-CUSTOMER-RECEIPT";
}

function controlAccountForSettlement(document: SettlementDocument) {
  if (document.documentDirection === "SALES") {
    return (
      document.partyProfile?.postingProfile?.receivablesControlAccountCode ??
      document.company.accountingSettings?.arControlAccountCode ??
      "1100"
    );
  }

  return (
    document.partyProfile?.postingProfile?.payablesControlAccountCode ??
    document.company.accountingSettings?.apControlAccountCode ??
    "2000"
  );
}

function postedReductionForDocument(document: SettlementDocument) {
  return roundMoney(
    document.settlementAllocations
      .filter((allocation) => allocation.status === "POSTED")
      .reduce(
        (sum, allocation) =>
          sum +
          Number(allocation.amount) +
          Number(allocation.discountAmount) +
          Number(allocation.writeOffAmount),
        0
      )
  );
}

function pendingReductionForDocument(document: SettlementDocument) {
  return roundMoney(
    document.settlementAllocations
      .filter((allocation) => allocation.status === "DRAFT")
      .reduce(
        (sum, allocation) =>
          sum +
          Number(allocation.amount) +
          Number(allocation.discountAmount) +
          Number(allocation.writeOffAmount),
        0
      )
  );
}

function buildUnavailableErpArApSettlementWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpArApSettlementWorkspaceData {
  const today = dateOnly(new Date());

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultAllocationDate: today,
    defaultPostingDate: today,
    accountOptions: [],
    metrics: {
      openItems: 0,
      arOpenAmount: 0,
      apOpenAmount: 0,
      overdueAmount: 0,
      pendingAllocationAmount: 0,
      draftAllocations: 0,
      postedAllocations: 0
    },
    openItemRows: [],
    allocationRows: []
  };
}

export { buildUnavailableErpArApSettlementWorkspace };

async function getSettlementContext(
  tx: Prisma.TransactionClient = prisma
): Promise<SettlementContext | null> {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: activeStatus
    },
    select: {
      retailOrgId: true,
      retailOrg: {
        select: {
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  return {
    retailOrgId: enterpriseNode.retailOrgId,
    retailOrg: enterpriseNode.retailOrg
  };
}

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: SettlementContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    include: {
      accountingSettings: true
    }
  });
}

function addPostingLine(
  lines: PostAccountingDocumentLine[],
  accountCode: string,
  debitAmount: number,
  creditAmount: number,
  memo: string
) {
  const debit = roundMoney(Math.max(0, debitAmount));
  const credit = roundMoney(Math.max(0, creditAmount));

  if (debit === 0 && credit === 0) {
    return;
  }

  lines.push({
    accountCode,
    debitAmount: debit,
    creditAmount: credit,
    memo
  });
}

async function loadSettlementDocuments(companyId: string) {
  return prisma.erpOperationalDocument.findMany({
    where: {
      companyId,
      status: "POSTED"
    },
    orderBy: [{ dueDate: "asc" }, { documentDate: "asc" }, { documentNo: "asc" }],
    include: {
      postingJournalEntry: {
        select: {
          journalNo: true
        }
      },
      partyProfile: {
        include: {
          postingProfile: true
        }
      },
      company: {
        include: {
          accountingSettings: true
        }
      },
      settlementAllocations: {
        where: {
          status: {
            not: RecordStatus.DELETED
          }
        },
        orderBy: [{ allocationDate: "desc" }, { allocationNo: "desc" }],
        include: {
          postingJournalEntry: {
            select: {
              journalNo: true
            }
          }
        }
      }
    }
  });
}

async function loadCustomerAccountEntries(retailOrgId: string) {
  return prisma.customerAccountEntry.findMany({
    where: {
      retailOrgId,
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
      invoicePaymentAllocations: true,
      paymentInvoiceAllocations: true
    }
  });
}

function buildOpenItemRow(document: SettlementDocument, today: Date) {
  const originalAmount = roundMoney(Number(document.totalAmount));
  const postedAllocationAmount = postedReductionForDocument(document);
  const pendingAllocationAmount = pendingReductionForDocument(document);
  const openAmount = roundMoney(Math.max(0, originalAmount - postedAllocationAmount));
  const availableAmount = roundMoney(Math.max(0, openAmount - pendingAllocationAmount));
  const dueDate = document.dueDate ?? document.documentDate;
  const overdueDays = Math.max(0, daysBetween(dueDate, today));

  return {
    sourceType: "OPERATIONAL_DOCUMENT",
    documentId: document.id,
    documentNo: document.documentNo,
    documentType: document.documentType,
    documentDirection: document.documentDirection,
    partyType: document.partyType,
    partyNo: document.partyNo,
    partyName: document.partyName,
    documentDate: document.documentDate.toISOString(),
    postingDate: document.postingDate.toISOString(),
    dueDate: document.dueDate?.toISOString() ?? null,
    currencyCode: document.currencyCode,
    journalEntryId: document.postingJournalEntryId,
    journalNo: document.postingJournalEntry?.journalNo ?? null,
    originalAmount,
    postedAllocationAmount,
    pendingAllocationAmount,
    openAmount,
    availableAmount,
    daysOverdue: overdueDays,
    agingBucket: agingBucket(overdueDays),
    status: openAmount <= 0 ? "SETTLED" : pendingAllocationAmount > 0 ? "PENDING" : "OPEN"
  };
}

function customerAccountReference(entry: SettlementCustomerAccountEntry) {
  return entry.transactionNoSnapshot ?? `CAE-${entry.id.slice(0, 8).toUpperCase()}`;
}

function buildCustomerAccountOpenItemRows(
  customerAccountEntries: SettlementCustomerAccountEntry[],
  today: Date,
  currencyCode: string,
  customerAccountJournalByReference: Map<string, CustomerAccountJournalLink>
) {
  const chargeRows: Array<{
    entry: SettlementCustomerAccountEntry;
    originalAmount: number;
    remainingAmount: number;
  }> = [];
  const explicitPaymentEntryIds = new Set<string>();
  const sortedEntries = [...customerAccountEntries].sort(
    (left, right) =>
      left.customer.customerNo.localeCompare(right.customer.customerNo) ||
      left.occurredAt.getTime() - right.occurredAt.getTime() ||
      left.createdAt.getTime() - right.createdAt.getTime()
  );

  for (const entry of sortedEntries) {
    for (const allocation of entry.paymentInvoiceAllocations) {
      explicitPaymentEntryIds.add(allocation.paymentEntryId);
    }
  }

  for (const entry of sortedEntries) {
    const receivableDeltaAmount = roundMoney(Number(entry.receivableDeltaAmount));

    if (receivableDeltaAmount > 0) {
      const explicitSettledAmount = roundMoney(
        entry.invoicePaymentAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
      );

      chargeRows.push({
        entry,
        originalAmount: receivableDeltaAmount,
        remainingAmount: roundMoney(Math.max(0, receivableDeltaAmount - explicitSettledAmount))
      });
      continue;
    }

    if (receivableDeltaAmount >= 0 || explicitPaymentEntryIds.has(entry.id)) {
      continue;
    }

    let creditAmount = Math.abs(receivableDeltaAmount);

    for (const charge of chargeRows.filter(
      (row) => row.entry.customerId === entry.customerId && row.remainingAmount > 0
    )) {
      if (creditAmount <= 0) {
        break;
      }

      const appliedAmount = Math.min(charge.remainingAmount, creditAmount);
      charge.remainingAmount = roundMoney(charge.remainingAmount - appliedAmount);
      creditAmount = roundMoney(creditAmount - appliedAmount);
    }
  }

  return chargeRows
    .filter((row) => row.remainingAmount >= 0.01)
    .map((row) => {
      const overdueDays = Math.max(0, daysBetween(row.entry.occurredAt, today));
      const settledAmount = roundMoney(row.originalAmount - row.remainingAmount);
      const journal = customerAccountJournalByReference.get(customerAccountReference(row.entry)) ?? null;

      return {
        sourceType: "CUSTOMER_ACCOUNT_ENTRY",
        documentId: row.entry.id,
        documentNo: customerAccountReference(row.entry),
        documentType: row.entry.entryType,
        documentDirection: "SALES",
        partyType: "CUSTOMER",
        partyNo: row.entry.customer.customerNo,
        partyName: row.entry.customer.fullName,
        documentDate: row.entry.occurredAt.toISOString(),
        postingDate: row.entry.occurredAt.toISOString(),
        dueDate: null,
        currencyCode,
        journalEntryId: journal?.id ?? null,
        journalNo: journal?.journalNo ?? null,
        originalAmount: row.originalAmount,
        postedAllocationAmount: settledAmount,
        pendingAllocationAmount: 0,
        openAmount: row.remainingAmount,
        availableAmount: row.remainingAmount,
        daysOverdue: overdueDays,
        agingBucket: agingBucket(overdueDays),
        status: "OPEN"
      };
    });
}

function buildAllocationRows(documents: SettlementDocument[]) {
  return documents.flatMap((document) =>
    document.settlementAllocations.map((allocation) => {
      const amount = Number(allocation.amount);
      const discountAmount = Number(allocation.discountAmount);
      const writeOffAmount = Number(allocation.writeOffAmount);

      return {
        allocationId: allocation.id,
        allocationNo: allocation.allocationNo,
        allocationType: allocation.allocationType,
        documentId: document.id,
        documentNo: document.documentNo,
        partyType: allocation.partyType,
        partyNo: allocation.partyNo,
        partyName: allocation.partyName,
        allocationDate: allocation.allocationDate.toISOString(),
        postingDate: allocation.postingDate.toISOString(),
        currencyCode: allocation.currencyCode,
        paymentAccountCode: allocation.paymentAccountCode,
        amount,
        discountAmount,
        writeOffAmount,
        reductionAmount: roundMoney(amount + discountAmount + writeOffAmount),
        memo: allocation.memo,
        status: allocation.status,
        postedAt: allocation.postedAt?.toISOString() ?? null,
        postedBy: allocation.postedBy,
        journalEntryId: allocation.postingJournalEntryId,
        journalNo: allocation.postingJournalEntry?.journalNo ?? null
      };
    })
  );
}

export async function getErpArApSettlementWorkspace(): Promise<ErpArApSettlementWorkspaceData> {
  const context = await getSettlementContext();

  if (!context) {
    return buildUnavailableErpArApSettlementWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpArApSettlementWorkspace(
      "Create a company in Finance foundation before reviewing AR/AP open items.",
      context.retailOrg.baseCurrencyCode
    );
  }

  const [documents, customerAccountEntries, accounts] = await Promise.all([
    loadSettlementDocuments(company.id),
    loadCustomerAccountEntries(context.retailOrgId),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    })
  ]);
  const today = new Date();
  const currencyCode = company.baseCurrencyCode || context.retailOrg.baseCurrencyCode;
  const customerAccountReferences = Array.from(
    new Set(customerAccountEntries.map((entry) => customerAccountReference(entry)))
  );
  const customerAccountJournals =
    customerAccountReferences.length > 0
      ? await prisma.glJournalEntry.findMany({
          where: {
            retailOrgId: context.retailOrgId,
            sourceReference: {
              in: customerAccountReferences
            },
            status: "POSTED"
          },
          orderBy: [{ postedAt: "desc" }],
          select: {
            id: true,
            journalNo: true,
            sourceReference: true
          }
        })
      : [];
  const customerAccountJournalByReference = new Map<string, CustomerAccountJournalLink>();

  for (const journal of customerAccountJournals) {
    if (journal.sourceReference && !customerAccountJournalByReference.has(journal.sourceReference)) {
      customerAccountJournalByReference.set(journal.sourceReference, {
        id: journal.id,
        journalNo: journal.journalNo
      });
    }
  }
  const allOpenItemRows = [
    ...documents.map((document) => buildOpenItemRow(document, today)),
    ...buildCustomerAccountOpenItemRows(
      customerAccountEntries,
      today,
      currencyCode,
      customerAccountJournalByReference
    )
  ];
  const openItemRows = allOpenItemRows.filter((row) => row.openAmount > 0);
  const allocationRows = buildAllocationRows(documents).sort((left, right) =>
    right.allocationDate.localeCompare(left.allocationDate) ||
    right.allocationNo.localeCompare(left.allocationNo)
  );

  return {
    currencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "AR/AP open items are derived from posted operational documents, posted settlement allocations, and customer account receivable activity.",
    refreshedAt: new Date().toISOString(),
    defaultAllocationDate: dateOnly(new Date()),
    defaultPostingDate: dateOnly(new Date()),
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    metrics: {
      openItems: openItemRows.length,
      arOpenAmount: roundMoney(
        openItemRows
          .filter((row) => row.documentDirection === "SALES")
          .reduce((sum, row) => sum + row.openAmount, 0)
      ),
      apOpenAmount: roundMoney(
        openItemRows
          .filter((row) => row.documentDirection === "PURCHASE")
          .reduce((sum, row) => sum + row.openAmount, 0)
      ),
      overdueAmount: roundMoney(
        openItemRows
          .filter((row) => row.daysOverdue > 0)
          .reduce((sum, row) => sum + row.openAmount, 0)
      ),
      pendingAllocationAmount: roundMoney(
        openItemRows.reduce((sum, row) => sum + row.pendingAllocationAmount, 0)
      ),
      draftAllocations: allocationRows.filter((allocation) => allocation.status === "DRAFT").length,
      postedAllocations: allocationRows.filter((allocation) => allocation.status === "POSTED").length
    },
    openItemRows,
    allocationRows
  };
}

export async function createErpSettlementAllocation(
  input: CreateErpSettlementAllocationRequest
): Promise<ErpSettlementAllocationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getSettlementContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const documentId = normalizeRequiredText(input.operationalDocumentId, "source document");
    const document = await tx.erpOperationalDocument.findFirst({
      where: {
        id: documentId,
        retailOrgId: context.retailOrgId,
        status: "POSTED"
      },
      include: {
        postingJournalEntry: {
          select: {
            journalNo: true
          }
        },
        partyProfile: {
          include: {
            postingProfile: true
          }
        },
        company: {
          include: {
            accountingSettings: true
          }
        },
        settlementAllocations: {
          where: {
            status: {
              not: RecordStatus.DELETED
            }
          },
          include: {
            postingJournalEntry: {
              select: {
                journalNo: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      throw new Error("Flash ERP cannot find a posted operational document for settlement.");
    }

    const openItem = buildOpenItemRow(document, new Date());
    const allocationDate = parseDate(input.allocationDate ?? dateOnly(new Date()), "allocation date");
    const postingDate = parseDate(input.postingDate ?? input.allocationDate ?? dateOnly(new Date()), "posting date");
    const amount = roundMoney(Math.max(0, numberOrZero(input.amount)));
    const discountAmount = roundMoney(Math.max(0, numberOrZero(input.discountAmount)));
    const writeOffAmount = roundMoney(Math.max(0, numberOrZero(input.writeOffAmount)));
    const reductionAmount = roundMoney(amount + discountAmount + writeOffAmount);

    if (reductionAmount <= 0) {
      throw new Error("Flash ERP needs a positive settlement amount, discount, or write-off.");
    }

    if (reductionAmount - openItem.availableAmount > 0.01) {
      throw new Error(
        `Flash ERP can only allocate up to ${openItem.availableAmount.toFixed(2)} for ${document.documentNo}.`
      );
    }

    const paymentAccountCode = normalizeCode(input.paymentAccountCode ?? "1000", "payment account");
    const paymentAccount = await tx.glAccount.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        code: paymentAccountCode,
        status: activeStatus
      },
      select: {
        id: true
      }
    });

    if (!paymentAccount) {
      throw new Error(`Flash ERP cannot find payment account ${paymentAccountCode}.`);
    }

    const settlementType = allocationType(document.documentDirection);
    const allocationNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: document.retailOrgId,
        companyId: document.companyId,
        documentType: allocationDocumentType(document.documentDirection)
      })
    ).documentNo;
    const allocation = await tx.erpSettlementAllocation.create({
      data: {
        retailOrgId: document.retailOrgId,
        companyId: document.companyId,
        partyProfileId: document.partyProfileId,
        operationalDocumentId: document.id,
        allocationNo,
        allocationType: settlementType,
        partyType: document.partyType,
        partyNo: document.partyNo,
        partyName: document.partyName,
        allocationDate,
        postingDate,
        currencyCode: document.currencyCode,
        paymentAccountCode,
        amount,
        discountAmount,
        writeOffAmount,
        memo: normalizeOptionalText(input.memo),
        status: "DRAFT"
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved settlement allocation ${allocationNo}.`,
      allocationId: allocation.id,
      allocationNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function postErpSettlementAllocation(
  allocationId: string
): Promise<ErpSettlementAllocationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getSettlementContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const allocation = await tx.erpSettlementAllocation.findFirst({
      where: {
        id: allocationId,
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        operationalDocument: {
          include: {
            postingJournalEntry: {
              select: {
                journalNo: true
              }
            },
            partyProfile: {
              include: {
                postingProfile: true
              }
            },
            company: {
              include: {
                accountingSettings: true
              }
            },
            settlementAllocations: {
              where: {
                status: "POSTED"
              },
              include: {
                postingJournalEntry: {
                  select: {
                    journalNo: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!allocation) {
      throw new Error("Flash ERP cannot find that settlement allocation.");
    }

    if (allocation.status !== "DRAFT") {
      throw new Error("Only draft settlement allocations can be posted.");
    }

    const document = allocation.operationalDocument;

    if (document.status !== "POSTED") {
      throw new Error("Flash ERP can only settle posted operational documents.");
    }

    const openItem = buildOpenItemRow(document, new Date());
    const amount = roundMoney(Number(allocation.amount));
    const discountAmount = roundMoney(Number(allocation.discountAmount));
    const writeOffAmount = roundMoney(Number(allocation.writeOffAmount));
    const reductionAmount = roundMoney(amount + discountAmount + writeOffAmount);

    if (reductionAmount <= 0) {
      throw new Error("Flash ERP cannot post a zero-value settlement allocation.");
    }

    if (reductionAmount - openItem.openAmount > 0.01) {
      throw new Error(
        `Flash ERP can only post up to ${openItem.openAmount.toFixed(2)} against ${document.documentNo}.`
      );
    }

    const controlAccountCode = controlAccountForSettlement(document);
    const postingProfile = document.partyProfile?.postingProfile ?? null;
    const postingLines: PostAccountingDocumentLine[] = [];

    if (allocation.allocationType === "CUSTOMER_RECEIPT") {
      addPostingLine(
        postingLines,
        allocation.paymentAccountCode,
        amount,
        0,
        `${allocation.allocationNo} cash receipt for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        postingProfile?.customerDiscountAccountCode ?? "8000",
        discountAmount,
        0,
        `${allocation.allocationNo} customer discount for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        postingProfile?.writeOffAccountCode ?? "1110",
        writeOffAmount,
        0,
        `${allocation.allocationNo} customer write-off for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        controlAccountCode,
        0,
        reductionAmount,
        `${allocation.allocationNo} receivable settlement for ${document.documentNo}`
      );
    } else {
      addPostingLine(
        postingLines,
        controlAccountCode,
        reductionAmount,
        0,
        `${allocation.allocationNo} payable settlement for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        allocation.paymentAccountCode,
        0,
        amount,
        `${allocation.allocationNo} supplier payment for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        postingProfile?.supplierDiscountAccountCode ?? "4400",
        0,
        discountAmount,
        `${allocation.allocationNo} supplier discount for ${document.documentNo}`
      );
      addPostingLine(
        postingLines,
        postingProfile?.exchangeGainAccountCode ?? "7000",
        0,
        writeOffAmount,
        `${allocation.allocationNo} supplier write-off for ${document.documentNo}`
      );
    }

    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: allocation.retailOrgId,
      companyId: allocation.companyId,
      documentType: "JOURNAL",
      batchSourceType: allocation.allocationType,
      journalType: allocation.allocationType,
      sourceType: sourceTypeForAllocation(allocation.allocationType),
      sourceId: allocation.id,
      sourceReference: allocation.allocationNo,
      postingDate: allocation.postingDate,
      description: `${allocation.allocationNo} settlement for ${document.documentNo} - ${allocation.partyName}`,
      postedBy: "Enterprise settlements",
      lines: postingLines
    });

    await tx.erpSettlementAllocation.update({
      where: {
        id: allocation.id
      },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Enterprise settlements",
        postingJournalEntryId: result.journalEntryId
      }
    });

    return {
      message: `Flash ERP posted ${allocation.allocationNo} through journal ${result.journalNo}.`,
      allocationId: allocation.id,
      allocationNo: allocation.allocationNo,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

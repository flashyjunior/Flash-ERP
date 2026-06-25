import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type ArApDocumentsContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type ArApDocument = Prisma.ErpOperationalDocumentGetPayload<{
  include: {
    postingJournalEntry: {
      select: {
        journalNo: true;
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

type ArApCustomerAccountEntry = Prisma.CustomerAccountEntryGetPayload<{
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
    invoicePaymentAllocations: true;
    paymentInvoiceAllocations: true;
  };
}>;

type CustomerAccountJournalLink = {
  id: string;
  journalNo: string;
};

export type ErpArApDocumentsWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  metrics: {
    draftDocuments: number;
    postedDocuments: number;
    customerStatementCount: number;
    supplierStatementCount: number;
    customerBalance: number;
    supplierBalance: number;
    overdueBalance: number;
  };
  statementPartyRows: Array<{
    partyType: string;
    partyNo: string;
    partyName: string;
    documentCount: number;
    settlementCount: number;
    debitAmount: number;
    creditAmount: number;
    balanceAmount: number;
    lastTransactionDate: string | null;
    status: string;
  }>;
  statementLineRows: Array<{
    transactionId: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    transactionDate: string;
    referenceNo: string;
    documentType: string;
    sourceType: string;
    memo: string | null;
    debitAmount: number;
    creditAmount: number;
    balanceImpact: number;
    runningBalance: number;
    journalEntryId: string | null;
    journalNo: string | null;
    status: string;
  }>;
  agingRows: Array<{
    documentId: string;
    documentNo: string;
    documentType: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    documentDate: string;
    dueDate: string | null;
    daysOverdue: number;
    agingBucket: string;
    originalAmount: number;
    settledAmount: number;
    debitOpenAmount: number;
    creditOpenAmount: number;
    openAmount: number;
    journalEntryId: string | null;
    journalNo: string | null;
    status: string;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;
const deletedStatus = RecordStatus.DELETED;
const creditDocumentTypes = new Set(["CUSTOMER_CREDIT_NOTE", "SUPPLIER_CREDIT_NOTE"]);

function roundMoney(value: number) {
  return Number(value.toFixed(2));
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

function isSupplierDocument(document: Pick<ArApDocument, "partyType" | "documentDirection">) {
  return document.partyType === "SUPPLIER" || document.documentDirection === "PURCHASE";
}

function isCreditDocument(documentType: string) {
  return creditDocumentTypes.has(documentType);
}

function postedReduction(document: ArApDocument) {
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

function documentDebitCredit(document: ArApDocument) {
  const amount = Number(document.totalAmount);
  const supplier = isSupplierDocument(document);
  const creditDocument = isCreditDocument(document.documentType);

  if (supplier) {
    return creditDocument
      ? { debitAmount: roundMoney(amount), creditAmount: 0 }
      : { debitAmount: 0, creditAmount: roundMoney(amount) };
  }

  return creditDocument
    ? { debitAmount: 0, creditAmount: roundMoney(amount) }
    : { debitAmount: roundMoney(amount), creditAmount: 0 };
}

function allocationDebitCredit(allocation: ArApDocument["settlementAllocations"][number]) {
  const amount = roundMoney(
    Number(allocation.amount) + Number(allocation.discountAmount) + Number(allocation.writeOffAmount)
  );

  return allocation.partyType === "SUPPLIER" || allocation.allocationType === "SUPPLIER_PAYMENT"
    ? { debitAmount: amount, creditAmount: 0 }
    : { debitAmount: 0, creditAmount: amount };
}

function balanceImpact(partyType: string, debitAmount: number, creditAmount: number) {
  return partyType === "SUPPLIER"
    ? roundMoney(creditAmount - debitAmount)
    : roundMoney(debitAmount - creditAmount);
}

function customerAccountReference(entry: ArApCustomerAccountEntry) {
  return entry.transactionNoSnapshot ?? `CAE-${entry.id.slice(0, 8).toUpperCase()}`;
}

function customerAccountMemo(entry: ArApCustomerAccountEntry) {
  const branch = entry.store ? `${entry.store.name} (${entry.store.code})` : "Enterprise";

  return entry.note ?? `${entry.entryType.replace(/_/g, " ")} from ${branch}.`;
}

function statementLineSortRank(line: {
  sourceType: string;
  balanceImpact: number;
}) {
  if (line.sourceType === "DOCUMENT") {
    return 0;
  }

  if (line.sourceType === "CUSTOMER_ACCOUNT") {
    return line.balanceImpact >= 0 ? 0 : 1;
  }

  if (line.sourceType === "SETTLEMENT") {
    return 1;
  }

  return 2;
}

async function getArApDocumentsContext(): Promise<ArApDocumentsContext | null> {
  const enterpriseNode = await prisma.syncNode.findFirst({
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

async function getPrimaryCompany(context: ArApDocumentsContext) {
  return prisma.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

function buildUnavailableErpArApDocumentsWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpArApDocumentsWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    metrics: {
      draftDocuments: 0,
      postedDocuments: 0,
      customerStatementCount: 0,
      supplierStatementCount: 0,
      customerBalance: 0,
      supplierBalance: 0,
      overdueBalance: 0
    },
    statementPartyRows: [],
    statementLineRows: [],
    agingRows: []
  };
}

export { buildUnavailableErpArApDocumentsWorkspace };

function buildStatementLines(
  documents: ArApDocument[],
  customerAccountEntries: ArApCustomerAccountEntry[],
  customerAccountJournalByReference: Map<string, CustomerAccountJournalLink>
) {
  const documentLines = documents
    .filter((document) => document.status === "POSTED")
    .flatMap((document) => {
      const documentAmounts = documentDebitCredit(document);
      const documentImpact = balanceImpact(
        document.partyType,
        documentAmounts.debitAmount,
        documentAmounts.creditAmount
      );
      const documentLine = {
        transactionId: document.id,
        partyType: document.partyType,
        partyNo: document.partyNo,
        partyName: document.partyName,
        transactionDate: document.postingDate.toISOString(),
        referenceNo: document.documentNo,
        documentType: document.documentType,
        sourceType: "DOCUMENT",
        memo: document.memo,
        debitAmount: documentAmounts.debitAmount,
        creditAmount: documentAmounts.creditAmount,
        balanceImpact: documentImpact,
        runningBalance: 0,
        journalEntryId: document.postingJournalEntryId,
        journalNo: document.postingJournalEntry?.journalNo ?? null,
        status: document.status
      };
      const allocationLines = document.settlementAllocations
        .filter((allocation) => allocation.status === "POSTED")
        .map((allocation) => {
          const allocationAmounts = allocationDebitCredit(allocation);

          return {
            transactionId: allocation.id,
            partyType: allocation.partyType,
            partyNo: allocation.partyNo,
            partyName: allocation.partyName,
            transactionDate: allocation.postingDate.toISOString(),
            referenceNo: allocation.allocationNo,
            documentType: allocation.allocationType,
            sourceType: "SETTLEMENT",
            memo: allocation.memo,
            debitAmount: allocationAmounts.debitAmount,
            creditAmount: allocationAmounts.creditAmount,
            balanceImpact: balanceImpact(
              allocation.partyType,
              allocationAmounts.debitAmount,
              allocationAmounts.creditAmount
            ),
            runningBalance: 0,
            journalEntryId: allocation.postingJournalEntryId,
            journalNo: allocation.postingJournalEntry?.journalNo ?? null,
            status: allocation.status
          };
        });

      return [documentLine, ...allocationLines];
    });
  const customerAccountLines = customerAccountEntries
    .filter((entry) => Number(entry.receivableDeltaAmount) !== 0)
    .map((entry) => {
      const receivableDeltaAmount = roundMoney(Number(entry.receivableDeltaAmount));
      const debitAmount = receivableDeltaAmount > 0 ? receivableDeltaAmount : 0;
      const creditAmount = receivableDeltaAmount < 0 ? Math.abs(receivableDeltaAmount) : 0;
      const journal = customerAccountJournalByReference.get(customerAccountReference(entry)) ?? null;

      return {
        transactionId: entry.id,
        partyType: "CUSTOMER",
        partyNo: entry.customer.customerNo,
        partyName: entry.customer.fullName,
        transactionDate: entry.occurredAt.toISOString(),
        referenceNo: customerAccountReference(entry),
        documentType: entry.entryType,
        sourceType: "CUSTOMER_ACCOUNT",
        memo: customerAccountMemo(entry),
        debitAmount,
        creditAmount,
        balanceImpact: roundMoney(debitAmount - creditAmount),
        runningBalance: 0,
        journalEntryId: journal?.id ?? null,
        journalNo: journal?.journalNo ?? null,
        status: "POSTED"
      };
    });
  const lines = [...documentLines, ...customerAccountLines]
    .sort(
      (left, right) =>
        left.partyType.localeCompare(right.partyType) ||
        left.partyNo.localeCompare(right.partyNo) ||
        left.transactionDate.localeCompare(right.transactionDate) ||
        statementLineSortRank(left) - statementLineSortRank(right) ||
        left.referenceNo.localeCompare(right.referenceNo)
    );
  const runningBalances = new Map<string, number>();

  return lines.map((line) => {
    const key = `${line.partyType}:${line.partyNo}`;
    const runningBalance = roundMoney((runningBalances.get(key) ?? 0) + line.balanceImpact);
    runningBalances.set(key, runningBalance);

    return {
      ...line,
      runningBalance
    };
  });
}

function buildStatementPartyRows(statementLineRows: ErpArApDocumentsWorkspaceData["statementLineRows"]) {
  const rowsByParty = new Map<string, ErpArApDocumentsWorkspaceData["statementPartyRows"][number]>();

  for (const line of statementLineRows) {
    const key = `${line.partyType}:${line.partyNo}`;
    const current =
      rowsByParty.get(key) ??
      ({
        partyType: line.partyType,
        partyNo: line.partyNo,
        partyName: line.partyName,
        documentCount: 0,
        settlementCount: 0,
        debitAmount: 0,
        creditAmount: 0,
        balanceAmount: 0,
        lastTransactionDate: null,
        status: "OPEN"
      } satisfies ErpArApDocumentsWorkspaceData["statementPartyRows"][number]);

    current.documentCount += line.sourceType === "DOCUMENT" ? 1 : 0;
    current.settlementCount += line.sourceType === "SETTLEMENT" ? 1 : 0;
    current.debitAmount = roundMoney(current.debitAmount + line.debitAmount);
    current.creditAmount = roundMoney(current.creditAmount + line.creditAmount);
    current.balanceAmount = roundMoney(current.balanceAmount + line.balanceImpact);
    current.lastTransactionDate =
      !current.lastTransactionDate || current.lastTransactionDate < line.transactionDate
        ? line.transactionDate
        : current.lastTransactionDate;
    current.status = Math.abs(current.balanceAmount) < 0.01 ? "SETTLED" : "OPEN";
    rowsByParty.set(key, current);
  }

  return Array.from(rowsByParty.values()).sort(
    (left, right) =>
      left.partyType.localeCompare(right.partyType) ||
      right.balanceAmount - left.balanceAmount ||
      left.partyNo.localeCompare(right.partyNo)
  );
}

function buildDocumentAgingRows(documents: ArApDocument[]) {
  const today = new Date();

  return documents
    .filter((document) => document.status === "POSTED")
    .map((document) => {
      const supplier = isSupplierDocument(document);
      const creditDocument = isCreditDocument(document.documentType);
      const originalAmount = roundMoney(Number(document.totalAmount));
      const settledAmount = creditDocument ? 0 : postedReduction(document);
      const openAmount = roundMoney((creditDocument ? -originalAmount : originalAmount) - settledAmount);
      const dueDate = document.dueDate ?? document.documentDate;
      const daysOverdue = Math.max(0, daysBetween(dueDate, today));
      const debitOpenAmount = supplier
        ? roundMoney(Math.max(0, -openAmount))
        : roundMoney(Math.max(0, openAmount));
      const creditOpenAmount = supplier
        ? roundMoney(Math.max(0, openAmount))
        : roundMoney(Math.max(0, -openAmount));

      return {
        documentId: document.id,
        documentNo: document.documentNo,
        documentType: document.documentType,
        partyType: document.partyType,
        partyNo: document.partyNo,
        partyName: document.partyName,
        documentDate: document.documentDate.toISOString(),
        dueDate: document.dueDate?.toISOString() ?? null,
        daysOverdue,
        agingBucket: agingBucket(daysOverdue),
        originalAmount,
        settledAmount,
        debitOpenAmount,
        creditOpenAmount,
        openAmount,
        journalEntryId: document.postingJournalEntryId,
        journalNo: document.postingJournalEntry?.journalNo ?? null,
        status: Math.abs(openAmount) < 0.01 ? "SETTLED" : openAmount < 0 ? "CREDIT" : "OPEN"
      };
    })
    .filter((row) => Math.abs(row.openAmount) >= 0.01)
    .sort(
      (left, right) =>
        right.daysOverdue - left.daysOverdue ||
        left.partyType.localeCompare(right.partyType) ||
        left.partyNo.localeCompare(right.partyNo) ||
        left.documentNo.localeCompare(right.documentNo)
    );
}

function buildCustomerAccountAgingRows(
  customerAccountEntries: ArApCustomerAccountEntry[],
  customerAccountJournalByReference: Map<string, CustomerAccountJournalLink>
) {
  const today = new Date();
  const chargeRows: Array<{
    entry: ArApCustomerAccountEntry;
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
      const documentDate = row.entry.occurredAt;
      const daysOverdue = Math.max(0, daysBetween(documentDate, today));
      const settledAmount = roundMoney(row.originalAmount - row.remainingAmount);
      const journal = customerAccountJournalByReference.get(customerAccountReference(row.entry)) ?? null;

      return {
        documentId: row.entry.id,
        documentNo: customerAccountReference(row.entry),
        documentType: row.entry.entryType,
        partyType: "CUSTOMER",
        partyNo: row.entry.customer.customerNo,
        partyName: row.entry.customer.fullName,
        documentDate: documentDate.toISOString(),
        dueDate: null,
        daysOverdue,
        agingBucket: agingBucket(daysOverdue),
        originalAmount: row.originalAmount,
        settledAmount,
        debitOpenAmount: row.remainingAmount,
        creditOpenAmount: 0,
        openAmount: row.remainingAmount,
        journalEntryId: journal?.id ?? null,
        journalNo: journal?.journalNo ?? null,
        status: "OPEN"
      };
    })
    .sort(
      (left, right) =>
        right.daysOverdue - left.daysOverdue ||
        left.partyNo.localeCompare(right.partyNo) ||
        left.documentNo.localeCompare(right.documentNo)
    );
}

function buildAgingRows(
  documents: ArApDocument[],
  customerAccountEntries: ArApCustomerAccountEntry[],
  customerAccountJournalByReference: Map<string, CustomerAccountJournalLink>
) {
  return [
    ...buildDocumentAgingRows(documents),
    ...buildCustomerAccountAgingRows(customerAccountEntries, customerAccountJournalByReference)
  ].sort(
    (left, right) =>
      right.daysOverdue - left.daysOverdue ||
      left.partyType.localeCompare(right.partyType) ||
      left.partyNo.localeCompare(right.partyNo) ||
      left.documentNo.localeCompare(right.documentNo)
  );
}

export async function getErpArApDocumentsWorkspace(): Promise<ErpArApDocumentsWorkspaceData> {
  const context = await getArApDocumentsContext();

  if (!context) {
    return buildUnavailableErpArApDocumentsWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(context);

  if (!company) {
    return buildUnavailableErpArApDocumentsWorkspace(
      "Create a company in Finance foundation before reviewing AR/AP documents.",
      context.retailOrg.baseCurrencyCode
    );
  }

  const [documents, customerAccountEntries] = await Promise.all([
    prisma.erpOperationalDocument.findMany({
      where: {
        companyId: company.id,
        status: {
          not: deletedStatus
        }
      },
      orderBy: [{ postingDate: "desc" }, { documentNo: "desc" }],
      include: {
        postingJournalEntry: {
          select: {
            journalNo: true
          }
        },
        settlementAllocations: {
          where: {
            status: {
              not: deletedStatus
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
    }),
    prisma.customerAccountEntry.findMany({
      where: {
        retailOrgId: context.retailOrgId,
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
        invoicePaymentAllocations: true,
        paymentInvoiceAllocations: true
      }
    })
  ]);
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

  const statementLineRows = buildStatementLines(
    documents,
    customerAccountEntries,
    customerAccountJournalByReference
  );
  const statementPartyRows = buildStatementPartyRows(statementLineRows);
  const agingRows = buildAgingRows(documents, customerAccountEntries, customerAccountJournalByReference);

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "AR/AP statements and aging are derived from posted operational documents, settlements, and customer account receivable activity.",
    refreshedAt: new Date().toISOString(),
    metrics: {
      draftDocuments: documents.filter((document) => document.status === "DRAFT").length,
      postedDocuments:
        documents.filter((document) => document.status === "POSTED").length +
        customerAccountEntries.filter((entry) => Number(entry.receivableDeltaAmount) > 0).length,
      customerStatementCount: statementPartyRows.filter((row) => row.partyType === "CUSTOMER").length,
      supplierStatementCount: statementPartyRows.filter((row) => row.partyType === "SUPPLIER").length,
      customerBalance: roundMoney(
        statementPartyRows
          .filter((row) => row.partyType === "CUSTOMER")
          .reduce((sum, row) => sum + row.balanceAmount, 0)
      ),
      supplierBalance: roundMoney(
        statementPartyRows
          .filter((row) => row.partyType === "SUPPLIER")
          .reduce((sum, row) => sum + row.balanceAmount, 0)
      ),
      overdueBalance: roundMoney(
        agingRows
          .filter((row) => row.daysOverdue > 0)
          .reduce((sum, row) => sum + Math.abs(row.openAmount), 0)
      )
    },
    statementPartyRows,
    statementLineRows,
    agingRows
  };
}

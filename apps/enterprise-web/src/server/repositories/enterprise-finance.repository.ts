import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  getEnterpriseCurrencyCode,
  resolveEnterpriseCurrencyCode
} from "@/server/repositories/enterprise-currency";
import {
  assertEnterpriseDatabaseReady,
  isEnterpriseDatabaseSchemaNotReadyError
} from "@/server/readiness/enterprise-database-readiness";
import {
  GlAccountType,
  GlJournalStatus,
  GlNormalBalance,
  InventoryMovementType,
  OperatingExpenseStatus,
  PaymentMethod,
  PosTransactionStatus,
  PosTransactionType,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


type FinanceFilters = {
  dateFrom: string;
  dateTo: string;
  storeCode: string;
};

type GlAccountDefinition = {
  code: string;
  name: string;
  accountType: GlAccountType;
  normalBalance: GlNormalBalance;
  description: string;
};

type JournalDraftLine = {
  accountCode: string;
  storeId: string | null;
  debitAmount: number;
  creditAmount: number;
  memo: string;
};

const standardChartOfAccounts: GlAccountDefinition[] = [
  {
    code: "1000",
    name: "Cash",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Cash on hand and primary cash clearing."
  },
  {
    code: "1100",
    name: "Accounts Receivable",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Customer receivables control account."
  },
  {
    code: "1200",
    name: "Inventory",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Inventory and stocked item value."
  },
  {
    code: "2000",
    name: "Accounts Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    description: "Supplier and vendor payable control account."
  },
  {
    code: "2100",
    name: "Sales Tax Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    description: "Sales tax collected and payable."
  },
  {
    code: "4000",
    name: "Sales Revenue",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    description: "Revenue from sales of goods."
  },
  {
    code: "5000",
    name: "Cost of Goods Sold",
    accountType: GlAccountType.COST_OF_SALES,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Cost of goods sold."
  },
  {
    code: "5100",
    name: "Purchases",
    accountType: GlAccountType.COST_OF_SALES,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Purchases of goods for resale or use."
  },
  {
    code: "8000",
    name: "Other Expenses",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    description: "Other expenses."
  }
];

const cogsMovementTypes = [InventoryMovementType.SALE, InventoryMovementType.RETURN];
const receiptMovementTypes = [
  InventoryMovementType.GOODS_RECEIPT,
  InventoryMovementType.RETURN_TO_VENDOR
];
const adjustmentMovementTypes = [
  InventoryMovementType.ADJUSTMENT_POSITIVE,
  InventoryMovementType.ADJUSTMENT_NEGATIVE,
  InventoryMovementType.COUNT_VARIANCE
];

export type EnterpriseFinanceWorkspaceData = {
  currencyCode: string;
  retailOrgName: string;
  filters: FinanceFilters;
  metrics: {
    accounts: number;
    postedJournals: number;
    postedDebit: number;
    postedCredit: number;
    imbalanceAmount: number;
    missingPostings: number;
    salesJournals: number;
    inventoryJournals: number;
    operatingExpenses: number;
  };
  accountRows: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    debitAmount: number;
    creditAmount: number;
    balanceAmount: number;
    externalCode: string | null;
    status: string;
  }>;
  journalRows: Array<{
    journalEntryId: string;
    journalNo: string;
    sourceType: string;
    sourceReference: string | null;
    postingDate: string;
    description: string;
    status: string;
    debitAmount: number;
    creditAmount: number;
    lineCount: number;
  }>;
  journalLineRows: Array<{
    journalLineId: string;
    journalNo: string;
    postingDate: string;
    accountCode: string;
    accountName: string;
    storeCode: string | null;
    storeName: string | null;
    debitAmount: number;
    creditAmount: number;
    memo: string | null;
  }>;
  trialBalanceRows: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    debitAmount: number;
    creditAmount: number;
    balanceAmount: number;
  }>;
  postingCoverageRows: Array<{
    source: string;
    expectedCount: number;
    postedCount: number;
    missingCount: number;
    status: "complete" | "review";
  }>;
  expenseRows: Array<{
    expenseId: string;
    expenseNo: string;
    expenseDate: string;
    storeCode: string | null;
    storeName: string | null;
    category: string;
    description: string;
    supplierName: string | null;
    paymentMethod: string | null;
    externalReference: string | null;
    amount: number;
    taxAmount: number;
    status: string;
    approvedBy: string | null;
    approvedAt: string | null;
    postedAt: string | null;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

type EnterpriseContext = {
  retailOrgId: string;
  retailOrgName: string;
  currencyCode: string;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function defaultFinanceFilters(input?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  storeCode?: string | null;
}): FinanceFilters {
  return {
    dateFrom: input?.dateFrom?.trim() ?? "",
    dateTo: input?.dateTo?.trim() ?? "",
    storeCode: input?.storeCode?.trim() ?? ""
  };
}

function parseDate(value: string, endOfDay = false) {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function buildDateRangeFilter(dateFrom: string, dateTo: string) {
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo, true);

  if (!from && !to) {
    return null;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {})
  };
}

function buildStoreRelationFilter(storeCode: string) {
  return storeCode
    ? {
        store: {
          code: {
            equals: storeCode
          }
        }
      }
    : {};
}

function buildSignedPair(input: {
  lines: JournalDraftLine[];
  debitAccountCode: string;
  creditAccountCode: string;
  amount: number;
  storeId: string | null;
  memo: string;
}) {
  const amount = roundMoney(input.amount);

  if (amount === 0) {
    return;
  }

  if (amount > 0) {
    input.lines.push({
      accountCode: input.debitAccountCode,
      storeId: input.storeId,
      debitAmount: amount,
      creditAmount: 0,
      memo: input.memo
    });
    input.lines.push({
      accountCode: input.creditAccountCode,
      storeId: input.storeId,
      debitAmount: 0,
      creditAmount: amount,
      memo: input.memo
    });
    return;
  }

  input.lines.push({
    accountCode: input.creditAccountCode,
    storeId: input.storeId,
    debitAmount: Math.abs(amount),
    creditAmount: 0,
    memo: input.memo
  });
  input.lines.push({
    accountCode: input.debitAccountCode,
    storeId: input.storeId,
    debitAmount: 0,
    creditAmount: Math.abs(amount),
    memo: input.memo
  });
}

function addLine(input: {
  lines: JournalDraftLine[];
  accountCode: string;
  storeId: string | null;
  debitAmount?: number;
  creditAmount?: number;
  memo: string;
}) {
  const debitAmount = roundMoney(input.debitAmount ?? 0);
  const creditAmount = roundMoney(input.creditAmount ?? 0);

  if (debitAmount === 0 && creditAmount === 0) {
    return;
  }

  input.lines.push({
    accountCode: input.accountCode,
    storeId: input.storeId,
    debitAmount,
    creditAmount,
    memo: input.memo
  });
}

function buildJournalNo(sourceType: string, sourceId: string) {
  return `${sourceType}-${sourceId}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function buildUnavailableEnterpriseFinanceWorkspace(
  reason: string,
  input?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    storeCode?: string | null;
  },
  currencyCode = "USD"
): EnterpriseFinanceWorkspaceData {
  return {
    currencyCode,
    retailOrgName: "Flash ERP",
    filters: defaultFinanceFilters(input),
    metrics: {
      accounts: 0,
      postedJournals: 0,
      postedDebit: 0,
      postedCredit: 0,
      imbalanceAmount: 0,
      missingPostings: 0,
      salesJournals: 0,
      inventoryJournals: 0,
      operatingExpenses: 0
    },
    accountRows: [],
    journalRows: [],
    journalLineRows: [],
    trialBalanceRows: [],
    postingCoverageRows: [],
    expenseRows: [],
    postureMessages: [
      reason,
      "Once the enterprise database is available, Flash ERP will project sales and stock movement facts into HQ GL journals."
    ],
    priorities: ["Run the enterprise database migration so the HQ chart of accounts and journal tables are available."],
    statusMessage: "Finance workspace is waiting for the enterprise database.",
    refreshedAt: new Date().toISOString()
  };
}

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
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
          name: true,
          baseCurrencyCode: true,
          companySettingsJson: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  return {
    retailOrgId: enterpriseNode.retailOrgId,
    retailOrgName: enterpriseNode.retailOrg.name,
    currencyCode: resolveEnterpriseCurrencyCode(enterpriseNode.retailOrg)
  };
}

async function ensureStandardChartOfAccounts(retailOrgId: string) {
  const accounts = await Promise.all(
    standardChartOfAccounts.map((definition) =>
      prisma.glAccount.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId,
            code: definition.code
          }
        },
        update: {
          name: definition.name,
          accountType: definition.accountType,
          normalBalance: definition.normalBalance,
          description: definition.description,
          status: RecordStatus.ACTIVE
        },
        create: {
          retailOrgId,
          code: definition.code,
          name: definition.name,
          accountType: definition.accountType,
          normalBalance: definition.normalBalance,
          description: definition.description,
          status: RecordStatus.ACTIVE
        }
      })
    )
  );

  return new Map(accounts.map((account) => [account.code, account]));
}

async function createJournalEntryIfMissing(input: {
  retailOrgId: string;
  accountsByCode: Awaited<ReturnType<typeof ensureStandardChartOfAccounts>>;
  sourceType: string;
  sourceId: string;
  sourceReference: string | null;
  postingDate: Date;
  description: string;
  lines: JournalDraftLine[];
}) {
  const validLines = input.lines.filter((line) => line.debitAmount > 0 || line.creditAmount > 0);
  const debitTotal = roundMoney(validLines.reduce((sum, line) => sum + line.debitAmount, 0));
  const creditTotal = roundMoney(validLines.reduce((sum, line) => sum + line.creditAmount, 0));

  if (validLines.length === 0 || Math.abs(debitTotal - creditTotal) > 0.01) {
    return false;
  }

  const existing = await prisma.glJournalEntry.findUnique({
    where: {
      retailOrgId_sourceType_sourceId: {
        retailOrgId: input.retailOrgId,
        sourceType: input.sourceType,
        sourceId: input.sourceId
      }
    },
    select: {
      id: true
    }
  });

  if (existing) {
    return false;
  }

  await prisma.glJournalEntry.create({
    data: {
      retailOrgId: input.retailOrgId,
      journalNo: buildJournalNo(input.sourceType, input.sourceId),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceReference: input.sourceReference,
      postingDate: input.postingDate,
      description: input.description,
      status: GlJournalStatus.POSTED,
      lines: {
        create: validLines.map((line) => {
          const account = input.accountsByCode.get(line.accountCode);

          if (!account) {
            throw new Error(`Flash ERP GL account ${line.accountCode} is not available.`);
          }

          return {
            accountId: account.id,
            storeId: line.storeId,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            memo: line.memo
          };
        })
      }
    }
  });

  return true;
}

async function materializeSalesJournals(input: {
  retailOrgId: string;
  accountsByCode: Awaited<ReturnType<typeof ensureStandardChartOfAccounts>>;
  filters: FinanceFilters;
}) {
  const completedAtFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);
  const transactions = await prisma.posTransaction.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      status: PosTransactionStatus.COMPLETED,
      deletedAt: null,
      ...(completedAtFilter ? { completedAt: completedAtFilter } : {}),
      ...buildStoreRelationFilter(input.filters.storeCode)
    },
    orderBy: {
      completedAt: "desc"
    },
    take: 1000,
    select: {
      id: true,
      transactionNo: true,
      sourceTransactionNo: true,
      transactionType: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      completedAt: true,
      storeId: true,
      store: {
        select: {
          name: true
        }
      }
    }
  });

  let created = 0;

  for (const transaction of transactions) {
    const postingDate = transaction.completedAt ?? new Date();
    const totalAmount = Math.abs(Number(transaction.totalAmount));
    const paidNetAmount = Math.max(
      0,
      Math.min(totalAmount, Number(transaction.paidAmount) - Number(transaction.changeAmount))
    );
    const receivableAmount = roundMoney(Math.max(0, totalAmount - paidNetAmount));
    const taxAmount = roundMoney(Math.abs(Number(transaction.taxAmount)));
    const netSalesAmount = roundMoney(Math.max(0, totalAmount - taxAmount));
    const isReturn = transaction.transactionType === PosTransactionType.RETURN;
    const lines: JournalDraftLine[] = [];
    const memo = `${transaction.store.name} ${formatEnumLabel(transaction.transactionType)} ${transaction.transactionNo}`;

    if (isReturn) {
      addLine({
        lines,
        accountCode: "4000",
        storeId: transaction.storeId,
        debitAmount: netSalesAmount,
        memo
      });
      addLine({
        lines,
        accountCode: "2100",
        storeId: transaction.storeId,
        debitAmount: taxAmount,
        memo
      });
      addLine({
        lines,
        accountCode: "1000",
        storeId: transaction.storeId,
        creditAmount: totalAmount,
        memo
      });
    } else {
      addLine({
        lines,
        accountCode: "1000",
        storeId: transaction.storeId,
        debitAmount: paidNetAmount,
        memo
      });
      addLine({
        lines,
        accountCode: "1100",
        storeId: transaction.storeId,
        debitAmount: receivableAmount,
        memo
      });
      addLine({
        lines,
        accountCode: "4000",
        storeId: transaction.storeId,
        creditAmount: netSalesAmount,
        memo
      });
      addLine({
        lines,
        accountCode: "2100",
        storeId: transaction.storeId,
        creditAmount: taxAmount,
        memo
      });
    }

    const wasCreated = await createJournalEntryIfMissing({
      retailOrgId: input.retailOrgId,
      accountsByCode: input.accountsByCode,
      sourceType: "POS_SALE",
      sourceId: transaction.id,
      sourceReference: transaction.sourceTransactionNo ?? transaction.transactionNo,
      postingDate,
      description: `POS ${formatEnumLabel(transaction.transactionType)} ${transaction.transactionNo}`,
      lines
    });

    if (wasCreated) {
      created += 1;
    }
  }

  return created;
}

async function materializeInventoryJournals(input: {
  retailOrgId: string;
  accountsByCode: Awaited<ReturnType<typeof ensureStandardChartOfAccounts>>;
  filters: FinanceFilters;
}) {
  const occurredAtFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);
  const ledgerEntries = await prisma.inventoryLedgerEntry.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      movementType: {
        in: [...cogsMovementTypes, ...receiptMovementTypes, ...adjustmentMovementTypes]
      },
      ...(occurredAtFilter ? { occurredAt: occurredAtFilter } : {}),
      ...buildStoreRelationFilter(input.filters.storeCode)
    },
    orderBy: {
      occurredAt: "desc"
    },
    take: 2000,
    select: {
      id: true,
      storeId: true,
      movementType: true,
      quantity: true,
      unitCost: true,
      referenceType: true,
      referenceId: true,
      externalReference: true,
      occurredAt: true,
      inventoryLocation: {
        select: {
          code: true,
          name: true,
          store: {
            select: {
              name: true
            }
          }
        }
      },
      product: {
        select: {
          code: true,
          name: true,
          baseCostPrice: true
        }
      }
    }
  });

  let created = 0;

  for (const entry of ledgerEntries) {
    const quantity = Number(entry.quantity);
    const unitCost = Number(entry.unitCost ?? entry.product.baseCostPrice ?? 0);
    const amount = roundMoney(Math.abs(quantity) * unitCost);

    if (amount <= 0) {
      continue;
    }

    const locationLabel = entry.inventoryLocation.store?.name ?? entry.inventoryLocation.name;
    const memo = `${locationLabel} ${formatEnumLabel(entry.movementType)} ${entry.product.code}`;
    const lines: JournalDraftLine[] = [];
    let sourceType = "INVENTORY_ADJUSTMENT";
    let description = `${formatEnumLabel(entry.movementType)} ${entry.product.name}`;

    if (entry.movementType === InventoryMovementType.SALE) {
      sourceType = "INVENTORY_COGS";
      buildSignedPair({
        lines,
        debitAccountCode: "5000",
        creditAccountCode: "1200",
        amount,
        storeId: entry.storeId,
        memo
      });
      description = `COGS for ${entry.product.name}`;
    } else if (entry.movementType === InventoryMovementType.RETURN) {
      sourceType = "INVENTORY_COGS";
      buildSignedPair({
        lines,
        debitAccountCode: "5000",
        creditAccountCode: "1200",
        amount: -amount,
        storeId: entry.storeId,
        memo
      });
      description = `COGS reversal for ${entry.product.name}`;
    } else if (entry.movementType === InventoryMovementType.GOODS_RECEIPT) {
      sourceType = "INVENTORY_RECEIPT";
      buildSignedPair({
        lines,
        debitAccountCode: "1200",
        creditAccountCode: "2000",
        amount,
        storeId: entry.storeId,
        memo
      });
      description = `Goods receipt for ${entry.product.name}`;
    } else if (entry.movementType === InventoryMovementType.RETURN_TO_VENDOR) {
      sourceType = "INVENTORY_RECEIPT";
      buildSignedPair({
        lines,
        debitAccountCode: "2000",
        creditAccountCode: "1200",
        amount,
        storeId: entry.storeId,
        memo
      });
      description = `Return to vendor for ${entry.product.name}`;
    } else {
      buildSignedPair({
        lines,
        debitAccountCode: "1200",
        creditAccountCode: "5100",
        amount: quantity >= 0 ? amount : -amount,
        storeId: entry.storeId,
        memo
      });
    }

    const wasCreated = await createJournalEntryIfMissing({
      retailOrgId: input.retailOrgId,
      accountsByCode: input.accountsByCode,
      sourceType,
      sourceId: entry.id,
      sourceReference: entry.externalReference ?? `${entry.referenceType}:${entry.referenceId}`,
      postingDate: entry.occurredAt,
      description,
      lines
    });

    if (wasCreated) {
      created += 1;
    }
  }

  return created;
}

async function materializeOperatingExpenseJournals(input: {
  retailOrgId: string;
  accountsByCode: Awaited<ReturnType<typeof ensureStandardChartOfAccounts>>;
  filters: FinanceFilters;
}) {
  const expenseDateFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);
  const expenses = await prisma.operatingExpense.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      status: {
        in: [OperatingExpenseStatus.APPROVED, OperatingExpenseStatus.POSTED]
      },
      ...(expenseDateFilter ? { expenseDate: expenseDateFilter } : {}),
      ...buildStoreRelationFilter(input.filters.storeCode)
    },
    orderBy: {
      expenseDate: "desc"
    },
    take: 1000,
    select: {
      id: true,
      expenseNo: true,
      expenseDate: true,
      storeId: true,
      category: true,
      description: true,
      supplierName: true,
      paymentMethod: true,
      amount: true,
      taxAmount: true
    }
  });

  let created = 0;

  for (const expense of expenses) {
    const amount = roundMoney(Number(expense.amount));
    const taxAmount = roundMoney(Number(expense.taxAmount));
    const totalAmount = roundMoney(amount + taxAmount);
    const memo = `${expense.category} ${expense.expenseNo}`;
    const clearingAccount = expense.paymentMethod ? "1000" : "2000";
    const lines: JournalDraftLine[] = [];

    addLine({
      lines,
      accountCode: "8000",
      storeId: expense.storeId,
      debitAmount: amount,
      memo
    });
    addLine({
      lines,
      accountCode: "2100",
      storeId: expense.storeId,
      debitAmount: taxAmount,
      memo
    });
    addLine({
      lines,
      accountCode: clearingAccount,
      storeId: expense.storeId,
      creditAmount: totalAmount,
      memo
    });

    const wasCreated = await createJournalEntryIfMissing({
      retailOrgId: input.retailOrgId,
      accountsByCode: input.accountsByCode,
      sourceType: "OPERATING_EXPENSE",
      sourceId: expense.id,
      sourceReference: expense.expenseNo,
      postingDate: expense.expenseDate,
      description: expense.description,
      lines
    });

    if (wasCreated) {
      created += 1;
    }
  }

  return created;
}

async function materializeGlPostings(input: {
  retailOrgId: string;
  filters: FinanceFilters;
}) {
  const accountsByCode = await ensureStandardChartOfAccounts(input.retailOrgId);
  const [salesCreated, inventoryCreated, expenseCreated] = await Promise.all([
    materializeSalesJournals({
      retailOrgId: input.retailOrgId,
      accountsByCode,
      filters: input.filters
    }),
    materializeInventoryJournals({
      retailOrgId: input.retailOrgId,
      accountsByCode,
      filters: input.filters
    }),
    materializeOperatingExpenseJournals({
      retailOrgId: input.retailOrgId,
      accountsByCode,
      filters: input.filters
    })
  ]);

  return {
    accountsByCode,
    salesCreated,
    inventoryCreated,
    expenseCreated
  };
}

function buildJournalWhere(input: {
  retailOrgId: string;
  filters: FinanceFilters;
}): Prisma.GlJournalEntryWhereInput {
  const postingDateFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);

  return {
    retailOrgId: input.retailOrgId,
    status: GlJournalStatus.POSTED,
    ...(postingDateFilter ? { postingDate: postingDateFilter } : {}),
    ...(input.filters.storeCode
      ? {
          lines: {
            some: {
              store: {
                code: {
                  equals: input.filters.storeCode
                }
              }
            }
          }
        }
      : {})
  };
}

async function countExpectedSources(input: {
  retailOrgId: string;
  filters: FinanceFilters;
  movementTypes?: InventoryMovementType[];
}) {
  const rangeFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);

  if (input.movementTypes) {
    return prisma.inventoryLedgerEntry.count({
      where: {
        retailOrgId: input.retailOrgId,
        movementType: {
          in: input.movementTypes
        },
        ...(rangeFilter ? { occurredAt: rangeFilter } : {}),
        ...buildStoreRelationFilter(input.filters.storeCode)
      }
    });
  }

  return prisma.posTransaction.count({
    where: {
      retailOrgId: input.retailOrgId,
      status: PosTransactionStatus.COMPLETED,
      deletedAt: null,
      ...(rangeFilter ? { completedAt: rangeFilter } : {}),
      ...buildStoreRelationFilter(input.filters.storeCode)
    }
  });
}

async function countPostedSources(input: {
  retailOrgId: string;
  filters: FinanceFilters;
  sourceType: string;
}) {
  return prisma.glJournalEntry.count({
    where: {
      ...buildJournalWhere({
        retailOrgId: input.retailOrgId,
        filters: input.filters
      }),
      sourceType: input.sourceType
    }
  });
}

async function countExpectedOperatingExpenses(input: {
  retailOrgId: string;
  filters: FinanceFilters;
}) {
  const expenseDateFilter = buildDateRangeFilter(input.filters.dateFrom, input.filters.dateTo);

  return prisma.operatingExpense.count({
    where: {
      retailOrgId: input.retailOrgId,
      status: {
        in: [OperatingExpenseStatus.APPROVED, OperatingExpenseStatus.POSTED]
      },
      ...(expenseDateFilter ? { expenseDate: expenseDateFilter } : {}),
      ...buildStoreRelationFilter(input.filters.storeCode)
    }
  });
}

export async function getEnterpriseFinanceWorkspace(input?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  storeCode?: string | null;
}): Promise<EnterpriseFinanceWorkspaceData> {
  const filters = defaultFinanceFilters(input);

  try {
    await assertEnterpriseDatabaseReady();
  } catch (error) {
    if (isEnterpriseDatabaseSchemaNotReadyError(error)) {
      return buildUnavailableEnterpriseFinanceWorkspace(
        error.message,
        input,
        await getEnterpriseCurrencyCode()
      );
    }

    throw error;
  }

  const context = await getEnterpriseContext();

  if (!context) {
    return buildUnavailableEnterpriseFinanceWorkspace(
      "Flash ERP enterprise node is not configured yet.",
      input,
      await getEnterpriseCurrencyCode()
    );
  }

  const materialized = await materializeGlPostings({
    retailOrgId: context.retailOrgId,
    filters
  });
  const journalWhere = buildJournalWhere({
    retailOrgId: context.retailOrgId,
    filters
  });
  const [
    accounts,
    journalEntries,
    salesExpected,
    cogsExpected,
    receiptsExpected,
    adjustmentsExpected,
    salesPosted,
    cogsPosted,
    receiptsPosted,
    adjustmentsPosted,
    expenseExpected,
    expensePosted,
    expenses
  ] = await Promise.all([
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        code: "asc"
      },
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        normalBalance: true,
        externalCode: true,
        status: true,
        journalLines: {
          where: {
            journalEntry: journalWhere
          },
          select: {
            debitAmount: true,
            creditAmount: true
          }
        }
      }
    }),
    prisma.glJournalEntry.findMany({
      where: journalWhere,
      orderBy: {
        postingDate: "desc"
      },
      take: 500,
      select: {
        id: true,
        journalNo: true,
        sourceType: true,
        sourceReference: true,
        postingDate: true,
        description: true,
        status: true,
        lines: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            debitAmount: true,
            creditAmount: true,
            memo: true,
            account: {
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
        }
      }
    }),
    countExpectedSources({ retailOrgId: context.retailOrgId, filters }),
    countExpectedSources({
      retailOrgId: context.retailOrgId,
      filters,
      movementTypes: cogsMovementTypes
    }),
    countExpectedSources({
      retailOrgId: context.retailOrgId,
      filters,
      movementTypes: receiptMovementTypes
    }),
    countExpectedSources({
      retailOrgId: context.retailOrgId,
      filters,
      movementTypes: adjustmentMovementTypes
    }),
    countPostedSources({ retailOrgId: context.retailOrgId, filters, sourceType: "POS_SALE" }),
    countPostedSources({
      retailOrgId: context.retailOrgId,
      filters,
      sourceType: "INVENTORY_COGS"
    }),
    countPostedSources({
      retailOrgId: context.retailOrgId,
      filters,
      sourceType: "INVENTORY_RECEIPT"
    }),
    countPostedSources({
      retailOrgId: context.retailOrgId,
      filters,
      sourceType: "INVENTORY_ADJUSTMENT"
    }),
    countExpectedOperatingExpenses({
      retailOrgId: context.retailOrgId,
      filters
    }),
    countPostedSources({
      retailOrgId: context.retailOrgId,
      filters,
      sourceType: "OPERATING_EXPENSE"
    }),
    prisma.operatingExpense.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        ...(buildDateRangeFilter(filters.dateFrom, filters.dateTo)
          ? { expenseDate: buildDateRangeFilter(filters.dateFrom, filters.dateTo)! }
          : {}),
        ...buildStoreRelationFilter(filters.storeCode)
      },
      orderBy: {
        expenseDate: "desc"
      },
      take: 500,
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
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    })
  ]);

  const journalRows = journalEntries.map((journal) => {
    const debitAmount = roundMoney(
      journal.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
    );
    const creditAmount = roundMoney(
      journal.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
    );

    return {
      journalEntryId: journal.id,
      journalNo: journal.journalNo,
      sourceType: journal.sourceType,
      sourceReference: journal.sourceReference,
      postingDate: journal.postingDate.toISOString(),
      description: journal.description,
      status: journal.status,
      debitAmount,
      creditAmount,
      lineCount: journal.lines.length
    };
  });
  const journalLineRows = journalEntries.flatMap((journal) =>
    journal.lines.map((line) => ({
      journalLineId: line.id,
      journalNo: journal.journalNo,
      postingDate: journal.postingDate.toISOString(),
      accountCode: line.account.code,
      accountName: line.account.name,
      storeCode: line.store?.code ?? null,
      storeName: line.store?.name ?? null,
      debitAmount: roundMoney(Number(line.debitAmount)),
      creditAmount: roundMoney(Number(line.creditAmount)),
      memo: line.memo
    }))
  );
  const accountRows = accounts.map((account) => {
    const debitAmount = roundMoney(
      account.journalLines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
    );
    const creditAmount = roundMoney(
      account.journalLines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
    );
    const balanceAmount = roundMoney(
      account.normalBalance === GlNormalBalance.DEBIT
        ? debitAmount - creditAmount
        : creditAmount - debitAmount
    );

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      debitAmount,
      creditAmount,
      balanceAmount,
      externalCode: account.externalCode,
      status: account.status
    };
  });
  const trialBalanceRows = accountRows.map((account) => ({
    accountCode: account.accountCode,
    accountName: account.accountName,
    accountType: account.accountType,
    debitAmount: account.debitAmount,
    creditAmount: account.creditAmount,
    balanceAmount: account.balanceAmount
  }));
  const postingCoverageRows: EnterpriseFinanceWorkspaceData["postingCoverageRows"] = [
    {
      source: "Completed POS sales",
      expectedCount: salesExpected,
      postedCount: salesPosted,
      missingCount: Math.max(0, salesExpected - salesPosted),
      status: salesExpected <= salesPosted ? "complete" : "review"
    },
    {
      source: "Inventory COGS",
      expectedCount: cogsExpected,
      postedCount: cogsPosted,
      missingCount: Math.max(0, cogsExpected - cogsPosted),
      status: cogsExpected <= cogsPosted ? "complete" : "review"
    },
    {
      source: "Inventory receipts",
      expectedCount: receiptsExpected,
      postedCount: receiptsPosted,
      missingCount: Math.max(0, receiptsExpected - receiptsPosted),
      status: receiptsExpected <= receiptsPosted ? "complete" : "review"
    },
    {
      source: "Inventory adjustments",
      expectedCount: adjustmentsExpected,
      postedCount: adjustmentsPosted,
      missingCount: Math.max(0, adjustmentsExpected - adjustmentsPosted),
      status: adjustmentsExpected <= adjustmentsPosted ? "complete" : "review"
    },
    {
      source: "Operating expenses",
      expectedCount: expenseExpected,
      postedCount: expensePosted,
      missingCount: Math.max(0, expenseExpected - expensePosted),
      status: expenseExpected <= expensePosted ? "complete" : "review"
    }
  ];
  const expenseRows = expenses.map((expense) => ({
    expenseId: expense.id,
    expenseNo: expense.expenseNo,
    expenseDate: expense.expenseDate.toISOString(),
    storeCode: expense.store?.code ?? null,
    storeName: expense.store?.name ?? null,
    category: expense.category,
    description: expense.description,
    supplierName: expense.supplierName,
    paymentMethod: expense.paymentMethod,
    externalReference: expense.externalReference,
    amount: roundMoney(Number(expense.amount)),
    taxAmount: roundMoney(Number(expense.taxAmount)),
    status: expense.status,
    approvedBy: expense.approvedBy,
    approvedAt: expense.approvedAt?.toISOString() ?? null,
    postedAt: expense.postedAt?.toISOString() ?? null
  }));
  const postedDebit = roundMoney(journalRows.reduce((sum, row) => sum + row.debitAmount, 0));
  const postedCredit = roundMoney(journalRows.reduce((sum, row) => sum + row.creditAmount, 0));
  const missingPostings = postingCoverageRows.reduce((sum, row) => sum + row.missingCount, 0);
  const salesJournals = salesPosted;
  const inventoryJournals = cogsPosted + receiptsPosted + adjustmentsPosted;
  const statusMessage =
    missingPostings > 0
      ? `HQ finance posted ${journalRows.length} journal(s), with ${missingPostings} source fact(s) still needing cost or posting review.`
      : `HQ finance posted balanced journals for sales, receipts, COGS, and stock adjustments in the selected scope.`;
  const postureMessages = [
    `${materialized.salesCreated + materialized.inventoryCreated + materialized.expenseCreated} new source posting(s) were materialized during this refresh.`,
    `${salesJournals} POS sales journal(s), ${inventoryJournals} inventory journal(s), and ${expensePosted} expense journal(s) are available for export.`,
    `${postedDebit.toFixed(2)} ${context.currencyCode} debits and ${postedCredit.toFixed(2)} ${context.currencyCode} credits are in scope.`
  ];
  const priorities = [
    ...(missingPostings > 0
      ? ["Review source rows without posted GL journals, especially inventory movements without usable cost."]
      : []),
    ...(Math.abs(postedDebit - postedCredit) > 0.01
      ? ["Investigate GL imbalance before exporting journals to an external accounting system."]
      : []),
    "Map external GL codes on the chart of accounts before enabling automated downstream export."
  ].slice(0, 4);

  return {
    currencyCode: context.currencyCode,
    retailOrgName: context.retailOrgName,
    filters,
    metrics: {
      accounts: accounts.length,
      postedJournals: journalRows.length,
      postedDebit,
      postedCredit,
      imbalanceAmount: roundMoney(postedDebit - postedCredit),
      missingPostings,
      salesJournals,
      inventoryJournals,
      operatingExpenses: expenseRows.length
    },
    accountRows,
    journalRows,
    journalLineRows,
    trialBalanceRows,
    postingCoverageRows,
    expenseRows,
    postureMessages,
    priorities,
    statusMessage,
    refreshedAt: toIsoString(new Date())
  };
}

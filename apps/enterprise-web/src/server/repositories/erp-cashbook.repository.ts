import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type CashbookContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type CashbookAccountWithEntries = Prisma.ErpCashbookAccountGetPayload<{
  include: {
    bankAccount: {
      include: {
        branch: {
          include: {
            bank: true;
          };
        };
      };
    };
    glAccount: true;
    entries: {
      include: {
        postingJournalEntry: {
          select: {
            journalNo: true;
          };
        };
        settlementAllocation: {
          select: {
            allocationNo: true;
          };
        };
      };
    };
  };
}>;

export type UpsertErpCashbookAccountRequest = {
  code?: string | null;
  name?: string | null;
  accountType?: string | null;
  currencyCode?: string | null;
  glAccountCode?: string | null;
  bankAccountId?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  mobileProviderName?: string | null;
  mobileWalletNumber?: string | null;
  pettyCashCustodian?: string | null;
  openingBalance?: number | string | null;
  reconciliationEnabled?: boolean | null;
  isDefault?: boolean | null;
};

export type CreateErpCashbookEntryRequest = {
  cashbookAccountId?: string | null;
  entryType?: string | null;
  direction?: string | null;
  entryDate?: string | null;
  postingDate?: string | null;
  valueDate?: string | null;
  amount?: number | string | null;
  offsetAccountCode?: string | null;
  counterpartyName?: string | null;
  workflowType?: string | null;
  workflowReference?: string | null;
  linkedCashbookAccountId?: string | null;
  linkedCashbookEntryId?: string | null;
  pettyCashCustodian?: string | null;
  providerName?: string | null;
  providerReference?: string | null;
  externalReference?: string | null;
  clearingReference?: string | null;
  memo?: string | null;
  settlementAllocationId?: string | null;
};

export type CreateErpBankTransferRequest = {
  fromCashbookAccountId?: string | null;
  toCashbookAccountId?: string | null;
  transferDate?: string | null;
  postingDate?: string | null;
  valueDate?: string | null;
  amount?: number | string | null;
  externalReference?: string | null;
  clearingReference?: string | null;
  memo?: string | null;
};

export type CreateErpPettyCashRequest = {
  cashbookAccountId?: string | null;
  movementType?: string | null;
  direction?: string | null;
  movementDate?: string | null;
  postingDate?: string | null;
  amount?: number | string | null;
  offsetAccountCode?: string | null;
  custodianName?: string | null;
  externalReference?: string | null;
  memo?: string | null;
};

export type ErpCashbookMutationResponse = {
  message: string;
  cashbookAccountId?: string;
  cashbookEntryId?: string;
  cashbookEntryIds?: string[];
  entryNo?: string;
  workflowReference?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpCashbookWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultEntryDate: string;
  defaultPostingDate: string;
  accountOptions: Array<{
    cashbookAccountId: string;
    code: string;
    name: string;
    accountType: string;
    currencyCode: string;
    glAccountCode: string;
    label: string;
  }>;
  glAccountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  bankAccountOptions: Array<{
    bankAccountId: string;
    label: string;
    accountNumber: string;
    bankName: string;
    branchName: string;
  }>;
  settlementAllocationOptions: Array<{
    settlementAllocationId: string;
    allocationNo: string;
    label: string;
  }>;
  metrics: {
    cashbookAccounts: number;
    bookBalance: number;
    postedInflows: number;
    postedOutflows: number;
    draftEntries: number;
    unreconciledEntries: number;
  };
  accountRows: Array<{
    cashbookAccountId: string;
    code: string;
    name: string;
    accountType: string;
    currencyCode: string;
    glAccountCode: string;
    glAccountName: string | null;
    accountNumber: string | null;
    bankName: string | null;
    branchName: string | null;
    mobileProviderName: string | null;
    mobileWalletNumber: string | null;
    pettyCashCustodian: string | null;
    openingBalance: number;
    postedInflows: number;
    postedOutflows: number;
    bookBalance: number;
    reconciliationEnabled: boolean;
    isDefault: boolean;
    status: string;
  }>;
  entryRows: Array<{
    cashbookEntryId: string;
    cashbookAccountId: string;
    cashbookAccountCode: string;
    entryNo: string;
    entryType: string;
    direction: string;
    entryDate: string;
    postingDate: string;
    valueDate: string | null;
    currencyCode: string;
    amount: number;
    offsetAccountCode: string;
    counterpartyName: string | null;
    workflowType: string;
    workflowReference: string | null;
    linkedCashbookAccountId: string | null;
    linkedCashbookEntryId: string | null;
    pettyCashCustodian: string | null;
    providerName: string | null;
    providerReference: string | null;
    externalReference: string | null;
    clearingReference: string | null;
    memo: string | null;
    reconciliationStatus: string;
    clearedAt: string | null;
    status: string;
    postedAt: string | null;
    postedBy: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
    settlementAllocationId: string | null;
    settlementAllocationNo: string | null;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;
const cashbookTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

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

function parseOptionalDate(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Flash ERP needs a valid value date.");
  }

  return date;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeDirection(value: string | null | undefined) {
  const direction = normalizeCode(value ?? "INFLOW", "cashbook direction");

  if (!["INFLOW", "OUTFLOW"].includes(direction)) {
    throw new Error("Flash ERP cashbook direction must be INFLOW or OUTFLOW.");
  }

  return direction;
}

function normalizeEntryType(value: string | null | undefined) {
  const entryType = normalizeCode(value ?? "RECEIPT", "cashbook entry type");

  if (!["RECEIPT", "PAYMENT", "TRANSFER", "ADJUSTMENT", "PETTY_CASH"].includes(entryType)) {
    throw new Error("Flash ERP supports receipt, payment, transfer, petty cash, and adjustment cashbook entries.");
  }

  return entryType;
}

function normalizeWorkflowType(value: string | null | undefined) {
  const workflowType = normalizeCode(value ?? "STANDARD", "cashbook workflow type");

  if (!["STANDARD", "BANK_TRANSFER", "PETTY_CASH", "MOBILE_MONEY"].includes(workflowType)) {
    throw new Error("Flash ERP supports standard, bank-transfer, petty-cash, and mobile-money cashbook workflows.");
  }

  return workflowType;
}

function normalizePettyCashMovementType(value: string | null | undefined) {
  const movementType = normalizeCode(value ?? "ISSUE", "petty cash movement type");

  if (!["ISSUE", "RETURN", "REPLENISHMENT", "ADJUSTMENT"].includes(movementType)) {
    throw new Error("Flash ERP supports petty-cash issue, return, replenishment, and adjustment movements.");
  }

  return movementType;
}

function buildUnavailableErpCashbookWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpCashbookWorkspaceData {
  const today = dateOnly(new Date());

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultEntryDate: today,
    defaultPostingDate: today,
    accountOptions: [],
    glAccountOptions: [],
    bankAccountOptions: [],
    settlementAllocationOptions: [],
    metrics: {
      cashbookAccounts: 0,
      bookBalance: 0,
      postedInflows: 0,
      postedOutflows: 0,
      draftEntries: 0,
      unreconciledEntries: 0
    },
    accountRows: [],
    entryRows: []
  };
}

export { buildUnavailableErpCashbookWorkspace };

async function getCashbookContext(tx: Prisma.TransactionClient = prisma): Promise<CashbookContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: CashbookContext) {
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

async function resolveGlAccount(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  accountCode: string
) {
  const account = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      code: accountCode,
      status: activeStatus
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });

  if (!account) {
    throw new Error(`Flash ERP cannot find GL account ${accountCode}.`);
  }

  return account;
}

async function ensureDefaultCashbookAccount(
  tx: Prisma.TransactionClient,
  context: CashbookContext,
  company: NonNullable<Awaited<ReturnType<typeof getPrimaryCompany>>>
) {
  const existing = await tx.erpCashbookAccount.findFirst({
    where: {
      companyId: company.id,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  if (existing) {
    return existing;
  }

  const glAccountCode = company.accountingSettings?.cashControlAccountCode ?? "1000";
  const glAccount = await resolveGlAccount(tx, context.retailOrgId, glAccountCode);

  return tx.erpCashbookAccount.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      glAccountId: glAccount.id,
      code: "MAIN-CASH",
      name: "Main cash account",
      accountType: "CASH",
      currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
      glAccountCode: glAccount.code,
      openingBalance: 0,
      reconciliationEnabled: true,
      isDefault: true,
      status: activeStatus
    },
    select: {
      id: true
    }
  });
}

async function ensureCashbookDocumentSequences(
  tx: Prisma.TransactionClient,
  context: CashbookContext,
  company: NonNullable<Awaited<ReturnType<typeof getPrimaryCompany>>>
) {
  const today = new Date();
  const fiscalYear =
    (await tx.erpFiscalYear.findFirst({
      where: {
        companyId: company.id,
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
        companyId: company.id,
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
    throw new Error("Flash ERP needs an open fiscal year before cashbook numbering can be used.");
  }

  for (const seed of [
    { documentType: "CASHBOOK_ENTRY", prefix: "CB" },
    { documentType: "BANK_TRANSFER", prefix: "BT" },
    { documentType: "PETTY_CASH", prefix: "PC" }
  ] as const) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId: company.id,
          documentType: seed.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {
        prefix: seed.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType: seed.documentType,
        prefix: seed.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      }
    });
  }
}

function postedInflows(account: CashbookAccountWithEntries) {
  return roundMoney(
    account.entries
      .filter((entry) => entry.status === "POSTED" && entry.direction === "INFLOW")
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
  );
}

function postedOutflows(account: CashbookAccountWithEntries) {
  return roundMoney(
    account.entries
      .filter((entry) => entry.status === "POSTED" && entry.direction === "OUTFLOW")
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
  );
}

function accountBookBalance(account: CashbookAccountWithEntries) {
  return roundMoney(Number(account.openingBalance) + postedInflows(account) - postedOutflows(account));
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

async function loadCashbookAccounts(companyId: string) {
  return prisma.erpCashbookAccount.findMany({
    where: {
      companyId,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    include: {
      bankAccount: {
        include: {
          branch: {
            include: {
              bank: true
            }
          }
        }
      },
      glAccount: true,
      entries: {
        where: {
          status: {
            not: RecordStatus.DELETED
          }
        },
        orderBy: [{ entryDate: "desc" }, { entryNo: "desc" }],
        include: {
          postingJournalEntry: {
            select: {
              journalNo: true
            }
          },
          settlementAllocation: {
            select: {
              allocationNo: true
            }
          }
        }
      }
    }
  });
}

export async function getErpCashbookWorkspace(): Promise<ErpCashbookWorkspaceData> {
  const context = await getCashbookContext();

  if (!context) {
    return buildUnavailableErpCashbookWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpCashbookWorkspace(
      "Create a company in Finance foundation before using cashbook.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await prisma.$transaction(async (tx) => {
    await ensureDefaultCashbookAccount(tx, context, company);
    await ensureCashbookDocumentSequences(tx, context, company);
  }, cashbookTransactionOptions);

  const [accounts, glAccounts, bankAccounts, settlementAllocations] = await Promise.all([
    loadCashbookAccounts(company.id),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.bankAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ accountName: "asc" }],
      include: {
        branch: {
          include: {
            bank: true
          }
        }
      }
    }),
    prisma.erpSettlementAllocation.findMany({
      where: {
        companyId: company.id,
        status: "POSTED"
      },
      orderBy: [{ allocationDate: "desc" }, { allocationNo: "desc" }],
      take: 100,
      include: {
        cashbookEntries: {
          where: {
            status: {
              not: RecordStatus.DELETED
            }
          },
          select: {
            id: true
          }
        }
      }
    })
  ]);
  const entryRows = accounts
    .flatMap((account) =>
      account.entries.map((entry) => ({
        cashbookEntryId: entry.id,
        cashbookAccountId: account.id,
        cashbookAccountCode: account.code,
        entryNo: entry.entryNo,
        entryType: entry.entryType,
        direction: entry.direction,
        entryDate: entry.entryDate.toISOString(),
        postingDate: entry.postingDate.toISOString(),
        valueDate: entry.valueDate?.toISOString() ?? null,
        currencyCode: entry.currencyCode,
        amount: Number(entry.amount),
        offsetAccountCode: entry.offsetAccountCode,
        counterpartyName: entry.counterpartyName,
        workflowType: entry.workflowType,
        workflowReference: entry.workflowReference,
        linkedCashbookAccountId: entry.linkedCashbookAccountId,
        linkedCashbookEntryId: entry.linkedCashbookEntryId,
        pettyCashCustodian: entry.pettyCashCustodian,
        providerName: entry.providerName,
        providerReference: entry.providerReference,
        externalReference: entry.externalReference,
        clearingReference: entry.clearingReference,
        memo: entry.memo,
        reconciliationStatus: entry.reconciliationStatus,
        clearedAt: entry.clearedAt?.toISOString() ?? null,
        status: entry.status,
        postedAt: entry.postedAt?.toISOString() ?? null,
        postedBy: entry.postedBy,
        journalEntryId: entry.postingJournalEntryId,
        journalNo: entry.postingJournalEntry?.journalNo ?? null,
        settlementAllocationId: entry.settlementAllocationId,
        settlementAllocationNo: entry.settlementAllocation?.allocationNo ?? null
      }))
    )
    .sort(
      (left, right) =>
        right.entryDate.localeCompare(left.entryDate) || right.entryNo.localeCompare(left.entryNo)
    );
  const postedEntries = entryRows.filter((entry) => entry.status === "POSTED");

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Cashbook entries are operational cash movements; posting flows through the shared GL engine.",
    refreshedAt: new Date().toISOString(),
    defaultEntryDate: dateOnly(new Date()),
    defaultPostingDate: dateOnly(new Date()),
    accountOptions: accounts.map((account) => ({
      cashbookAccountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      currencyCode: account.currencyCode,
      glAccountCode: account.glAccountCode,
      label: `${account.code} - ${account.name}`
    })),
    glAccountOptions: glAccounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    bankAccountOptions: bankAccounts.map((account) => ({
      bankAccountId: account.id,
      label: `${account.accountNumber} - ${account.accountName}`,
      accountNumber: account.accountNumber,
      bankName: account.branch.bank.name,
      branchName: account.branch.name
    })),
    settlementAllocationOptions: settlementAllocations
      .filter((allocation) => allocation.cashbookEntries.length === 0)
      .map((allocation) => ({
        settlementAllocationId: allocation.id,
        allocationNo: allocation.allocationNo,
        label: `${allocation.allocationNo} - ${allocation.partyName}`
      })),
    metrics: {
      cashbookAccounts: accounts.length,
      bookBalance: roundMoney(accounts.reduce((sum, account) => sum + accountBookBalance(account), 0)),
      postedInflows: roundMoney(
        postedEntries
          .filter((entry) => entry.direction === "INFLOW")
          .reduce((sum, entry) => sum + entry.amount, 0)
      ),
      postedOutflows: roundMoney(
        postedEntries
          .filter((entry) => entry.direction === "OUTFLOW")
          .reduce((sum, entry) => sum + entry.amount, 0)
      ),
      draftEntries: entryRows.filter((entry) => entry.status === "DRAFT").length,
      unreconciledEntries: entryRows.filter(
        (entry) => entry.status === "POSTED" && entry.reconciliationStatus === "UNRECONCILED"
      ).length
    },
    accountRows: accounts.map((account) => {
      const bankAccount = account.bankAccount;

      return {
        cashbookAccountId: account.id,
        code: account.code,
        name: account.name,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        glAccountCode: account.glAccountCode,
        glAccountName: account.glAccount?.name ?? null,
        accountNumber: account.accountNumber ?? bankAccount?.accountNumber ?? null,
        bankName: account.bankName ?? bankAccount?.branch.bank.name ?? null,
        branchName: account.branchName ?? bankAccount?.branch.name ?? null,
        mobileProviderName: account.mobileProviderName,
        mobileWalletNumber: account.mobileWalletNumber,
        pettyCashCustodian: account.pettyCashCustodian,
        openingBalance: Number(account.openingBalance),
        postedInflows: postedInflows(account),
        postedOutflows: postedOutflows(account),
        bookBalance: accountBookBalance(account),
        reconciliationEnabled: account.reconciliationEnabled,
        isDefault: account.isDefault,
        status: account.status
      };
    }),
    entryRows
  };
}

export async function upsertErpCashbookAccount(
  input: UpsertErpCashbookAccountRequest
): Promise<ErpCashbookMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getCashbookContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using cashbook.");
    }

    const code = normalizeCode(input.code, "cashbook account code");
    const name = normalizeRequiredText(input.name, "cashbook account name");
    const accountType = normalizeCode(input.accountType ?? "CASH", "cashbook account type");
    const glAccountCode = normalizeCode(input.glAccountCode ?? "1000", "cashbook GL account");
    const glAccount = await resolveGlAccount(tx, context.retailOrgId, glAccountCode);
    const bankAccountId = normalizeOptionalText(input.bankAccountId);
    const bankAccount = bankAccountId
      ? await tx.bankAccount.findFirst({
          where: {
            id: bankAccountId,
            retailOrgId: context.retailOrgId,
            status: activeStatus
          },
          include: {
            branch: {
              include: {
                bank: true
              }
            }
          }
        })
      : null;

    if (bankAccountId && !bankAccount) {
      throw new Error("Flash ERP cannot find that bank account.");
    }

    if (input.isDefault) {
      await tx.erpCashbookAccount.updateMany({
        where: {
          companyId: company.id
        },
        data: {
          isDefault: false
        }
      });
    }

    const account = await tx.erpCashbookAccount.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code
        }
      },
      update: {
        bankAccountId: bankAccount?.id ?? null,
        glAccountId: glAccount.id,
        name,
        accountType,
        currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency code"),
        glAccountCode,
        accountNumber: normalizeOptionalText(input.accountNumber) ?? bankAccount?.accountNumber ?? null,
        bankName: normalizeOptionalText(input.bankName) ?? bankAccount?.branch.bank.name ?? null,
        branchName: normalizeOptionalText(input.branchName) ?? bankAccount?.branch.name ?? null,
        mobileProviderName: normalizeOptionalText(input.mobileProviderName),
        mobileWalletNumber: normalizeOptionalText(input.mobileWalletNumber),
        pettyCashCustodian: normalizeOptionalText(input.pettyCashCustodian),
        openingBalance: roundMoney(numberOrZero(input.openingBalance)),
        reconciliationEnabled: input.reconciliationEnabled ?? true,
        isDefault: input.isDefault ?? false,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        bankAccountId: bankAccount?.id ?? null,
        glAccountId: glAccount.id,
        code,
        name,
        accountType,
        currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency code"),
        glAccountCode,
        accountNumber: normalizeOptionalText(input.accountNumber) ?? bankAccount?.accountNumber ?? null,
        bankName: normalizeOptionalText(input.bankName) ?? bankAccount?.branch.bank.name ?? null,
        branchName: normalizeOptionalText(input.branchName) ?? bankAccount?.branch.name ?? null,
        mobileProviderName: normalizeOptionalText(input.mobileProviderName),
        mobileWalletNumber: normalizeOptionalText(input.mobileWalletNumber),
        pettyCashCustodian: normalizeOptionalText(input.pettyCashCustodian),
        openingBalance: roundMoney(numberOrZero(input.openingBalance)),
        reconciliationEnabled: input.reconciliationEnabled ?? true,
        isDefault: input.isDefault ?? false,
        status: activeStatus
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved cashbook account ${code}.`,
      cashbookAccountId: account.id,
      serverProcessedAt: new Date().toISOString()
    };
  }, cashbookTransactionOptions);
}

export async function createErpCashbookEntry(
  input: CreateErpCashbookEntryRequest
): Promise<ErpCashbookMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getCashbookContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using cashbook.");
    }

    await ensureDefaultCashbookAccount(tx, context, company);
    await ensureCashbookDocumentSequences(tx, context, company);

    const cashbookAccountId = normalizeRequiredText(input.cashbookAccountId, "cashbook account");
    const account = await tx.erpCashbookAccount.findFirst({
      where: {
        id: cashbookAccountId,
        companyId: company.id,
        status: activeStatus
      }
    });

    if (!account) {
      throw new Error("Flash ERP cannot find that active cashbook account.");
    }

    const entryType = normalizeEntryType(input.entryType);
    const direction = normalizeDirection(input.direction);
    const entryDate = parseDate(input.entryDate ?? dateOnly(new Date()), "entry date");
    const postingDate = parseDate(input.postingDate ?? input.entryDate ?? dateOnly(new Date()), "posting date");
    const valueDate = parseOptionalDate(input.valueDate);
    const amount = roundMoney(Math.max(0, numberOrZero(input.amount)));
    const offsetAccountCode = normalizeCode(input.offsetAccountCode, "offset account");
    const settlementAllocationId = normalizeOptionalText(input.settlementAllocationId);
    const workflowType = normalizeWorkflowType(
      input.workflowType ?? (account.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "STANDARD")
    );

    if (amount <= 0) {
      throw new Error("Flash ERP needs a positive cashbook amount.");
    }

    await resolveGlAccount(tx, context.retailOrgId, account.glAccountCode);
    await resolveGlAccount(tx, context.retailOrgId, offsetAccountCode);

    if (settlementAllocationId) {
      const allocation = await tx.erpSettlementAllocation.findFirst({
        where: {
          id: settlementAllocationId,
          companyId: company.id,
          status: "POSTED"
        },
        select: {
          id: true
        }
      });

      if (!allocation) {
        throw new Error("Flash ERP can only link posted settlement allocations to cashbook entries.");
      }
    }

    const entryNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "CASHBOOK_ENTRY"
      })
    ).documentNo;
    const entry = await tx.erpCashbookEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: account.id,
        settlementAllocationId,
        entryNo,
        entryType,
        direction,
        entryDate,
        postingDate,
        valueDate,
        currencyCode: account.currencyCode,
        amount,
        offsetAccountCode,
        counterpartyName: normalizeOptionalText(input.counterpartyName),
        workflowType,
        workflowReference: normalizeOptionalText(input.workflowReference),
        linkedCashbookAccountId: normalizeOptionalText(input.linkedCashbookAccountId),
        linkedCashbookEntryId: normalizeOptionalText(input.linkedCashbookEntryId),
        pettyCashCustodian: normalizeOptionalText(input.pettyCashCustodian) ?? account.pettyCashCustodian,
        providerName: normalizeOptionalText(input.providerName) ?? account.mobileProviderName,
        providerReference: normalizeOptionalText(input.providerReference),
        externalReference: normalizeOptionalText(input.externalReference),
        clearingReference: normalizeOptionalText(input.clearingReference),
        memo: normalizeOptionalText(input.memo),
        reconciliationStatus: "UNRECONCILED",
        status: "DRAFT"
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved cashbook entry ${entryNo}.`,
      cashbookEntryId: entry.id,
      entryNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, cashbookTransactionOptions);
}

export async function createErpBankTransfer(
  input: CreateErpBankTransferRequest
): Promise<ErpCashbookMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getCashbookContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using bank transfers.");
    }

    await ensureDefaultCashbookAccount(tx, context, company);
    await ensureCashbookDocumentSequences(tx, context, company);

    const fromCashbookAccountId = normalizeRequiredText(
      input.fromCashbookAccountId,
      "source cashbook account"
    );
    const toCashbookAccountId = normalizeRequiredText(input.toCashbookAccountId, "target cashbook account");

    if (fromCashbookAccountId === toCashbookAccountId) {
      throw new Error("Bank transfers need two different cashbook accounts.");
    }

    const accounts = await tx.erpCashbookAccount.findMany({
      where: {
        id: {
          in: [fromCashbookAccountId, toCashbookAccountId]
        },
        companyId: company.id,
        status: activeStatus
      }
    });
    const fromAccount = accounts.find((account) => account.id === fromCashbookAccountId);
    const toAccount = accounts.find((account) => account.id === toCashbookAccountId);

    if (!fromAccount || !toAccount) {
      throw new Error("Flash ERP cannot find both active cashbook accounts for this transfer.");
    }

    if (fromAccount.currencyCode !== toAccount.currencyCode) {
      throw new Error("Bank transfers currently require matching cashbook account currencies.");
    }

    await resolveGlAccount(tx, context.retailOrgId, fromAccount.glAccountCode);
    await resolveGlAccount(tx, context.retailOrgId, toAccount.glAccountCode);

    const amount = roundMoney(Math.max(0, numberOrZero(input.amount)));

    if (amount <= 0) {
      throw new Error("Flash ERP needs a positive transfer amount.");
    }

    const transferDate = parseDate(input.transferDate ?? dateOnly(new Date()), "transfer date");
    const postingDate = parseDate(
      input.postingDate ?? input.transferDate ?? dateOnly(new Date()),
      "posting date"
    );
    const valueDate = parseOptionalDate(input.valueDate);
    const workflowReference = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "BANK_TRANSFER"
      })
    ).documentNo;
    const outflowEntryNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "CASHBOOK_ENTRY"
      })
    ).documentNo;
    const inflowEntryNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "CASHBOOK_ENTRY"
      })
    ).documentNo;
    const memo =
      normalizeOptionalText(input.memo) ??
      `${workflowReference} transfer from ${fromAccount.code} to ${toAccount.code}.`;
    const externalReference = normalizeOptionalText(input.externalReference);
    const clearingReference = normalizeOptionalText(input.clearingReference);
    const outflowEntry = await tx.erpCashbookEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: fromAccount.id,
        entryNo: outflowEntryNo,
        entryType: "TRANSFER",
        direction: "OUTFLOW",
        entryDate: transferDate,
        postingDate,
        valueDate,
        currencyCode: fromAccount.currencyCode,
        amount,
        offsetAccountCode: toAccount.glAccountCode,
        counterpartyName: toAccount.name,
        workflowType: "BANK_TRANSFER",
        workflowReference,
        linkedCashbookAccountId: toAccount.id,
        providerName: fromAccount.mobileProviderName,
        providerReference: externalReference,
        externalReference,
        clearingReference,
        memo,
        reconciliationStatus: "UNRECONCILED",
        status: "DRAFT"
      },
      select: {
        id: true
      }
    });
    const inflowEntry = await tx.erpCashbookEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: toAccount.id,
        entryNo: inflowEntryNo,
        entryType: "TRANSFER",
        direction: "INFLOW",
        entryDate: transferDate,
        postingDate,
        valueDate,
        currencyCode: toAccount.currencyCode,
        amount,
        offsetAccountCode: fromAccount.glAccountCode,
        counterpartyName: fromAccount.name,
        workflowType: "BANK_TRANSFER",
        workflowReference,
        linkedCashbookAccountId: fromAccount.id,
        linkedCashbookEntryId: outflowEntry.id,
        providerName: toAccount.mobileProviderName,
        providerReference: externalReference,
        externalReference,
        clearingReference,
        memo,
        reconciliationStatus: "UNRECONCILED",
        status: "DRAFT"
      },
      select: {
        id: true
      }
    });

    await tx.erpCashbookEntry.update({
      where: {
        id: outflowEntry.id
      },
      data: {
        linkedCashbookEntryId: inflowEntry.id
      }
    });

    return {
      message: `Flash ERP saved bank transfer ${workflowReference} between ${fromAccount.code} and ${toAccount.code}.`,
      cashbookEntryId: outflowEntry.id,
      cashbookEntryIds: [outflowEntry.id, inflowEntry.id],
      entryNo: outflowEntryNo,
      workflowReference,
      serverProcessedAt: new Date().toISOString()
    };
  }, cashbookTransactionOptions);
}

export async function createErpPettyCashMovement(
  input: CreateErpPettyCashRequest
): Promise<ErpCashbookMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getCashbookContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using petty cash.");
    }

    await ensureDefaultCashbookAccount(tx, context, company);
    await ensureCashbookDocumentSequences(tx, context, company);

    const cashbookAccountId = normalizeRequiredText(input.cashbookAccountId, "petty cash account");
    const account = await tx.erpCashbookAccount.findFirst({
      where: {
        id: cashbookAccountId,
        companyId: company.id,
        status: activeStatus
      }
    });

    if (!account) {
      throw new Error("Flash ERP cannot find that active petty cash account.");
    }

    const movementType = normalizePettyCashMovementType(input.movementType);
    const defaultDirection = movementType === "ISSUE" ? "OUTFLOW" : "INFLOW";
    const direction = normalizeDirection(input.direction ?? defaultDirection);
    const movementDate = parseDate(input.movementDate ?? dateOnly(new Date()), "petty cash date");
    const postingDate = parseDate(
      input.postingDate ?? input.movementDate ?? dateOnly(new Date()),
      "posting date"
    );
    const amount = roundMoney(Math.max(0, numberOrZero(input.amount)));
    const offsetAccountCode = normalizeCode(
      input.offsetAccountCode ?? (direction === "OUTFLOW" ? "6100" : "1000"),
      "petty cash offset account"
    );
    const custodianName =
      normalizeOptionalText(input.custodianName) ?? account.pettyCashCustodian ?? "Petty cash custodian";

    if (amount <= 0) {
      throw new Error("Flash ERP needs a positive petty cash amount.");
    }

    await resolveGlAccount(tx, context.retailOrgId, account.glAccountCode);
    await resolveGlAccount(tx, context.retailOrgId, offsetAccountCode);

    const workflowReference = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "PETTY_CASH"
      })
    ).documentNo;
    const entryNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "CASHBOOK_ENTRY"
      })
    ).documentNo;
    const entry = await tx.erpCashbookEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: account.id,
        entryNo,
        entryType: "PETTY_CASH",
        direction,
        entryDate: movementDate,
        postingDate,
        currencyCode: account.currencyCode,
        amount,
        offsetAccountCode,
        counterpartyName: custodianName,
        workflowType: "PETTY_CASH",
        workflowReference,
        pettyCashCustodian: custodianName,
        externalReference: normalizeOptionalText(input.externalReference),
        memo:
          normalizeOptionalText(input.memo) ??
          `${workflowReference} ${movementType.toLowerCase().replace(/_/g, " ")} for ${custodianName}.`,
        reconciliationStatus: "UNRECONCILED",
        status: "DRAFT"
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved petty cash ${movementType.toLowerCase().replace(/_/g, " ")} ${workflowReference}.`,
      cashbookEntryId: entry.id,
      cashbookEntryIds: [entry.id],
      entryNo,
      workflowReference,
      serverProcessedAt: new Date().toISOString()
    };
  }, cashbookTransactionOptions);
}

async function postErpBankTransferWorkflow(
  tx: Prisma.TransactionClient,
  context: CashbookContext,
  companyId: string,
  workflowReference: string
): Promise<ErpCashbookMutationResponse> {
  const entries = await tx.erpCashbookEntry.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      companyId,
      workflowType: "BANK_TRANSFER",
      workflowReference,
      status: {
        not: RecordStatus.DELETED
      }
    },
    include: {
      cashbookAccount: true
    },
    orderBy: [{ direction: "asc" }, { entryNo: "asc" }]
  });

  if (entries.length !== 2) {
    throw new Error("Bank transfer posting requires exactly one outflow and one inflow cashbook entry.");
  }

  if (entries.some((entry) => entry.status !== "DRAFT")) {
    throw new Error("Only draft bank transfer entries can be posted.");
  }

  const outflow = entries.find((entry) => entry.direction === "OUTFLOW");
  const inflow = entries.find((entry) => entry.direction === "INFLOW");

  if (!outflow || !inflow) {
    throw new Error("Bank transfer posting requires one outflow and one inflow entry.");
  }

  const amount = roundMoney(Number(outflow.amount));

  if (amount <= 0 || Math.abs(amount - Number(inflow.amount)) > 0.01) {
    throw new Error("Bank transfer entries must carry the same positive amount.");
  }

  if (outflow.currencyCode !== inflow.currencyCode) {
    throw new Error("Bank transfer entries must use the same currency.");
  }

  const result = await postAccountingDocumentInTransaction(tx, {
    retailOrgId: outflow.retailOrgId,
    companyId: outflow.companyId,
    documentType: "JOURNAL",
    batchSourceType: "BANK_TRANSFER",
    journalType: "BANK_TRANSFER",
    sourceType: "ERP-CASHBOOK-TRANSFER",
    sourceId: `${outflow.companyId}:${workflowReference}`,
    sourceReference: workflowReference,
    postingDate: outflow.postingDate,
    description: `${workflowReference} bank transfer from ${outflow.cashbookAccount.code} to ${inflow.cashbookAccount.code}`,
    postedBy: "Enterprise bank transfer",
    lines: [
      {
        accountCode: inflow.cashbookAccount.glAccountCode,
        debitAmount: amount,
        creditAmount: 0,
        memo: `${workflowReference} transfer inflow`
      },
      {
        accountCode: outflow.cashbookAccount.glAccountCode,
        debitAmount: 0,
        creditAmount: amount,
        memo: `${workflowReference} transfer outflow`
      }
    ]
  });

  await tx.erpCashbookEntry.updateMany({
    where: {
      id: {
        in: entries.map((entry) => entry.id)
      }
    },
    data: {
      status: "POSTED",
      postedAt: new Date(),
      postedBy: "Enterprise bank transfer",
      postingJournalEntryId: result.journalEntryId
    }
  });

  return {
    message: `Flash ERP posted bank transfer ${workflowReference} through journal ${result.journalNo}.`,
    cashbookEntryId: outflow.id,
    cashbookEntryIds: entries.map((entry) => entry.id),
    entryNo: outflow.entryNo,
    workflowReference,
    journalEntryId: result.journalEntryId,
    journalNo: result.journalNo,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function postErpCashbookEntry(entryId: string): Promise<ErpCashbookMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getCashbookContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const entry = await tx.erpCashbookEntry.findFirst({
      where: {
        id: entryId,
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        cashbookAccount: true
      }
    });

    if (!entry) {
      throw new Error("Flash ERP cannot find that cashbook entry.");
    }

    if (entry.status !== "DRAFT") {
      throw new Error("Only draft cashbook entries can be posted.");
    }

    if (entry.workflowType === "BANK_TRANSFER" && entry.workflowReference) {
      return postErpBankTransferWorkflow(tx, context, entry.companyId, entry.workflowReference);
    }

    const amount = roundMoney(Number(entry.amount));
    const postingLines: PostAccountingDocumentLine[] = [];
    const description = `${entry.entryNo} ${entry.entryType.toLowerCase()} - ${
      entry.counterpartyName ?? entry.memo ?? entry.offsetAccountCode
    }`;

    if (amount <= 0) {
      throw new Error("Flash ERP cannot post a zero-value cashbook entry.");
    }

    if (entry.direction === "INFLOW") {
      addPostingLine(
        postingLines,
        entry.cashbookAccount.glAccountCode,
        amount,
        0,
        `${entry.entryNo} cashbook inflow`
      );
      addPostingLine(
        postingLines,
        entry.offsetAccountCode,
        0,
        amount,
        `${entry.entryNo} cashbook offset`
      );
    } else {
      addPostingLine(
        postingLines,
        entry.offsetAccountCode,
        amount,
        0,
        `${entry.entryNo} cashbook offset`
      );
      addPostingLine(
        postingLines,
        entry.cashbookAccount.glAccountCode,
        0,
        amount,
        `${entry.entryNo} cashbook outflow`
      );
    }

    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: entry.retailOrgId,
      companyId: entry.companyId,
      documentType: "JOURNAL",
      batchSourceType: "CASHBOOK_ENTRY",
      journalType: entry.entryType,
      sourceType: "ERP-CASHBOOK-ENTRY",
      sourceId: entry.id,
      sourceReference: entry.workflowReference ?? entry.entryNo,
      postingDate: entry.postingDate,
      description,
      postedBy: "Enterprise cashbook",
      lines: postingLines
    });

    await tx.erpCashbookEntry.update({
      where: {
        id: entry.id
      },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Enterprise cashbook",
        postingJournalEntryId: result.journalEntryId
      }
    });

    return {
      message: `Flash ERP posted ${entry.entryNo} through journal ${result.journalNo}.`,
      cashbookEntryId: entry.id,
      entryNo: entry.entryNo,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, cashbookTransactionOptions);
}

import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type ReconciliationContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type StatementWithLines = Prisma.ErpBankStatementGetPayload<{
  include: {
    cashbookAccount: true;
    lines: {
      include: {
        reconciliationMatches: {
          include: {
            cashbookEntry: {
              select: {
                entryNo: true;
              };
            };
          };
        };
      };
    };
    reconciliationMatches: {
      include: {
        statementLine: true;
        cashbookEntry: true;
      };
    };
  };
}>;

export type CreateErpBankStatementRequest = {
  cashbookAccountId?: string | null;
  statementNo?: string | null;
  statementType?: string | null;
  statementDate?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  openingBalance?: number | string | null;
  closingBalance?: number | string | null;
  sourceType?: string | null;
  externalReference?: string | null;
  memo?: string | null;
  lines?: Array<{
    transactionDate?: string | null;
    valueDate?: string | null;
    direction?: string | null;
    amount?: number | string | null;
    description?: string | null;
    reference?: string | null;
    counterpartyName?: string | null;
  }>;
};

export type MatchErpBankStatementLineRequest = {
  statementLineId?: string | null;
  cashbookEntryId?: string | null;
  matchedAmount?: number | string | null;
};

export type ReverseErpBankReconciliationMatchRequest = {
  reason?: string | null;
};

export type ErpBankReconciliationMutationResponse = {
  message: string;
  bankStatementId?: string;
  statementNo?: string;
  statementLineId?: string;
  cashbookEntryId?: string;
  reconciliationMatchId?: string;
  serverProcessedAt: string;
};

export type ErpBankReconciliationWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultStatementDate: string;
  accountOptions: Array<{
    cashbookAccountId: string;
    code: string;
    name: string;
    currencyCode: string;
    label: string;
  }>;
  metrics: {
    statements: number;
    statementLines: number;
    matchedLines: number;
    unmatchedLines: number;
    unreconciledCashbookEntries: number;
  };
  statementRows: Array<{
    bankStatementId: string;
    statementNo: string;
    cashbookAccountId: string;
    cashbookAccountCode: string;
    statementType: string;
    statementDate: string;
    fromDate: string;
    toDate: string;
    currencyCode: string;
    openingBalance: number;
    closingBalance: number;
    totalInflows: number;
    totalOutflows: number;
    matchedLines: number;
    unmatchedLines: number;
    sourceType: string;
    externalReference: string | null;
    memo: string | null;
    status: string;
  }>;
  statementLineRows: Array<{
    statementLineId: string;
    bankStatementId: string;
    statementNo: string;
    cashbookAccountId: string;
    cashbookAccountCode: string;
    lineNo: number;
    transactionDate: string;
    valueDate: string | null;
    direction: string;
    amount: number;
    description: string;
    reference: string | null;
    counterpartyName: string | null;
    matchStatus: string;
    matchedCashbookEntryNo: string | null;
    activeMatchId: string | null;
    status: string;
  }>;
  cashbookEntryRows: Array<{
    cashbookEntryId: string;
    cashbookAccountId: string;
    cashbookAccountCode: string;
    entryNo: string;
    entryType: string;
    direction: string;
    entryDate: string;
    postingDate: string;
    amount: number;
    offsetAccountCode: string;
    counterpartyName: string | null;
    externalReference: string | null;
    clearingReference: string | null;
    reconciliationStatus: string;
    journalEntryId: string | null;
    journalNo: string | null;
    status: string;
  }>;
  matchRows: Array<{
    reconciliationMatchId: string;
    statementNo: string;
    statementLineId: string;
    cashbookEntryId: string;
    cashbookEntryNo: string;
    cashbookAccountCode: string;
    direction: string;
    matchedAmount: number;
    matchType: string;
    matchedBy: string | null;
    matchedAt: string;
    reversedAt: string | null;
    reversalReason: string | null;
    status: string;
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
    .slice(0, 40);

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
  const direction = normalizeCode(value ?? "INFLOW", "statement line direction");

  if (!["INFLOW", "OUTFLOW"].includes(direction)) {
    throw new Error("Flash ERP statement line direction must be INFLOW or OUTFLOW.");
  }

  return direction;
}

function buildUnavailableErpBankReconciliationWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpBankReconciliationWorkspaceData {
  const today = dateOnly(new Date());

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultStatementDate: today,
    accountOptions: [],
    metrics: {
      statements: 0,
      statementLines: 0,
      matchedLines: 0,
      unmatchedLines: 0,
      unreconciledCashbookEntries: 0
    },
    statementRows: [],
    statementLineRows: [],
    cashbookEntryRows: [],
    matchRows: []
  };
}

export { buildUnavailableErpBankReconciliationWorkspace };

async function getReconciliationContext(
  tx: Prisma.TransactionClient = prisma
): Promise<ReconciliationContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: ReconciliationContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

async function ensureDefaultCashbookAccount(
  tx: Prisma.TransactionClient,
  context: ReconciliationContext,
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

  const glAccount = await tx.glAccount.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      code: "1000",
      status: activeStatus
    },
    select: {
      id: true,
      code: true
    }
  });

  if (!glAccount) {
    throw new Error("Flash ERP needs GL account 1000 before reconciliation can be used.");
  }

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

function statementTotals(lines: StatementWithLines["lines"]) {
  return {
    totalInflows: roundMoney(
      lines
        .filter((line) => line.direction === "INFLOW")
        .reduce((sum, line) => sum + Number(line.amount), 0)
    ),
    totalOutflows: roundMoney(
      lines
        .filter((line) => line.direction === "OUTFLOW")
        .reduce((sum, line) => sum + Number(line.amount), 0)
    ),
    matchedLines: lines.filter((line) => line.matchStatus === "MATCHED").length,
    unmatchedLines: lines.filter((line) => line.matchStatus === "UNMATCHED").length
  };
}

async function refreshStatementStatus(tx: Prisma.TransactionClient, bankStatementId: string) {
  const unmatchedCount = await tx.erpBankStatementLine.count({
    where: {
      bankStatementId,
      status: activeStatus,
      matchStatus: "UNMATCHED"
    }
  });

  await tx.erpBankStatement.update({
    where: {
      id: bankStatementId
    },
    data: {
      status: unmatchedCount === 0 ? "RECONCILED" : "OPEN"
    }
  });
}

export async function getErpBankReconciliationWorkspace(): Promise<ErpBankReconciliationWorkspaceData> {
  const context = await getReconciliationContext();

  if (!context) {
    return buildUnavailableErpBankReconciliationWorkspace(
      "Flash ERP enterprise node is not configured yet."
    );
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpBankReconciliationWorkspace(
      "Create a company in Finance foundation before using reconciliation.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await prisma.$transaction((tx) => ensureDefaultCashbookAccount(tx, context, company));

  const [cashbookAccounts, statements, cashbookEntries, matches] = await Promise.all([
    prisma.erpCashbookAccount.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }]
    }),
    prisma.erpBankStatement.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ statementDate: "desc" }, { statementNo: "desc" }],
      include: {
        cashbookAccount: true,
        lines: {
          where: {
            status: {
              not: RecordStatus.DELETED
            }
          },
          orderBy: {
            lineNo: "asc"
          },
          include: {
            reconciliationMatches: {
              where: {
                status: "ACTIVE"
              },
              include: {
                cashbookEntry: {
                  select: {
                    entryNo: true
                  }
                }
              }
            }
          }
        },
        reconciliationMatches: {
          where: {
            status: {
              not: RecordStatus.DELETED
            }
          },
          include: {
            statementLine: true,
            cashbookEntry: true
          }
        }
      }
    }),
    prisma.erpCashbookEntry.findMany({
      where: {
        companyId: company.id,
        status: "POSTED"
      },
      orderBy: [{ entryDate: "desc" }, { entryNo: "desc" }],
      include: {
        cashbookAccount: true,
        postingJournalEntry: {
          select: {
            journalNo: true
          }
        }
      }
    }),
    prisma.erpBankReconciliationMatch.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: {
        matchedAt: "desc"
      },
      include: {
        bankStatement: true,
        statementLine: true,
        cashbookEntry: true,
        cashbookAccount: true
      }
    })
  ]);
  const statementRows = statements.map((statement) => {
    const totals = statementTotals(statement.lines);

    return {
      bankStatementId: statement.id,
      statementNo: statement.statementNo,
      cashbookAccountId: statement.cashbookAccountId,
      cashbookAccountCode: statement.cashbookAccount.code,
      statementType: statement.statementType,
      statementDate: statement.statementDate.toISOString(),
      fromDate: statement.fromDate.toISOString(),
      toDate: statement.toDate.toISOString(),
      currencyCode: statement.currencyCode,
      openingBalance: Number(statement.openingBalance),
      closingBalance: Number(statement.closingBalance),
      totalInflows: totals.totalInflows,
      totalOutflows: totals.totalOutflows,
      matchedLines: totals.matchedLines,
      unmatchedLines: totals.unmatchedLines,
      sourceType: statement.sourceType,
      externalReference: statement.externalReference,
      memo: statement.memo,
      status: statement.status
    };
  });
  const statementLineRows = statements.flatMap((statement) =>
    statement.lines.map((line) => {
      const activeMatch = line.reconciliationMatches[0] ?? null;

      return {
        statementLineId: line.id,
        bankStatementId: statement.id,
        statementNo: statement.statementNo,
        cashbookAccountId: statement.cashbookAccountId,
        cashbookAccountCode: statement.cashbookAccount.code,
        lineNo: line.lineNo,
        transactionDate: line.transactionDate.toISOString(),
        valueDate: line.valueDate?.toISOString() ?? null,
        direction: line.direction,
        amount: Number(line.amount),
        description: line.description,
        reference: line.reference,
        counterpartyName: line.counterpartyName,
        matchStatus: line.matchStatus,
        matchedCashbookEntryNo: activeMatch?.cashbookEntry.entryNo ?? null,
        activeMatchId: activeMatch?.id ?? null,
        status: line.status
      };
    })
  );
  const cashbookEntryRows = cashbookEntries.map((entry) => ({
    cashbookEntryId: entry.id,
    cashbookAccountId: entry.cashbookAccountId,
    cashbookAccountCode: entry.cashbookAccount.code,
    entryNo: entry.entryNo,
    entryType: entry.entryType,
    direction: entry.direction,
    entryDate: entry.entryDate.toISOString(),
    postingDate: entry.postingDate.toISOString(),
    amount: Number(entry.amount),
    offsetAccountCode: entry.offsetAccountCode,
    counterpartyName: entry.counterpartyName,
    externalReference: entry.externalReference,
    clearingReference: entry.clearingReference,
    reconciliationStatus: entry.reconciliationStatus,
    journalEntryId: entry.postingJournalEntryId,
    journalNo: entry.postingJournalEntry?.journalNo ?? null,
    status: entry.status
  }));
  const matchRows = matches.map((match) => ({
    reconciliationMatchId: match.id,
    statementNo: match.bankStatement.statementNo,
    statementLineId: match.statementLineId,
    cashbookEntryId: match.cashbookEntryId,
    cashbookEntryNo: match.cashbookEntry.entryNo,
    cashbookAccountCode: match.cashbookAccount.code,
    direction: match.statementLine.direction,
    matchedAmount: Number(match.matchedAmount),
    matchType: match.matchType,
    matchedBy: match.matchedBy,
    matchedAt: match.matchedAt.toISOString(),
    reversedAt: match.reversedAt?.toISOString() ?? null,
    reversalReason: match.reversalReason,
    status: match.status
  }));

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Statement matching changes reconciliation status only; posted cashbook journals remain immutable.",
    refreshedAt: new Date().toISOString(),
    defaultStatementDate: dateOnly(new Date()),
    accountOptions: cashbookAccounts.map((account) => ({
      cashbookAccountId: account.id,
      code: account.code,
      name: account.name,
      currencyCode: account.currencyCode,
      label: `${account.code} - ${account.name}`
    })),
    metrics: {
      statements: statementRows.length,
      statementLines: statementLineRows.length,
      matchedLines: statementLineRows.filter((line) => line.matchStatus === "MATCHED").length,
      unmatchedLines: statementLineRows.filter((line) => line.matchStatus === "UNMATCHED").length,
      unreconciledCashbookEntries: cashbookEntryRows.filter(
        (entry) => entry.reconciliationStatus === "UNRECONCILED"
      ).length
    },
    statementRows,
    statementLineRows,
    cashbookEntryRows,
    matchRows
  };
}

export async function createErpBankStatement(
  input: CreateErpBankStatementRequest
): Promise<ErpBankReconciliationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getReconciliationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using reconciliation.");
    }

    await ensureDefaultCashbookAccount(tx, context, company);

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

    const statementDate = parseDate(input.statementDate ?? dateOnly(new Date()), "statement date");
    const fromDate = parseDate(input.fromDate ?? input.statementDate ?? dateOnly(new Date()), "from date");
    const toDate = parseDate(input.toDate ?? input.statementDate ?? dateOnly(new Date()), "to date");
    const lines = (input.lines ?? [])
      .map((line, index) => {
        const amount = roundMoney(Math.max(0, numberOrZero(line.amount)));
        const description = normalizeOptionalText(line.description);

        if (!description || amount <= 0) {
          return null;
        }

        return {
          lineNo: index + 1,
          transactionDate: parseDate(line.transactionDate ?? dateOnly(statementDate), "transaction date"),
          valueDate: parseOptionalDate(line.valueDate),
          direction: normalizeDirection(line.direction),
          amount,
          description,
          reference: normalizeOptionalText(line.reference),
          counterpartyName: normalizeOptionalText(line.counterpartyName)
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line))
      .map((line, index) => ({
        ...line,
        lineNo: index + 1
      }));

    if (lines.length === 0) {
      throw new Error("Flash ERP needs at least one statement line.");
    }

    const openingBalance = roundMoney(numberOrZero(input.openingBalance));
    const computedClosingBalance = roundMoney(
      openingBalance +
        lines
          .filter((line) => line.direction === "INFLOW")
          .reduce((sum, line) => sum + line.amount, 0) -
        lines
          .filter((line) => line.direction === "OUTFLOW")
          .reduce((sum, line) => sum + line.amount, 0)
    );
    const closingBalance =
      input.closingBalance === null || input.closingBalance === undefined || input.closingBalance === ""
        ? computedClosingBalance
        : roundMoney(numberOrZero(input.closingBalance));
    const statementNo =
      normalizeOptionalText(input.statementNo)?.toUpperCase() ??
      `STMT-${dateOnly(statementDate).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
    const statement = await tx.erpBankStatement.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: account.id,
        statementNo,
        statementType: normalizeCode(input.statementType ?? "BANK_STATEMENT", "statement type"),
        statementDate,
        fromDate,
        toDate,
        currencyCode: account.currencyCode,
        openingBalance,
        closingBalance,
        sourceType: normalizeCode(input.sourceType ?? "MANUAL", "statement source"),
        externalReference: normalizeOptionalText(input.externalReference),
        memo: normalizeOptionalText(input.memo),
        status: "OPEN",
        importedAt: new Date(),
        lines: {
          create: lines.map((line) => ({
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            cashbookAccountId: account.id,
            lineNo: line.lineNo,
            transactionDate: line.transactionDate,
            valueDate: line.valueDate,
            direction: line.direction,
            amount: line.amount,
            description: line.description,
            reference: line.reference,
            counterpartyName: line.counterpartyName,
            matchStatus: "UNMATCHED",
            status: activeStatus
          }))
        }
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved statement ${statementNo}.`,
      bankStatementId: statement.id,
      statementNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function matchErpBankStatementLine(
  input: MatchErpBankStatementLineRequest
): Promise<ErpBankReconciliationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getReconciliationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const statementLineId = normalizeRequiredText(input.statementLineId, "statement line");
    const cashbookEntryId = normalizeRequiredText(input.cashbookEntryId, "cashbook entry");
    const line = await tx.erpBankStatementLine.findFirst({
      where: {
        id: statementLineId,
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      include: {
        bankStatement: true
      }
    });

    if (!line) {
      throw new Error("Flash ERP cannot find that statement line.");
    }

    if (line.matchStatus !== "UNMATCHED") {
      throw new Error("Only unmatched statement lines can be matched.");
    }

    const entry = await tx.erpCashbookEntry.findFirst({
      where: {
        id: cashbookEntryId,
        companyId: line.companyId,
        cashbookAccountId: line.cashbookAccountId,
        status: "POSTED"
      }
    });

    if (!entry) {
      throw new Error("Flash ERP can only match posted cashbook entries from the same cashbook account.");
    }

    if (entry.reconciliationStatus === "RECONCILED") {
      throw new Error("That cashbook entry is already reconciled.");
    }

    if (entry.direction !== line.direction) {
      throw new Error("Statement line and cashbook entry directions must match.");
    }

    const matchedAmount = roundMoney(numberOrZero(input.matchedAmount ?? line.amount.toString()));
    const lineAmount = roundMoney(Number(line.amount));
    const entryAmount = roundMoney(Number(entry.amount));

    if (matchedAmount <= 0 || Math.abs(matchedAmount - lineAmount) > 0.01 || Math.abs(matchedAmount - entryAmount) > 0.01) {
      throw new Error("This slice supports exact one-to-one reconciliation matches.");
    }

    const duplicate = await tx.erpBankReconciliationMatch.findFirst({
      where: {
        statementLineId: line.id,
        cashbookEntryId: entry.id,
        status: "ACTIVE"
      },
      select: {
        id: true
      }
    });

    if (duplicate) {
      throw new Error("That statement line and cashbook entry are already matched.");
    }

    const match = await tx.erpBankReconciliationMatch.create({
      data: {
        retailOrgId: line.retailOrgId,
        companyId: line.companyId,
        cashbookAccountId: line.cashbookAccountId,
        bankStatementId: line.bankStatementId,
        statementLineId: line.id,
        cashbookEntryId: entry.id,
        matchedAmount,
        matchType: "MANUAL",
        matchedBy: "Enterprise reconciliation",
        status: "ACTIVE"
      },
      select: {
        id: true
      }
    });

    await tx.erpBankStatementLine.update({
      where: {
        id: line.id
      },
      data: {
        matchStatus: "MATCHED"
      }
    });
    await tx.erpCashbookEntry.update({
      where: {
        id: entry.id
      },
      data: {
        reconciliationStatus: "RECONCILED",
        clearedAt: new Date(),
        clearingReference: entry.clearingReference ?? line.reference ?? line.bankStatement.statementNo
      }
    });
    await tx.erpCashbookAccount.update({
      where: {
        id: line.cashbookAccountId
      },
      data: {
        lastReconciledAt: new Date()
      }
    });
    await refreshStatementStatus(tx, line.bankStatementId);

    return {
      message: `Flash ERP matched statement line ${line.lineNo} to cashbook entry ${entry.entryNo}.`,
      reconciliationMatchId: match.id,
      statementLineId: line.id,
      cashbookEntryId: entry.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function reverseErpBankReconciliationMatch(
  matchId: string,
  input: ReverseErpBankReconciliationMatchRequest = {}
): Promise<ErpBankReconciliationMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getReconciliationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const match = await tx.erpBankReconciliationMatch.findFirst({
      where: {
        id: matchId,
        retailOrgId: context.retailOrgId,
        status: "ACTIVE"
      },
      include: {
        statementLine: true,
        cashbookEntry: true
      }
    });

    if (!match) {
      throw new Error("Flash ERP cannot find an active reconciliation match.");
    }

    await tx.erpBankReconciliationMatch.update({
      where: {
        id: match.id
      },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversalReason: normalizeOptionalText(input.reason) ?? "Manual unmatch"
      }
    });
    await tx.erpBankStatementLine.update({
      where: {
        id: match.statementLineId
      },
      data: {
        matchStatus: "UNMATCHED"
      }
    });
    await tx.erpCashbookEntry.update({
      where: {
        id: match.cashbookEntryId
      },
      data: {
        reconciliationStatus: "UNRECONCILED",
        clearedAt: null
      }
    });
    await refreshStatementStatus(tx, match.bankStatementId);

    return {
      message: `Flash ERP unmatched statement line ${match.statementLine.lineNo} from cashbook entry ${match.cashbookEntry.entryNo}.`,
      reconciliationMatchId: match.id,
      statementLineId: match.statementLineId,
      cashbookEntryId: match.cashbookEntryId,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  GlAccountType,
  GlJournalStatus,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";

export type ErpFinancialStatementFilters = {
  companyCode?: string | null;
  fiscalYearCode?: string | null;
  fromPeriodCode?: string | null;
  toPeriodCode?: string | null;
  costCenterCode?: string | null;
};

export type UpdateErpFiscalPeriodStatusRequest = {
  fiscalPeriodId?: string | null;
  fiscalPeriodCode?: string | null;
  companyCode?: string | null;
  action?: string | null;
};

export type ErpFinancialStatementMutationResponse = {
  message: string;
  fiscalPeriodId?: string;
  fiscalPeriodCode?: string;
  status?: string;
  serverProcessedAt: string;
};

type StatementContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type ResolvedFilters = {
  companyCode: string;
  fiscalYearCode: string;
  fromPeriodCode: string;
  toPeriodCode: string;
  costCenterCode: string;
};

type StatementAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  accountGroup: string | null;
  sortOrder: number;
};

export type ErpFinancialStatementsWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  filters: ResolvedFilters;
  filterOptions: {
    companies: Array<{
      companyCode: string;
      label: string;
    }>;
    fiscalYears: Array<{
      fiscalYearCode: string;
      label: string;
    }>;
    fiscalPeriods: Array<{
      fiscalPeriodId: string;
      fiscalPeriodCode: string;
      fiscalYearCode: string;
      label: string;
      status: string;
    }>;
    costCenters: Array<{
      costCenterCode: string;
      label: string;
    }>;
  };
  metrics: {
    periodDebit: number;
    periodCredit: number;
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    expenses: number;
    netIncome: number;
    assets: number;
    liabilities: number;
    equity: number;
    currentEarnings: number;
    balanceCheck: number;
    openPeriods: number;
    closedPeriods: number;
  };
  incomeStatementRows: Array<{
    accountId: string;
    section: string;
    accountCode: string;
    accountName: string;
    accountGroup: string | null;
    amount: number;
  }>;
  balanceSheetRows: Array<{
    accountId: string | null;
    section: string;
    accountCode: string;
    accountName: string;
    accountGroup: string | null;
    amount: number;
  }>;
  periodCloseRows: Array<{
    fiscalPeriodId: string;
    fiscalYearCode: string;
    fiscalPeriodCode: string;
    periodNo: number;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
    postedJournals: number;
    totalDebit: number;
    totalCredit: number;
    outOfBalance: number;
    canClose: boolean;
    canReopen: boolean;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;
const deletedStatus = RecordStatus.DELETED;
const postedStatus = GlJournalStatus.POSTED;
const statementTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function trimToNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeCode(value?: string | null) {
  return trimToNull(value)?.toUpperCase() ?? null;
}

function normalizeRequiredAction(value?: string | null) {
  const normalized = normalizeCode(value);

  if (normalized !== "CLOSE" && normalized !== "REOPEN") {
    throw new Error("Flash ERP needs a period close action.");
  }

  return normalized;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isIncomeStatementType(accountType: string) {
  return [
    GlAccountType.REVENUE,
    GlAccountType.COST_OF_SALES,
    GlAccountType.EXPENSE
  ].includes(accountType);
}

function isBalanceSheetType(accountType: string) {
  return [
    GlAccountType.ASSET,
    GlAccountType.LIABILITY,
    GlAccountType.EQUITY
  ].includes(accountType);
}

function incomeStatementSection(accountType: string) {
  if (accountType === GlAccountType.REVENUE) {
    return "Revenue";
  }

  if (accountType === GlAccountType.COST_OF_SALES) {
    return "Cost of Sales";
  }

  return "Expenses";
}

function balanceSheetSection(accountType: string) {
  if (accountType === GlAccountType.ASSET) {
    return "Assets";
  }

  if (accountType === GlAccountType.LIABILITY) {
    return "Liabilities";
  }

  return "Equity";
}

function statementAmount(accountType: string, debitAmount: number, creditAmount: number) {
  if (
    accountType === GlAccountType.REVENUE ||
    accountType === GlAccountType.LIABILITY ||
    accountType === GlAccountType.EQUITY
  ) {
    return roundMoney(creditAmount - debitAmount);
  }

  return roundMoney(debitAmount - creditAmount);
}

function buildUnavailableErpFinancialStatementsWorkspace(
  reason: string,
  filters: ErpFinancialStatementFilters = {},
  currencyCode = "GHS"
): ErpFinancialStatementsWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    filters: {
      companyCode: normalizeCode(filters.companyCode) ?? "",
      fiscalYearCode: normalizeCode(filters.fiscalYearCode) ?? "",
      fromPeriodCode: normalizeCode(filters.fromPeriodCode) ?? "",
      toPeriodCode: normalizeCode(filters.toPeriodCode) ?? "",
      costCenterCode: normalizeCode(filters.costCenterCode) ?? ""
    },
    filterOptions: {
      companies: [],
      fiscalYears: [],
      fiscalPeriods: [],
      costCenters: []
    },
    metrics: {
      periodDebit: 0,
      periodCredit: 0,
      revenue: 0,
      costOfSales: 0,
      grossProfit: 0,
      expenses: 0,
      netIncome: 0,
      assets: 0,
      liabilities: 0,
      equity: 0,
      currentEarnings: 0,
      balanceCheck: 0,
      openPeriods: 0,
      closedPeriods: 0
    },
    incomeStatementRows: [],
    balanceSheetRows: [],
    periodCloseRows: []
  };
}

export { buildUnavailableErpFinancialStatementsWorkspace };

async function getStatementContext(): Promise<StatementContext | null> {
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

function accountSort(left: StatementAccount, right: StatementAccount) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.code.localeCompare(right.code);
}

function summarizeLinesByAccount(
  lines: Array<{
    accountId: string;
    debitAmount: Prisma.Decimal | number;
    creditAmount: Prisma.Decimal | number;
  }>
) {
  const totals = new Map<string, { debit: number; credit: number }>();

  for (const line of lines) {
    const current = totals.get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit = roundMoney(current.debit + Number(line.debitAmount));
    current.credit = roundMoney(current.credit + Number(line.creditAmount));
    totals.set(line.accountId, current);
  }

  return totals;
}

function buildIncomeRows(accounts: StatementAccount[], totalsByAccount: Map<string, { debit: number; credit: number }>) {
  return accounts
    .filter((account) => isIncomeStatementType(account.accountType))
    .sort(accountSort)
    .map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { debit: 0, credit: 0 };

      return {
        accountId: account.id,
        section: incomeStatementSection(account.accountType),
        accountCode: account.code,
        accountName: account.name,
        accountGroup: account.accountGroup,
        amount: statementAmount(account.accountType, totals.debit, totals.credit)
      };
    })
    .filter((row) => Math.abs(row.amount) > 0.005);
}

function buildBalanceRows(
  accounts: StatementAccount[],
  totalsByAccount: Map<string, { debit: number; credit: number }>,
  currentEarnings: number
) {
  const rows: ErpFinancialStatementsWorkspaceData["balanceSheetRows"] = accounts
    .filter((account) => isBalanceSheetType(account.accountType))
    .sort(accountSort)
    .map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { debit: 0, credit: 0 };

      return {
        accountId: account.id,
        section: balanceSheetSection(account.accountType),
        accountCode: account.code,
        accountName: account.name,
        accountGroup: account.accountGroup,
        amount: statementAmount(account.accountType, totals.debit, totals.credit)
      };
    })
    .filter((row) => Math.abs(row.amount) > 0.005);

  if (Math.abs(currentEarnings) > 0.005) {
    rows.push({
      accountId: null,
      section: "Equity",
      accountCode: "CURRENT-EARNINGS",
      accountName: "Current earnings",
      accountGroup: "Current period result",
      amount: currentEarnings
    });
  }

  return rows;
}

export async function getErpFinancialStatementsWorkspace(
  input: ErpFinancialStatementFilters = {}
): Promise<ErpFinancialStatementsWorkspaceData> {
  const context = await getStatementContext();

  if (!context) {
    return buildUnavailableErpFinancialStatementsWorkspace(
      "Flash ERP enterprise node is not configured yet.",
      input
    );
  }

  const companies = await prisma.erpCompany.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: {
        not: deletedStatus
      }
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
  const selectedCompany =
    companies.find((company) => company.code === normalizeCode(input.companyCode)) ??
    companies.find((company) => company.isPrimary && company.status === activeStatus) ??
    companies[0] ??
    null;

  if (!selectedCompany) {
    return buildUnavailableErpFinancialStatementsWorkspace(
      "Create a company in Finance foundation before opening financial statements.",
      input,
      context.retailOrg.baseCurrencyCode
    );
  }

  const [fiscalYears, allFiscalPeriods, accounts, costCenters] = await Promise.all([
    prisma.erpFiscalYear.findMany({
      where: {
        companyId: selectedCompany.id,
        status: {
          not: deletedStatus
        }
      },
      orderBy: [{ startsOn: "desc" }]
    }),
    prisma.erpFiscalPeriod.findMany({
      where: {
        companyId: selectedCompany.id,
        status: {
          not: deletedStatus
        }
      },
      include: {
        fiscalYear: {
          select: {
            code: true
          }
        }
      },
      orderBy: [{ startsOn: "asc" }]
    }),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: {
          not: deletedStatus
        },
        OR: [{ companyId: selectedCompany.id }, { companyId: null }]
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        accountGroup: true,
        sortOrder: true
      }
    }),
    prisma.erpFinanceDimension.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        companyId: selectedCompany.id,
        dimensionType: "COST_CENTER",
        status: activeStatus
      },
      orderBy: [{ code: "asc" }],
      select: {
        code: true,
        name: true
      }
    })
  ]);
  const today = new Date();
  const currentFiscalYear =
    fiscalYears.find((year) => year.startsOn <= today && year.endsOn >= today) ??
    fiscalYears.find((year) => year.status === "OPEN") ??
    fiscalYears[0] ??
    null;
  const selectedFiscalYear =
    fiscalYears.find((year) => year.code === normalizeCode(input.fiscalYearCode)) ??
    currentFiscalYear;

  if (!selectedFiscalYear) {
    return buildUnavailableErpFinancialStatementsWorkspace(
      "Create a fiscal year in Finance foundation before opening financial statements.",
      input,
      selectedCompany.baseCurrencyCode || context.retailOrg.baseCurrencyCode
    );
  }

  const periodsForYear = allFiscalPeriods.filter(
    (period) => period.fiscalYearId === selectedFiscalYear.id
  );
  const currentPeriod =
    periodsForYear.find((period) => period.startsOn <= today && period.endsOn >= today) ??
    periodsForYear.find((period) => period.status === "OPEN") ??
    periodsForYear[periodsForYear.length - 1] ??
    null;
  const defaultFromPeriod = periodsForYear[0] ?? null;
  const defaultToPeriod = currentPeriod ?? periodsForYear[periodsForYear.length - 1] ?? defaultFromPeriod;
  let fromPeriod =
    periodsForYear.find((period) => period.code === normalizeCode(input.fromPeriodCode)) ??
    defaultFromPeriod;
  let toPeriod =
    periodsForYear.find((period) => period.code === normalizeCode(input.toPeriodCode)) ??
    defaultToPeriod;

  if (fromPeriod && toPeriod && fromPeriod.periodNo > toPeriod.periodNo) {
    [fromPeriod, toPeriod] = [toPeriod, fromPeriod];
  }
  const selectedCostCenter =
    costCenters.find((costCenter) => costCenter.code === normalizeCode(input.costCenterCode)) ??
    null;
  const costCenterLineWhere = selectedCostCenter
    ? {
        dimensionType: "COST_CENTER",
        dimensionCode: selectedCostCenter.code
      }
    : {};

  const periodsInRange =
    fromPeriod && toPeriod
      ? periodsForYear.filter(
          (period) => period.periodNo >= fromPeriod.periodNo && period.periodNo <= toPeriod.periodNo
        )
      : [];
  const periodStart = fromPeriod?.startsOn ?? selectedFiscalYear.startsOn;
  const periodEnd = endOfDay(toPeriod?.endsOn ?? selectedFiscalYear.endsOn);
  const fiscalYearStart = selectedFiscalYear.startsOn;
  const accountIds = accounts.map((account) => account.id);
  const noAccountWhere = accountIds.length > 0 ? { accountId: { in: accountIds } } : { accountId: "__NO_ACCOUNT__" };
  const [periodLines, balanceLines, companyYearToDateLines, periodJournalEntries] = await Promise.all([
    prisma.glJournalLine.findMany({
      where: {
        ...noAccountWhere,
        ...costCenterLineWhere,
        journalEntry: {
          retailOrgId: context.retailOrgId,
          companyId: selectedCompany.id,
          status: postedStatus,
          postingDate: {
            gte: periodStart,
            lte: periodEnd
          }
        }
      }
    }),
    prisma.glJournalLine.findMany({
      where: {
        ...noAccountWhere,
        journalEntry: {
          retailOrgId: context.retailOrgId,
          companyId: selectedCompany.id,
          status: postedStatus,
          postingDate: {
            lte: periodEnd
          }
        }
      }
    }),
    prisma.glJournalLine.findMany({
      where: {
        ...noAccountWhere,
        journalEntry: {
          retailOrgId: context.retailOrgId,
          companyId: selectedCompany.id,
          status: postedStatus,
          postingDate: {
            gte: fiscalYearStart,
            lte: periodEnd
          }
        }
      }
    }),
    prisma.glJournalEntry.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        companyId: selectedCompany.id,
        status: postedStatus,
        fiscalPeriodId: {
          in: periodsForYear.map((period) => period.id)
        }
      },
      select: {
        fiscalPeriodId: true,
        lines: {
          select: {
            debitAmount: true,
            creditAmount: true
          }
        }
      }
    })
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const periodTotalsByAccount = summarizeLinesByAccount(periodLines);
  const balanceTotalsByAccount = summarizeLinesByAccount(balanceLines);
  const companyYtdTotalsByAccount = summarizeLinesByAccount(companyYearToDateLines);
  const incomeStatementRows = buildIncomeRows(accounts, periodTotalsByAccount);
  const companyYtdIncomeRows = buildIncomeRows(accounts, companyYtdTotalsByAccount);
  const revenue = roundMoney(
    incomeStatementRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.REVENUE)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const costOfSales = roundMoney(
    incomeStatementRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.COST_OF_SALES)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const expenses = roundMoney(
    incomeStatementRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.EXPENSE)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const grossProfit = roundMoney(revenue - costOfSales);
  const netIncome = roundMoney(grossProfit - expenses);
  const companyYtdRevenue = roundMoney(
    companyYtdIncomeRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.REVENUE)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const companyYtdCostOfSales = roundMoney(
    companyYtdIncomeRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.COST_OF_SALES)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const companyYtdExpenses = roundMoney(
    companyYtdIncomeRows
      .filter((row) => accountsById.get(row.accountId)?.accountType === GlAccountType.EXPENSE)
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const currentEarnings = roundMoney(companyYtdRevenue - companyYtdCostOfSales - companyYtdExpenses);
  const balanceSheetRows = buildBalanceRows(accounts, balanceTotalsByAccount, currentEarnings);
  const assets = roundMoney(
    balanceSheetRows.filter((row) => row.section === "Assets").reduce((sum, row) => sum + row.amount, 0)
  );
  const liabilities = roundMoney(
    balanceSheetRows.filter((row) => row.section === "Liabilities").reduce((sum, row) => sum + row.amount, 0)
  );
  const equity = roundMoney(
    balanceSheetRows
      .filter((row) => row.section === "Equity" && row.accountCode !== "CURRENT-EARNINGS")
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const balanceCheck = roundMoney(assets - liabilities - equity - currentEarnings);
  const periodTotals = new Map<string, { journals: number; debit: number; credit: number }>();

  for (const journal of periodJournalEntries) {
    if (!journal.fiscalPeriodId) {
      continue;
    }

    const current = periodTotals.get(journal.fiscalPeriodId) ?? {
      journals: 0,
      debit: 0,
      credit: 0
    };
    current.journals += 1;

    for (const line of journal.lines) {
      current.debit = roundMoney(current.debit + Number(line.debitAmount));
      current.credit = roundMoney(current.credit + Number(line.creditAmount));
    }

    periodTotals.set(journal.fiscalPeriodId, current);
  }

  const periodCloseRows = periodsForYear.map((period) => {
    const totals = periodTotals.get(period.id) ?? { journals: 0, debit: 0, credit: 0 };
    const outOfBalance = roundMoney(totals.debit - totals.credit);

    return {
      fiscalPeriodId: period.id,
      fiscalYearCode: period.fiscalYear.code,
      fiscalPeriodCode: period.code,
      periodNo: period.periodNo,
      name: period.name,
      startsOn: period.startsOn.toISOString(),
      endsOn: period.endsOn.toISOString(),
      status: period.status,
      postedJournals: totals.journals,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      outOfBalance,
      canClose: period.status !== "CLOSED" && Math.abs(outOfBalance) <= 0.01,
      canReopen: period.status === "CLOSED"
    };
  });
  const periodDebit = roundMoney(periodLines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
  const periodCredit = roundMoney(periodLines.reduce((sum, line) => sum + Number(line.creditAmount), 0));

  return {
    currencyCode: selectedCompany.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: selectedCompany.tradingName ?? selectedCompany.legalName,
    statusMessage:
      selectedCostCenter
        ? `Income statement rows are filtered to shop cost center ${selectedCostCenter.code} - ${selectedCostCenter.name}; balance sheet and period close remain company-level.`
        : "Financial statements are derived from posted GL lines; period close updates fiscal-period status used by the posting engine.",
    refreshedAt: new Date().toISOString(),
    filters: {
      companyCode: selectedCompany.code,
      fiscalYearCode: selectedFiscalYear.code,
      fromPeriodCode: fromPeriod?.code ?? "",
      toPeriodCode: toPeriod?.code ?? "",
      costCenterCode: selectedCostCenter?.code ?? ""
    },
    filterOptions: {
      companies: companies.map((company) => ({
        companyCode: company.code,
        label: `${company.code} - ${company.tradingName ?? company.legalName}`
      })),
      fiscalYears: fiscalYears.map((year) => ({
        fiscalYearCode: year.code,
        label: `${year.code} - ${year.name}`
      })),
      fiscalPeriods: allFiscalPeriods.map((period) => ({
        fiscalPeriodId: period.id,
        fiscalPeriodCode: period.code,
        fiscalYearCode: period.fiscalYear.code,
        label: `${period.code} - ${period.name}`,
        status: period.status
      })),
      costCenters: costCenters.map((costCenter) => ({
        costCenterCode: costCenter.code,
        label: `${costCenter.code} - ${costCenter.name}`
      }))
    },
    metrics: {
      periodDebit,
      periodCredit,
      revenue,
      costOfSales,
      grossProfit,
      expenses,
      netIncome,
      assets,
      liabilities,
      equity,
      currentEarnings,
      balanceCheck,
      openPeriods: periodCloseRows.filter((period) => period.status !== "CLOSED").length,
      closedPeriods: periodCloseRows.filter((period) => period.status === "CLOSED").length
    },
    incomeStatementRows,
    balanceSheetRows,
    periodCloseRows
  };
}

export async function updateErpFiscalPeriodCloseStatus(
  input: UpdateErpFiscalPeriodStatusRequest
): Promise<ErpFinancialStatementMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const action = normalizeRequiredAction(input.action);
    const context = await getStatementContext();

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const companyCode = normalizeCode(input.companyCode);
    const company = await tx.erpCompany.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        ...(companyCode ? { code: companyCode } : {}),
        status: {
          not: deletedStatus
        }
      },
      orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
    });

    if (!company) {
      throw new Error("Flash ERP cannot find the selected company.");
    }

    const periodId = trimToNull(input.fiscalPeriodId);
    const periodCode = normalizeCode(input.fiscalPeriodCode);
    const period = await tx.erpFiscalPeriod.findFirst({
      where: {
        companyId: company.id,
        ...(periodId ? { id: periodId } : {}),
        ...(periodId ? {} : periodCode ? { code: periodCode } : {}),
        status: {
          not: deletedStatus
        }
      },
      include: {
        fiscalYear: true
      }
    });

    if (!period) {
      throw new Error("Flash ERP cannot find the selected fiscal period.");
    }

    if (action === "CLOSE") {
      if (period.status === "CLOSED") {
        return {
          message: `Fiscal period ${period.code} is already closed.`,
          fiscalPeriodId: period.id,
          fiscalPeriodCode: period.code,
          status: period.status,
          serverProcessedAt: new Date().toISOString()
        };
      }

      const lines = await tx.glJournalLine.findMany({
        where: {
          journalEntry: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            fiscalPeriodId: period.id,
            status: postedStatus
          }
        },
        select: {
          debitAmount: true,
          creditAmount: true
        }
      });
      const totalDebit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
      const totalCredit = roundMoney(lines.reduce((sum, line) => sum + Number(line.creditAmount), 0));

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(
          `Fiscal period ${period.code} is out of balance by ${roundMoney(totalDebit - totalCredit)}.`
        );
      }

      const updated = await tx.erpFiscalPeriod.update({
        where: {
          id: period.id
        },
        data: {
          status: "CLOSED"
        }
      });
      const openPeriodCount = await tx.erpFiscalPeriod.count({
        where: {
          fiscalYearId: period.fiscalYearId,
          status: {
            notIn: ["CLOSED", deletedStatus]
          }
        }
      });

      if (openPeriodCount === 0) {
        await tx.erpFiscalYear.update({
          where: {
            id: period.fiscalYearId
          },
          data: {
            status: "CLOSED"
          }
        });
      }

      return {
        message: `Closed fiscal period ${updated.code}.`,
        fiscalPeriodId: updated.id,
        fiscalPeriodCode: updated.code,
        status: updated.status,
        serverProcessedAt: new Date().toISOString()
      };
    }

    if (period.status !== "CLOSED") {
      return {
        message: `Fiscal period ${period.code} is already open.`,
        fiscalPeriodId: period.id,
        fiscalPeriodCode: period.code,
        status: period.status,
        serverProcessedAt: new Date().toISOString()
      };
    }

    const updated = await tx.erpFiscalPeriod.update({
      where: {
        id: period.id
      },
      data: {
        status: "OPEN"
      }
    });

    if (period.fiscalYear.status === "CLOSED") {
      await tx.erpFiscalYear.update({
        where: {
          id: period.fiscalYearId
        },
        data: {
          status: "OPEN"
        }
      });
    }

    return {
      message: `Reopened fiscal period ${updated.code}.`,
      fiscalPeriodId: updated.id,
      fiscalPeriodCode: updated.code,
      status: updated.status,
      serverProcessedAt: new Date().toISOString()
    };
  }, statementTransactionOptions);
}

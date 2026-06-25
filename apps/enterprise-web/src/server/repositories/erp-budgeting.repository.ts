import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type BudgetingContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type BudgetingCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

export type UpsertErpBudgetVersionRequest = {
  budgetVersionId?: string | null;
  fiscalYearCode?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  budgetType?: string | null;
  scenario?: string | null;
  currencyCode?: string | null;
  status?: string | null;
};

export type UpsertErpFinanceDimensionRequest = {
  financeDimensionId?: string | null;
  dimensionType?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
};

export type UpsertErpBudgetLineRequest = {
  budgetVersionId?: string | null;
  budgetVersionCode?: string | null;
  accountCode?: string | null;
  financeDimensionId?: string | null;
  dimensionType?: string | null;
  dimensionCode?: string | null;
  description?: string | null;
  annualAmount?: number | string | null;
  spreadMethod?: string | null;
  status?: string | null;
  periodAmounts?: Array<{
    fiscalPeriodId?: string | null;
    periodCode?: string | null;
    periodNo?: number | string | null;
    amount?: number | string | null;
  }> | null;
};

export type ErpBudgetingMutationResponse = {
  message: string;
  budgetVersionId?: string;
  budgetLineId?: string;
  financeDimensionId?: string;
  serverProcessedAt: string;
};

export type ErpBudgetingWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  fiscalYearOptions: Array<{
    fiscalYearId: string;
    code: string;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
  }>;
  accountOptions: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    label: string;
  }>;
  financeDimensionRows: Array<{
    financeDimensionId: string;
    dimensionType: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
  }>;
  budgetVersionRows: Array<{
    budgetVersionId: string;
    fiscalYearCode: string;
    code: string;
    name: string;
    description: string | null;
    budgetType: string;
    scenario: string;
    currencyCode: string;
    totalAmount: number;
    lineCount: number;
    status: string;
    approvedAt: string | null;
    lockedAt: string | null;
  }>;
  budgetLineRows: Array<{
    budgetLineId: string;
    budgetVersionId: string;
    budgetVersionCode: string;
    fiscalYearCode: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    financeDimensionId: string | null;
    dimensionType: string | null;
    dimensionCode: string | null;
    dimensionKey: string;
    dimensionName: string | null;
    lineNo: number;
    description: string | null;
    annualAmount: number;
    spreadMethod: string;
    status: string;
    periodAmounts: Array<{
      fiscalPeriodId: string;
      periodCode: string;
      periodNo: number;
      amount: number;
    }>;
  }>;
  budgetPeriodRows: Array<{
    budgetPeriodAmountId: string;
    budgetVersionCode: string;
    fiscalYearCode: string;
    fiscalPeriodCode: string;
    periodNo: number;
    accountCode: string;
    accountName: string;
    financeDimensionId: string | null;
    dimensionType: string | null;
    dimensionCode: string | null;
    dimensionKey: string;
    dimensionName: string | null;
    periodAmount: number;
    status: string;
  }>;
  budgetVsActualRows: Array<{
    budgetVersionId: string;
    budgetVersionCode: string;
    fiscalYearCode: string;
    fiscalPeriodCode: string;
    periodNo: number;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    financeDimensionId: string | null;
    dimensionType: string | null;
    dimensionCode: string | null;
    dimensionKey: string;
    dimensionName: string | null;
    budgetAmount: number;
    actualAmount: number;
    varianceAmount: number;
    ytdBudgetAmount: number;
    ytdActualAmount: number;
    ytdVarianceAmount: number;
  }>;
  metrics: {
    budgetVersions: number;
    budgetLines: number;
    annualBudget: number;
    currentYearBudget: number;
    currentYearActual: number;
    currentYearVariance: number;
  };
};

const activeStatus = RecordStatus.ACTIVE;
const accountOnlyDimensionKey = "ACCOUNT_ONLY";
const financeDimensionTypes = ["DEPARTMENT", "COST_CENTER", "PROJECT", "OPERATING_UNIT"];

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

function normalizeOptionalCode(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 40);
}

function normalizeStatus(value: string | null | undefined, allowed = ["ACTIVE", "INACTIVE"]) {
  const normalized = normalizeOptionalCode(value) ?? activeStatus;

  if (!allowed.includes(normalized)) {
    throw new Error(`Flash ERP status must be one of: ${allowed.join(", ")}.`);
  }

  return normalized;
}

function normalizeDimensionType(value: string | null | undefined) {
  const normalized = normalizeOptionalCode(value);

  if (!normalized) {
    return null;
  }

  if (!financeDimensionTypes.includes(normalized)) {
    throw new Error(`Flash ERP finance dimension type must be one of: ${financeDimensionTypes.join(", ")}.`);
  }

  return normalized;
}

function buildDimensionKey(dimensionType: string | null, dimensionCode: string | null) {
  return dimensionType && dimensionCode ? `${dimensionType}:${dimensionCode}` : accountOnlyDimensionKey;
}

function dimensionLabel({
  dimensionType,
  dimensionCode,
  dimensionName
}: {
  dimensionType: string | null;
  dimensionCode: string | null;
  dimensionName: string | null;
}) {
  if (!dimensionType || !dimensionCode) {
    return "Account only";
  }

  return dimensionName ? `${dimensionType}:${dimensionCode} - ${dimensionName}` : `${dimensionType}:${dimensionCode}`;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildUnavailableErpBudgetingWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpBudgetingWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    fiscalYearOptions: [],
    accountOptions: [],
    financeDimensionRows: [],
    budgetVersionRows: [],
    budgetLineRows: [],
    budgetPeriodRows: [],
    budgetVsActualRows: [],
    metrics: {
      budgetVersions: 0,
      budgetLines: 0,
      annualBudget: 0,
      currentYearBudget: 0,
      currentYearActual: 0,
      currentYearVariance: 0
    }
  };
}

export { buildUnavailableErpBudgetingWorkspace };

async function getBudgetingContext(
  tx: Prisma.TransactionClient = prisma
): Promise<BudgetingContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: BudgetingContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

async function getDefaultFiscalYear(tx: Prisma.TransactionClient, companyId: string) {
  return tx.erpFiscalYear.findFirst({
    where: {
      companyId,
      status: {
        not: "CLOSED"
      }
    },
    orderBy: [{ startsOn: "desc" }, { code: "desc" }]
  });
}

async function getFiscalYearByInput(
  tx: Prisma.TransactionClient,
  companyId: string,
  fiscalYearCode?: string | null
) {
  const normalizedCode = normalizeOptionalCode(fiscalYearCode);

  if (!normalizedCode) {
    return getDefaultFiscalYear(tx, companyId);
  }

  return tx.erpFiscalYear.findFirst({
    where: {
      companyId,
      code: normalizedCode
    }
  });
}

async function ensureDefaultBudgetingFoundation(
  tx: Prisma.TransactionClient,
  context: BudgetingContext,
  company: BudgetingCompany
) {
  const fiscalYear = await getDefaultFiscalYear(tx, company.id);

  if (!fiscalYear) {
    return;
  }

  await tx.erpBudgetVersion.upsert({
    where: {
      companyId_fiscalYearId_code: {
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        code: "BASE"
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      fiscalYearId: fiscalYear.id,
      code: "BASE",
      name: `${fiscalYear.code} base budget`,
      description: "Default planning budget version.",
      budgetType: "OPERATING",
      scenario: "BASE",
      currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
      status: "DRAFT"
    },
    update: {}
  });
}

async function getBudgetVersionForLine(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: UpsertErpBudgetLineRequest
) {
  const budgetVersionId = normalizeOptionalText(input.budgetVersionId);

  if (budgetVersionId) {
    return tx.erpBudgetVersion.findFirst({
      where: {
        id: budgetVersionId,
        companyId
      },
      include: {
        fiscalYear: true
      }
    });
  }

  const budgetVersionCode = normalizeOptionalCode(input.budgetVersionCode) ?? "BASE";

  return tx.erpBudgetVersion.findFirst({
    where: {
      companyId,
      code: budgetVersionCode,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      fiscalYear: true
    }
  });
}

async function resolveBudgetLineDimension(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: {
    financeDimensionId?: string | null;
    dimensionType?: string | null;
    dimensionCode?: string | null;
  }
) {
  const financeDimensionId = normalizeOptionalText(input.financeDimensionId);
  const requestedDimensionType = normalizeDimensionType(input.dimensionType);
  const requestedDimensionCode = normalizeOptionalCode(input.dimensionCode);

  if (!financeDimensionId && !requestedDimensionType && !requestedDimensionCode) {
    return {
      financeDimensionId: null,
      dimensionType: null,
      dimensionCode: null,
      dimensionKey: accountOnlyDimensionKey
    };
  }

  if (financeDimensionId) {
    const dimension = await tx.erpFinanceDimension.findFirst({
      where: {
        id: financeDimensionId,
        companyId,
        status: activeStatus
      },
      select: {
        id: true,
        dimensionType: true,
        code: true
      }
    });

    if (!dimension) {
      throw new Error("Flash ERP cannot find the requested active finance dimension.");
    }

    return {
      financeDimensionId: dimension.id,
      dimensionType: dimension.dimensionType,
      dimensionCode: dimension.code,
      dimensionKey: buildDimensionKey(dimension.dimensionType, dimension.code)
    };
  }

  if (!requestedDimensionType || !requestedDimensionCode) {
    throw new Error("Flash ERP budget dimensions need both a dimension type and dimension code.");
  }

  const dimension = await tx.erpFinanceDimension.findFirst({
    where: {
      companyId,
      dimensionType: requestedDimensionType,
      code: requestedDimensionCode,
      status: activeStatus
    },
    select: {
      id: true,
      dimensionType: true,
      code: true
    }
  });

  if (!dimension) {
    throw new Error(`Flash ERP cannot find active finance dimension ${requestedDimensionType}:${requestedDimensionCode}.`);
  }

  return {
    financeDimensionId: dimension.id,
    dimensionType: dimension.dimensionType,
    dimensionCode: dimension.code,
    dimensionKey: buildDimensionKey(dimension.dimensionType, dimension.code)
  };
}

function calculateSpread(
  annualAmount: number,
  periods: Array<{ id: string; code: string; periodNo: number }>,
  periodAmounts: UpsertErpBudgetLineRequest["periodAmounts"]
) {
  if (periodAmounts?.length) {
    const explicitAmounts = new Map<string, number>();

    for (const amount of periodAmounts) {
      const periodNo = Math.trunc(numberOrZero(amount.periodNo));
      const periodKey =
        normalizeOptionalText(amount.fiscalPeriodId) ??
        normalizeOptionalCode(amount.periodCode) ??
        (periodNo > 0 ? String(periodNo) : null);

      if (!periodKey) {
        continue;
      }

      explicitAmounts.set(periodKey, roundMoney(numberOrZero(amount.amount)));
    }

    return periods.map((period) => ({
      fiscalPeriodId: period.id,
      periodNo: period.periodNo,
      amount: roundMoney(
        explicitAmounts.get(period.id) ??
          explicitAmounts.get(period.code) ??
          explicitAmounts.get(String(period.periodNo)) ??
          0
      )
    }));
  }

  if (periods.length === 0) {
    return [];
  }

  const baseAmount = roundMoney(annualAmount / periods.length);

  return periods.map((period, index) => ({
    fiscalPeriodId: period.id,
    periodNo: period.periodNo,
    amount:
      index === periods.length - 1
        ? roundMoney(annualAmount - baseAmount * (periods.length - 1))
        : baseAmount
  }));
}

async function updateBudgetVersionTotal(tx: Prisma.TransactionClient, budgetVersionId: string) {
  const lines = await tx.erpBudgetLine.findMany({
    where: {
      budgetVersionId,
      status: activeStatus
    },
    select: {
      annualAmount: true
    }
  });

  const totalAmount = roundMoney(lines.reduce((sum, line) => sum + Number(line.annualAmount), 0));

  await tx.erpBudgetVersion.update({
    where: {
      id: budgetVersionId
    },
    data: {
      totalAmount
    }
  });
}

export async function getErpBudgetingWorkspace(): Promise<ErpBudgetingWorkspaceData> {
  const context = await getBudgetingContext();

  if (!context) {
    return buildUnavailableErpBudgetingWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpBudgetingWorkspace(
      "Create a company in Finance foundation before using budgeting.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await prisma.$transaction((tx) => ensureDefaultBudgetingFoundation(tx, context, company));

  const fiscalYears = await prisma.erpFiscalYear.findMany({
    where: {
      companyId: company.id,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ startsOn: "desc" }, { code: "desc" }],
    include: {
      periods: {
        orderBy: {
          periodNo: "asc"
        }
      }
    }
  });
  const activeFiscalYear = fiscalYears.find((fiscalYear) => fiscalYear.status !== "CLOSED") ?? fiscalYears[0];
  const periodIds = fiscalYears.flatMap((fiscalYear) =>
    fiscalYear.periods.map((period) => period.id)
  );

  const [accounts, financeDimensions, budgetVersions, budgetLines, budgetPeriods, actualLines] = await Promise.all([
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpFinanceDimension.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ dimensionType: "asc" }, { code: "asc" }]
    }),
    prisma.erpBudgetVersion.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ fiscalYear: { startsOn: "desc" } }, { code: "asc" }],
      include: {
        fiscalYear: true,
        lines: {
          select: {
            id: true
          }
        }
      },
      take: 100
    }),
    prisma.erpBudgetLine.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ budgetVersion: { fiscalYear: { startsOn: "desc" } } }, { lineNo: "asc" }],
      include: {
        budgetVersion: {
          include: {
            fiscalYear: true
          }
        },
        account: true,
        financeDimension: true,
        periodAmounts: {
          orderBy: {
            periodNo: "asc"
          },
          include: {
            fiscalPeriod: true
          }
        }
      },
      take: 300
    }),
    prisma.erpBudgetPeriodAmount.findMany({
      where: {
        companyId: company.id,
        status: activeStatus
      },
      orderBy: [{ budgetVersion: { code: "asc" } }, { periodNo: "asc" }, { accountCode: "asc" }],
      include: {
        budgetVersion: {
          include: {
            fiscalYear: true
          }
        },
        account: true,
        financeDimension: true,
        fiscalPeriod: true
      },
      take: 500
    }),
    periodIds.length
      ? prisma.glJournalLine.findMany({
          where: {
            journalEntry: {
              companyId: company.id,
              status: "POSTED",
              fiscalPeriodId: {
                in: periodIds
              }
            }
          },
          include: {
            account: true,
            journalEntry: {
              select: {
                fiscalPeriodId: true
              }
            }
          },
          take: 10000
        })
      : []
  ]);
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const dimensionByKey = new Map(
    financeDimensions.map((dimension) => [
      buildDimensionKey(dimension.dimensionType, dimension.code),
      dimension
    ])
  );
  const actualByPeriodAccount = new Map<string, number>();
  const actualByPeriodAccountDimension = new Map<string, number>();

  for (const line of actualLines) {
    const fiscalPeriodId = line.journalEntry.fiscalPeriodId;

    if (!fiscalPeriodId) {
      continue;
    }

    const actualAmount =
      line.account.normalBalance === "DEBIT"
        ? Number(line.debitAmount) - Number(line.creditAmount)
        : Number(line.creditAmount) - Number(line.debitAmount);
    const key = `${fiscalPeriodId}:${line.account.code}`;
    actualByPeriodAccount.set(key, roundMoney((actualByPeriodAccount.get(key) ?? 0) + actualAmount));

    const lineDimensionKey = buildDimensionKey(line.dimensionType, line.dimensionCode);

    if (lineDimensionKey !== accountOnlyDimensionKey) {
      const dimensionKey = `${fiscalPeriodId}:${line.account.code}:${lineDimensionKey}`;
      actualByPeriodAccountDimension.set(
        dimensionKey,
        roundMoney((actualByPeriodAccountDimension.get(dimensionKey) ?? 0) + actualAmount)
      );
    }
  }

  const ytdByVersionAccount = new Map<string, { budget: number; actual: number }>();
  const budgetVsActualRows = budgetPeriods
    .map((periodAmount) => {
      const account = periodAmount.account ?? accountByCode.get(periodAmount.accountCode);
      const dimensionKey = periodAmount.dimensionKey || accountOnlyDimensionKey;
      const dimension = periodAmount.financeDimension ?? dimensionByKey.get(dimensionKey) ?? null;
      const actualKey =
        dimensionKey === accountOnlyDimensionKey
          ? `${periodAmount.fiscalPeriodId}:${periodAmount.accountCode}`
          : `${periodAmount.fiscalPeriodId}:${periodAmount.accountCode}:${dimensionKey}`;
      const actualAmount =
        dimensionKey === accountOnlyDimensionKey
          ? actualByPeriodAccount.get(actualKey) ?? 0
          : actualByPeriodAccountDimension.get(actualKey) ?? 0;
      const budgetAmount = Number(periodAmount.periodAmount);
      const ytdKey = `${periodAmount.budgetVersionId}:${periodAmount.accountCode}:${dimensionKey}`;
      const currentYtd = ytdByVersionAccount.get(ytdKey) ?? { budget: 0, actual: 0 };
      const nextYtd = {
        budget: roundMoney(currentYtd.budget + budgetAmount),
        actual: roundMoney(currentYtd.actual + actualAmount)
      };
      ytdByVersionAccount.set(ytdKey, nextYtd);

      return {
        budgetVersionId: periodAmount.budgetVersionId,
        budgetVersionCode: periodAmount.budgetVersion.code,
        fiscalYearCode: periodAmount.budgetVersion.fiscalYear.code,
        fiscalPeriodCode: periodAmount.fiscalPeriod.code,
        periodNo: periodAmount.periodNo,
        accountCode: periodAmount.accountCode,
        accountName: account?.name ?? "Unmapped account",
        accountType: account?.accountType ?? "UNKNOWN",
        normalBalance: account?.normalBalance ?? "DEBIT",
        financeDimensionId: periodAmount.financeDimensionId,
        dimensionType: periodAmount.dimensionType,
        dimensionCode: periodAmount.dimensionCode,
        dimensionKey,
        dimensionName: dimension?.name ?? null,
        budgetAmount,
        actualAmount,
        varianceAmount: roundMoney(actualAmount - budgetAmount),
        ytdBudgetAmount: nextYtd.budget,
        ytdActualAmount: nextYtd.actual,
        ytdVarianceAmount: roundMoney(nextYtd.actual - nextYtd.budget)
      };
    })
    .sort((left, right) => {
      const versionCompare = left.budgetVersionCode.localeCompare(right.budgetVersionCode);

      if (versionCompare !== 0) {
        return versionCompare;
      }

      const accountCompare = left.accountCode.localeCompare(right.accountCode);

      if (accountCompare !== 0) {
        return accountCompare;
      }

      const dimensionCompare = left.dimensionKey.localeCompare(right.dimensionKey);

      if (dimensionCompare !== 0) {
        return dimensionCompare;
      }

      return left.periodNo - right.periodNo;
    });
  const activeBudgetVsActualRows = budgetVsActualRows.filter(
    (row) => row.fiscalYearCode === activeFiscalYear?.code
  );
  const currentYearBudget = roundMoney(
    activeBudgetVsActualRows.reduce((sum, row) => sum + row.budgetAmount, 0)
  );
  const currentYearActual = roundMoney(
    activeBudgetVsActualRows.reduce((sum, row) => sum + row.actualAmount, 0)
  );

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Budgeting prepares company fiscal-year plans and compares them with posted GL activity without changing journal history.",
    refreshedAt: new Date().toISOString(),
    fiscalYearOptions: fiscalYears.map((fiscalYear) => ({
      fiscalYearId: fiscalYear.id,
      code: fiscalYear.code,
      name: fiscalYear.name,
      startsOn: dateOnly(fiscalYear.startsOn),
      endsOn: dateOnly(fiscalYear.endsOn),
      status: fiscalYear.status
    })),
    accountOptions: accounts.map((account) => ({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      label: `${account.code} - ${account.name}`
    })),
    financeDimensionRows: financeDimensions.map((dimension) => ({
      financeDimensionId: dimension.id,
      dimensionType: dimension.dimensionType,
      code: dimension.code,
      name: dimension.name,
      description: dimension.description,
      status: dimension.status
    })),
    budgetVersionRows: budgetVersions.map((budgetVersion) => ({
      budgetVersionId: budgetVersion.id,
      fiscalYearCode: budgetVersion.fiscalYear.code,
      code: budgetVersion.code,
      name: budgetVersion.name,
      description: budgetVersion.description,
      budgetType: budgetVersion.budgetType,
      scenario: budgetVersion.scenario,
      currencyCode: budgetVersion.currencyCode,
      totalAmount: Number(budgetVersion.totalAmount),
      lineCount: budgetVersion.lines.length,
      status: budgetVersion.status,
      approvedAt: budgetVersion.approvedAt?.toISOString() ?? null,
      lockedAt: budgetVersion.lockedAt?.toISOString() ?? null
    })),
    budgetLineRows: budgetLines.map((line) => ({
      budgetLineId: line.id,
      budgetVersionId: line.budgetVersionId,
      budgetVersionCode: line.budgetVersion.code,
      fiscalYearCode: line.budgetVersion.fiscalYear.code,
      accountCode: line.accountCode,
      accountName: line.account?.name ?? accountByCode.get(line.accountCode)?.name ?? "Unmapped account",
      accountType: line.account?.accountType ?? accountByCode.get(line.accountCode)?.accountType ?? "UNKNOWN",
      normalBalance: line.account?.normalBalance ?? accountByCode.get(line.accountCode)?.normalBalance ?? "DEBIT",
      financeDimensionId: line.financeDimensionId,
      dimensionType: line.dimensionType,
      dimensionCode: line.dimensionCode,
      dimensionKey: line.dimensionKey || accountOnlyDimensionKey,
      dimensionName: line.financeDimension?.name ?? dimensionByKey.get(line.dimensionKey)?.name ?? null,
      lineNo: line.lineNo,
      description: line.description,
      annualAmount: Number(line.annualAmount),
      spreadMethod: line.spreadMethod,
      status: line.status,
      periodAmounts: line.periodAmounts.map((periodAmount) => ({
        fiscalPeriodId: periodAmount.fiscalPeriodId,
        periodCode: periodAmount.fiscalPeriod.code,
        periodNo: periodAmount.periodNo,
        amount: Number(periodAmount.periodAmount)
      }))
    })),
    budgetPeriodRows: budgetPeriods.map((periodAmount) => ({
      budgetPeriodAmountId: periodAmount.id,
      budgetVersionCode: periodAmount.budgetVersion.code,
      fiscalYearCode: periodAmount.budgetVersion.fiscalYear.code,
      fiscalPeriodCode: periodAmount.fiscalPeriod.code,
      periodNo: periodAmount.periodNo,
      accountCode: periodAmount.accountCode,
      accountName: periodAmount.account?.name ?? accountByCode.get(periodAmount.accountCode)?.name ?? "Unmapped account",
      financeDimensionId: periodAmount.financeDimensionId,
      dimensionType: periodAmount.dimensionType,
      dimensionCode: periodAmount.dimensionCode,
      dimensionKey: periodAmount.dimensionKey || accountOnlyDimensionKey,
      dimensionName: periodAmount.financeDimension?.name ?? dimensionByKey.get(periodAmount.dimensionKey)?.name ?? null,
      periodAmount: Number(periodAmount.periodAmount),
      status: periodAmount.status
    })),
    budgetVsActualRows,
    metrics: {
      budgetVersions: budgetVersions.length,
      budgetLines: budgetLines.filter((line) => line.status === activeStatus).length,
      annualBudget: roundMoney(
        budgetLines
          .filter((line) => line.status === activeStatus)
          .reduce((sum, line) => sum + Number(line.annualAmount), 0)
      ),
      currentYearBudget,
      currentYearActual,
      currentYearVariance: roundMoney(currentYearActual - currentYearBudget)
    }
  };
}

export async function upsertErpFinanceDimension(
  input: UpsertErpFinanceDimensionRequest
): Promise<ErpBudgetingMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getBudgetingContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using budgeting.");
    }

    const dimensionType = normalizeDimensionType(input.dimensionType);

    if (!dimensionType) {
      throw new Error("Flash ERP needs a finance dimension type.");
    }

    const code = normalizeCode(input.code, "finance dimension code");
    const name = normalizeRequiredText(input.name, "finance dimension name");
    const status = normalizeStatus(input.status);
    const dimensionData = {
      dimensionType,
      code,
      name,
      description: normalizeOptionalText(input.description),
      status
    };
    const financeDimensionId = normalizeOptionalText(input.financeDimensionId);
    const dimension = financeDimensionId
      ? await tx.erpFinanceDimension.update({
          where: {
            id: financeDimensionId
          },
          data: dimensionData
        })
      : await tx.erpFinanceDimension.upsert({
          where: {
            companyId_dimensionType_code: {
              companyId: company.id,
              dimensionType,
              code
            }
          },
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...dimensionData
          },
          update: dimensionData
        });

    return {
      message: `Flash ERP saved ${dimension.dimensionType.toLowerCase().replace(/_/g, " ")} ${dimension.code}.`,
      financeDimensionId: dimension.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpBudgetVersion(
  input: UpsertErpBudgetVersionRequest
): Promise<ErpBudgetingMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getBudgetingContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using budgeting.");
    }

    const fiscalYear = await getFiscalYearByInput(tx, company.id, input.fiscalYearCode);

    if (!fiscalYear) {
      throw new Error("Create an open fiscal year in Finance foundation before using budgeting.");
    }

    const status = normalizeStatus(input.status, ["DRAFT", "ACTIVE", "APPROVED", "LOCKED", "INACTIVE"]);
    const budgetVersionId = normalizeOptionalText(input.budgetVersionId);
    const budgetData = {
      fiscalYearId: fiscalYear.id,
      code: normalizeCode(input.code ?? "BASE", "budget code"),
      name: normalizeRequiredText(input.name ?? `${fiscalYear.code} budget`, "budget name"),
      description: normalizeOptionalText(input.description),
      budgetType: normalizeCode(input.budgetType ?? "OPERATING", "budget type"),
      scenario: normalizeCode(input.scenario ?? "BASE", "budget scenario"),
      currencyCode: normalizeCode(
        input.currencyCode ?? company.baseCurrencyCode ?? context.retailOrg.baseCurrencyCode,
        "budget currency"
      ),
      status,
      approvedAt: status === "APPROVED" ? new Date() : null,
      lockedAt: status === "LOCKED" ? new Date() : null
    };

    const budgetVersion = budgetVersionId
      ? await tx.erpBudgetVersion.update({
          where: {
            id: budgetVersionId
          },
          data: budgetData
        })
      : await tx.erpBudgetVersion.upsert({
          where: {
            companyId_fiscalYearId_code: {
              companyId: company.id,
              fiscalYearId: fiscalYear.id,
              code: budgetData.code
            }
          },
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...budgetData
          },
          update: budgetData
        });

    return {
      message: `Flash ERP saved budget version ${budgetVersion.code}.`,
      budgetVersionId: budgetVersion.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpBudgetLine(
  input: UpsertErpBudgetLineRequest
): Promise<ErpBudgetingMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getBudgetingContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using budgeting.");
    }

    await ensureDefaultBudgetingFoundation(tx, context, company);

    const budgetVersion = await getBudgetVersionForLine(tx, company.id, input);

    if (!budgetVersion) {
      throw new Error("Create a budget version before adding budget lines.");
    }

    if (budgetVersion.status === "LOCKED") {
      throw new Error(`Budget version ${budgetVersion.code} is locked.`);
    }

    const accountCode = normalizeCode(input.accountCode, "budget account");
    const account = await tx.glAccount.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        code: accountCode,
        status: activeStatus
      }
    });

    if (!account) {
      throw new Error(`Flash ERP cannot find active GL account ${accountCode}.`);
    }

    const budgetDimension = await resolveBudgetLineDimension(tx, company.id, input);

    const fiscalPeriods = await tx.erpFiscalPeriod.findMany({
      where: {
        fiscalYearId: budgetVersion.fiscalYearId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: {
        periodNo: "asc"
      },
      select: {
        id: true,
        code: true,
        periodNo: true
      }
    });

    if (fiscalPeriods.length === 0) {
      throw new Error(`Budget version ${budgetVersion.code} needs fiscal periods.`);
    }

    const annualAmount = roundMoney(numberOrZero(input.annualAmount));
    const spreadMethod = normalizeStatus(input.spreadMethod ?? "EVEN", ["EVEN", "MANUAL"]);
    const lineStatus = normalizeStatus(input.status);
    const existingLine = await tx.erpBudgetLine.findUnique({
      where: {
        budgetVersionId_accountCode_dimensionKey: {
          budgetVersionId: budgetVersion.id,
          accountCode,
          dimensionKey: budgetDimension.dimensionKey
        }
      }
    });
    const lineNo =
      existingLine?.lineNo ??
      ((await tx.erpBudgetLine.count({
        where: {
          budgetVersionId: budgetVersion.id
        }
      })) +
        1);
    const budgetLine = await tx.erpBudgetLine.upsert({
      where: {
        budgetVersionId_accountCode_dimensionKey: {
          budgetVersionId: budgetVersion.id,
          accountCode,
          dimensionKey: budgetDimension.dimensionKey
        }
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: budgetVersion.fiscalYearId,
        budgetVersionId: budgetVersion.id,
        accountId: account.id,
        accountCode,
        financeDimensionId: budgetDimension.financeDimensionId,
        dimensionType: budgetDimension.dimensionType,
        dimensionCode: budgetDimension.dimensionCode,
        dimensionKey: budgetDimension.dimensionKey,
        lineNo,
        description: normalizeOptionalText(input.description),
        annualAmount,
        spreadMethod,
        status: lineStatus
      },
      update: {
        accountId: account.id,
        financeDimensionId: budgetDimension.financeDimensionId,
        dimensionType: budgetDimension.dimensionType,
        dimensionCode: budgetDimension.dimensionCode,
        dimensionKey: budgetDimension.dimensionKey,
        description: normalizeOptionalText(input.description),
        annualAmount,
        spreadMethod,
        status: lineStatus
      }
    });
    const spreadRows = calculateSpread(annualAmount, fiscalPeriods, input.periodAmounts);

    await tx.erpBudgetPeriodAmount.deleteMany({
      where: {
        budgetLineId: budgetLine.id
      }
    });

    await tx.erpBudgetPeriodAmount.createMany({
      data: spreadRows.map((periodAmount) => ({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        budgetVersionId: budgetVersion.id,
        budgetLineId: budgetLine.id,
        fiscalPeriodId: periodAmount.fiscalPeriodId,
        accountId: account.id,
        accountCode,
        financeDimensionId: budgetDimension.financeDimensionId,
        dimensionType: budgetDimension.dimensionType,
        dimensionCode: budgetDimension.dimensionCode,
        dimensionKey: budgetDimension.dimensionKey,
        periodNo: periodAmount.periodNo,
        periodAmount: periodAmount.amount,
        status: lineStatus
      }))
    });

    await updateBudgetVersionTotal(tx, budgetVersion.id);

    return {
      message: `Flash ERP saved budget line ${accountCode} ${
        budgetDimension.dimensionKey === accountOnlyDimensionKey ? "account-only" : budgetDimension.dimensionKey
      } on ${budgetVersion.code}.`,
      budgetVersionId: budgetVersion.id,
      budgetLineId: budgetLine.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

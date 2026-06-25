import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { GlJournalStatus, GlNormalBalance, RecordStatus, SyncNodeType } from "@flash-erp/domain";

export type ErpGlInquiryFilters = {
  companyCode?: string | null;
  fiscalYearCode?: string | null;
  fiscalPeriodCode?: string | null;
  accountCode?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  journalEntryId?: string | null;
};

type InquiryContext = {
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
  fiscalPeriodCode: string;
  accountCode: string;
  dateFrom: string;
  dateTo: string;
  journalEntryId: string;
};

export type ErpGlInquiryWorkspaceData = {
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
      fiscalPeriodCode: string;
      fiscalYearCode: string;
      label: string;
    }>;
    accounts: Array<{
      accountCode: string;
      label: string;
    }>;
  };
  metrics: {
    accounts: number;
    postedJournals: number;
    journalLines: number;
    totalDebit: number;
    totalCredit: number;
    outOfBalance: number;
    trialBalanceRows: number;
  };
  trialBalanceRows: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
    balanceAmount: number;
  }>;
  accountActivityRows: Array<{
    journalLineId: string;
    journalEntryId: string;
    journalNo: string;
    journalType: string;
    sourceType: string;
    sourceReference: string | null;
    fiscalPeriodCode: string | null;
    postingDate: string;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    balanceEffect: number;
    runningBalance: number;
    memo: string | null;
  }>;
  journalRows: Array<{
    journalEntryId: string;
    journalBatchId: string | null;
    journalNo: string;
    batchNo: string | null;
    journalType: string;
    sourceType: string;
    sourceId: string;
    sourceReference: string | null;
    fiscalPeriodCode: string | null;
    postingDate: string;
    description: string;
    status: string;
    postedBy: string | null;
    debitAmount: number;
    creditAmount: number;
    lineCount: number;
    hasReversal: boolean;
    reversalOfJournalNo: string | null;
  }>;
  journalDetail: {
    journalEntryId: string;
    journalNo: string;
    journalBatchId: string | null;
    batchNo: string | null;
    companyCode: string | null;
    fiscalPeriodCode: string | null;
    postingDate: string;
    description: string;
    status: string;
    journalType: string;
    sourceType: string;
    sourceId: string;
    sourceReference: string | null;
    postedBy: string | null;
    postedAt: string;
    reversalReason: string | null;
    reversalOfJournalNo: string | null;
    debitAmount: number;
    creditAmount: number;
    lines: Array<{
      journalLineId: string;
      accountCode: string;
      accountName: string;
      accountType: string;
      normalBalance: string;
      debitAmount: number;
      creditAmount: number;
      memo: string | null;
    }>;
  } | null;
};

const activeStatus = RecordStatus.ACTIVE;
const postedStatus = GlJournalStatus.POSTED;

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

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateFilter(value?: string | null, endOfDay = false) {
  const normalized = trimToNull(value);

  if (!normalized) {
    return null;
  }

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? new Date(`${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
      : new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  }

  return date;
}

function buildUnavailableErpGlInquiryWorkspace(
  reason: string,
  filters: ErpGlInquiryFilters = {},
  currencyCode = "GHS"
): ErpGlInquiryWorkspaceData {
  const resolvedFilters = normalizeFilters(filters, "", null, null);

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    filters: resolvedFilters,
    filterOptions: {
      companies: [],
      fiscalYears: [],
      fiscalPeriods: [],
      accounts: []
    },
    metrics: {
      accounts: 0,
      postedJournals: 0,
      journalLines: 0,
      totalDebit: 0,
      totalCredit: 0,
      outOfBalance: 0,
      trialBalanceRows: 0
    },
    trialBalanceRows: [],
    accountActivityRows: [],
    journalRows: [],
    journalDetail: null
  };
}

export { buildUnavailableErpGlInquiryWorkspace };

async function getInquiryContext(): Promise<InquiryContext | null> {
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

function normalizeFilters(
  input: ErpGlInquiryFilters,
  defaultCompanyCode: string,
  defaultFiscalYearCode: string | null,
  defaultFiscalPeriodCode: string | null
): ResolvedFilters {
  return {
    companyCode: normalizeCode(input.companyCode) ?? defaultCompanyCode,
    fiscalYearCode: normalizeCode(input.fiscalYearCode) ?? defaultFiscalYearCode ?? "",
    fiscalPeriodCode: normalizeCode(input.fiscalPeriodCode) ?? defaultFiscalPeriodCode ?? "",
    accountCode: normalizeCode(input.accountCode) ?? "",
    dateFrom: trimToNull(input.dateFrom) ?? "",
    dateTo: trimToNull(input.dateTo) ?? "",
    journalEntryId: trimToNull(input.journalEntryId) ?? ""
  };
}

function buildJournalDateWhere(dateFrom: Date | null, dateTo: Date | null): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) {
    return undefined;
  }

  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {})
  };
}

function lineBalanceEffect(normalBalance: string, debitAmount: number, creditAmount: number) {
  return normalBalance === GlNormalBalance.CREDIT
    ? roundMoney(creditAmount - debitAmount)
    : roundMoney(debitAmount - creditAmount);
}

function signedNetDebit(debitAmount: number, creditAmount: number) {
  return roundMoney(debitAmount - creditAmount);
}

export async function getErpGlInquiryWorkspace(
  input: ErpGlInquiryFilters = {}
): Promise<ErpGlInquiryWorkspaceData> {
  const context = await getInquiryContext();

  if (!context) {
    return buildUnavailableErpGlInquiryWorkspace(
      "Flash ERP enterprise node is not configured yet.",
      input
    );
  }

  const companies = await prisma.erpCompany.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: {
        not: RecordStatus.DELETED
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
    return buildUnavailableErpGlInquiryWorkspace(
      "Create a company in Finance foundation before opening GL inquiry.",
      input,
      context.retailOrg.baseCurrencyCode
    );
  }

  const fiscalYears = await prisma.erpFiscalYear.findMany({
    where: {
      companyId: selectedCompany.id,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ startsOn: "desc" }]
  });
  const fiscalPeriods = await prisma.erpFiscalPeriod.findMany({
    where: {
      companyId: selectedCompany.id,
      status: {
        not: RecordStatus.DELETED
      }
    },
    orderBy: [{ startsOn: "asc" }],
    include: {
      fiscalYear: {
        select: {
          code: true
        }
      }
    }
  });
  const today = new Date();
  const currentFiscalYear =
    fiscalYears.find((year) => year.startsOn <= today && year.endsOn >= today) ??
    fiscalYears.find((year) => year.status === "OPEN") ??
    fiscalYears[0] ??
    null;
  const selectedFiscalYear =
    fiscalYears.find((year) => year.code === normalizeCode(input.fiscalYearCode)) ??
    currentFiscalYear;
  const selectedFiscalPeriod =
    fiscalPeriods.find((period) => period.code === normalizeCode(input.fiscalPeriodCode)) ?? null;
  const resolvedFilters = normalizeFilters(
    input,
    selectedCompany.code,
    selectedFiscalYear?.code ?? null,
    null
  );
  const dateFrom =
    parseDateFilter(resolvedFilters.dateFrom) ??
    (selectedFiscalPeriod ? selectedFiscalPeriod.startsOn : selectedFiscalYear?.startsOn ?? null);
  const dateTo =
    parseDateFilter(resolvedFilters.dateTo, true) ??
    (selectedFiscalPeriod ? selectedFiscalPeriod.endsOn : selectedFiscalYear?.endsOn ?? null);
  const accounts = await prisma.glAccount.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: {
        not: RecordStatus.DELETED
      },
      OR: [{ companyId: selectedCompany.id }, { companyId: null }]
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
  });
  const selectedAccounts = resolvedFilters.accountCode
    ? accounts.filter((account) => account.code === resolvedFilters.accountCode)
    : accounts;
  const accountIds = selectedAccounts.map((account) => account.id);
  const journalDateWhere = buildJournalDateWhere(dateFrom, dateTo);
  const fiscalYearPeriodIds =
    selectedFiscalYear && !selectedFiscalPeriod
      ? fiscalPeriods
          .filter((period) => period.fiscalYearId === selectedFiscalYear.id)
          .map((period) => period.id)
      : [];
  const periodWhere: Prisma.GlJournalEntryWhereInput =
    selectedFiscalPeriod
      ? { fiscalPeriodId: selectedFiscalPeriod.id }
      : fiscalYearPeriodIds.length > 0
        ? { fiscalPeriodId: { in: fiscalYearPeriodIds } }
        : {};
  const entryScopeWhere: Prisma.GlJournalEntryWhereInput = {
    retailOrgId: context.retailOrgId,
    companyId: selectedCompany.id,
    status: postedStatus,
    ...periodWhere,
    ...(journalDateWhere ? { postingDate: journalDateWhere } : {})
  };
  const lineScopeWhere: Prisma.GlJournalLineWhereInput = {
    ...(accountIds.length > 0 ? { accountId: { in: accountIds } } : { accountId: "__NO_ACCOUNT__" }),
    journalEntry: entryScopeWhere
  };
  const openingLineWhere: Prisma.GlJournalLineWhereInput | null = dateFrom
    ? {
        ...(accountIds.length > 0
          ? { accountId: { in: accountIds } }
          : { accountId: "__NO_ACCOUNT__" }),
        journalEntry: {
          retailOrgId: context.retailOrgId,
          companyId: selectedCompany.id,
          status: postedStatus,
          postingDate: {
            lt: dateFrom
          }
        }
      }
    : null;

  const [periodLines, openingLines, journalEntries, journalDetail] = await Promise.all([
    prisma.glJournalLine.findMany({
      where: lineScopeWhere,
      orderBy: [{ id: "asc" }],
      include: {
        account: true,
        journalEntry: {
          include: {
            fiscalPeriod: {
              select: {
                code: true
              }
            }
          }
        }
      }
    }),
    openingLineWhere
      ? prisma.glJournalLine.findMany({
          where: openingLineWhere,
          include: {
            account: true
          }
        })
      : Promise.resolve([]),
    prisma.glJournalEntry.findMany({
      where: entryScopeWhere,
      orderBy: [{ postingDate: "desc" }, { journalNo: "desc" }],
      take: 500,
      include: {
        company: {
          select: {
            code: true
          }
        },
        journalBatch: {
          select: {
            id: true,
            batchNo: true
          }
        },
        fiscalPeriod: {
          select: {
            code: true
          }
        },
        reversalOfJournalEntry: {
          select: {
            journalNo: true
          }
        },
        reversalEntries: {
          select: {
            id: true
          }
        },
        lines: {
          include: {
            account: true
          }
        }
      }
    }),
    resolvedFilters.journalEntryId
      ? prisma.glJournalEntry.findFirst({
          where: {
            id: resolvedFilters.journalEntryId,
            retailOrgId: context.retailOrgId,
            companyId: selectedCompany.id,
            status: postedStatus
          },
          include: {
            company: {
              select: {
                code: true
              }
            },
            journalBatch: {
              select: {
                id: true,
                batchNo: true
              }
            },
            fiscalPeriod: {
              select: {
                code: true
              }
            },
            reversalOfJournalEntry: {
              select: {
                journalNo: true
              }
            },
            lines: {
              orderBy: [{ id: "asc" }],
              include: {
                account: true
              }
            }
          }
        })
      : Promise.resolve(null)
  ]);
  const orderedPeriodLines = [...periodLines].sort((left, right) => {
    const dateDifference =
      left.journalEntry.postingDate.getTime() - right.journalEntry.postingDate.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    const journalDifference = left.journalEntry.journalNo.localeCompare(
      right.journalEntry.journalNo
    );

    if (journalDifference !== 0) {
      return journalDifference;
    }

    return left.id.localeCompare(right.id);
  });

  const openingByAccountId = new Map<string, { debit: number; credit: number }>();
  for (const line of openingLines) {
    const current = openingByAccountId.get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit = roundMoney(current.debit + Number(line.debitAmount));
    current.credit = roundMoney(current.credit + Number(line.creditAmount));
    openingByAccountId.set(line.accountId, current);
  }

  const periodByAccountId = new Map<string, { debit: number; credit: number }>();
  for (const line of periodLines) {
    const current = periodByAccountId.get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit = roundMoney(current.debit + Number(line.debitAmount));
    current.credit = roundMoney(current.credit + Number(line.creditAmount));
    periodByAccountId.set(line.accountId, current);
  }

  const trialBalanceRows = selectedAccounts.map((account) => {
    const opening = openingByAccountId.get(account.id) ?? { debit: 0, credit: 0 };
    const period = periodByAccountId.get(account.id) ?? { debit: 0, credit: 0 };
    const openingNetDebit = signedNetDebit(opening.debit, opening.credit);
    const closingNetDebit = signedNetDebit(
      opening.debit + period.debit,
      opening.credit + period.credit
    );

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      openingDebit: Math.max(openingNetDebit, 0),
      openingCredit: Math.max(-openingNetDebit, 0),
      periodDebit: period.debit,
      periodCredit: period.credit,
      closingDebit: Math.max(closingNetDebit, 0),
      closingCredit: Math.max(-closingNetDebit, 0),
      balanceAmount: lineBalanceEffect(
        account.normalBalance,
        opening.debit + period.debit,
        opening.credit + period.credit
      )
    };
  });

  const runningByAccountId = new Map<string, number>();
  for (const account of selectedAccounts) {
    const opening = openingByAccountId.get(account.id) ?? { debit: 0, credit: 0 };
    runningByAccountId.set(
      account.id,
      lineBalanceEffect(account.normalBalance, opening.debit, opening.credit)
    );
  }

  const accountActivityRows = orderedPeriodLines.map((line) => {
    const debitAmount = Number(line.debitAmount);
    const creditAmount = Number(line.creditAmount);
    const balanceEffect = lineBalanceEffect(line.account.normalBalance, debitAmount, creditAmount);
    const runningBalance = roundMoney((runningByAccountId.get(line.accountId) ?? 0) + balanceEffect);
    runningByAccountId.set(line.accountId, runningBalance);

    return {
      journalLineId: line.id,
      journalEntryId: line.journalEntryId,
      journalNo: line.journalEntry.journalNo,
      journalType: line.journalEntry.journalType,
      sourceType: line.journalEntry.sourceType,
      sourceReference: line.journalEntry.sourceReference,
      fiscalPeriodCode: line.journalEntry.fiscalPeriod?.code ?? null,
      postingDate: line.journalEntry.postingDate.toISOString(),
      accountCode: line.account.code,
      accountName: line.account.name,
      debitAmount: roundMoney(debitAmount),
      creditAmount: roundMoney(creditAmount),
      balanceEffect,
      runningBalance,
      memo: line.memo
    };
  });

  const journalRows = journalEntries.map((journal) => {
    const debitAmount = roundMoney(
      journal.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
    );
    const creditAmount = roundMoney(
      journal.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
    );

    return {
      journalEntryId: journal.id,
      journalBatchId: journal.journalBatch?.id ?? null,
      journalNo: journal.journalNo,
      batchNo: journal.journalBatch?.batchNo ?? null,
      journalType: journal.journalType,
      sourceType: journal.sourceType,
      sourceId: journal.sourceId,
      sourceReference: journal.sourceReference,
      fiscalPeriodCode: journal.fiscalPeriod?.code ?? null,
      postingDate: journal.postingDate.toISOString(),
      description: journal.description,
      status: journal.status,
      postedBy: journal.postedBy,
      debitAmount,
      creditAmount,
      lineCount: journal.lines.length,
      hasReversal: journal.reversalEntries.length > 0,
      reversalOfJournalNo: journal.reversalOfJournalEntry?.journalNo ?? null
    };
  });

  const journalDetailData = journalDetail
    ? (() => {
        const debitAmount = roundMoney(
          journalDetail.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
        );
        const creditAmount = roundMoney(
          journalDetail.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
        );

        return {
          journalEntryId: journalDetail.id,
          journalNo: journalDetail.journalNo,
          journalBatchId: journalDetail.journalBatch?.id ?? null,
          batchNo: journalDetail.journalBatch?.batchNo ?? null,
          companyCode: journalDetail.company?.code ?? null,
          fiscalPeriodCode: journalDetail.fiscalPeriod?.code ?? null,
          postingDate: journalDetail.postingDate.toISOString(),
          description: journalDetail.description,
          status: journalDetail.status,
          journalType: journalDetail.journalType,
          sourceType: journalDetail.sourceType,
          sourceId: journalDetail.sourceId,
          sourceReference: journalDetail.sourceReference,
          postedBy: journalDetail.postedBy,
          postedAt: journalDetail.postedAt.toISOString(),
          reversalReason: journalDetail.reversalReason,
          reversalOfJournalNo: journalDetail.reversalOfJournalEntry?.journalNo ?? null,
          debitAmount,
          creditAmount,
          lines: journalDetail.lines.map((line) => ({
            journalLineId: line.id,
            accountCode: line.account.code,
            accountName: line.account.name,
            accountType: line.account.accountType,
            normalBalance: line.account.normalBalance,
            debitAmount: roundMoney(Number(line.debitAmount)),
            creditAmount: roundMoney(Number(line.creditAmount)),
            memo: line.memo
          }))
        };
      })()
    : null;
  const totalDebit = roundMoney(periodLines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
  const totalCredit = roundMoney(
    periodLines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
  );

  return {
    currencyCode: selectedCompany.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: selectedCompany.tradingName ?? selectedCompany.legalName,
    statusMessage: "GL inquiry is reading posted journals from the Flash ERP accounting foundation.",
    refreshedAt: new Date().toISOString(),
    filters: {
      ...resolvedFilters,
      dateFrom: dateFrom ? dateOnly(dateFrom) : resolvedFilters.dateFrom,
      dateTo: dateTo ? dateOnly(dateTo) : resolvedFilters.dateTo
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
      fiscalPeriods: fiscalPeriods.map((period) => ({
        fiscalPeriodCode: period.code,
        fiscalYearCode: period.fiscalYear.code,
        label: `${period.code} - ${period.name}`
      })),
      accounts: accounts.map((account) => ({
        accountCode: account.code,
        label: `${account.code} - ${account.name}`
      }))
    },
    metrics: {
      accounts: accounts.length,
      postedJournals: journalRows.length,
      journalLines: periodLines.length,
      totalDebit,
      totalCredit,
      outOfBalance: roundMoney(totalDebit - totalCredit),
      trialBalanceRows: trialBalanceRows.length
    },
    trialBalanceRows,
    accountActivityRows,
    journalRows,
    journalDetail: journalDetailData
  };
}

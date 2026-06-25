import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import { GlJournalStatus, RecordStatus, SyncNodeType } from "@flash-erp/domain";

type PostingContext = {
  retailOrgId: string;
  companyId: string;
};

export type PostAccountingDocumentLine = {
  accountCode: string;
  financeDimensionId?: string | null;
  dimensionType?: string | null;
  dimensionCode?: string | null;
  debitAmount?: number | string | null;
  creditAmount?: number | string | null;
  memo?: string | null;
  storeId?: string | null;
};

export type PostAccountingDocumentRequest = {
  retailOrgId?: string | null;
  companyId?: string | null;
  batchNo?: string | null;
  batchSourceType?: string | null;
  documentType?: string | null;
  journalType?: string | null;
  sourceType: string;
  sourceId?: string | null;
  sourceReference?: string | null;
  postingDate: string | Date;
  description: string;
  postedBy?: string | null;
  lines: PostAccountingDocumentLine[];
};

export type PostAccountingDocumentResult = {
  journalBatchId: string;
  journalEntryId: string;
  journalNo: string;
  fiscalPeriodId: string;
  fiscalPeriodCode: string;
  totalDebit: number;
  totalCredit: number;
};

const activeStatus = RecordStatus.ACTIVE;
const postingTransactionOptions = {
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

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeCode(value: string | null | undefined, label: string) {
  const code = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!code) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return code;
}

function normalizeDimensionCode(value: string | null | undefined, label: string) {
  const code = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 40);

  if (!code) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return code;
}

function normalizeOptionalDimensionCode(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  return normalizeDimensionCode(normalized, label);
}

function normalizePostingDate(value: string | Date) {
  const postingDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(postingDate.getTime())) {
    throw new Error("Flash ERP needs a valid posting date.");
  }

  return postingDate;
}

async function resolvePostingContext(
  tx: Prisma.TransactionClient,
  retailOrgId?: string | null,
  companyId?: string | null
): Promise<PostingContext> {
  const retailOrg = retailOrgId
    ? await tx.retailOrg.findFirst({
        where: {
          id: retailOrgId,
          status: activeStatus
        },
        select: {
          id: true
        }
      })
    : (
        await tx.syncNode.findFirst({
          where: {
            nodeType: SyncNodeType.ENTERPRISE,
            isPrimary: true,
            status: activeStatus
          },
          select: {
            retailOrgId: true
          }
        })
      )?.retailOrgId;

  const resolvedRetailOrgId = typeof retailOrg === "string" ? retailOrg : retailOrg?.id;

  if (!resolvedRetailOrgId) {
    throw new Error("Flash ERP enterprise posting context is not configured.");
  }

  const company = await tx.erpCompany.findFirst({
    where: {
      id: companyId ?? undefined,
      retailOrgId: resolvedRetailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  if (!company) {
    throw new Error("Flash ERP cannot find an active ERP company for posting.");
  }

  const settings = await tx.erpAccountingSettings.findUnique({
    where: {
      companyId: company.id
    },
    select: {
      id: true
    }
  });

  if (!settings) {
    throw new Error("Flash ERP accounting settings must be configured before posting.");
  }

  return {
    retailOrgId: resolvedRetailOrgId,
    companyId: company.id
  };
}

async function resolvePostingLineDimension(
  tx: Prisma.TransactionClient,
  companyId: string,
  line: {
    financeDimensionId: string | null;
    dimensionType: string | null;
    dimensionCode: string | null;
  }
) {
  if (!line.financeDimensionId && !line.dimensionType && !line.dimensionCode) {
    return {
      financeDimensionId: null,
      dimensionType: null,
      dimensionCode: null
    };
  }

  if (line.financeDimensionId) {
    const dimension = await tx.erpFinanceDimension.findFirst({
      where: {
        id: line.financeDimensionId,
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
      throw new Error("Flash ERP cannot find the requested finance dimension.");
    }

    return {
      financeDimensionId: dimension.id,
      dimensionType: dimension.dimensionType,
      dimensionCode: dimension.code
    };
  }

  if (!line.dimensionType || !line.dimensionCode) {
    throw new Error("Flash ERP posting dimensions need both a dimension type and code.");
  }

  const dimension = await tx.erpFinanceDimension.findFirst({
    where: {
      companyId,
      dimensionType: line.dimensionType,
      code: line.dimensionCode,
      status: activeStatus
    },
    select: {
      id: true,
      dimensionType: true,
      code: true
    }
  });

  if (!dimension) {
    throw new Error(`Flash ERP cannot find finance dimension ${line.dimensionType}:${line.dimensionCode}.`);
  }

  return {
    financeDimensionId: dimension.id,
    dimensionType: dimension.dimensionType,
    dimensionCode: dimension.code
  };
}

async function getOpenFiscalPeriodForDate(
  tx: Prisma.TransactionClient,
  companyId: string,
  postingDate: Date
) {
  return tx.erpFiscalPeriod.findFirst({
    where: {
      companyId,
      startsOn: {
        lte: postingDate
      },
      endsOn: {
        gte: postingDate
      },
      status: {
        not: "CLOSED"
      }
    },
    orderBy: {
      startsOn: "desc"
    },
    select: {
      id: true,
      code: true
    }
  });
}

export async function postAccountingDocumentInTransaction(
  tx: Prisma.TransactionClient,
  input: PostAccountingDocumentRequest
): Promise<PostAccountingDocumentResult> {
  const context = await resolvePostingContext(tx, input.retailOrgId, input.companyId);
  const postingDate = normalizePostingDate(input.postingDate);
  const description = normalizeRequiredText(input.description, "posting description");
  const sourceType = normalizeCode(input.sourceType, "source type");
  const batchSourceType = normalizeCode(input.batchSourceType ?? input.sourceType, "batch source type");
  const journalType = normalizeCode(input.journalType ?? "GENERAL", "journal type");
  const inputSourceId = normalizeOptionalText(input.sourceId);
  const sourceReference = normalizeOptionalText(input.sourceReference);
  const postedBy = normalizeOptionalText(input.postedBy) ?? "Flash ERP posting engine";

  if (inputSourceId) {
    const duplicate = await tx.glJournalEntry.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        sourceType,
        sourceId: inputSourceId
      },
      select: {
        journalNo: true
      }
    });

    if (duplicate) {
      throw new Error(`Flash ERP has already posted this source as ${duplicate.journalNo}.`);
    }
  }

  const normalizedLines = input.lines
    .map((line) => ({
      accountCode: normalizeCode(line.accountCode, "account code"),
      financeDimensionId: normalizeOptionalText(line.financeDimensionId),
      dimensionType: normalizeOptionalDimensionCode(line.dimensionType, "dimension type"),
      dimensionCode: normalizeOptionalDimensionCode(line.dimensionCode, "dimension code"),
      debitAmount: roundMoney(Math.max(0, numberOrZero(line.debitAmount))),
      creditAmount: roundMoney(Math.max(0, numberOrZero(line.creditAmount))),
      memo: normalizeOptionalText(line.memo),
      storeId: normalizeOptionalText(line.storeId)
    }))
    .filter((line) => line.debitAmount > 0 || line.creditAmount > 0);

  if (normalizedLines.length < 2) {
    throw new Error("Flash ERP needs at least two posting lines.");
  }

  const mixedLine = normalizedLines.find(
    (line) => line.debitAmount > 0 && line.creditAmount > 0
  );

  if (mixedLine) {
    throw new Error(`Flash ERP posting line ${mixedLine.accountCode} cannot contain both debit and credit.`);
  }

  const debitTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.debitAmount, 0));
  const creditTotal = roundMoney(
    normalizedLines.reduce((sum, line) => sum + line.creditAmount, 0)
  );

  if (Math.abs(debitTotal - creditTotal) > 0.01) {
    throw new Error("Flash ERP can only post balanced accounting documents.");
  }

  const period = await getOpenFiscalPeriodForDate(tx, context.companyId, postingDate);

  if (!period) {
    throw new Error("Flash ERP cannot find an open fiscal period for that posting date.");
  }

  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      code: {
        in: normalizedLines.map((line) => line.accountCode)
      },
      status: activeStatus
    },
    select: {
      id: true,
      code: true
    }
  });
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const missingAccountCodes = normalizedLines
    .map((line) => line.accountCode)
    .filter((code) => !accountsByCode.has(code));

  if (missingAccountCodes.length > 0) {
    throw new Error(`Flash ERP cannot find GL account(s): ${missingAccountCodes.join(", ")}.`);
  }

  const normalizedLinesWithDimensions = await Promise.all(
    normalizedLines.map(async (line) => ({
      ...line,
      ...(await resolvePostingLineDimension(tx, context.companyId, {
        financeDimensionId: line.financeDimensionId,
        dimensionType: line.dimensionType,
        dimensionCode: line.dimensionCode
      }))
    }))
  );

  const reservedDocumentNo = input.batchNo
    ? null
    : await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: context.companyId,
        documentType: input.documentType ?? "JOURNAL"
      });
  const journalNo = normalizeOptionalText(input.batchNo) ?? reservedDocumentNo?.documentNo;
  const journalNoCode = normalizeCode(journalNo, "journal number");
  const batch = await tx.glJournalBatch.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: context.companyId,
      batchNo: journalNoCode,
      sourceType: batchSourceType,
      postingDate,
      description,
      status: GlJournalStatus.POSTED,
      totalDebit: debitTotal,
      totalCredit: creditTotal,
      postedAt: new Date()
    }
  });

  const sourceId = inputSourceId ?? batch.id;
  const journalEntry = await tx.glJournalEntry.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: context.companyId,
      journalBatchId: batch.id,
      fiscalPeriodId: period.id,
      journalNo: journalNoCode,
      journalType,
      sourceType,
      sourceId,
      sourceReference: sourceReference ?? journalNoCode,
      postingDate,
      description,
      status: GlJournalStatus.POSTED,
      postedBy,
      lines: {
        create: normalizedLinesWithDimensions.map((line) => ({
          accountId: accountsByCode.get(line.accountCode)!.id,
          storeId: line.storeId,
          financeDimensionId: line.financeDimensionId,
          dimensionType: line.dimensionType,
          dimensionCode: line.dimensionCode,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          memo: line.memo
        }))
      }
    },
    select: {
      id: true
    }
  });

  return {
    journalBatchId: batch.id,
    journalEntryId: journalEntry.id,
    journalNo: journalNoCode,
    fiscalPeriodId: period.id,
    fiscalPeriodCode: period.code,
    totalDebit: debitTotal,
    totalCredit: creditTotal
  };
}

export async function postAccountingDocument(
  input: PostAccountingDocumentRequest
): Promise<PostAccountingDocumentResult> {
  return prisma.$transaction((tx) => postAccountingDocumentInTransaction(tx, input), postingTransactionOptions);
}

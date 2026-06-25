import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type FixedAssetContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type FixedAssetCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

export type UpsertErpFixedAssetClassRequest = {
  fixedAssetClassId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  assetType?: string | null;
  depreciationMethod?: string | null;
  defaultUsefulLifeMonths?: number | string | null;
  defaultResidualValue?: number | string | null;
  acquisitionAccountCode?: string | null;
  accumulatedDepreciationAccountCode?: string | null;
  depreciationExpenseAccountCode?: string | null;
  gainOnDisposalAccountCode?: string | null;
  lossOnDisposalAccountCode?: string | null;
  status?: string | null;
};

export type UpsertErpFixedAssetRequest = {
  fixedAssetId?: string | null;
  assetClassCode?: string | null;
  name?: string | null;
  description?: string | null;
  serialNo?: string | null;
  modelNo?: string | null;
  manufacturer?: string | null;
  locationCode?: string | null;
  custodianName?: string | null;
  acquisitionDate?: string | null;
  inServiceDate?: string | null;
  depreciationStartDate?: string | null;
  currencyCode?: string | null;
  acquisitionCost?: number | string | null;
  residualValue?: number | string | null;
  accumulatedDepreciation?: number | string | null;
  usefulLifeMonths?: number | string | null;
  depreciationMethod?: string | null;
  status?: string | null;
};

export type CreateErpFixedAssetDepreciationRequest = {
  fixedAssetId?: string | null;
  bookCode?: string | null;
  postingDate?: string | null;
  amount?: number | string | null;
  memo?: string | null;
};

export type TransferErpFixedAssetRequest = {
  fixedAssetId?: string | null;
  transferDate?: string | null;
  toLocationCode?: string | null;
  toCustodianName?: string | null;
  memo?: string | null;
};

export type CreateErpFixedAssetDisposalRequest = {
  fixedAssetId?: string | null;
  bookCode?: string | null;
  postingDate?: string | null;
  proceedsAmount?: number | string | null;
  proceedsAccountCode?: string | null;
  memo?: string | null;
};

export type PostErpFixedAssetTransactionRequest = {
  fixedAssetTransactionId?: string | null;
  postingDate?: string | null;
};

export type ErpFixedAssetsMutationResponse = {
  message: string;
  fixedAssetClassId?: string;
  fixedAssetId?: string;
  assetNo?: string;
  fixedAssetTransactionId?: string;
  transactionNo?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpFixedAssetsWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultAcquisitionDate: string;
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  assetClassRows: Array<{
    fixedAssetClassId: string;
    code: string;
    name: string;
    description: string | null;
    assetType: string;
    depreciationMethod: string;
    defaultUsefulLifeMonths: number;
    defaultResidualValue: number;
    acquisitionAccountCode: string;
    accumulatedDepreciationAccountCode: string;
    depreciationExpenseAccountCode: string;
    gainOnDisposalAccountCode: string;
    lossOnDisposalAccountCode: string;
    assetCount: number;
    status: string;
  }>;
  assetRows: Array<{
    fixedAssetId: string;
    assetNo: string;
    assetClassCode: string;
    assetClassName: string;
    name: string;
    description: string | null;
    serialNo: string | null;
    modelNo: string | null;
    manufacturer: string | null;
    locationCode: string | null;
    custodianName: string | null;
    acquisitionDate: string;
    inServiceDate: string | null;
    depreciationStartDate: string | null;
    currencyCode: string;
    acquisitionCost: number;
    residualValue: number;
    accumulatedDepreciation: number;
    netBookValue: number;
    usefulLifeMonths: number;
    depreciationMethod: string;
    status: string;
  }>;
  bookRows: Array<{
    fixedAssetBookId: string;
    fixedAssetId: string;
    assetNo: string;
    assetName: string;
    bookCode: string;
    bookName: string;
    depreciationMethod: string;
    usefulLifeMonths: number;
    residualValue: number;
    depreciationStartDate: string | null;
    lastDepreciationDate: string | null;
    accumulatedDepreciation: number;
    netBookValue: number;
    status: string;
  }>;
  transactionRows: Array<{
    fixedAssetTransactionId: string;
    fixedAssetId: string;
    assetNo: string;
    assetName: string;
    transactionNo: string;
    transactionType: string;
    bookCode: string;
    transactionDate: string;
    postingDate: string;
    currencyCode: string;
    amount: number;
    accumulatedDepreciationAmount: number;
    proceedsAmount: number;
    gainLossAmount: number;
    proceedsAccountCode: string | null;
    fromLocationCode: string | null;
    toLocationCode: string | null;
    fromCustodianName: string | null;
    toCustodianName: string | null;
    sourceType: string;
    sourceReference: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
    status: string;
  }>;
  metrics: {
    assetClasses: number;
    activeAssets: number;
    acquisitionCost: number;
    netBookValue: number;
    draftTransactions: number;
  };
};

const activeStatus = RecordStatus.ACTIVE;
const fixedAssetTransactionOptions = {
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

function normalizePositiveInteger(
  value: number | string | null | undefined,
  fallback: number,
  label: string
) {
  const parsed = Math.trunc(numberOrZero(value ?? fallback));

  if (parsed <= 0) {
    throw new Error(`Flash ERP needs a positive ${label}.`);
  }

  return parsed;
}

function parseDate(value: string | null | undefined, label: string) {
  const normalized = normalizeRequiredText(value, label);
  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

function parseOptionalDate(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
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

  if (debit <= 0 && credit <= 0) {
    return;
  }

  lines.push({
    accountCode,
    debitAmount: debit,
    creditAmount: credit,
    memo
  });
}

function monthsBetween(startDate: Date, endDate: Date) {
  const yearMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12;
  const calendarMonths = yearMonths + endDate.getUTCMonth() - startDate.getUTCMonth();
  const completedMonth = endDate.getUTCDate() >= startDate.getUTCDate() ? 1 : 0;

  return Math.max(1, calendarMonths + completedMonth);
}

function calculateStraightLineDepreciationAmount({
  assetCost,
  residualValue,
  usefulLifeMonths,
  accumulatedDepreciation,
  startDate,
  lastDepreciationDate,
  postingDate
}: {
  assetCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  startDate: Date;
  lastDepreciationDate: Date | null;
  postingDate: Date;
}) {
  if (lastDepreciationDate && postingDate <= lastDepreciationDate) {
    throw new Error("Flash ERP depreciation date must be after the last depreciation date.");
  }

  if (!lastDepreciationDate && postingDate < startDate) {
    throw new Error("Flash ERP depreciation date cannot be before the depreciation start date.");
  }

  const depreciableBase = roundMoney(Math.max(0, assetCost - residualValue));
  const remainingDepreciableAmount = roundMoney(Math.max(0, depreciableBase - accumulatedDepreciation));

  if (remainingDepreciableAmount <= 0) {
    throw new Error("Flash ERP has no remaining depreciable amount for this asset.");
  }

  const effectiveStartDate = lastDepreciationDate ?? startDate;
  const elapsedMonths = monthsBetween(effectiveStartDate, postingDate);
  const monthlyAmount = roundMoney(depreciableBase / Math.max(1, usefulLifeMonths));

  return roundMoney(Math.min(remainingDepreciableAmount, monthlyAmount * elapsedMonths));
}

function normalizeBookCode(value: string | null | undefined) {
  return normalizeCode(value ?? "COMPANY", "fixed asset book");
}

function buildUnavailableErpFixedAssetsWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpFixedAssetsWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultAcquisitionDate: dateOnly(new Date()),
    accountOptions: [],
    assetClassRows: [],
    assetRows: [],
    bookRows: [],
    transactionRows: [],
    metrics: {
      assetClasses: 0,
      activeAssets: 0,
      acquisitionCost: 0,
      netBookValue: 0,
      draftTransactions: 0
    }
  };
}

export { buildUnavailableErpFixedAssetsWorkspace };

async function getFixedAssetContext(
  tx: Prisma.TransactionClient = prisma
): Promise<FixedAssetContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: FixedAssetContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

async function validateAccountCodes(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  accountCodes: string[]
) {
  const uniqueCodes = Array.from(new Set(accountCodes.map((code) => normalizeCode(code, "GL account"))));
  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId,
      code: {
        in: uniqueCodes
      },
      status: activeStatus
    },
    select: {
      code: true
    }
  });
  const found = new Set(accounts.map((account) => account.code));
  const missing = uniqueCodes.filter((code) => !found.has(code));

  if (missing.length > 0) {
    throw new Error(`Flash ERP fixed assets reference missing GL account(s): ${missing.join(", ")}.`);
  }
}

async function ensureFixedAssetDocumentSequences(
  tx: Prisma.TransactionClient,
  context: FixedAssetContext,
  company: FixedAssetCompany
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
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
  });

  if (!fiscalYear) {
    return;
  }

  for (const sequence of [
    { documentType: "FIXED_ASSET", prefix: "FA" },
    { documentType: "FIXED_ASSET_TXN", prefix: "FAT" }
  ]) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId: company.id,
          documentType: sequence.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {},
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType: sequence.documentType,
        prefix: sequence.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      }
    });
  }
}

async function ensureDefaultFixedAssetClasses(
  tx: Prisma.TransactionClient,
  context: FixedAssetContext,
  company: FixedAssetCompany
) {
  await validateAccountCodes(tx, context.retailOrgId, ["1500", "1510", "1590", "6100", "7010", "8010"]);

  const defaults = [
    {
      code: "EQUIPMENT",
      name: "Equipment",
      description: "Equipment and machinery assets.",
      acquisitionAccountCode: "1500",
      defaultUsefulLifeMonths: 60
    },
    {
      code: "VEHICLES",
      name: "Vehicles",
      description: "Vehicle and transport assets.",
      acquisitionAccountCode: "1510",
      defaultUsefulLifeMonths: 48
    }
  ];

  for (const assetClass of defaults) {
    await tx.erpFixedAssetClass.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: assetClass.code
        }
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        code: assetClass.code,
        name: assetClass.name,
        description: assetClass.description,
        assetType: "TANGIBLE",
        depreciationMethod: "STRAIGHT_LINE",
        defaultUsefulLifeMonths: assetClass.defaultUsefulLifeMonths,
        defaultResidualValue: 0,
        acquisitionAccountCode: assetClass.acquisitionAccountCode,
        accumulatedDepreciationAccountCode: "1590",
        depreciationExpenseAccountCode: "6100",
        gainOnDisposalAccountCode: "7010",
        lossOnDisposalAccountCode: "8010",
        status: activeStatus
      },
      update: {}
    });
  }
}

async function ensureFixedAssetFoundation(
  tx: Prisma.TransactionClient,
  context: FixedAssetContext,
  company: FixedAssetCompany
) {
  await ensureFixedAssetDocumentSequences(tx, context, company);
  await ensureDefaultFixedAssetClasses(tx, context, company);
}

function normalizeAssetClassInput(input: UpsertErpFixedAssetClassRequest) {
  const acquisitionAccountCode = normalizeCode(input.acquisitionAccountCode ?? "1500", "acquisition account");
  const accumulatedDepreciationAccountCode = normalizeCode(
    input.accumulatedDepreciationAccountCode ?? "1590",
    "accumulated depreciation account"
  );
  const depreciationExpenseAccountCode = normalizeCode(
    input.depreciationExpenseAccountCode ?? "6100",
    "depreciation expense account"
  );
  const gainOnDisposalAccountCode = normalizeCode(
    input.gainOnDisposalAccountCode ?? "7010",
    "gain on disposal account"
  );
  const lossOnDisposalAccountCode = normalizeCode(
    input.lossOnDisposalAccountCode ?? "8010",
    "loss on disposal account"
  );

  return {
    code: normalizeCode(input.code, "asset class code"),
    name: normalizeRequiredText(input.name, "asset class name"),
    description: normalizeOptionalText(input.description),
    assetType: normalizeCode(input.assetType ?? "TANGIBLE", "asset type"),
    depreciationMethod: normalizeCode(input.depreciationMethod ?? "STRAIGHT_LINE", "depreciation method"),
    defaultUsefulLifeMonths: normalizePositiveInteger(
      input.defaultUsefulLifeMonths,
      60,
      "default useful life"
    ),
    defaultResidualValue: roundMoney(Math.max(0, numberOrZero(input.defaultResidualValue))),
    acquisitionAccountCode,
    accumulatedDepreciationAccountCode,
    depreciationExpenseAccountCode,
    gainOnDisposalAccountCode,
    lossOnDisposalAccountCode,
    status: normalizeStatus(input.status)
  };
}

export async function getErpFixedAssetsWorkspace(): Promise<ErpFixedAssetsWorkspaceData> {
  const context = await getFixedAssetContext();

  if (!context) {
    return buildUnavailableErpFixedAssetsWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpFixedAssetsWorkspace(
      "Create a company in Finance foundation before using fixed assets.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await prisma.$transaction((tx) => ensureFixedAssetFoundation(tx, context, company));

  const [accounts, assetClasses, assets, books, transactions] = await Promise.all([
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpFixedAssetClass.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ code: "asc" }],
      include: {
        assets: {
          select: {
            id: true
          }
        }
      }
    }),
    prisma.erpFixedAsset.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ acquisitionDate: "desc" }, { assetNo: "desc" }],
      include: {
        assetClass: true
      },
      take: 200
    }),
    prisma.erpFixedAssetBook.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        fixedAsset: true
      },
      take: 200
    }),
    prisma.erpFixedAssetTransaction.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ transactionDate: "desc" }, { transactionNo: "desc" }],
      include: {
        fixedAsset: true,
        journalEntry: {
          select: {
            journalNo: true
          }
        }
      },
      take: 200
    })
  ]);
  const assetRows = assets.map((asset) => ({
    fixedAssetId: asset.id,
    assetNo: asset.assetNo,
    assetClassCode: asset.assetClass.code,
    assetClassName: asset.assetClass.name,
    name: asset.name,
    description: asset.description,
    serialNo: asset.serialNo,
    modelNo: asset.modelNo,
    manufacturer: asset.manufacturer,
    locationCode: asset.locationCode,
    custodianName: asset.custodianName,
    acquisitionDate: asset.acquisitionDate.toISOString(),
    inServiceDate: asset.inServiceDate?.toISOString() ?? null,
    depreciationStartDate: asset.depreciationStartDate?.toISOString() ?? null,
    currencyCode: asset.currencyCode,
    acquisitionCost: Number(asset.acquisitionCost),
    residualValue: Number(asset.residualValue),
    accumulatedDepreciation: Number(asset.accumulatedDepreciation),
    netBookValue: Number(asset.netBookValue),
    usefulLifeMonths: asset.usefulLifeMonths,
    depreciationMethod: asset.depreciationMethod,
    status: asset.status
  }));
  const bookRows = books.map((book) => ({
    fixedAssetBookId: book.id,
    fixedAssetId: book.fixedAssetId,
    assetNo: book.fixedAsset.assetNo,
    assetName: book.fixedAsset.name,
    bookCode: book.bookCode,
    bookName: book.bookName,
    depreciationMethod: book.depreciationMethod,
    usefulLifeMonths: book.usefulLifeMonths,
    residualValue: Number(book.residualValue),
    depreciationStartDate: book.depreciationStartDate?.toISOString() ?? null,
    lastDepreciationDate: book.lastDepreciationDate?.toISOString() ?? null,
    accumulatedDepreciation: Number(book.accumulatedDepreciation),
    netBookValue: Number(book.netBookValue),
    status: book.status
  }));
  const transactionRows = transactions.map((transaction) => ({
    fixedAssetTransactionId: transaction.id,
    fixedAssetId: transaction.fixedAssetId,
    assetNo: transaction.fixedAsset.assetNo,
    assetName: transaction.fixedAsset.name,
    transactionNo: transaction.transactionNo,
    transactionType: transaction.transactionType,
    bookCode: transaction.bookCode,
    transactionDate: transaction.transactionDate.toISOString(),
    postingDate: transaction.postingDate.toISOString(),
    currencyCode: transaction.currencyCode,
    amount: Number(transaction.amount),
    accumulatedDepreciationAmount: Number(transaction.accumulatedDepreciationAmount),
    proceedsAmount: Number(transaction.proceedsAmount),
    gainLossAmount: Number(transaction.gainLossAmount),
    proceedsAccountCode: transaction.proceedsAccountCode,
    fromLocationCode: transaction.fromLocationCode,
    toLocationCode: transaction.toLocationCode,
    fromCustodianName: transaction.fromCustodianName,
    toCustodianName: transaction.toCustodianName,
    sourceType: transaction.sourceType,
    sourceReference: transaction.sourceReference,
    journalEntryId: transaction.journalEntryId,
    journalNo: transaction.journalEntry?.journalNo ?? null,
    status: transaction.status
  }));

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Fixed asset setup and lifecycle workflows manage depreciation, transfers, and disposals through reviewable contracts.",
    refreshedAt: new Date().toISOString(),
    defaultAcquisitionDate: dateOnly(new Date()),
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    assetClassRows: assetClasses.map((assetClass) => ({
      fixedAssetClassId: assetClass.id,
      code: assetClass.code,
      name: assetClass.name,
      description: assetClass.description,
      assetType: assetClass.assetType,
      depreciationMethod: assetClass.depreciationMethod,
      defaultUsefulLifeMonths: assetClass.defaultUsefulLifeMonths,
      defaultResidualValue: Number(assetClass.defaultResidualValue),
      acquisitionAccountCode: assetClass.acquisitionAccountCode,
      accumulatedDepreciationAccountCode: assetClass.accumulatedDepreciationAccountCode,
      depreciationExpenseAccountCode: assetClass.depreciationExpenseAccountCode,
      gainOnDisposalAccountCode: assetClass.gainOnDisposalAccountCode,
      lossOnDisposalAccountCode: assetClass.lossOnDisposalAccountCode,
      assetCount: assetClass.assets.length,
      status: assetClass.status
    })),
    assetRows,
    bookRows,
    transactionRows,
    metrics: {
      assetClasses: assetClasses.filter((assetClass) => assetClass.status === activeStatus).length,
      activeAssets: assetRows.filter((asset) => asset.status === activeStatus).length,
      acquisitionCost: roundMoney(assetRows.reduce((sum, asset) => sum + asset.acquisitionCost, 0)),
      netBookValue: roundMoney(assetRows.reduce((sum, asset) => sum + asset.netBookValue, 0)),
      draftTransactions: transactionRows.filter((transaction) => transaction.status === "DRAFT").length
    }
  };
}

export async function upsertErpFixedAssetClass(
  input: UpsertErpFixedAssetClassRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using fixed assets.");
    }

    await ensureFixedAssetDocumentSequences(tx, context, company);

    const normalized = normalizeAssetClassInput(input);
    await validateAccountCodes(tx, context.retailOrgId, [
      normalized.acquisitionAccountCode,
      normalized.accumulatedDepreciationAccountCode,
      normalized.depreciationExpenseAccountCode,
      normalized.gainOnDisposalAccountCode,
      normalized.lossOnDisposalAccountCode
    ]);

    const assetClass = await tx.erpFixedAssetClass.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: normalized.code
        }
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        ...normalized
      },
      update: normalized
    });

    return {
      message: `Flash ERP saved fixed asset class ${assetClass.code}.`,
      fixedAssetClassId: assetClass.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpFixedAsset(
  input: UpsertErpFixedAssetRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using fixed assets.");
    }

    await ensureFixedAssetFoundation(tx, context, company);

    const assetClassCode = normalizeCode(input.assetClassCode, "asset class");
    const assetClass = await tx.erpFixedAssetClass.findFirst({
      where: {
        companyId: company.id,
        code: assetClassCode,
        status: activeStatus
      }
    });

    if (!assetClass) {
      throw new Error(`Flash ERP cannot find active fixed asset class ${assetClassCode}.`);
    }

    const acquisitionDate = parseDate(input.acquisitionDate ?? dateOnly(new Date()), "acquisition date");
    const acquisitionCost = roundMoney(Math.max(0, numberOrZero(input.acquisitionCost)));
    const residualValue = roundMoney(
      Math.max(0, numberOrZero(input.residualValue ?? Number(assetClass.defaultResidualValue)))
    );
    const accumulatedDepreciation = roundMoney(Math.max(0, numberOrZero(input.accumulatedDepreciation)));
    const netBookValue = roundMoney(Math.max(0, acquisitionCost - accumulatedDepreciation));
    const usefulLifeMonths = normalizePositiveInteger(
      input.usefulLifeMonths,
      assetClass.defaultUsefulLifeMonths,
      "useful life"
    );
    const depreciationMethod = normalizeCode(
      input.depreciationMethod ?? assetClass.depreciationMethod,
      "depreciation method"
    );
    const fixedAssetId = normalizeOptionalText(input.fixedAssetId);
    const assetStatus = normalizeStatus(input.status, ["ACTIVE", "INACTIVE", "DRAFT", "RETIRED"]);
    const assetData = {
      assetClassId: assetClass.id,
      name: normalizeRequiredText(input.name, "asset name"),
      description: normalizeOptionalText(input.description),
      serialNo: normalizeOptionalText(input.serialNo),
      modelNo: normalizeOptionalText(input.modelNo),
      manufacturer: normalizeOptionalText(input.manufacturer),
      locationCode: normalizeOptionalCode(input.locationCode),
      custodianName: normalizeOptionalText(input.custodianName),
      acquisitionDate,
      inServiceDate: parseOptionalDate(input.inServiceDate, "in-service date"),
      depreciationStartDate: parseOptionalDate(input.depreciationStartDate, "depreciation start date"),
      currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency"),
      acquisitionCost,
      residualValue,
      usefulLifeMonths,
      depreciationMethod,
      accumulatedDepreciation,
      netBookValue,
      status: assetStatus,
      retiredAt: assetStatus === "RETIRED" ? new Date() : null
    };

    if (fixedAssetId) {
      const existing = await tx.erpFixedAsset.findFirst({
        where: {
          id: fixedAssetId,
          companyId: company.id,
          status: {
            not: RecordStatus.DELETED
          }
        },
        select: {
          id: true,
          assetNo: true
        }
      });

      if (!existing) {
        throw new Error("Flash ERP cannot find that fixed asset.");
      }

      const asset = await tx.erpFixedAsset.update({
        where: {
          id: existing.id
        },
        data: assetData
      });

      await tx.erpFixedAssetBook.upsert({
        where: {
          fixedAssetId_bookCode: {
            fixedAssetId: asset.id,
            bookCode: "COMPANY"
          }
        },
        create: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          fixedAssetId: asset.id,
          bookCode: "COMPANY",
          bookName: "Company book",
          depreciationMethod,
          usefulLifeMonths,
          residualValue,
          depreciationStartDate: asset.depreciationStartDate,
          accumulatedDepreciation,
          netBookValue,
          status: activeStatus
        },
        update: {
          depreciationMethod,
          usefulLifeMonths,
          residualValue,
          depreciationStartDate: asset.depreciationStartDate,
          accumulatedDepreciation,
          netBookValue,
          status: activeStatus
        }
      });

      return {
        message: `Flash ERP updated fixed asset ${asset.assetNo}.`,
        fixedAssetId: asset.id,
        assetNo: asset.assetNo,
        serverProcessedAt: new Date().toISOString()
      };
    }

    const assetNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "FIXED_ASSET"
      })
    ).documentNo;
    const transactionNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "FIXED_ASSET_TXN"
      })
    ).documentNo;
    const asset = await tx.erpFixedAsset.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        assetNo,
        ...assetData,
        depreciationBooks: {
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            bookCode: "COMPANY",
            bookName: "Company book",
            depreciationMethod,
            usefulLifeMonths,
            residualValue,
            depreciationStartDate: assetData.depreciationStartDate,
            accumulatedDepreciation,
            netBookValue,
            status: activeStatus
          }
        },
        transactions: {
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            transactionNo,
            transactionType: "ACQUISITION",
            transactionDate: acquisitionDate,
            postingDate: acquisitionDate,
            currencyCode: assetData.currencyCode,
            amount: acquisitionCost,
            accumulatedDepreciationAmount: 0,
            proceedsAmount: 0,
            sourceType: "FIXED_ASSET_REGISTER",
            sourceReference: assetNo,
            memo: `Acquisition contract for ${assetNo}`,
            status: "DRAFT"
          }
        }
      }
    });

    return {
      message: `Flash ERP registered fixed asset ${assetNo}.`,
      fixedAssetId: asset.id,
      assetNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createErpFixedAssetDepreciationProposal(
  input: CreateErpFixedAssetDepreciationRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using fixed assets.");
    }

    await ensureFixedAssetDocumentSequences(tx, context, company);

    const fixedAssetId = normalizeRequiredText(input.fixedAssetId, "fixed asset");
    const bookCode = normalizeBookCode(input.bookCode);
    const postingDate = parseDate(input.postingDate ?? dateOnly(new Date()), "depreciation date");
    const asset = await tx.erpFixedAsset.findFirst({
      where: {
        id: fixedAssetId,
        companyId: company.id,
        status: activeStatus
      },
      include: {
        assetClass: true,
        depreciationBooks: {
          where: {
            bookCode,
            status: activeStatus
          },
          take: 1
        }
      }
    });

    if (!asset) {
      throw new Error("Flash ERP cannot find an active fixed asset for depreciation.");
    }

    const book = asset.depreciationBooks[0];

    if (!book) {
      throw new Error(`Flash ERP cannot find active depreciation book ${bookCode}.`);
    }

    if (book.depreciationMethod === "NO_DEPRECIATION") {
      throw new Error("Flash ERP cannot depreciate a no-depreciation asset book.");
    }

    const remainingAmount = roundMoney(
      Math.max(0, Number(book.netBookValue) - Number(book.residualValue))
    );
    const requestedAmount = numberOrZero(input.amount);
    const calculatedAmount =
      requestedAmount > 0
        ? roundMoney(requestedAmount)
        : calculateStraightLineDepreciationAmount({
            assetCost: Number(asset.acquisitionCost),
            residualValue: Number(book.residualValue),
            usefulLifeMonths: book.usefulLifeMonths,
            accumulatedDepreciation: Number(book.accumulatedDepreciation),
            startDate:
              book.depreciationStartDate ??
              asset.depreciationStartDate ??
              asset.inServiceDate ??
              asset.acquisitionDate,
            lastDepreciationDate: book.lastDepreciationDate,
            postingDate
          });
    const depreciationAmount = roundMoney(Math.min(calculatedAmount, remainingAmount));

    if (depreciationAmount <= 0) {
      throw new Error("Flash ERP depreciation proposal must be greater than zero.");
    }

    const transactionNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "FIXED_ASSET_TXN"
      })
    ).documentNo;
    const transaction = await tx.erpFixedAssetTransaction.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fixedAssetId: asset.id,
        transactionNo,
        transactionType: "DEPRECIATION",
        bookCode,
        transactionDate: postingDate,
        postingDate,
        currencyCode: asset.currencyCode,
        amount: depreciationAmount,
        accumulatedDepreciationAmount: roundMoney(
          Number(book.accumulatedDepreciation) + depreciationAmount
        ),
        proceedsAmount: 0,
        gainLossAmount: 0,
        sourceType: "FIXED_ASSET_DEPRECIATION",
        sourceReference: asset.assetNo,
        memo:
          normalizeOptionalText(input.memo) ??
          `Depreciation proposal for ${asset.assetNo} ${bookCode}`,
        status: "DRAFT"
      }
    });

    return {
      message: `Flash ERP prepared depreciation proposal ${transactionNo}.`,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fixedAssetTransactionId: transaction.id,
      transactionNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, fixedAssetTransactionOptions);
}

export async function transferErpFixedAsset(
  input: TransferErpFixedAssetRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using fixed assets.");
    }

    await ensureFixedAssetDocumentSequences(tx, context, company);

    const fixedAssetId = normalizeRequiredText(input.fixedAssetId, "fixed asset");
    const transferDate = parseDate(input.transferDate ?? dateOnly(new Date()), "transfer date");
    const toLocationCode = normalizeOptionalCode(input.toLocationCode);
    const toCustodianName = normalizeOptionalText(input.toCustodianName);

    if (!toLocationCode && !toCustodianName) {
      throw new Error("Flash ERP transfer needs a new location or custodian.");
    }

    const asset = await tx.erpFixedAsset.findFirst({
      where: {
        id: fixedAssetId,
        companyId: company.id,
        status: activeStatus
      }
    });

    if (!asset) {
      throw new Error("Flash ERP cannot find an active fixed asset to transfer.");
    }

    const nextLocationCode = toLocationCode ?? asset.locationCode;
    const nextCustodianName = toCustodianName ?? asset.custodianName;

    if (nextLocationCode === asset.locationCode && nextCustodianName === asset.custodianName) {
      throw new Error("Flash ERP transfer destination matches the current asset assignment.");
    }

    const transactionNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "FIXED_ASSET_TXN"
      })
    ).documentNo;

    await tx.erpFixedAsset.update({
      where: {
        id: asset.id
      },
      data: {
        locationCode: nextLocationCode,
        custodianName: nextCustodianName
      }
    });
    const transaction = await tx.erpFixedAssetTransaction.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fixedAssetId: asset.id,
        transactionNo,
        transactionType: "TRANSFER",
        bookCode: "COMPANY",
        transactionDate: transferDate,
        postingDate: transferDate,
        currencyCode: asset.currencyCode,
        amount: 0,
        accumulatedDepreciationAmount: Number(asset.accumulatedDepreciation),
        proceedsAmount: 0,
        gainLossAmount: 0,
        fromLocationCode: asset.locationCode,
        toLocationCode: nextLocationCode,
        fromCustodianName: asset.custodianName,
        toCustodianName: nextCustodianName,
        sourceType: "FIXED_ASSET_TRANSFER",
        sourceReference: asset.assetNo,
        memo:
          normalizeOptionalText(input.memo) ??
          `Transfer ${asset.assetNo} from ${asset.locationCode ?? "unassigned"} to ${
            nextLocationCode ?? "unassigned"
          }`,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Enterprise fixed assets"
      }
    });

    return {
      message: `Flash ERP recorded fixed asset transfer ${transactionNo}.`,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fixedAssetTransactionId: transaction.id,
      transactionNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, fixedAssetTransactionOptions);
}

export async function createErpFixedAssetDisposalProposal(
  input: CreateErpFixedAssetDisposalRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using fixed assets.");
    }

    await ensureFixedAssetDocumentSequences(tx, context, company);

    const fixedAssetId = normalizeRequiredText(input.fixedAssetId, "fixed asset");
    const bookCode = normalizeBookCode(input.bookCode);
    const postingDate = parseDate(input.postingDate ?? dateOnly(new Date()), "disposal date");
    const proceedsAmount = roundMoney(Math.max(0, numberOrZero(input.proceedsAmount)));
    const proceedsAccountCode = normalizeCode(
      input.proceedsAccountCode ?? "1000",
      "disposal proceeds account"
    );
    const asset = await tx.erpFixedAsset.findFirst({
      where: {
        id: fixedAssetId,
        companyId: company.id,
        status: activeStatus
      },
      include: {
        assetClass: true,
        depreciationBooks: {
          where: {
            bookCode,
            status: activeStatus
          },
          take: 1
        }
      }
    });

    if (!asset) {
      throw new Error("Flash ERP cannot find an active fixed asset to dispose.");
    }

    const book = asset.depreciationBooks[0];

    if (!book) {
      throw new Error(`Flash ERP cannot find active depreciation book ${bookCode}.`);
    }

    await validateAccountCodes(tx, context.retailOrgId, [
      proceedsAccountCode,
      asset.assetClass.acquisitionAccountCode,
      asset.assetClass.accumulatedDepreciationAccountCode,
      asset.assetClass.gainOnDisposalAccountCode,
      asset.assetClass.lossOnDisposalAccountCode
    ]);

    const acquisitionCost = roundMoney(Number(asset.acquisitionCost));
    const accumulatedDepreciation = roundMoney(Number(book.accumulatedDepreciation));
    const netBookValue = roundMoney(Math.max(0, acquisitionCost - accumulatedDepreciation));
    const gainLossAmount = roundMoney(proceedsAmount - netBookValue);
    const transactionNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: "FIXED_ASSET_TXN"
      })
    ).documentNo;
    const transaction = await tx.erpFixedAssetTransaction.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fixedAssetId: asset.id,
        transactionNo,
        transactionType: "DISPOSAL",
        bookCode,
        transactionDate: postingDate,
        postingDate,
        currencyCode: asset.currencyCode,
        amount: acquisitionCost,
        accumulatedDepreciationAmount: accumulatedDepreciation,
        proceedsAmount,
        gainLossAmount,
        proceedsAccountCode,
        sourceType: "FIXED_ASSET_DISPOSAL",
        sourceReference: asset.assetNo,
        memo:
          normalizeOptionalText(input.memo) ??
          `Disposal proposal for ${asset.assetNo} ${bookCode}`,
        status: "DRAFT"
      }
    });

    return {
      message: `Flash ERP prepared disposal proposal ${transactionNo}.`,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fixedAssetTransactionId: transaction.id,
      transactionNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, fixedAssetTransactionOptions);
}

export async function postErpFixedAssetTransaction(
  input: PostErpFixedAssetTransactionRequest
): Promise<ErpFixedAssetsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getFixedAssetContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const transactionId = normalizeRequiredText(
      input.fixedAssetTransactionId,
      "fixed asset transaction"
    );
    const transaction = await tx.erpFixedAssetTransaction.findFirst({
      where: {
        id: transactionId,
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        fixedAsset: {
          include: {
            assetClass: true,
            depreciationBooks: {
              where: {
                status: {
                  not: RecordStatus.DELETED
                }
              }
            }
          }
        }
      }
    });

    if (!transaction) {
      throw new Error("Flash ERP cannot find that fixed asset transaction.");
    }

    if (transaction.status !== "DRAFT") {
      throw new Error("Only draft fixed asset transactions can be posted.");
    }

    if (!["DEPRECIATION", "DISPOSAL"].includes(transaction.transactionType)) {
      throw new Error("Flash ERP can only post depreciation or disposal lifecycle transactions here.");
    }

    const postingDate = parseDate(
      input.postingDate ?? dateOnly(transaction.postingDate),
      "posting date"
    );
    const asset = transaction.fixedAsset;
    const assetClass = asset.assetClass;
    const book = asset.depreciationBooks.find((row) => row.bookCode === transaction.bookCode);

    if (!book || book.status !== activeStatus) {
      throw new Error(`Flash ERP cannot find active depreciation book ${transaction.bookCode}.`);
    }

    await validateAccountCodes(
      tx,
      context.retailOrgId,
      transaction.transactionType === "DEPRECIATION"
        ? [
            assetClass.accumulatedDepreciationAccountCode,
            assetClass.depreciationExpenseAccountCode
          ]
        : [
            assetClass.acquisitionAccountCode,
            assetClass.accumulatedDepreciationAccountCode,
            assetClass.gainOnDisposalAccountCode,
            assetClass.lossOnDisposalAccountCode,
            transaction.proceedsAccountCode ?? "1000"
          ]
    );

    const postingLines: PostAccountingDocumentLine[] = [];
    let sourceType = "ERP-FIXED-ASSET-DEPRECIATION";
    let journalType = "FIXED_ASSET_DEPRECIATION";
    let description = `${transaction.transactionNo} depreciation for ${asset.assetNo}`;
    let depreciationAmount = roundMoney(Number(transaction.amount));

    if (transaction.transactionType === "DEPRECIATION") {
      const remainingAmount = roundMoney(
        Math.max(0, Number(book.netBookValue) - Number(book.residualValue))
      );
      depreciationAmount = roundMoney(Math.min(depreciationAmount, remainingAmount));

      if (depreciationAmount <= 0) {
        throw new Error("Flash ERP depreciation posting must be greater than zero.");
      }

      addPostingLine(
        postingLines,
        assetClass.depreciationExpenseAccountCode,
        depreciationAmount,
        0,
        `${transaction.transactionNo} depreciation expense`
      );
      addPostingLine(
        postingLines,
        assetClass.accumulatedDepreciationAccountCode,
        0,
        depreciationAmount,
        `${transaction.transactionNo} accumulated depreciation`
      );
    } else {
      const acquisitionCost = roundMoney(Number(asset.acquisitionCost));
      const accumulatedDepreciation = roundMoney(Number(book.accumulatedDepreciation));
      const proceedsAmount = roundMoney(Number(transaction.proceedsAmount));
      const netBookValue = roundMoney(Math.max(0, acquisitionCost - accumulatedDepreciation));
      const gainLossAmount = roundMoney(proceedsAmount - netBookValue);
      const gainAmount = Math.max(0, gainLossAmount);
      const lossAmount = Math.max(0, -gainLossAmount);
      const proceedsAccountCode = normalizeCode(
        transaction.proceedsAccountCode ?? "1000",
        "disposal proceeds account"
      );

      sourceType = "ERP-FIXED-ASSET-DISPOSAL";
      journalType = "FIXED_ASSET_DISPOSAL";
      description = `${transaction.transactionNo} disposal for ${asset.assetNo}`;

      addPostingLine(
        postingLines,
        assetClass.accumulatedDepreciationAccountCode,
        accumulatedDepreciation,
        0,
        `${transaction.transactionNo} remove accumulated depreciation`
      );
      addPostingLine(
        postingLines,
        proceedsAccountCode,
        proceedsAmount,
        0,
        `${transaction.transactionNo} disposal proceeds`
      );
      addPostingLine(
        postingLines,
        assetClass.lossOnDisposalAccountCode,
        lossAmount,
        0,
        `${transaction.transactionNo} disposal loss`
      );
      addPostingLine(
        postingLines,
        assetClass.acquisitionAccountCode,
        0,
        acquisitionCost,
        `${transaction.transactionNo} remove asset cost`
      );
      addPostingLine(
        postingLines,
        assetClass.gainOnDisposalAccountCode,
        0,
        gainAmount,
        `${transaction.transactionNo} disposal gain`
      );

      await tx.erpFixedAssetTransaction.update({
        where: {
          id: transaction.id
        },
        data: {
          amount: acquisitionCost,
          accumulatedDepreciationAmount: accumulatedDepreciation,
          gainLossAmount,
          proceedsAccountCode
        }
      });
    }

    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: transaction.retailOrgId,
      companyId: transaction.companyId,
      documentType: "JOURNAL",
      batchSourceType: "FIXED_ASSET",
      journalType,
      sourceType,
      sourceId: transaction.id,
      sourceReference: transaction.transactionNo,
      postingDate,
      description: normalizeOptionalText(transaction.memo) ?? description,
      postedBy: "Enterprise fixed assets",
      lines: postingLines
    });
    const postedAt = new Date();

    if (transaction.transactionType === "DEPRECIATION") {
      const nextAccumulatedDepreciation = roundMoney(
        Number(book.accumulatedDepreciation) + depreciationAmount
      );
      const nextNetBookValue = roundMoney(Math.max(0, Number(book.netBookValue) - depreciationAmount));

      await tx.erpFixedAssetBook.update({
        where: {
          id: book.id
        },
        data: {
          accumulatedDepreciation: nextAccumulatedDepreciation,
          netBookValue: nextNetBookValue,
          lastDepreciationDate: postingDate
        }
      });
      await tx.erpFixedAsset.update({
        where: {
          id: asset.id
        },
        data: {
          accumulatedDepreciation: nextAccumulatedDepreciation,
          netBookValue: nextNetBookValue
        }
      });
      await tx.erpFixedAssetTransaction.update({
        where: {
          id: transaction.id
        },
        data: {
          amount: depreciationAmount,
          accumulatedDepreciationAmount: nextAccumulatedDepreciation,
          status: "POSTED",
          postedAt,
          postedBy: "Enterprise fixed assets",
          postingDate,
          journalEntryId: result.journalEntryId
        }
      });
    } else {
      await tx.erpFixedAssetBook.update({
        where: {
          id: book.id
        },
        data: {
          netBookValue: 0,
          status: "RETIRED"
        }
      });
      await tx.erpFixedAsset.update({
        where: {
          id: asset.id
        },
        data: {
          netBookValue: 0,
          status: "RETIRED",
          retiredAt: postingDate
        }
      });
      await tx.erpFixedAssetTransaction.update({
        where: {
          id: transaction.id
        },
        data: {
          status: "POSTED",
          postedAt,
          postedBy: "Enterprise fixed assets",
          postingDate,
          journalEntryId: result.journalEntryId
        }
      });
    }

    return {
      message: `Flash ERP posted ${transaction.transactionNo} through journal ${result.journalNo}.`,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fixedAssetTransactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  }, fixedAssetTransactionOptions);
}

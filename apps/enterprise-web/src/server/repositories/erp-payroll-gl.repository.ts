import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type PayrollGlContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type PayrollCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

export type UpsertErpPayrollGlMappingRequest = {
  mappingId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  componentType?: string | null;
  accountCode?: string | null;
  defaultEntrySide?: string | null;
  status?: string | null;
};

export type UpsertErpPayrollPostingBatchRequest = {
  payrollPostingBatchId?: string | null;
  payPeriodCode?: string | null;
  payPeriodStart?: string | null;
  payPeriodEnd?: string | null;
  paymentDate?: string | null;
  postingDate?: string | null;
  currencyCode?: string | null;
  sourceSystem?: string | null;
  sourceReference?: string | null;
  description?: string | null;
  employeeCount?: number | string | null;
  lines?: Array<{
    mappingCode?: string | null;
    accountCode?: string | null;
    employeeReference?: string | null;
    departmentCode?: string | null;
    componentCode?: string | null;
    componentName?: string | null;
    componentType?: string | null;
    entrySide?: string | null;
    amount?: number | string | null;
    memo?: string | null;
  }> | null;
};

export type ErpPayrollGlMutationResponse = {
  message: string;
  mappingId?: string;
  payrollPostingBatchId?: string;
  batchNo?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpPayrollGlWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultPayPeriodStart: string;
  defaultPayPeriodEnd: string;
  defaultPostingDate: string;
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  mappingOptions: Array<{
    mappingCode: string;
    label: string;
    componentType: string;
    accountCode: string;
    defaultEntrySide: string;
  }>;
  mappingRows: Array<{
    mappingId: string;
    code: string;
    name: string;
    description: string | null;
    componentType: string;
    accountCode: string;
    accountName: string | null;
    defaultEntrySide: string;
    status: string;
  }>;
  batchRows: Array<{
    payrollPostingBatchId: string;
    batchNo: string;
    payPeriodCode: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    paymentDate: string | null;
    postingDate: string;
    currencyCode: string;
    sourceSystem: string;
    sourceReference: string | null;
    description: string | null;
    employeeCount: number;
    grossPay: number;
    employeeDeductions: number;
    employerCosts: number;
    netPay: number;
    totalDebit: number;
    totalCredit: number;
    status: string;
    postedAt: string | null;
    postedBy: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
  }>;
  lineRows: Array<{
    payrollPostingLineId: string;
    payrollPostingBatchId: string;
    batchNo: string;
    lineNo: number;
    employeeReference: string | null;
    departmentCode: string | null;
    componentCode: string;
    componentName: string;
    componentType: string;
    accountCode: string;
    accountName: string | null;
    entrySide: string;
    debitAmount: number;
    creditAmount: number;
    memo: string | null;
    status: string;
  }>;
  metrics: {
    mappings: number;
    draftBatches: number;
    postedBatches: number;
    grossPay: number;
    netPay: number;
    unpostedDebits: number;
    unpostedCredits: number;
  };
};

const activeStatus = RecordStatus.ACTIVE;
const payrollGlTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

function runPayrollGlTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback, payrollGlTransactionOptions);
}

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

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function currentMonthEnd() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
}

function defaultPayPeriodCode(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildUnavailableErpPayrollGlWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpPayrollGlWorkspaceData {
  const periodStart = currentMonthStart();
  const periodEnd = currentMonthEnd();

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultPayPeriodStart: dateOnly(periodStart),
    defaultPayPeriodEnd: dateOnly(periodEnd),
    defaultPostingDate: dateOnly(periodEnd),
    accountOptions: [],
    mappingOptions: [],
    mappingRows: [],
    batchRows: [],
    lineRows: [],
    metrics: {
      mappings: 0,
      draftBatches: 0,
      postedBatches: 0,
      grossPay: 0,
      netPay: 0,
      unpostedDebits: 0,
      unpostedCredits: 0
    }
  };
}

export { buildUnavailableErpPayrollGlWorkspace };

async function getPayrollGlContext(
  tx: Prisma.TransactionClient = prisma
): Promise<PayrollGlContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: PayrollGlContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

async function resolveGlAccount(tx: Prisma.TransactionClient, retailOrgId: string, accountCode: string) {
  const normalizedCode = normalizeCode(accountCode, "GL account");
  const account = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      code: normalizedCode,
      status: activeStatus
    }
  });

  if (!account) {
    throw new Error(`Flash ERP cannot find active GL account ${normalizedCode}.`);
  }

  return account;
}

async function ensurePayrollDocumentSequence(
  tx: Prisma.TransactionClient,
  context: PayrollGlContext,
  company: PayrollCompany
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

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: company.id,
        documentType: "PAYROLL_BATCH",
        fiscalYearId: fiscalYear.id
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      fiscalYearId: fiscalYear.id,
      documentType: "PAYROLL_BATCH",
      prefix: "PR",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: activeStatus
    },
    update: {}
  });
}

async function ensureDefaultPayrollMappings(
  tx: Prisma.TransactionClient,
  context: PayrollGlContext,
  company: PayrollCompany
) {
  const defaults = [
    {
      code: "SALARY_EARNINGS",
      name: "Salary earnings",
      componentType: "EARNING",
      accountCode: "6020",
      defaultEntrySide: "DEBIT",
      description: "Gross salary expense from external payroll."
    },
    {
      code: "WAGE_EARNINGS",
      name: "Wage earnings",
      componentType: "EARNING",
      accountCode: "6030",
      defaultEntrySide: "DEBIT",
      description: "Gross wage expense from external payroll."
    },
    {
      code: "EMPLOYER_TAX",
      name: "Employer payroll tax",
      componentType: "EMPLOYER_COST",
      accountCode: "6040",
      defaultEntrySide: "DEBIT",
      description: "Employer payroll tax expense."
    },
    {
      code: "EMPLOYEE_BENEFITS",
      name: "Employee benefits",
      componentType: "EMPLOYER_COST",
      accountCode: "6050",
      defaultEntrySide: "DEBIT",
      description: "Employer benefit cost."
    },
    {
      code: "NET_PAY",
      name: "Net pay payable",
      componentType: "NET_PAY",
      accountCode: "2020",
      defaultEntrySide: "CREDIT",
      description: "Net payroll payable before cashbook payment."
    },
    {
      code: "STATUTORY_DEDUCTION",
      name: "Statutory deductions payable",
      componentType: "DEDUCTION",
      accountCode: "2020",
      defaultEntrySide: "CREDIT",
      description: "Payroll deductions and statutory liabilities payable."
    },
    {
      code: "EMPLOYER_TAX_LIABILITY",
      name: "Employer payroll tax payable",
      componentType: "LIABILITY",
      accountCode: "2020",
      defaultEntrySide: "CREDIT",
      description: "Employer payroll tax liability."
    }
  ];

  for (const mapping of defaults) {
    const account = await resolveGlAccount(tx, context.retailOrgId, mapping.accountCode);

    await tx.erpPayrollGlMapping.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: mapping.code
        }
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        accountId: account.id,
        ...mapping,
        status: activeStatus
      },
      update: {
        accountId: account.id,
        accountCode: mapping.accountCode
      }
    });
  }
}

async function ensurePayrollGlFoundation(
  tx: Prisma.TransactionClient,
  context: PayrollGlContext,
  company: PayrollCompany
) {
  await ensurePayrollDocumentSequence(tx, context, company);
  await ensureDefaultPayrollMappings(tx, context, company);
}

function normalizeMappingInput(input: UpsertErpPayrollGlMappingRequest) {
  return {
    code: normalizeCode(input.code, "payroll mapping code"),
    name: normalizeRequiredText(input.name, "payroll mapping name"),
    description: normalizeOptionalText(input.description),
    componentType: normalizeCode(input.componentType ?? "EARNING", "component type"),
    accountCode: normalizeCode(input.accountCode, "GL account"),
    defaultEntrySide: normalizeStatus(input.defaultEntrySide ?? "DEBIT", ["DEBIT", "CREDIT"]),
    status: normalizeStatus(input.status)
  };
}

function normalizePayrollLine(
  line: NonNullable<UpsertErpPayrollPostingBatchRequest["lines"]>[number],
  index: number,
  mapping: {
    id: string;
    code: string;
    name: string;
    componentType: string;
    accountCode: string;
    accountId: string | null;
    defaultEntrySide: string;
  } | null,
  accountId: string
) {
  const entrySide = normalizeStatus(line.entrySide ?? mapping?.defaultEntrySide ?? "DEBIT", [
    "DEBIT",
    "CREDIT"
  ]);
  const amount = roundMoney(Math.max(0, numberOrZero(line.amount)));

  if (amount <= 0) {
    throw new Error("Flash ERP payroll lines need positive amounts.");
  }

  return {
    mappingId: mapping?.id ?? null,
    accountId,
    lineNo: index + 1,
    employeeReference: normalizeOptionalText(line.employeeReference),
    departmentCode: normalizeOptionalCode(line.departmentCode),
    componentCode: normalizeCode(line.componentCode ?? mapping?.code, "payroll component code"),
    componentName: normalizeRequiredText(line.componentName ?? mapping?.name, "payroll component name"),
    componentType: normalizeCode(line.componentType ?? mapping?.componentType ?? "EARNING", "component type"),
    accountCode: normalizeCode(line.accountCode ?? mapping?.accountCode, "GL account"),
    entrySide,
    debitAmount: entrySide === "DEBIT" ? amount : 0,
    creditAmount: entrySide === "CREDIT" ? amount : 0,
    memo: normalizeOptionalText(line.memo),
    status: activeStatus
  };
}

function calculateBatchTotals(
  lines: Array<{
    componentType: string;
    debitAmount: number;
    creditAmount: number;
    employeeReference: string | null;
  }>,
  employeeCountInput: number | string | null | undefined
) {
  const employeeReferences = new Set(
    lines.map((line) => line.employeeReference).filter((value): value is string => Boolean(value))
  );
  const employeeCount = Math.max(
    Math.trunc(numberOrZero(employeeCountInput)),
    employeeReferences.size
  );
  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + line.debitAmount, 0));
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + line.creditAmount, 0));

  return {
    employeeCount,
    grossPay: roundMoney(
      lines
        .filter((line) => line.componentType === "EARNING")
        .reduce((sum, line) => sum + line.debitAmount + line.creditAmount, 0)
    ),
    employeeDeductions: roundMoney(
      lines
        .filter((line) => line.componentType === "DEDUCTION")
        .reduce((sum, line) => sum + line.debitAmount + line.creditAmount, 0)
    ),
    employerCosts: roundMoney(
      lines
        .filter((line) => line.componentType === "EMPLOYER_COST")
        .reduce((sum, line) => sum + line.debitAmount + line.creditAmount, 0)
    ),
    netPay: roundMoney(
      lines
        .filter((line) => line.componentType === "NET_PAY")
        .reduce((sum, line) => sum + line.debitAmount + line.creditAmount, 0)
    ),
    totalDebit,
    totalCredit
  };
}

export async function getErpPayrollGlWorkspace(): Promise<ErpPayrollGlWorkspaceData> {
  const context = await getPayrollGlContext();

  if (!context) {
    return buildUnavailableErpPayrollGlWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpPayrollGlWorkspace(
      "Create a company in Finance foundation before using payroll GL integration.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await runPayrollGlTransaction((tx) => ensurePayrollGlFoundation(tx, context, company));

  const [accounts, mappings, batches, lines] = await Promise.all([
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpPayrollGlMapping.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        account: true
      },
      orderBy: [{ componentType: "asc" }, { code: "asc" }]
    }),
    prisma.erpPayrollPostingBatch.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        journalEntry: {
          select: {
            journalNo: true
          }
        }
      },
      orderBy: [{ payPeriodEnd: "desc" }, { batchNo: "desc" }],
      take: 150
    }),
    prisma.erpPayrollPostingLine.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        payrollPostingBatch: true,
        account: true
      },
      orderBy: [{ payrollPostingBatch: { payPeriodEnd: "desc" } }, { lineNo: "asc" }],
      take: 500
    })
  ]);
  const draftBatches = batches.filter((batch) => batch.status === "DRAFT");

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Payroll GL integration stages external payroll summaries and posts balanced journals through the shared accounting engine.",
    refreshedAt: new Date().toISOString(),
    defaultPayPeriodStart: dateOnly(currentMonthStart()),
    defaultPayPeriodEnd: dateOnly(currentMonthEnd()),
    defaultPostingDate: dateOnly(currentMonthEnd()),
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    mappingOptions: mappings.map((mapping) => ({
      mappingCode: mapping.code,
      label: `${mapping.code} - ${mapping.name}`,
      componentType: mapping.componentType,
      accountCode: mapping.accountCode,
      defaultEntrySide: mapping.defaultEntrySide
    })),
    mappingRows: mappings.map((mapping) => ({
      mappingId: mapping.id,
      code: mapping.code,
      name: mapping.name,
      description: mapping.description,
      componentType: mapping.componentType,
      accountCode: mapping.accountCode,
      accountName: mapping.account?.name ?? null,
      defaultEntrySide: mapping.defaultEntrySide,
      status: mapping.status
    })),
    batchRows: batches.map((batch) => ({
      payrollPostingBatchId: batch.id,
      batchNo: batch.batchNo,
      payPeriodCode: batch.payPeriodCode,
      payPeriodStart: batch.payPeriodStart.toISOString(),
      payPeriodEnd: batch.payPeriodEnd.toISOString(),
      paymentDate: batch.paymentDate?.toISOString() ?? null,
      postingDate: batch.postingDate.toISOString(),
      currencyCode: batch.currencyCode,
      sourceSystem: batch.sourceSystem,
      sourceReference: batch.sourceReference,
      description: batch.description,
      employeeCount: batch.employeeCount,
      grossPay: Number(batch.grossPay),
      employeeDeductions: Number(batch.employeeDeductions),
      employerCosts: Number(batch.employerCosts),
      netPay: Number(batch.netPay),
      totalDebit: Number(batch.totalDebit),
      totalCredit: Number(batch.totalCredit),
      status: batch.status,
      postedAt: batch.postedAt?.toISOString() ?? null,
      postedBy: batch.postedBy,
      journalEntryId: batch.journalEntryId,
      journalNo: batch.journalEntry?.journalNo ?? null
    })),
    lineRows: lines.map((line) => ({
      payrollPostingLineId: line.id,
      payrollPostingBatchId: line.payrollPostingBatchId,
      batchNo: line.payrollPostingBatch.batchNo,
      lineNo: line.lineNo,
      employeeReference: line.employeeReference,
      departmentCode: line.departmentCode,
      componentCode: line.componentCode,
      componentName: line.componentName,
      componentType: line.componentType,
      accountCode: line.accountCode,
      accountName: line.account?.name ?? null,
      entrySide: line.entrySide,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: line.memo,
      status: line.status
    })),
    metrics: {
      mappings: mappings.filter((mapping) => mapping.status === activeStatus).length,
      draftBatches: draftBatches.length,
      postedBatches: batches.filter((batch) => batch.status === "POSTED").length,
      grossPay: roundMoney(batches.reduce((sum, batch) => sum + Number(batch.grossPay), 0)),
      netPay: roundMoney(batches.reduce((sum, batch) => sum + Number(batch.netPay), 0)),
      unpostedDebits: roundMoney(draftBatches.reduce((sum, batch) => sum + Number(batch.totalDebit), 0)),
      unpostedCredits: roundMoney(draftBatches.reduce((sum, batch) => sum + Number(batch.totalCredit), 0))
    }
  };
}

export async function upsertErpPayrollGlMapping(
  input: UpsertErpPayrollGlMappingRequest
): Promise<ErpPayrollGlMutationResponse> {
  return runPayrollGlTransaction(async (tx) => {
    const context = await getPayrollGlContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using payroll GL integration.");
    }

    const normalized = normalizeMappingInput(input);
    const account = await resolveGlAccount(tx, context.retailOrgId, normalized.accountCode);
    const mappingId = normalizeOptionalText(input.mappingId);
    const mapping = mappingId
      ? await tx.erpPayrollGlMapping.update({
          where: {
            id: mappingId
          },
          data: {
            ...normalized,
            accountId: account.id
          }
        })
      : await tx.erpPayrollGlMapping.upsert({
          where: {
            companyId_code: {
              companyId: company.id,
              code: normalized.code
            }
          },
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            accountId: account.id,
            ...normalized
          },
          update: {
            ...normalized,
            accountId: account.id
          }
        });

    return {
      message: `Flash ERP saved payroll mapping ${mapping.code}.`,
      mappingId: mapping.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpPayrollPostingBatch(
  input: UpsertErpPayrollPostingBatchRequest
): Promise<ErpPayrollGlMutationResponse> {
  return runPayrollGlTransaction(async (tx) => {
    const context = await getPayrollGlContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using payroll GL integration.");
    }

    await ensurePayrollGlFoundation(tx, context, company);

    const batchId = normalizeOptionalText(input.payrollPostingBatchId);
    const existingBatch = batchId
      ? await tx.erpPayrollPostingBatch.findFirst({
          where: {
            id: batchId,
            companyId: company.id
          }
        })
      : null;

    if (existingBatch && existingBatch.status !== "DRAFT") {
      throw new Error("Only draft payroll batches can be changed.");
    }

    const payPeriodStart = parseDate(input.payPeriodStart ?? dateOnly(currentMonthStart()), "pay period start");
    const payPeriodEnd = parseDate(input.payPeriodEnd ?? dateOnly(currentMonthEnd()), "pay period end");

    if (payPeriodEnd < payPeriodStart) {
      throw new Error("Flash ERP payroll period end cannot be before the start date.");
    }

    const inputLines = input.lines ?? [];
    const mappings = await tx.erpPayrollGlMapping.findMany({
      where: {
        companyId: company.id,
        code: {
          in: inputLines
            .map((line) => normalizeOptionalCode(line.mappingCode))
            .filter((value): value is string => Boolean(value))
        },
        status: activeStatus
      }
    });
    const mappingsByCode = new Map(mappings.map((mapping) => [mapping.code, mapping]));
    const normalizedLines = [];

    for (const [index, line] of inputLines.entries()) {
      const mappingCode = normalizeOptionalCode(line.mappingCode);
      const mapping = mappingCode ? mappingsByCode.get(mappingCode) ?? null : null;
      const accountCode = normalizeCode(line.accountCode ?? mapping?.accountCode, "payroll line GL account");
      const account = await resolveGlAccount(tx, context.retailOrgId, accountCode);

      normalizedLines.push(normalizePayrollLine(line, index, mapping, account.id));
    }

    const totals = calculateBatchTotals(normalizedLines, input.employeeCount);
    const batchNo =
      existingBatch?.batchNo ??
      (
        await reserveErpDocumentNumberInTransaction(tx, {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          documentType: "PAYROLL_BATCH"
        })
      ).documentNo;
    const batchData = {
      payPeriodCode: normalizeCode(
        input.payPeriodCode ?? defaultPayPeriodCode(payPeriodStart),
        "pay period code"
      ),
      payPeriodStart,
      payPeriodEnd,
      paymentDate: parseOptionalDate(input.paymentDate, "payment date"),
      postingDate: parseDate(input.postingDate ?? dateOnly(payPeriodEnd), "posting date"),
      currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency"),
      sourceSystem: normalizeCode(input.sourceSystem ?? "MANUAL", "source system"),
      sourceReference: normalizeOptionalText(input.sourceReference),
      description: normalizeOptionalText(input.description),
      ...totals,
      status: "DRAFT"
    };
    const batch = existingBatch
      ? await tx.erpPayrollPostingBatch.update({
          where: {
            id: existingBatch.id
          },
          data: batchData
        })
      : await tx.erpPayrollPostingBatch.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            batchNo,
            ...batchData
          }
        });

    if (input.lines) {
      await tx.erpPayrollPostingLine.deleteMany({
        where: {
          payrollPostingBatchId: batch.id
        }
      });

      if (normalizedLines.length > 0) {
        await tx.erpPayrollPostingLine.createMany({
          data: normalizedLines.map((line) => ({
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            payrollPostingBatchId: batch.id,
            ...line
          }))
        });
      }
    }

    return {
      message: `Flash ERP staged payroll batch ${batch.batchNo}.`,
      payrollPostingBatchId: batch.id,
      batchNo: batch.batchNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function postErpPayrollPostingBatch(
  batchId: string
): Promise<ErpPayrollGlMutationResponse> {
  return runPayrollGlTransaction(async (tx) => {
    const context = await getPayrollGlContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const batch = await tx.erpPayrollPostingBatch.findFirst({
      where: {
        id: batchId,
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        lines: {
          where: {
            status: activeStatus
          },
          orderBy: {
            lineNo: "asc"
          }
        }
      }
    });

    if (!batch) {
      throw new Error("Flash ERP cannot find that payroll batch.");
    }

    if (batch.status !== "DRAFT") {
      throw new Error("Only draft payroll batches can be posted.");
    }

    if (batch.lines.length < 2) {
      throw new Error("Flash ERP payroll posting needs at least two lines.");
    }

    const totalDebit = roundMoney(batch.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
    const totalCredit = roundMoney(batch.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0));

    if (Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit <= 0) {
      throw new Error("Flash ERP can only post balanced payroll batches.");
    }

    const postingLines: PostAccountingDocumentLine[] = batch.lines.map((line) => ({
      accountCode: line.accountCode,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: `${batch.batchNo} ${line.componentName}`
    }));
    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: batch.retailOrgId,
      companyId: batch.companyId,
      documentType: "JOURNAL",
      batchSourceType: "PAYROLL",
      journalType: "PAYROLL",
      sourceType: "ERP-PAYROLL-BATCH",
      sourceId: batch.id,
      sourceReference: batch.batchNo,
      postingDate: batch.postingDate,
      description: `${batch.batchNo} payroll ${batch.payPeriodCode}`,
      postedBy: "Enterprise payroll GL integration",
      lines: postingLines
    });

    await tx.erpPayrollPostingBatch.update({
      where: {
        id: batch.id
      },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Enterprise payroll GL integration",
        journalEntryId: result.journalEntryId,
        totalDebit,
        totalCredit
      }
    });

    return {
      message: `Flash ERP posted ${batch.batchNo} through journal ${result.journalNo}.`,
      payrollPostingBatchId: batch.id,
      batchNo: batch.batchNo,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

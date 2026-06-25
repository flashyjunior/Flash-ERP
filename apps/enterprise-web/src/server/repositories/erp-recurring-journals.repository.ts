import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type RecurringJournalContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type RecurringJournalCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

export type UpsertErpRecurringJournalTemplateRequest = {
  templateId?: string | null;
  templateCode?: string | null;
  name?: string | null;
  description?: string | null;
  frequency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  nextRunDate?: string | null;
  sourceReference?: string | null;
  journalType?: string | null;
  status?: string | null;
  lines?: Array<{
    accountCode?: string | null;
    debitAmount?: number | string | null;
    creditAmount?: number | string | null;
    memo?: string | null;
  }> | null;
};

export type GenerateErpRecurringJournalRequest = {
  templateId?: string | null;
  runDate?: string | null;
  postingDate?: string | null;
  description?: string | null;
};

export type GenerateDueErpRecurringJournalRequest = {
  dueDate?: string | null;
};

export type PostErpRecurringJournalDraftRequest = {
  postingDate?: string | null;
  description?: string | null;
};

export type ErpRecurringJournalMutationResponse = {
  message: string;
  templateId?: string;
  generatedCount?: number;
  journalBatchId?: string;
  batchNo?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpRecurringJournalsWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultRunDate: string;
  defaultPostingDate: string;
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  templateRows: Array<{
    templateId: string;
    templateCode: string;
    name: string;
    description: string | null;
    frequency: string;
    startDate: string;
    endDate: string | null;
    nextRunDate: string;
    lastRunDate: string | null;
    lastGeneratedBatchNo: string | null;
    lastGeneratedAt: string | null;
    sourceReference: string | null;
    journalType: string;
    totalDebit: number;
    totalCredit: number;
    lineCount: number;
    status: string;
  }>;
  templateLineRows: Array<{
    templateLineId: string;
    templateId: string;
    templateCode: string;
    lineNo: number;
    accountCode: string;
    accountName: string | null;
    debitAmount: number;
    creditAmount: number;
    memo: string | null;
    status: string;
  }>;
  draftRows: Array<{
    journalBatchId: string;
    draftEntryId: string | null;
    batchNo: string;
    templateCode: string | null;
    postingDate: string;
    description: string;
    status: string;
    totalDebit: number;
    totalCredit: number;
    lineCount: number;
  }>;
  draftLineRows: Array<{
    journalBatchId: string;
    batchNo: string;
    lineNo: number;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    memo: string | null;
    status: string;
  }>;
  metrics: {
    templates: number;
    activeTemplates: number;
    dueTemplates: number;
    draftBatches: number;
    convertedBatches: number;
  };
};

const activeStatus = RecordStatus.ACTIVE;
const deletedStatus = RecordStatus.DELETED;
const recurringTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

function runRecurringJournalTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback, recurringTransactionOptions);
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

function normalizeFrequency(value: string | null | undefined) {
  const normalized = normalizeOptionalCode(value) ?? "MONTHLY";
  const allowed = ["WEEKLY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];

  if (!allowed.includes(normalized)) {
    throw new Error("Flash ERP recurring journals support weekly, monthly, quarterly, semi-annual, and annual frequencies.");
  }

  return normalized;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = normalizeOptionalCode(value) ?? activeStatus;
  const allowed = [activeStatus, "INACTIVE", "ARCHIVED"];

  if (!allowed.includes(normalized)) {
    throw new Error("Flash ERP recurring journal status must be active, inactive, or archived.");
  }

  return normalized;
}

function parseDate(value: string | null | undefined, label: string) {
  const normalized = normalizeRequiredText(value, label);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00.000Z`)
    : new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

function parseOptionalDate(value: string | null | undefined, label: string) {
  return normalizeOptionalText(value) ? parseDate(value, label) : null;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function currentMonthEnd() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
}

function addMonths(value: Date, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}

function nextRunDateForFrequency(value: Date, frequency: string) {
  if (frequency === "WEEKLY") {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  if (frequency === "QUARTERLY") {
    return addMonths(value, 3);
  }

  if (frequency === "SEMI_ANNUAL") {
    return addMonths(value, 6);
  }

  if (frequency === "ANNUAL") {
    return addMonths(value, 12);
  }

  return addMonths(value, 1);
}

function sourceIdForTemplateRun(templateId: string, runDate: Date) {
  return `${templateId}:${dateOnly(runDate)}`;
}

async function getRecurringJournalContext(
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<RecurringJournalContext | null> {
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

async function getPrimaryCompany(
  tx: Prisma.TransactionClient | typeof prisma,
  context: RecurringJournalContext
): Promise<RecurringJournalCompany | null> {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      legalName: true,
      tradingName: true,
      baseCurrencyCode: true
    }
  });
}

async function ensureRecurringJournalSequence(
  tx: Prisma.TransactionClient,
  context: RecurringJournalContext,
  company: RecurringJournalCompany,
  postingDate: Date
) {
  const fiscalYear =
    (await tx.erpFiscalYear.findFirst({
      where: {
        companyId: company.id,
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
    throw new Error("Flash ERP needs an open fiscal year before recurring journals can be generated.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: company.id,
        documentType: "RECURRING_JOURNAL",
        fiscalYearId: fiscalYear.id
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      fiscalYearId: fiscalYear.id,
      documentType: "RECURRING_JOURNAL",
      prefix: "RJ",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: activeStatus
    },
    update: {}
  });
}

async function resolveAccountsByCode(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  accountCodes: string[]
) {
  const normalizedCodes = Array.from(new Set(accountCodes.map((code) => normalizeCode(code, "GL account"))));
  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId,
      code: {
        in: normalizedCodes
      },
      status: activeStatus
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const missingCodes = normalizedCodes.filter((code) => !accountsByCode.has(code));

  if (missingCodes.length > 0) {
    throw new Error(`Flash ERP cannot find GL account(s): ${missingCodes.join(", ")}.`);
  }

  return accountsByCode;
}

function normalizeTemplateLines(input: UpsertErpRecurringJournalTemplateRequest["lines"]) {
  const lines = input ?? [];

  if (lines.length < 2) {
    throw new Error("Flash ERP recurring journal templates need at least two lines.");
  }

  const normalized = lines
    .map((line, index) => {
      const debitAmount = roundMoney(Math.max(0, numberOrZero(line.debitAmount)));
      const creditAmount = roundMoney(Math.max(0, numberOrZero(line.creditAmount)));

      if (debitAmount > 0 && creditAmount > 0) {
        throw new Error(`Recurring journal line ${index + 1} cannot contain both debit and credit.`);
      }

      return {
        accountCode: normalizeCode(line.accountCode, "GL account"),
        debitAmount,
        creditAmount,
        lineNo: index + 1,
        memo: normalizeOptionalText(line.memo),
        status: activeStatus
      };
    })
    .filter((line) => line.debitAmount > 0 || line.creditAmount > 0);

  if (normalized.length < 2) {
    throw new Error("Flash ERP recurring journal templates need at least two non-zero lines.");
  }

  const debitTotal = roundMoney(normalized.reduce((sum, line) => sum + line.debitAmount, 0));
  const creditTotal = roundMoney(normalized.reduce((sum, line) => sum + line.creditAmount, 0));

  if (Math.abs(debitTotal - creditTotal) > 0.01) {
    throw new Error("Flash ERP recurring journal templates must be balanced.");
  }

  return {
    debitTotal,
    creditTotal,
    lines: normalized
  };
}

function buildUnavailableErpRecurringJournalsWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpRecurringJournalsWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultRunDate: dateOnly(currentMonthEnd()),
    defaultPostingDate: dateOnly(currentMonthEnd()),
    accountOptions: [],
    templateRows: [],
    templateLineRows: [],
    draftRows: [],
    draftLineRows: [],
    metrics: {
      templates: 0,
      activeTemplates: 0,
      dueTemplates: 0,
      draftBatches: 0,
      convertedBatches: 0
    }
  };
}

export { buildUnavailableErpRecurringJournalsWorkspace };

export async function getErpRecurringJournalsWorkspace(): Promise<ErpRecurringJournalsWorkspaceData> {
  const context = await getRecurringJournalContext();

  if (!context) {
    return buildUnavailableErpRecurringJournalsWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpRecurringJournalsWorkspace(
      "Create a company in Finance foundation before using recurring journals.",
      context.retailOrg.baseCurrencyCode
    );
  }

  const [accounts, templates, draftBatches] = await Promise.all([
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpRecurringJournalTemplate.findMany({
      where: {
        companyId: company.id,
        status: {
          not: deletedStatus
        }
      },
      include: {
        lines: {
          where: {
            status: {
              not: deletedStatus
            }
          },
          include: {
            account: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            lineNo: "asc"
          }
        }
      },
      orderBy: [{ nextRunDate: "asc" }, { templateCode: "asc" }]
    }),
    prisma.glJournalBatch.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        sourceType: "RECURRING",
        status: {
          in: ["DRAFT", "CONVERTED"]
        }
      },
      include: {
        entries: {
          include: {
            lines: {
              include: {
                account: true
              },
              orderBy: {
                id: "asc"
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: [{ postingDate: "desc" }, { batchNo: "desc" }],
      take: 100
    })
  ]);
  const today = new Date();
  const templateRows = templates.map((template) => {
    const totalDebit = roundMoney(template.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
    const totalCredit = roundMoney(template.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0));

    return {
      templateId: template.id,
      templateCode: template.templateCode,
      name: template.name,
      description: template.description,
      frequency: template.frequency,
      startDate: template.startDate.toISOString(),
      endDate: template.endDate?.toISOString() ?? null,
      nextRunDate: template.nextRunDate.toISOString(),
      lastRunDate: template.lastRunDate?.toISOString() ?? null,
      lastGeneratedBatchNo: template.lastGeneratedBatchNo,
      lastGeneratedAt: template.lastGeneratedAt?.toISOString() ?? null,
      sourceReference: template.sourceReference,
      journalType: template.journalType,
      totalDebit,
      totalCredit,
      lineCount: template.lines.length,
      status: template.status
    };
  });
  const templateLineRows = templates.flatMap((template) =>
    template.lines.map((line) => ({
      templateLineId: line.id,
      templateId: template.id,
      templateCode: template.templateCode,
      lineNo: line.lineNo,
      accountCode: line.accountCode,
      accountName: line.account?.name ?? null,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: line.memo,
      status: line.status
    }))
  );
  const draftRows = draftBatches.map((batch) => {
    const entry = batch.entries[0] ?? null;

    return {
      journalBatchId: batch.id,
      draftEntryId: entry?.id ?? null,
      batchNo: batch.batchNo,
      templateCode: entry?.sourceReference ?? null,
      postingDate: batch.postingDate.toISOString(),
      description: batch.description,
      status: batch.status,
      totalDebit: Number(batch.totalDebit),
      totalCredit: Number(batch.totalCredit),
      lineCount: entry?.lines.length ?? 0
    };
  });
  const draftLineRows = draftBatches.flatMap((batch) =>
    (batch.entries[0]?.lines ?? []).map((line, index) => ({
      journalBatchId: batch.id,
      batchNo: batch.batchNo,
      lineNo: index + 1,
      accountCode: line.account.code,
      accountName: line.account.name,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: line.memo,
      status: batch.status
    }))
  );

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Recurring journal templates generate reviewable draft GL batches; adjusting journals are flagged in GL inquiry.",
    refreshedAt: new Date().toISOString(),
    defaultRunDate: dateOnly(currentMonthEnd()),
    defaultPostingDate: dateOnly(currentMonthEnd()),
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    templateRows,
    templateLineRows,
    draftRows,
    draftLineRows,
    metrics: {
      templates: templates.length,
      activeTemplates: templates.filter((template) => template.status === activeStatus).length,
      dueTemplates: templates.filter(
        (template) => template.status === activeStatus && template.nextRunDate <= today
      ).length,
      draftBatches: draftBatches.filter((batch) => batch.status === "DRAFT").length,
      convertedBatches: draftBatches.filter((batch) => batch.status === "CONVERTED").length
    }
  };
}

export async function upsertErpRecurringJournalTemplate(
  input: UpsertErpRecurringJournalTemplateRequest
): Promise<ErpRecurringJournalMutationResponse> {
  return runRecurringJournalTransaction(async (tx) => {
    const context = await getRecurringJournalContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using recurring journals.");
    }

    const templateId = normalizeOptionalText(input.templateId);
    const templateCode = normalizeCode(input.templateCode, "template code");
    const startDate = parseDate(input.startDate ?? dateOnly(new Date()), "start date");
    const nextRunDate = parseDate(input.nextRunDate ?? input.startDate ?? dateOnly(new Date()), "next run date");
    const endDate = parseOptionalDate(input.endDate, "end date");

    if (endDate && endDate < startDate) {
      throw new Error("Flash ERP recurring journal end date cannot be before the start date.");
    }

    if (nextRunDate < startDate) {
      throw new Error("Flash ERP recurring journal next run date cannot be before the start date.");
    }

    const normalizedLines = normalizeTemplateLines(input.lines);
    const accountsByCode = await resolveAccountsByCode(
      tx,
      context.retailOrgId,
      normalizedLines.lines.map((line) => line.accountCode)
    );
    const templateData = {
      templateCode,
      name: normalizeRequiredText(input.name, "template name"),
      description: normalizeOptionalText(input.description),
      frequency: normalizeFrequency(input.frequency),
      startDate,
      endDate,
      nextRunDate,
      sourceReference: normalizeOptionalText(input.sourceReference),
      journalType: normalizeOptionalCode(input.journalType) ?? "RECURRING",
      status: normalizeStatus(input.status)
    };
    const existingTemplate = templateId
      ? await tx.erpRecurringJournalTemplate.findFirst({
          where: {
            id: templateId,
            companyId: company.id
          }
        })
      : null;
    const template = existingTemplate
      ? await tx.erpRecurringJournalTemplate.update({
          where: {
            id: existingTemplate.id
          },
          data: templateData
        })
      : await tx.erpRecurringJournalTemplate.upsert({
          where: {
            companyId_templateCode: {
              companyId: company.id,
              templateCode
            }
          },
          create: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...templateData
          },
          update: templateData
        });

    await tx.erpRecurringJournalTemplateLine.deleteMany({
      where: {
        recurringJournalTemplateId: template.id
      }
    });
    await tx.erpRecurringJournalTemplateLine.createMany({
      data: normalizedLines.lines.map((line) => ({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        recurringJournalTemplateId: template.id,
        accountId: accountsByCode.get(line.accountCode)?.id,
        ...line
      }))
    });

    return {
      message: `Flash ERP saved recurring journal ${template.templateCode}.`,
      templateId: template.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

async function generateRecurringJournalDraftInTransaction(
  tx: Prisma.TransactionClient,
  context: RecurringJournalContext,
  company: RecurringJournalCompany,
  templateId: string,
  request: GenerateErpRecurringJournalRequest = {}
): Promise<ErpRecurringJournalMutationResponse> {
  const template = await tx.erpRecurringJournalTemplate.findFirst({
    where: {
      id: templateId,
      companyId: company.id,
      status: activeStatus
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

  if (!template) {
    throw new Error("Flash ERP cannot find that active recurring journal template.");
  }

  if (template.lines.length < 2) {
    throw new Error(`Recurring journal ${template.templateCode} needs at least two active lines.`);
  }

  const runDate = parseDate(request.runDate ?? dateOnly(template.nextRunDate), "run date");
  const postingDate = parseDate(request.postingDate ?? request.runDate ?? dateOnly(runDate), "posting date");

  if (runDate < template.startDate) {
    throw new Error(`Recurring journal ${template.templateCode} cannot run before its start date.`);
  }

  if (template.endDate && runDate > template.endDate) {
    throw new Error(`Recurring journal ${template.templateCode} has ended.`);
  }

  const debitTotal = roundMoney(template.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0));
  const creditTotal = roundMoney(template.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0));

  if (Math.abs(debitTotal - creditTotal) > 0.01 || debitTotal <= 0) {
    throw new Error(`Recurring journal ${template.templateCode} is not balanced.`);
  }

  const duplicate = await tx.glJournalEntry.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      sourceType: "RECURRING-DRAFT",
      sourceId: sourceIdForTemplateRun(template.id, runDate)
    },
    select: {
      journalNo: true
    }
  });

  if (duplicate) {
    throw new Error(`Flash ERP already generated ${duplicate.journalNo} for this recurring run.`);
  }

  await ensureRecurringJournalSequence(tx, context, company, postingDate);
  const batchNo = (
    await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "RECURRING_JOURNAL"
    })
  ).documentNo;
  const description =
    normalizeOptionalText(request.description) ??
    `${template.templateCode} ${template.name} for ${dateOnly(runDate)}`;
  const accountsByCode = await resolveAccountsByCode(
    tx,
    context.retailOrgId,
    template.lines.map((line) => line.accountCode)
  );
  const batch = await tx.glJournalBatch.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      batchNo,
      sourceType: "RECURRING",
      postingDate,
      description,
      status: "DRAFT",
      totalDebit: debitTotal,
      totalCredit: creditTotal
    }
  });
  await tx.glJournalEntry.create({
    data: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      journalBatchId: batch.id,
      journalNo: batchNo,
      journalType: template.journalType,
      sourceType: "RECURRING-DRAFT",
      sourceId: sourceIdForTemplateRun(template.id, runDate),
      sourceReference: template.templateCode,
      postingDate,
      description,
      status: "DRAFT",
      postedBy: "Enterprise recurring journals",
      lines: {
        create: template.lines.map((line) => ({
          accountId: accountsByCode.get(line.accountCode)!.id,
          debitAmount: Number(line.debitAmount),
          creditAmount: Number(line.creditAmount),
          memo: line.memo
        }))
      }
    }
  });
  const nextRunDate = nextRunDateForFrequency(runDate, template.frequency);
  await tx.erpRecurringJournalTemplate.update({
    where: {
      id: template.id
    },
    data: {
      lastRunDate: runDate,
      lastGeneratedAt: new Date(),
      lastGeneratedBatchNo: batchNo,
      nextRunDate,
      ...(template.endDate && nextRunDate > template.endDate ? { status: "INACTIVE" } : {})
    }
  });

  return {
    message: `Flash ERP generated draft recurring journal ${batchNo}.`,
    templateId: template.id,
    journalBatchId: batch.id,
    batchNo,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function generateErpRecurringJournalDraft(
  input: GenerateErpRecurringJournalRequest
): Promise<ErpRecurringJournalMutationResponse> {
  return runRecurringJournalTransaction(async (tx) => {
    const context = await getRecurringJournalContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using recurring journals.");
    }

    const templateId = normalizeRequiredText(input.templateId, "template");
    return generateRecurringJournalDraftInTransaction(tx, context, company, templateId, input);
  });
}

export async function generateDueErpRecurringJournalDrafts(
  input: GenerateDueErpRecurringJournalRequest = {}
): Promise<ErpRecurringJournalMutationResponse> {
  return runRecurringJournalTransaction(async (tx) => {
    const context = await getRecurringJournalContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using recurring journals.");
    }

    const dueDate = parseDate(input.dueDate ?? dateOnly(new Date()), "due date");
    const templates = await tx.erpRecurringJournalTemplate.findMany({
      where: {
        companyId: company.id,
        status: activeStatus,
        nextRunDate: {
          lte: dueDate
        }
      },
      orderBy: [{ nextRunDate: "asc" }, { templateCode: "asc" }],
      select: {
        id: true,
        nextRunDate: true
      }
    });
    let generatedCount = 0;
    let lastBatchNo: string | undefined;

    for (const template of templates) {
      const result = await generateRecurringJournalDraftInTransaction(tx, context, company, template.id, {
        runDate: dateOnly(template.nextRunDate)
      });
      generatedCount += 1;
      lastBatchNo = result.batchNo;
    }

    return {
      message:
        generatedCount > 0
          ? `Flash ERP generated ${generatedCount} due recurring journal draft(s).`
          : "No recurring journal templates are due.",
      generatedCount,
      batchNo: lastBatchNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function postErpRecurringJournalDraft(
  journalBatchId: string,
  input: PostErpRecurringJournalDraftRequest = {}
): Promise<ErpRecurringJournalMutationResponse> {
  return runRecurringJournalTransaction(async (tx) => {
    const context = await getRecurringJournalContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const batch = await tx.glJournalBatch.findFirst({
      where: {
        id: journalBatchId,
        retailOrgId: context.retailOrgId,
        sourceType: "RECURRING",
        status: "DRAFT"
      },
      include: {
        entries: {
          where: {
            status: "DRAFT"
          },
          include: {
            lines: {
              include: {
                account: true
              },
              orderBy: {
                id: "asc"
              }
            }
          }
        }
      }
    });

    if (!batch) {
      throw new Error("Flash ERP cannot find that draft recurring journal batch.");
    }

    const draftEntry = batch.entries[0];

    if (!draftEntry || draftEntry.lines.length < 2) {
      throw new Error("Draft recurring journal batch needs at least two lines before posting.");
    }

    const postingLines: PostAccountingDocumentLine[] = draftEntry.lines.map((line) => ({
      accountCode: line.account.code,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: line.memo
    }));
    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: batch.retailOrgId,
      companyId: batch.companyId,
      documentType: "JOURNAL",
      batchSourceType: "RECURRING",
      journalType: draftEntry.journalType || "RECURRING",
      sourceType: "RECURRING-JOURNAL",
      sourceId: draftEntry.id,
      sourceReference: batch.batchNo,
      postingDate: parseDate(input.postingDate ?? dateOnly(batch.postingDate), "posting date"),
      description: normalizeOptionalText(input.description) ?? batch.description,
      postedBy: "Enterprise recurring journals",
      lines: postingLines
    });

    await tx.glJournalEntry.update({
      where: {
        id: draftEntry.id
      },
      data: {
        status: "CONVERTED",
        sourceReference: `${draftEntry.sourceReference ?? batch.batchNo} -> ${result.journalNo}`
      }
    });
    await tx.glJournalBatch.update({
      where: {
        id: batch.id
      },
      data: {
        status: "CONVERTED",
        postedAt: new Date()
      }
    });

    return {
      message: `Flash ERP posted recurring draft ${batch.batchNo} through journal ${result.journalNo}.`,
      journalBatchId: batch.id,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

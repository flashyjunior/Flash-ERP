import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ensureDefaultErpTaxSetup } from "@/server/repositories/erp-tax-setup.repository";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type OperationalDocumentContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type DocumentTypeConfig = {
  documentType: string;
  direction: "SALES" | "PURCHASE";
  partyType: "CUSTOMER" | "SUPPLIER";
  label: string;
  prefix: string;
  controlFallbackAccountCode: string;
  defaultLineAccountCode: string;
  defaultTaxAccountCode: string;
  lineEntrySide: "DEBIT" | "CREDIT";
  taxEntrySide: "DEBIT" | "CREDIT";
  controlEntrySide: "DEBIT" | "CREDIT";
  sourceType: string;
};

export type UpsertErpOperationalDocumentRequest = {
  documentType?: string | null;
  documentDate?: string | null;
  postingDate?: string | null;
  dueDate?: string | null;
  partyNo?: string | null;
  partyName?: string | null;
  currencyCode?: string | null;
  exchangeRate?: number | string | null;
  externalReference?: string | null;
  memo?: string | null;
  lines?: Array<{
    productProfileCode?: string | null;
    itemCode?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unitPrice?: number | string | null;
    discountAmount?: number | string | null;
    taxCode?: string | null;
    taxAmount?: number | string | null;
    chargeAmount?: number | string | null;
    postingAccountCode?: string | null;
    taxAccountCode?: string | null;
  }>;
};

export type ErpOperationalDocumentsMutationResponse = {
  message: string;
  documentId?: string;
  documentNo?: string;
  journalEntryId?: string;
  journalNo?: string;
  serverProcessedAt: string;
};

export type ErpOperationalDocumentsWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultDocumentDate: string;
  defaultPostingDate: string;
  documentTypeOptions: Array<{
    documentType: string;
    label: string;
    direction: string;
    partyType: string;
  }>;
  partyOptions: Array<{
    partyType: string;
    partyNo: string;
    partyName: string;
    label: string;
  }>;
  productOptions: Array<{
    productProfileCode: string;
    label: string;
    defaultUomCode: string;
    trackingMode: string;
  }>;
  taxCodeOptions: Array<{
    taxCode: string;
    label: string;
    taxType: string;
    ratePercent: number;
    inputTaxAccountCode: string | null;
    outputTaxAccountCode: string | null;
    payableAccountCode: string | null;
    receivableAccountCode: string | null;
  }>;
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  metrics: {
    draftDocuments: number;
    postedDocuments: number;
    draftAmount: number;
    postedAmount: number;
    documentLines: number;
  };
  documentRows: Array<{
    documentId: string;
    documentNo: string;
    documentType: string;
    documentDirection: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    documentDate: string;
    postingDate: string;
    dueDate: string | null;
    currencyCode: string;
    externalReference: string | null;
    memo: string | null;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    chargeAmount: number;
    totalAmount: number;
    status: string;
    postedAt: string | null;
    postedBy: string | null;
    journalEntryId: string | null;
    journalNo: string | null;
    lineCount: number;
    lines: Array<{
      lineId: string;
      lineNo: number;
      itemCode: string | null;
      productProfileCode: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      taxCode: string | null;
      taxCodeName: string | null;
      taxAmount: number;
      chargeAmount: number;
      lineAmount: number;
      postingAccountCode: string | null;
      taxAccountCode: string | null;
    }>;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;
const operationalDocumentTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

function runOperationalDocumentTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback, operationalDocumentTransactionOptions);
}

const documentTypeConfigs: Record<string, DocumentTypeConfig> = {
  SALES_INVOICE: {
    documentType: "SALES_INVOICE",
    direction: "SALES",
    partyType: "CUSTOMER",
    label: "Customer invoice",
    prefix: "INV",
    controlFallbackAccountCode: "1100",
    defaultLineAccountCode: "4000",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "CREDIT",
    taxEntrySide: "CREDIT",
    controlEntrySide: "DEBIT",
    sourceType: "ERP-SALES-INVOICE"
  },
  CUSTOMER_CREDIT_NOTE: {
    documentType: "CUSTOMER_CREDIT_NOTE",
    direction: "SALES",
    partyType: "CUSTOMER",
    label: "Customer credit note",
    prefix: "CCN",
    controlFallbackAccountCode: "1100",
    defaultLineAccountCode: "4000",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "DEBIT",
    taxEntrySide: "DEBIT",
    controlEntrySide: "CREDIT",
    sourceType: "ERP-CUSTOMER-CREDIT-NOTE"
  },
  CUSTOMER_DEBIT_NOTE: {
    documentType: "CUSTOMER_DEBIT_NOTE",
    direction: "SALES",
    partyType: "CUSTOMER",
    label: "Customer debit note",
    prefix: "CDN",
    controlFallbackAccountCode: "1100",
    defaultLineAccountCode: "4000",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "CREDIT",
    taxEntrySide: "CREDIT",
    controlEntrySide: "DEBIT",
    sourceType: "ERP-CUSTOMER-DEBIT-NOTE"
  },
  SUPPLIER_INVOICE: {
    documentType: "SUPPLIER_INVOICE",
    direction: "PURCHASE",
    partyType: "SUPPLIER",
    label: "Supplier invoice",
    prefix: "SI",
    controlFallbackAccountCode: "2000",
    defaultLineAccountCode: "5100",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "DEBIT",
    taxEntrySide: "DEBIT",
    controlEntrySide: "CREDIT",
    sourceType: "ERP-SUPPLIER-INVOICE"
  },
  PURCHASE_ORDER: {
    documentType: "PURCHASE_ORDER",
    direction: "PURCHASE",
    partyType: "SUPPLIER",
    label: "Supplier document",
    prefix: "PO",
    controlFallbackAccountCode: "2000",
    defaultLineAccountCode: "5100",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "DEBIT",
    taxEntrySide: "DEBIT",
    controlEntrySide: "CREDIT",
    sourceType: "ERP-PURCHASE-ORDER"
  },
  SUPPLIER_CREDIT_NOTE: {
    documentType: "SUPPLIER_CREDIT_NOTE",
    direction: "PURCHASE",
    partyType: "SUPPLIER",
    label: "Supplier credit note",
    prefix: "SCN",
    controlFallbackAccountCode: "2000",
    defaultLineAccountCode: "5100",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "CREDIT",
    taxEntrySide: "CREDIT",
    controlEntrySide: "DEBIT",
    sourceType: "ERP-SUPPLIER-CREDIT-NOTE"
  },
  SUPPLIER_DEBIT_NOTE: {
    documentType: "SUPPLIER_DEBIT_NOTE",
    direction: "PURCHASE",
    partyType: "SUPPLIER",
    label: "Supplier debit note",
    prefix: "SDN",
    controlFallbackAccountCode: "2000",
    defaultLineAccountCode: "5100",
    defaultTaxAccountCode: "2100",
    lineEntrySide: "DEBIT",
    taxEntrySide: "DEBIT",
    controlEntrySide: "CREDIT",
    sourceType: "ERP-SUPPLIER-DEBIT-NOTE"
  }
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
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!normalized) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return normalized;
}

function normalizeDocumentType(value: string | null | undefined) {
  const documentType = normalizeCode(value ?? "SALES_INVOICE", "document type").replace(/-/g, "_");
  const config = documentTypeConfigs[documentType];

  if (!config) {
    throw new Error(
      "Flash ERP supports customer/supplier invoices, credit notes, and debit notes in this workflow."
    );
  }

  return config;
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
    throw new Error("Flash ERP needs a valid due date.");
  }

  return date;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildUnavailableErpOperationalDocumentsWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpOperationalDocumentsWorkspaceData {
  const today = dateOnly(new Date());

  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    defaultDocumentDate: today,
    defaultPostingDate: today,
    documentTypeOptions: Object.values(documentTypeConfigs).map((config) => ({
      documentType: config.documentType,
      label: config.label,
      direction: config.direction,
      partyType: config.partyType
    })),
    partyOptions: [],
    productOptions: [],
    taxCodeOptions: [],
    accountOptions: [],
    metrics: {
      draftDocuments: 0,
      postedDocuments: 0,
      draftAmount: 0,
      postedAmount: 0,
      documentLines: 0
    },
    documentRows: []
  };
}

export { buildUnavailableErpOperationalDocumentsWorkspace };

async function getOperationalDocumentContext(
  tx: Prisma.TransactionClient = prisma
): Promise<OperationalDocumentContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: OperationalDocumentContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

function controlAccountForDocument(
  config: DocumentTypeConfig,
  document: {
    partyProfile: {
      postingProfile: {
        receivablesControlAccountCode: string | null;
        payablesControlAccountCode: string | null;
      } | null;
    } | null;
    company: {
      accountingSettings: {
        arControlAccountCode: string | null;
        apControlAccountCode: string | null;
      } | null;
    };
  }
) {
  if (config.direction === "SALES") {
    return (
      document.partyProfile?.postingProfile?.receivablesControlAccountCode ??
      document.company.accountingSettings?.arControlAccountCode ??
      config.controlFallbackAccountCode
    );
  }

  return (
    document.partyProfile?.postingProfile?.payablesControlAccountCode ??
    document.company.accountingSettings?.apControlAccountCode ??
    config.controlFallbackAccountCode
  );
}

function defaultLineAccountForPurchase(line: {
  postingAccountCode: string | null;
  productProfile: { trackingMode: string } | null;
}) {
  if (line.postingAccountCode) {
    return line.postingAccountCode;
  }

  return line.productProfile?.trackingMode === "QUANTITY" ? "1200" : "5100";
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

function addPostingLineForSide(
  lines: PostAccountingDocumentLine[],
  accountCode: string,
  side: "DEBIT" | "CREDIT",
  amount: number,
  memo: string
) {
  addPostingLine(lines, accountCode, side === "DEBIT" ? amount : 0, side === "CREDIT" ? amount : 0, memo);
}

async function ensureOperationalDocumentSequences(
  tx: Prisma.TransactionClient,
  context: OperationalDocumentContext,
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
    throw new Error("Flash ERP needs an open fiscal year before AR/AP document numbering can be used.");
  }

  for (const config of Object.values(documentTypeConfigs)) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId: company.id,
          documentType: config.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {
        prefix: config.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType: config.documentType,
        prefix: config.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      }
    });
  }
}

type OperationalTaxCode = {
  id: string;
  code: string;
  name: string;
  inputTaxAccountCode: string | null;
  outputTaxAccountCode: string | null;
  payableAccountCode: string | null;
  receivableAccountCode: string | null;
};

type OperationalTaxRegistration = {
  defaultInputTaxAccountCode: string | null;
  defaultOutputTaxAccountCode: string | null;
  taxPayableAccountCode: string | null;
  taxReceivableAccountCode: string | null;
} | null;

function taxAccountForLine(
  config: DocumentTypeConfig,
  explicitTaxAccountCode: string | null | undefined,
  taxCode: OperationalTaxCode | null,
  registration: OperationalTaxRegistration
) {
  const explicitAccountCode = normalizeOptionalText(explicitTaxAccountCode)?.toUpperCase();

  if (explicitAccountCode) {
    return explicitAccountCode;
  }

  if (config.direction === "SALES") {
    return (
      taxCode?.outputTaxAccountCode ??
      taxCode?.payableAccountCode ??
      registration?.defaultOutputTaxAccountCode ??
      registration?.taxPayableAccountCode ??
      config.defaultTaxAccountCode
    );
  }

  return (
    taxCode?.inputTaxAccountCode ??
    taxCode?.receivableAccountCode ??
    registration?.defaultInputTaxAccountCode ??
    registration?.taxReceivableAccountCode ??
    config.defaultTaxAccountCode
  );
}

function normalizeDocumentLines(
  inputLines: UpsertErpOperationalDocumentRequest["lines"],
  config: DocumentTypeConfig,
  productsByCode: Map<string, { id: string; code: string; name: string; trackingMode: string }>,
  taxCodesByCode: Map<string, OperationalTaxCode>,
  taxRegistration: OperationalTaxRegistration
) {
  const lines = (inputLines ?? [])
    .map((line, index) => {
      const productCode = normalizeOptionalText(line.productProfileCode)?.toUpperCase() ?? null;
      const product = productCode ? productsByCode.get(productCode) ?? null : null;
      const quantity = Math.max(0, numberOrZero(line.quantity ?? 1));
      const unitPrice = Math.max(0, numberOrZero(line.unitPrice));
      const discountAmount = Math.max(0, numberOrZero(line.discountAmount));
      const taxAmount = Math.max(0, numberOrZero(line.taxAmount));
      const chargeAmount = Math.max(0, numberOrZero(line.chargeAmount));
      const grossLineAmount = roundMoney(quantity * unitPrice);
      const lineAmount = roundMoney(Math.max(0, grossLineAmount - discountAmount));
      const description =
        normalizeOptionalText(line.description) ?? product?.name ?? normalizeOptionalText(line.itemCode);
      const requestedTaxCode = normalizeOptionalText(line.taxCode)?.toUpperCase() ?? null;
      const defaultTaxCode = requestedTaxCode ?? (taxAmount > 0 ? "STANDARD" : "ZERO");
      const taxCode = defaultTaxCode ? taxCodesByCode.get(defaultTaxCode) ?? null : null;

      if (!description || quantity <= 0) {
        return null;
      }

      if (requestedTaxCode && !taxCode) {
        throw new Error(`Flash ERP cannot find active tax code ${requestedTaxCode}.`);
      }

      return {
        lineNo: index + 1,
        productProfileId: product?.id ?? null,
        itemCode: normalizeOptionalText(line.itemCode) ?? product?.code ?? null,
        description,
        quantity: roundMoney(quantity),
        unitPrice: roundMoney(unitPrice),
        discountAmount: roundMoney(discountAmount),
        taxCodeId: taxCode?.id ?? null,
        taxCode: taxCode?.code ?? requestedTaxCode,
        taxAmount: roundMoney(taxAmount),
        chargeAmount: roundMoney(chargeAmount),
        lineAmount,
        postingAccountCode:
          normalizeOptionalText(line.postingAccountCode)?.toUpperCase() ??
          (config.direction === "SALES" ? config.defaultLineAccountCode : null),
        taxAccountCode: taxAccountForLine(config, line.taxAccountCode, taxCode, taxRegistration),
        product
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (lines.length === 0) {
    throw new Error("Flash ERP needs at least one document line.");
  }

  return lines.map((line, index) => ({
    ...line,
    lineNo: index + 1
  }));
}

export async function getErpOperationalDocumentsWorkspace(): Promise<ErpOperationalDocumentsWorkspaceData> {
  const context = await getOperationalDocumentContext();

  if (!context) {
    return buildUnavailableErpOperationalDocumentsWorkspace(
      "Flash ERP enterprise node is not configured yet."
    );
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpOperationalDocumentsWorkspace(
      "Create a company in Finance foundation before using operational documents.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await runOperationalDocumentTransaction(async (tx) => {
    await ensureDefaultErpTaxSetup(tx, context, company);
    await ensureOperationalDocumentSequences(tx, context, company);
  });

  const [documents, partyProfiles, products, taxCodes, accounts] = await Promise.all([
    prisma.erpOperationalDocument.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ documentDate: "desc" }, { documentNo: "desc" }],
      take: 100,
      include: {
        postingJournalEntry: {
          select: {
            journalNo: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          include: {
            productProfile: {
              select: {
                code: true
              }
            },
            taxCodeSetup: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.erpPartyAccountingProfile.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ partyType: "asc" }, { partyNo: "asc" }]
    }),
    prisma.erpProductProfile.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ productFamily: "asc" }, { code: "asc" }]
    }),
    prisma.erpTaxCode.findMany({
      where: {
        companyId: company.id,
        status: activeStatus
      },
      orderBy: [{ taxType: "asc" }, { code: "asc" }]
    }),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    })
  ]);
  const draftDocuments = documents.filter((document) => document.status === "DRAFT");
  const postedDocuments = documents.filter((document) => document.status === "POSTED");

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Operational documents are source records; posting flows through the shared Flash ERP GL engine.",
    refreshedAt: new Date().toISOString(),
    defaultDocumentDate: dateOnly(new Date()),
    defaultPostingDate: dateOnly(new Date()),
    documentTypeOptions: Object.values(documentTypeConfigs).map((config) => ({
      documentType: config.documentType,
      label: config.label,
      direction: config.direction,
      partyType: config.partyType
    })),
    partyOptions: partyProfiles.map((profile) => ({
      partyType: profile.partyType,
      partyNo: profile.partyNo,
      partyName: profile.partyName,
      label: `${profile.partyNo} - ${profile.partyName}`
    })),
    productOptions: products.map((product) => ({
      productProfileCode: product.code,
      label: `${product.code} - ${product.name}`,
      defaultUomCode: product.defaultUomCode,
      trackingMode: product.trackingMode
    })),
    taxCodeOptions: taxCodes.map((taxCode) => ({
      taxCode: taxCode.code,
      label: `${taxCode.code} - ${taxCode.name}`,
      taxType: taxCode.taxType,
      ratePercent: Number(taxCode.ratePercent),
      inputTaxAccountCode: taxCode.inputTaxAccountCode,
      outputTaxAccountCode: taxCode.outputTaxAccountCode,
      payableAccountCode: taxCode.payableAccountCode,
      receivableAccountCode: taxCode.receivableAccountCode
    })),
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    metrics: {
      draftDocuments: draftDocuments.length,
      postedDocuments: postedDocuments.length,
      draftAmount: roundMoney(
        draftDocuments.reduce((sum, document) => sum + Number(document.totalAmount), 0)
      ),
      postedAmount: roundMoney(
        postedDocuments.reduce((sum, document) => sum + Number(document.totalAmount), 0)
      ),
      documentLines: documents.reduce((sum, document) => sum + document.lines.length, 0)
    },
    documentRows: documents.map((document) => ({
      documentId: document.id,
      documentNo: document.documentNo,
      documentType: document.documentType,
      documentDirection: document.documentDirection,
      partyType: document.partyType,
      partyNo: document.partyNo,
      partyName: document.partyName,
      documentDate: document.documentDate.toISOString(),
      postingDate: document.postingDate.toISOString(),
      dueDate: document.dueDate?.toISOString() ?? null,
      currencyCode: document.currencyCode,
      externalReference: document.externalReference,
      memo: document.memo,
      subtotalAmount: Number(document.subtotalAmount),
      discountAmount: Number(document.discountAmount),
      taxAmount: Number(document.taxAmount),
      chargeAmount: Number(document.chargeAmount),
      totalAmount: Number(document.totalAmount),
      status: document.status,
      postedAt: document.postedAt?.toISOString() ?? null,
      postedBy: document.postedBy,
      journalEntryId: document.postingJournalEntryId,
      journalNo: document.postingJournalEntry?.journalNo ?? null,
      lineCount: document.lines.length,
      lines: document.lines.map((line) => ({
        lineId: line.id,
        lineNo: line.lineNo,
        itemCode: line.itemCode,
        productProfileCode: line.productProfile?.code ?? null,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        taxCode: line.taxCode ?? line.taxCodeSetup?.code ?? null,
        taxCodeName: line.taxCodeSetup?.name ?? null,
        taxAmount: Number(line.taxAmount),
        chargeAmount: Number(line.chargeAmount),
        lineAmount: Number(line.lineAmount),
        postingAccountCode: line.postingAccountCode,
        taxAccountCode: line.taxAccountCode
      }))
    }))
  };
}

export async function createErpOperationalDocument(
  input: UpsertErpOperationalDocumentRequest
): Promise<ErpOperationalDocumentsMutationResponse> {
  return runOperationalDocumentTransaction(async (tx) => {
    const context = await getOperationalDocumentContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using operational documents.");
    }

    await ensureDefaultErpTaxSetup(tx, context, company);
    await ensureOperationalDocumentSequences(tx, context, company);

    const config = normalizeDocumentType(input.documentType);
    const documentDate = parseDate(input.documentDate ?? dateOnly(new Date()), "document date");
    const postingDate = parseDate(input.postingDate ?? input.documentDate ?? dateOnly(new Date()), "posting date");
    const dueDate = parseOptionalDate(input.dueDate);
    const partyNo = normalizeCode(input.partyNo, `${config.partyType.toLowerCase()} number`);
    const partyProfile = await tx.erpPartyAccountingProfile.findFirst({
      where: {
        companyId: company.id,
        partyType: config.partyType,
        partyNo,
        status: {
          not: RecordStatus.DELETED
        }
      }
    });
    const partyName =
      partyProfile?.partyName ?? normalizeRequiredText(input.partyName, `${config.partyType.toLowerCase()} name`);
    const [products, taxCodes, taxRegistration] = await Promise.all([
      tx.erpProductProfile.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          status: activeStatus
        },
        select: {
          id: true,
          code: true,
          name: true,
          trackingMode: true
        }
      }),
      tx.erpTaxCode.findMany({
        where: {
          companyId: company.id,
          status: activeStatus
        },
        select: {
          id: true,
          code: true,
          name: true,
          inputTaxAccountCode: true,
          outputTaxAccountCode: true,
          payableAccountCode: true,
          receivableAccountCode: true
        }
      }),
      tx.erpTaxRegistration.findUnique({
        where: {
          companyId: company.id
        },
        select: {
          defaultInputTaxAccountCode: true,
          defaultOutputTaxAccountCode: true,
          taxPayableAccountCode: true,
          taxReceivableAccountCode: true
        }
      })
    ]);
    const productsByCode = new Map(products.map((product) => [product.code, product]));
    const taxCodesByCode = new Map(taxCodes.map((taxCode) => [taxCode.code, taxCode]));
    const lines = normalizeDocumentLines(input.lines, config, productsByCode, taxCodesByCode, taxRegistration);
    const subtotalAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineAmount, 0));
    const discountAmount = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0));
    const taxAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
    const chargeAmount = roundMoney(lines.reduce((sum, line) => sum + line.chargeAmount, 0));
    const totalAmount = roundMoney(subtotalAmount + taxAmount + chargeAmount);

    if (totalAmount <= 0) {
      throw new Error("Flash ERP needs a positive document total before saving a draft.");
    }

    const documentNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        documentType: config.documentType
      })
    ).documentNo;
    const document = await tx.erpOperationalDocument.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        partyProfileId: partyProfile?.id ?? null,
        documentNo,
        documentType: config.documentType,
        documentDirection: config.direction,
        partyType: config.partyType,
        partyNo,
        partyName,
        documentDate,
        postingDate,
        dueDate,
        currencyCode: normalizeCode(input.currencyCode ?? company.baseCurrencyCode, "currency code"),
        exchangeRate: Math.max(0.000001, numberOrZero(input.exchangeRate ?? 1)),
        externalReference: normalizeOptionalText(input.externalReference),
        memo: normalizeOptionalText(input.memo),
        subtotalAmount,
        discountAmount,
        taxAmount,
        chargeAmount,
        totalAmount,
        status: "DRAFT",
        lines: {
          create: lines.map((line) => ({
            retailOrgId: context.retailOrgId,
            productProfileId: line.productProfileId,
            lineNo: line.lineNo,
            itemCode: line.itemCode,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            taxCode: line.taxCode,
            taxAmount: line.taxAmount,
            chargeAmount: line.chargeAmount,
            lineAmount: line.lineAmount,
            postingAccountCode: line.postingAccountCode,
            taxAccountCode: line.taxAccountCode,
            status: activeStatus
          }))
        }
      },
      select: {
        id: true
      }
    });

    return {
      message: `Flash ERP saved draft document ${documentNo}.`,
      documentId: document.id,
      documentNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function postErpOperationalDocument(
  documentId: string
): Promise<ErpOperationalDocumentsMutationResponse> {
  return runOperationalDocumentTransaction(async (tx) => {
    const context = await getOperationalDocumentContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const document = await tx.erpOperationalDocument.findFirst({
      where: {
        id: documentId,
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      include: {
        company: {
          include: {
            accountingSettings: true
          }
        },
        partyProfile: {
          include: {
            postingProfile: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          include: {
            productProfile: {
              select: {
                trackingMode: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      throw new Error("Flash ERP cannot find that operational document.");
    }

    if (document.status !== "DRAFT") {
      throw new Error("Only draft operational documents can be posted.");
    }

    const config = normalizeDocumentType(document.documentType);
    const postingLines: PostAccountingDocumentLine[] = [];
    const controlAccountCode = controlAccountForDocument(config, document);
    const totalAmount = roundMoney(Number(document.totalAmount));

    if (totalAmount <= 0) {
      throw new Error("Flash ERP cannot post a zero-value operational document.");
    }

    for (const line of document.lines) {
      const lineBaseAndCharges = roundMoney(Number(line.lineAmount) + Number(line.chargeAmount));
      const postingAccountCode =
        config.direction === "SALES"
          ? line.postingAccountCode ?? config.defaultLineAccountCode
          : defaultLineAccountForPurchase(line);
      const lineMemo = `${document.documentNo} line ${line.lineNo}: ${line.description}`;

      addPostingLineForSide(postingLines, postingAccountCode, config.lineEntrySide, lineBaseAndCharges, lineMemo);
      addPostingLineForSide(
        postingLines,
        line.taxAccountCode ?? config.defaultTaxAccountCode,
        config.taxEntrySide,
        Number(line.taxAmount),
        `${document.documentNo} ${config.direction === "SALES" ? "output" : "input"} tax line ${line.lineNo}`
      );
    }
    addPostingLineForSide(
      postingLines,
      controlAccountCode,
      config.controlEntrySide,
      totalAmount,
      `${document.documentNo} ${config.direction === "SALES" ? "receivable" : "payable"} control`
    );

    const result = await postAccountingDocumentInTransaction(tx, {
      retailOrgId: document.retailOrgId,
      companyId: document.companyId,
      documentType: "JOURNAL",
      batchSourceType: config.documentType,
      journalType: config.direction,
      sourceType: config.sourceType,
      sourceId: document.id,
      sourceReference: document.documentNo,
      postingDate: document.postingDate,
      description: `${config.label} ${document.documentNo} - ${document.partyName}`,
      postedBy: "Enterprise operations",
      lines: postingLines
    });

    const taxTransactions = document.lines
      .filter((line) => Number(line.taxAmount) > 0)
      .map((line) => ({
        retailOrgId: document.retailOrgId,
        companyId: document.companyId,
        taxCodeId: line.taxCodeId,
        documentLineId: line.id,
        partyProfileId: document.partyProfileId,
        journalEntryId: result.journalEntryId,
        sourceType: config.sourceType,
        sourceId: document.id,
        sourceReference: document.documentNo,
        transactionDate: document.documentDate,
        postingDate: document.postingDate,
        taxDirection: config.direction === "SALES" ? "OUTPUT" : "INPUT",
        taxableAmount: roundMoney(Number(line.lineAmount) + Number(line.chargeAmount)),
        taxAmount: roundMoney(Number(line.taxAmount)),
        currencyCode: document.currencyCode,
        taxAccountCode: line.taxAccountCode ?? config.defaultTaxAccountCode,
        memo: `${document.documentNo} tax line ${line.lineNo}: ${line.description}`,
        status: "POSTED"
      }));

    if (taxTransactions.length > 0) {
      await tx.erpTaxTransaction.createMany({
        data: taxTransactions
      });
    }

    await tx.erpOperationalDocument.update({
      where: {
        id: document.id
      },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Enterprise operations",
        postingJournalEntryId: result.journalEntryId
      }
    });

    return {
      message: `Flash ERP posted ${document.documentNo} through journal ${result.journalNo}.`,
      documentId: document.id,
      documentNo: document.documentNo,
      journalEntryId: result.journalEntryId,
      journalNo: result.journalNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

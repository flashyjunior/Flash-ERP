import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";

type TaxSetupContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type TaxSetupCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  taxRegistrationNo: string | null;
  baseCurrencyCode: string;
  countryCode: string | null;
};

export type UpsertErpTaxRegistrationRequest = {
  registrationNo?: string | null;
  authorityName?: string | null;
  countryCode?: string | null;
  taxCurrencyCode?: string | null;
  defaultInputTaxAccountCode?: string | null;
  defaultOutputTaxAccountCode?: string | null;
  taxPayableAccountCode?: string | null;
  taxReceivableAccountCode?: string | null;
  filingFrequency?: string | null;
  status?: string | null;
};

export type UpsertErpTaxCodeRequest = {
  taxCodeId?: string | null;
  code?: string | null;
  name?: string | null;
  taxType?: string | null;
  calculationMode?: string | null;
  ratePercent?: number | string | null;
  recoverablePercent?: number | string | null;
  inputTaxAccountCode?: string | null;
  outputTaxAccountCode?: string | null;
  payableAccountCode?: string | null;
  receivableAccountCode?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status?: string | null;
};

export type UpsertErpTaxGroupRequest = {
  taxGroupId?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  taxCodeCodes?: string[] | string | null;
  status?: string | null;
};

export type ErpTaxSetupMutationResponse = {
  message: string;
  taxRegistrationId?: string;
  taxCodeId?: string;
  taxGroupId?: string;
  serverProcessedAt: string;
};

export type ErpTaxSetupWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  registrationRow: {
    taxRegistrationId: string | null;
    registrationNo: string | null;
    authorityName: string | null;
    countryCode: string | null;
    taxCurrencyCode: string;
    defaultInputTaxAccountCode: string | null;
    defaultOutputTaxAccountCode: string | null;
    taxPayableAccountCode: string | null;
    taxReceivableAccountCode: string | null;
    filingFrequency: string;
    status: string;
  };
  accountOptions: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    label: string;
  }>;
  taxCodeRows: Array<{
    taxCodeId: string;
    code: string;
    name: string;
    taxType: string;
    calculationMode: string;
    ratePercent: number;
    recoverablePercent: number;
    inputTaxAccountCode: string | null;
    outputTaxAccountCode: string | null;
    payableAccountCode: string | null;
    receivableAccountCode: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    status: string;
  }>;
  taxGroupRows: Array<{
    taxGroupId: string;
    code: string;
    name: string;
    description: string | null;
    taxCodes: string[];
    taxCodeLabels: string;
    status: string;
  }>;
  taxTransactionRows: Array<{
    taxTransactionId: string;
    taxCode: string | null;
    taxCodeName: string | null;
    taxDirection: string;
    transactionDate: string;
    postingDate: string;
    sourceType: string;
    sourceReference: string | null;
    partyName: string | null;
    taxableAmount: number;
    taxAmount: number;
    taxAccountCode: string;
    currencyCode: string;
    journalEntryId: string | null;
    journalNo: string | null;
    status: string;
  }>;
  metrics: {
    activeTaxCodes: number;
    activeTaxGroups: number;
    postedTaxTransactions: number;
    outputTaxAmount: number;
    inputTaxAmount: number;
  };
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

function normalizeStatus(value: string | null | undefined) {
  const normalized = normalizeOptionalCode(value) ?? activeStatus;

  if (!["ACTIVE", "INACTIVE"].includes(normalized)) {
    throw new Error("Flash ERP tax setup status must be ACTIVE or INACTIVE.");
  }

  return normalized;
}

function normalizePercent(value: number | string | null | undefined, fallback: number) {
  return Math.min(100, Math.max(0, numberOrZero(value ?? fallback)));
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

function normalizeTaxCodeList(value: string[] | string | null | undefined) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(",");

  return Array.from(
    new Set(
      rawValues
        .map((item) => normalizeOptionalCode(item))
        .filter((item): item is string => Boolean(item))
    )
  );
}

function buildUnavailableErpTaxSetupWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpTaxSetupWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    registrationRow: {
      taxRegistrationId: null,
      registrationNo: null,
      authorityName: null,
      countryCode: null,
      taxCurrencyCode: currencyCode,
      defaultInputTaxAccountCode: null,
      defaultOutputTaxAccountCode: null,
      taxPayableAccountCode: null,
      taxReceivableAccountCode: null,
      filingFrequency: "MONTHLY",
      status: "INACTIVE"
    },
    accountOptions: [],
    taxCodeRows: [],
    taxGroupRows: [],
    taxTransactionRows: [],
    metrics: {
      activeTaxCodes: 0,
      activeTaxGroups: 0,
      postedTaxTransactions: 0,
      outputTaxAmount: 0,
      inputTaxAmount: 0
    }
  };
}

export { buildUnavailableErpTaxSetupWorkspace };

async function getTaxSetupContext(
  tx: Prisma.TransactionClient = prisma
): Promise<TaxSetupContext | null> {
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

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: TaxSetupContext) {
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
  accountCodes: Array<string | null | undefined>
) {
  const normalizedCodes = Array.from(
    new Set(accountCodes.map((code) => normalizeOptionalCode(code)).filter((code): code is string => Boolean(code)))
  );

  if (normalizedCodes.length === 0) {
    return;
  }

  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId,
      code: {
        in: normalizedCodes
      },
      status: activeStatus
    },
    select: {
      code: true
    }
  });
  const foundCodes = new Set(accounts.map((account) => account.code));
  const missing = normalizedCodes.filter((code) => !foundCodes.has(code));

  if (missing.length > 0) {
    throw new Error(`Flash ERP tax setup references missing GL account(s): ${missing.join(", ")}.`);
  }
}

async function findDefaultTaxAccountCode(
  tx: Prisma.TransactionClient,
  retailOrgId: string
) {
  const preferred = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      code: "2100",
      status: activeStatus
    },
    select: {
      code: true
    }
  });

  if (preferred) {
    return preferred.code;
  }

  const liability = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      accountType: "LIABILITY",
      status: activeStatus
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true
    }
  });

  if (liability) {
    return liability.code;
  }

  const anyAccount = await tx.glAccount.findFirst({
    where: {
      retailOrgId,
      status: activeStatus
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true
    }
  });

  if (!anyAccount) {
    throw new Error("Flash ERP needs at least one active GL account before tax setup can be used.");
  }

  return anyAccount.code;
}

export async function ensureDefaultErpTaxSetup(
  tx: Prisma.TransactionClient,
  context: TaxSetupContext,
  company: TaxSetupCompany
) {
  const defaultAccountCode = await findDefaultTaxAccountCode(tx, context.retailOrgId);

  await tx.erpTaxRegistration.upsert({
    where: {
      companyId: company.id
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      registrationNo: company.taxRegistrationNo,
      authorityName: null,
      countryCode: company.countryCode,
      taxCurrencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
      defaultInputTaxAccountCode: defaultAccountCode,
      defaultOutputTaxAccountCode: defaultAccountCode,
      taxPayableAccountCode: defaultAccountCode,
      taxReceivableAccountCode: defaultAccountCode,
      filingFrequency: "MONTHLY",
      status: activeStatus
    },
    update: {}
  });

  const standardTaxCode = await tx.erpTaxCode.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "STANDARD"
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code: "STANDARD",
      name: "Standard tax",
      taxType: "VAT",
      calculationMode: "PERCENTAGE",
      ratePercent: 0,
      recoverablePercent: 100,
      inputTaxAccountCode: defaultAccountCode,
      outputTaxAccountCode: defaultAccountCode,
      payableAccountCode: defaultAccountCode,
      receivableAccountCode: defaultAccountCode,
      status: activeStatus
    },
    update: {}
  });

  await tx.erpTaxCode.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "ZERO"
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code: "ZERO",
      name: "Zero rated",
      taxType: "VAT",
      calculationMode: "PERCENTAGE",
      ratePercent: 0,
      recoverablePercent: 100,
      inputTaxAccountCode: defaultAccountCode,
      outputTaxAccountCode: defaultAccountCode,
      payableAccountCode: defaultAccountCode,
      receivableAccountCode: defaultAccountCode,
      status: activeStatus
    },
    update: {}
  });

  const defaultGroup = await tx.erpTaxGroup.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "DEFAULT"
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code: "DEFAULT",
      name: "Default tax group",
      description: "Default tax group for new Flash ERP source documents.",
      status: activeStatus
    },
    update: {}
  });

  await tx.erpTaxGroupLine.upsert({
    where: {
      taxGroupId_taxCodeId: {
        taxGroupId: defaultGroup.id,
        taxCodeId: standardTaxCode.id
      }
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      taxGroupId: defaultGroup.id,
      taxCodeId: standardTaxCode.id,
      lineNo: 1,
      status: activeStatus
    },
    update: {}
  });
}

export async function getErpTaxSetupWorkspace(): Promise<ErpTaxSetupWorkspaceData> {
  const context = await getTaxSetupContext();

  if (!context) {
    return buildUnavailableErpTaxSetupWorkspace("Flash ERP enterprise node is not configured yet.");
  }

  const company = await getPrimaryCompany(prisma, context);

  if (!company) {
    return buildUnavailableErpTaxSetupWorkspace(
      "Create a company in Finance foundation before using tax setup.",
      context.retailOrg.baseCurrencyCode
    );
  }

  await prisma.$transaction((tx) => ensureDefaultErpTaxSetup(tx, context, company));

  const [registration, accounts, taxCodes, taxGroups, taxTransactions] = await Promise.all([
    prisma.erpTaxRegistration.findUnique({
      where: {
        companyId: company.id
      }
    }),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpTaxCode.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ taxType: "asc" }, { code: "asc" }]
    }),
    prisma.erpTaxGroup.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ code: "asc" }],
      include: {
        lines: {
          where: {
            status: activeStatus
          },
          orderBy: {
            lineNo: "asc"
          },
          include: {
            taxCode: true
          }
        }
      }
    }),
    prisma.erpTaxTransaction.findMany({
      where: {
        companyId: company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        taxCode: true,
        partyProfile: {
          select: {
            partyName: true
          }
        },
        journalEntry: {
          select: {
            journalNo: true
          }
        }
      }
    })
  ]);
  const taxCodeRows = taxCodes.map((taxCode) => ({
    taxCodeId: taxCode.id,
    code: taxCode.code,
    name: taxCode.name,
    taxType: taxCode.taxType,
    calculationMode: taxCode.calculationMode,
    ratePercent: Number(taxCode.ratePercent),
    recoverablePercent: Number(taxCode.recoverablePercent),
    inputTaxAccountCode: taxCode.inputTaxAccountCode,
    outputTaxAccountCode: taxCode.outputTaxAccountCode,
    payableAccountCode: taxCode.payableAccountCode,
    receivableAccountCode: taxCode.receivableAccountCode,
    effectiveFrom: taxCode.effectiveFrom?.toISOString() ?? null,
    effectiveTo: taxCode.effectiveTo?.toISOString() ?? null,
    status: taxCode.status
  }));
  const taxGroupRows = taxGroups.map((group) => {
    const taxCodeLabels = group.lines.map((line) => `${line.taxCode.code} - ${line.taxCode.name}`);

    return {
      taxGroupId: group.id,
      code: group.code,
      name: group.name,
      description: group.description,
      taxCodes: group.lines.map((line) => line.taxCode.code),
      taxCodeLabels: taxCodeLabels.length > 0 ? taxCodeLabels.join(", ") : "No tax codes",
      status: group.status
    };
  });
  const taxTransactionRows = taxTransactions.map((transaction) => ({
    taxTransactionId: transaction.id,
    taxCode: transaction.taxCode?.code ?? null,
    taxCodeName: transaction.taxCode?.name ?? null,
    taxDirection: transaction.taxDirection,
    transactionDate: transaction.transactionDate.toISOString(),
    postingDate: transaction.postingDate.toISOString(),
    sourceType: transaction.sourceType,
    sourceReference: transaction.sourceReference,
    partyName: transaction.partyProfile?.partyName ?? null,
    taxableAmount: Number(transaction.taxableAmount),
    taxAmount: Number(transaction.taxAmount),
    taxAccountCode: transaction.taxAccountCode,
    currencyCode: transaction.currencyCode,
    journalEntryId: transaction.journalEntryId,
    journalNo: transaction.journalEntry?.journalNo ?? null,
    status: transaction.status
  }));

  return {
    currencyCode: company.baseCurrencyCode || context.retailOrg.baseCurrencyCode,
    companyName: company.tradingName ?? company.legalName,
    statusMessage:
      "Tax setup is company-scoped and feeds future source documents through configured control accounts.",
    refreshedAt: new Date().toISOString(),
    registrationRow: {
      taxRegistrationId: registration?.id ?? null,
      registrationNo: registration?.registrationNo ?? null,
      authorityName: registration?.authorityName ?? null,
      countryCode: registration?.countryCode ?? null,
      taxCurrencyCode:
        registration?.taxCurrencyCode ?? company.baseCurrencyCode ?? context.retailOrg.baseCurrencyCode,
      defaultInputTaxAccountCode: registration?.defaultInputTaxAccountCode ?? null,
      defaultOutputTaxAccountCode: registration?.defaultOutputTaxAccountCode ?? null,
      taxPayableAccountCode: registration?.taxPayableAccountCode ?? null,
      taxReceivableAccountCode: registration?.taxReceivableAccountCode ?? null,
      filingFrequency: registration?.filingFrequency ?? "MONTHLY",
      status: registration?.status ?? "INACTIVE"
    },
    accountOptions: accounts.map((account) => ({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      label: `${account.code} - ${account.name}`
    })),
    taxCodeRows,
    taxGroupRows,
    taxTransactionRows,
    metrics: {
      activeTaxCodes: taxCodeRows.filter((row) => row.status === activeStatus).length,
      activeTaxGroups: taxGroupRows.filter((row) => row.status === activeStatus).length,
      postedTaxTransactions: taxTransactionRows.filter((row) => row.status === "POSTED").length,
      outputTaxAmount: roundMoney(
        taxTransactionRows
          .filter((row) => row.taxDirection === "OUTPUT")
          .reduce((sum, row) => sum + row.taxAmount, 0)
      ),
      inputTaxAmount: roundMoney(
        taxTransactionRows
          .filter((row) => row.taxDirection === "INPUT")
          .reduce((sum, row) => sum + row.taxAmount, 0)
      )
    }
  };
}

export async function upsertErpTaxRegistration(
  input: UpsertErpTaxRegistrationRequest
): Promise<ErpTaxSetupMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getTaxSetupContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using tax setup.");
    }

    await ensureDefaultErpTaxSetup(tx, context, company);

    const accountCodes = [
      input.defaultInputTaxAccountCode,
      input.defaultOutputTaxAccountCode,
      input.taxPayableAccountCode,
      input.taxReceivableAccountCode
    ].map((code) => normalizeOptionalCode(code));
    await validateAccountCodes(tx, context.retailOrgId, accountCodes);

    const registration = await tx.erpTaxRegistration.upsert({
      where: {
        companyId: company.id
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        registrationNo: normalizeOptionalText(input.registrationNo),
        authorityName: normalizeOptionalText(input.authorityName),
        countryCode: normalizeOptionalCode(input.countryCode),
        taxCurrencyCode: normalizeCode(
          input.taxCurrencyCode ?? company.baseCurrencyCode,
          "tax currency"
        ),
        defaultInputTaxAccountCode: accountCodes[0] ?? null,
        defaultOutputTaxAccountCode: accountCodes[1] ?? null,
        taxPayableAccountCode: accountCodes[2] ?? null,
        taxReceivableAccountCode: accountCodes[3] ?? null,
        filingFrequency: normalizeCode(input.filingFrequency ?? "MONTHLY", "filing frequency"),
        status: normalizeStatus(input.status)
      },
      update: {
        registrationNo: normalizeOptionalText(input.registrationNo),
        authorityName: normalizeOptionalText(input.authorityName),
        countryCode: normalizeOptionalCode(input.countryCode),
        taxCurrencyCode: normalizeCode(
          input.taxCurrencyCode ?? company.baseCurrencyCode,
          "tax currency"
        ),
        defaultInputTaxAccountCode: accountCodes[0] ?? null,
        defaultOutputTaxAccountCode: accountCodes[1] ?? null,
        taxPayableAccountCode: accountCodes[2] ?? null,
        taxReceivableAccountCode: accountCodes[3] ?? null,
        filingFrequency: normalizeCode(input.filingFrequency ?? "MONTHLY", "filing frequency"),
        status: normalizeStatus(input.status)
      }
    });

    return {
      message: "Flash ERP saved the company tax registration setup.",
      taxRegistrationId: registration.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpTaxCode(
  input: UpsertErpTaxCodeRequest
): Promise<ErpTaxSetupMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getTaxSetupContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using tax setup.");
    }

    await ensureDefaultErpTaxSetup(tx, context, company);

    const code = normalizeCode(input.code, "tax code");
    const accountCodes = [
      input.inputTaxAccountCode,
      input.outputTaxAccountCode,
      input.payableAccountCode,
      input.receivableAccountCode
    ].map((accountCode) => normalizeOptionalCode(accountCode));
    await validateAccountCodes(tx, context.retailOrgId, accountCodes);

    const data = {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code,
      name: normalizeRequiredText(input.name, "tax code name"),
      taxType: normalizeCode(input.taxType ?? "VAT", "tax type"),
      calculationMode: normalizeCode(input.calculationMode ?? "PERCENTAGE", "calculation mode"),
      ratePercent: normalizePercent(input.ratePercent, 0),
      recoverablePercent: normalizePercent(input.recoverablePercent, 100),
      inputTaxAccountCode: accountCodes[0] ?? null,
      outputTaxAccountCode: accountCodes[1] ?? null,
      payableAccountCode: accountCodes[2] ?? null,
      receivableAccountCode: accountCodes[3] ?? null,
      effectiveFrom: parseOptionalDate(input.effectiveFrom, "effective from date"),
      effectiveTo: parseOptionalDate(input.effectiveTo, "effective to date"),
      status: normalizeStatus(input.status)
    };
    const taxCode = await tx.erpTaxCode.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code
        }
      },
      create: data,
      update: data
    });

    return {
      message: `Flash ERP saved tax code ${taxCode.code}.`,
      taxCodeId: taxCode.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpTaxGroup(
  input: UpsertErpTaxGroupRequest
): Promise<ErpTaxSetupMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getTaxSetupContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const company = await getPrimaryCompany(tx, context);

    if (!company) {
      throw new Error("Create a company in Finance foundation before using tax setup.");
    }

    await ensureDefaultErpTaxSetup(tx, context, company);

    const code = normalizeCode(input.code, "tax group code");
    const taxCodeCodes = normalizeTaxCodeList(input.taxCodeCodes);
    const taxCodes =
      taxCodeCodes.length > 0
        ? await tx.erpTaxCode.findMany({
            where: {
              companyId: company.id,
              code: {
                in: taxCodeCodes
              },
              status: {
                not: RecordStatus.DELETED
              }
            },
            select: {
              id: true,
              code: true
            }
          })
        : [];
    const foundTaxCodes = new Set(taxCodes.map((taxCode) => taxCode.code));
    const missingTaxCodes = taxCodeCodes.filter((taxCodeCode) => !foundTaxCodes.has(taxCodeCode));

    if (missingTaxCodes.length > 0) {
      throw new Error(`Flash ERP cannot find tax code(s): ${missingTaxCodes.join(", ")}.`);
    }

    const taxGroup = await tx.erpTaxGroup.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code
        }
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        code,
        name: normalizeRequiredText(input.name, "tax group name"),
        description: normalizeOptionalText(input.description),
        status: normalizeStatus(input.status)
      },
      update: {
        name: normalizeRequiredText(input.name, "tax group name"),
        description: normalizeOptionalText(input.description),
        status: normalizeStatus(input.status)
      }
    });

    await tx.erpTaxGroupLine.deleteMany({
      where: {
        taxGroupId: taxGroup.id
      }
    });

    if (taxCodes.length > 0) {
      await tx.erpTaxGroupLine.createMany({
        data: taxCodes.map((taxCode, index) => ({
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          taxGroupId: taxGroup.id,
          taxCodeId: taxCode.id,
          lineNo: index + 1,
          status: activeStatus
        }))
      });
    }

    return {
      message: `Flash ERP saved tax group ${taxGroup.code}.`,
      taxGroupId: taxGroup.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

import { type Prisma } from "@prisma/client";

import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import {
  InventoryMovementType,
  PaymentMethod,
  PosTransactionLineIntent,
  PosTransactionStatus,
  PosTransactionType,
  RecordStatus
} from "@flash-erp/domain";

type PosSaleAccountingResult = {
  salesJournalCreated: boolean;
  cogsJournalCount: number;
  cashbookEntryCount: number;
};

type AccountingContext = {
  retailOrgId: string;
  companyId: string;
  baseCurrencyCode: string;
  arAccountCode: string;
  customerDiscountAccountCode: string;
  inventoryAccountCode: string;
  taxAccountCode: string;
};

const activeStatus = RecordStatus.ACTIVE;
const journalDocumentType = "JOURNAL";
const cashbookDocumentType = "CASHBOOK_ENTRY";
const posSaleSourceType = "POS_SALE";
const inventoryCogsSourceType = "INVENTORY_COGS";
const salesRevenueAccountCode = "4000";
const serviceRevenueAccountCode = "4100";
const cogsAccountCode = "5000";

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(`Flash ERP needs ${label} before posting POS sales.`);
  }

  return normalized;
}

function isStoreCreditMethod(value: string | null | undefined) {
  return value === PaymentMethod.STORE_CREDIT || value === "STORE_CREDIT";
}

function isCashMethod(value: string | null | undefined) {
  return value === PaymentMethod.CASH || value === "CASH";
}

function addPostingLine(
  lines: PostAccountingDocumentLine[],
  accountCode: string,
  debitAmount: number,
  creditAmount: number,
  memo: string,
  storeId?: string | null
) {
  const debit = roundMoney(debitAmount);
  const credit = roundMoney(creditAmount);

  if (debit <= 0 && credit <= 0) {
    return;
  }

  lines.push({
    accountCode,
    debitAmount: debit,
    creditAmount: credit,
    memo,
    storeId: storeId ?? null
  });
}

function salesAccountForProductType(productType: string | null | undefined) {
  return productType?.toUpperCase() === "SERVICE" ? serviceRevenueAccountCode : salesRevenueAccountCode;
}

async function getAccountingContext(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  companyId?: string | null
): Promise<AccountingContext> {
  const company = await tx.erpCompany.findFirst({
    where: {
      retailOrgId,
      id: companyId ?? undefined,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
    select: {
      id: true,
      baseCurrencyCode: true,
      accountingSettings: {
        select: {
          arControlAccountCode: true,
          inventoryControlAccountCode: true,
          taxControlAccountCode: true
        }
      }
    }
  });
  const customerPostingProfile = await tx.erpArApPostingProfile.findFirst({
    where: {
      retailOrgId,
      companyId: company?.id,
      profileType: "CUSTOMER",
      isDefault: true,
      status: activeStatus
    },
    select: {
      customerDiscountAccountCode: true
    }
  });

  if (!company) {
    throw new Error("Flash ERP cannot find an active ERP company before posting POS sales.");
  }

  if (!company.accountingSettings) {
    throw new Error("Configure Finance accounting settings before posting POS sales.");
  }

  return {
    retailOrgId,
    companyId: company.id,
    baseCurrencyCode: company.baseCurrencyCode,
    arAccountCode: normalizeRequiredText(
      company.accountingSettings.arControlAccountCode ?? "1100",
      "an AR control account"
    ),
    customerDiscountAccountCode: normalizeRequiredText(
      customerPostingProfile?.customerDiscountAccountCode ?? "8000",
      "a customer discount/loyalty account"
    ),
    inventoryAccountCode: normalizeRequiredText(
      company.accountingSettings.inventoryControlAccountCode ?? "1200",
      "an inventory control account"
    ),
    taxAccountCode: normalizeRequiredText(
      company.accountingSettings.taxControlAccountCode ?? "2100",
      "a tax control account"
    )
  };
}

async function ensureCashbookEntrySequence(
  tx: Prisma.TransactionClient,
  context: AccountingContext,
  postingDate: Date
) {
  const fiscalYear =
    (await tx.erpFiscalYear.findFirst({
      where: {
        companyId: context.companyId,
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
        companyId: context.companyId,
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
    throw new Error("Flash ERP needs an open fiscal year before POS cashbook entries can be posted.");
  }

  await tx.erpDocumentSequence.upsert({
    where: {
      companyId_documentType_fiscalYearId: {
        companyId: context.companyId,
        documentType: cashbookDocumentType,
        fiscalYearId: fiscalYear.id
      }
    },
    update: {
      prefix: "CB",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: context.companyId,
      fiscalYearId: fiscalYear.id,
      documentType: cashbookDocumentType,
      prefix: "CB",
      paddingLength: 6,
      resetPolicy: "FISCAL_YEAR",
      status: activeStatus
    }
  });
}

function buildPaymentAllocation(input: {
  paymentAmount: number;
  remainingChangeAmount: number;
  method: string | null;
  positiveSale: boolean;
}) {
  if (!input.positiveSale || input.remainingChangeAmount <= 0 || !isCashMethod(input.method)) {
    return {
      netAmount: input.paymentAmount,
      changeUsed: 0
    };
  }

  const changeUsed = Math.min(input.paymentAmount, input.remainingChangeAmount);

  return {
    netAmount: roundMoney(input.paymentAmount - changeUsed),
    changeUsed: roundMoney(changeUsed)
  };
}

async function createPosSaleCashbookEntries(input: {
  tx: Prisma.TransactionClient;
  context: AccountingContext;
  transaction: NonNullable<Awaited<ReturnType<typeof getPostingTransaction>>>;
  journalEntryId: string;
  postedBy: string;
  cashbookPayments: Array<{
    paymentId: string;
    cashbookAccountId: string;
    cashbookAccountCode: string;
    cashbookAccountName: string;
    currencyCode: string | null;
    amount: number;
    reference: string | null;
    glAccountCode: string;
  }>;
  positiveSale: boolean;
}) {
  if (input.cashbookPayments.length === 0) {
    return 0;
  }

  const postingDate = input.transaction.completedAt ?? new Date();

  await ensureCashbookEntrySequence(input.tx, input.context, postingDate);

  let created = 0;

  for (const payment of input.cashbookPayments) {
    const existing = await input.tx.erpCashbookEntry.findFirst({
      where: {
        retailOrgId: input.context.retailOrgId,
        cashbookAccountId: payment.cashbookAccountId,
        workflowType: "POS_SALE",
        workflowReference: input.transaction.transactionNo,
        externalReference: payment.paymentId,
        status: {
          not: "DELETED"
        }
      },
      select: {
        id: true
      }
    });

    if (existing) {
      continue;
    }

    const entryNo = (
      await reserveErpDocumentNumberInTransaction(input.tx, {
        retailOrgId: input.context.retailOrgId,
        companyId: input.context.companyId,
        documentType: cashbookDocumentType
      })
    ).documentNo;

    await input.tx.erpCashbookEntry.create({
      data: {
        retailOrgId: input.context.retailOrgId,
        companyId: input.context.companyId,
        cashbookAccountId: payment.cashbookAccountId,
        postingJournalEntryId: input.journalEntryId,
        entryNo,
        entryType: input.positiveSale ? "RECEIPT" : "REFUND",
        direction: input.positiveSale ? "INFLOW" : "OUTFLOW",
        entryDate: postingDate,
        postingDate,
        valueDate: postingDate,
        currencyCode: payment.currencyCode || input.context.baseCurrencyCode,
        amount: payment.amount,
        offsetAccountCode: salesRevenueAccountCode,
        counterpartyName: input.transaction.customerNameSnapshot ?? "Walk-in customer",
        workflowType: "POS_SALE",
        workflowReference: input.transaction.transactionNo,
        providerReference: payment.reference,
        externalReference: payment.paymentId,
        memo: `${input.transaction.transactionNo} ${payment.cashbookAccountName} POS sale tender`,
        reconciliationStatus: "UNRECONCILED",
        status: "POSTED",
        postedAt: new Date(),
        postedBy: input.postedBy
      }
    });

    created += 1;
  }

  return created;
}

async function getPostingTransaction(tx: Prisma.TransactionClient, retailOrgId: string, transactionId: string) {
  return tx.posTransaction.findFirst({
    where: {
      id: transactionId,
      retailOrgId,
      status: PosTransactionStatus.COMPLETED,
      deletedAt: null
    },
    select: {
      id: true,
      retailOrgId: true,
      storeId: true,
      terminalId: true,
      customerId: true,
      transactionNo: true,
      transactionType: true,
      customerNameSnapshot: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      completedAt: true,
      store: {
        select: {
          code: true,
          name: true
        }
      },
      lines: {
        select: {
          id: true,
          lineIntent: true,
          quantity: true,
          productNameSnapshot: true,
          taxAmount: true,
          lineTotal: true,
          product: {
            select: {
              code: true,
              name: true,
              productType: true
            }
          }
        }
      },
      payments: {
        select: {
          id: true,
          tenderMethodId: true,
          tenderMethodCodeSnapshot: true,
          tenderMethodNameSnapshot: true,
          method: true,
          amount: true,
          reference: true,
          tenderMethod: {
            select: {
              id: true,
              code: true,
              name: true,
              paymentMethod: true,
              cashbookAccountId: true,
              cashbookAccount: {
                select: {
                  id: true,
                  companyId: true,
                  code: true,
                  name: true,
                  glAccountCode: true,
                  currencyCode: true,
                  status: true
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function postPosTransactionAccountingInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    transactionId: string;
    companyId?: string | null;
    postedBy?: string | null;
  }
): Promise<PosSaleAccountingResult> {
  const transaction = await getPostingTransaction(tx, input.retailOrgId, input.transactionId);

  if (!transaction) {
    return {
      salesJournalCreated: false,
      cogsJournalCount: 0,
      cashbookEntryCount: 0
    };
  }

  const context = await getAccountingContext(tx, input.retailOrgId, input.companyId);
  const postedBy = normalizeOptionalText(input.postedBy) ?? "POS sales accounting";
  const postingDate = transaction.completedAt ?? new Date();
  const existingSalesJournal = await tx.glJournalEntry.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      sourceType: posSaleSourceType,
      sourceId: transaction.id
    },
    select: {
      id: true
    }
  });
  let salesJournalCreated = false;
  let cashbookEntryCount = 0;

  if (!existingSalesJournal) {
    const tenderCodes = [
      ...new Set(
        transaction.payments
          .map((payment) => normalizeOptionalText(payment.tenderMethodCodeSnapshot)?.toUpperCase())
          .filter((code): code is string => Boolean(code))
      )
    ];
    const tenderMethodsByCode =
      tenderCodes.length > 0
        ? new Map(
            (
              await tx.tenderMethod.findMany({
                where: {
                  retailOrgId: input.retailOrgId,
                  code: {
                    in: tenderCodes
                  },
                  status: activeStatus,
                  deletedAt: null
                },
                select: {
                  id: true,
                  code: true,
                  name: true,
                  paymentMethod: true,
                  cashbookAccountId: true,
                  cashbookAccount: {
                    select: {
                      id: true,
                      companyId: true,
                      code: true,
                      name: true,
                      glAccountCode: true,
                      currencyCode: true,
                      status: true
                    }
                  }
                }
              })
            ).map((method) => [method.code.toUpperCase(), method] as const)
          )
        : new Map();
    const lines: PostAccountingDocumentLine[] = [];
    const memo = `${transaction.store.code} POS ${transaction.transactionNo}`;
    const positiveSale =
      transaction.transactionType !== PosTransactionType.RETURN && Number(transaction.totalAmount) >= 0;
    let remainingChangeAmount = roundMoney(Number(transaction.changeAmount));
    let settlementAmount = 0;
    const cashbookPayments: Parameters<typeof createPosSaleCashbookEntries>[0]["cashbookPayments"] = [];

    for (const payment of transaction.payments) {
      const snapshotTenderCode = normalizeOptionalText(payment.tenderMethodCodeSnapshot)?.toUpperCase() ?? null;
      const tender = payment.tenderMethod ?? (snapshotTenderCode ? tenderMethodsByCode.get(snapshotTenderCode) ?? null : null);
      const paymentMethod = tender?.paymentMethod ?? payment.method;
      const paymentAmount = roundMoney(Math.abs(Number(payment.amount)));

      if (paymentAmount <= 0) {
        continue;
      }

      const allocation = buildPaymentAllocation({
        paymentAmount,
        remainingChangeAmount,
        method: paymentMethod,
        positiveSale
      });
      remainingChangeAmount = roundMoney(remainingChangeAmount - allocation.changeUsed);

      if (allocation.netAmount <= 0) {
        continue;
      }

      if (isStoreCreditMethod(paymentMethod)) {
        if (!transaction.customerId) {
          throw new Error(`${transaction.transactionNo} uses Store Credit but has no customer account for AR posting.`);
        }
        settlementAmount = roundMoney(settlementAmount + allocation.netAmount);

        addPostingLine(
          lines,
          context.arAccountCode,
          positiveSale ? allocation.netAmount : 0,
          positiveSale ? 0 : allocation.netAmount,
          `${memo} customer credit tender`,
          transaction.storeId
        );
        continue;
      }

      const cashbookAccount = tender?.cashbookAccount ?? null;

      if (!tender || !cashbookAccount || !tender.cashbookAccountId) {
        throw new Error(
          `${transaction.transactionNo} cannot post ${payment.tenderMethodNameSnapshot ?? payment.method} because the tender method is not mapped to a Finance cashbook account.`
        );
      }

      if (cashbookAccount.companyId !== context.companyId || cashbookAccount.status !== activeStatus) {
        throw new Error(`${tender.name} is not mapped to an active cashbook account for the posting company.`);
      }

      const cashAccountCode = normalizeRequiredText(
        cashbookAccount.glAccountCode,
        `${tender.name} cashbook GL account`
      );

      addPostingLine(
        lines,
        cashAccountCode,
        positiveSale ? allocation.netAmount : 0,
        positiveSale ? 0 : allocation.netAmount,
        `${memo} ${tender.name} tender`,
        transaction.storeId
      );
      settlementAmount = roundMoney(settlementAmount + allocation.netAmount);
      cashbookPayments.push({
        paymentId: payment.id,
        cashbookAccountId: cashbookAccount.id,
        cashbookAccountCode: cashbookAccount.code,
        cashbookAccountName: cashbookAccount.name,
        currencyCode: cashbookAccount.currencyCode,
        amount: allocation.netAmount,
        reference: payment.reference,
        glAccountCode: cashAccountCode
      });
    }

    for (const line of transaction.lines) {
      const isReturnLine = line.lineIntent === PosTransactionLineIntent.RETURN || line.lineIntent === "RETURN";
      const netSalesAmount = roundMoney(Math.max(0, Math.abs(Number(line.lineTotal) - Number(line.taxAmount))));
      const taxAmount = roundMoney(Math.max(0, Math.abs(Number(line.taxAmount))));
      const revenueAccountCode = salesAccountForProductType(line.product.productType);
      const lineMemo = `${memo} ${line.product.code}`;

      addPostingLine(
        lines,
        revenueAccountCode,
        isReturnLine ? netSalesAmount : 0,
        isReturnLine ? 0 : netSalesAmount,
        lineMemo,
        transaction.storeId
      );
      addPostingLine(
        lines,
        context.taxAccountCode,
        isReturnLine ? taxAmount : 0,
        isReturnLine ? 0 : taxAmount,
        `${lineMemo} tax`,
        transaction.storeId
      );
    }

    const debitTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.debitAmount ?? 0), 0));
    const creditTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.creditAmount ?? 0), 0));
    const balanceGap = roundMoney(creditTotal - debitTotal);

    if (balanceGap > 0) {
      const settledTransactionAmount = roundMoney(Math.abs(Number(transaction.totalAmount)));
      const looksLikeTransactionLevelReduction =
        positiveSale && settlementAmount + 0.005 >= settledTransactionAmount;

      if (looksLikeTransactionLevelReduction) {
        addPostingLine(
          lines,
          context.customerDiscountAccountCode,
          balanceGap,
          0,
          `${memo} customer discount or loyalty redemption`,
          transaction.storeId
        );
      } else if (!transaction.customerId) {
        throw new Error(`${transaction.transactionNo} has an unpaid balance but no customer account for AR posting.`);
      } else {
        addPostingLine(
          lines,
          context.arAccountCode,
          balanceGap,
          0,
          `${memo} unpaid customer receivable`,
          transaction.storeId
        );
      }
    } else if (balanceGap < 0) {
      addPostingLine(
        lines,
        context.arAccountCode,
        0,
        Math.abs(balanceGap),
        `${memo} customer receivable reduction`,
        transaction.storeId
      );
    }

    const isZeroValueSale = Math.abs(Number(transaction.totalAmount)) <= 0.005;
    const hasNoSalesPosting = lines.length === 0 && cashbookPayments.length === 0;

    if (!isZeroValueSale || !hasNoSalesPosting) {
      const salesJournal = await postAccountingDocumentInTransaction(tx, {
        retailOrgId: input.retailOrgId,
        companyId: context.companyId,
        documentType: journalDocumentType,
        batchSourceType: posSaleSourceType,
        journalType: posSaleSourceType,
        sourceType: posSaleSourceType,
        sourceId: transaction.id,
        sourceReference: transaction.transactionNo,
        postingDate,
        description: `${transaction.transactionNo} POS sale from ${transaction.store.name}`,
        postedBy,
        lines
      });
      salesJournalCreated = true;
      cashbookEntryCount = await createPosSaleCashbookEntries({
        tx,
        context,
        transaction,
        journalEntryId: salesJournal.journalEntryId,
        postedBy,
        cashbookPayments,
        positiveSale
      });
    }
  }

  const cogsJournalCount = await postPosTransactionCogsInTransaction(tx, {
    retailOrgId: input.retailOrgId,
    transactionId: transaction.id,
    companyId: context.companyId,
    postedBy
  });

  return {
    salesJournalCreated,
    cogsJournalCount,
    cashbookEntryCount
  };
}

export async function postPosTransactionCogsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    transactionId: string;
    companyId?: string | null;
    postedBy?: string | null;
  }
) {
  const transaction = await tx.posTransaction.findFirst({
    where: {
      id: input.transactionId,
      retailOrgId: input.retailOrgId,
      status: PosTransactionStatus.COMPLETED,
      deletedAt: null
    },
    select: {
      id: true,
      transactionNo: true,
      storeId: true
    }
  });

  if (!transaction) {
    return 0;
  }

  const context = await getAccountingContext(tx, input.retailOrgId, input.companyId);
  const postedBy = normalizeOptionalText(input.postedBy) ?? "POS sales accounting";
  const entries = await tx.inventoryLedgerEntry.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      referenceType: "POS_TRANSACTION",
      referenceId: transaction.id,
      movementType: {
        in: [InventoryMovementType.SALE, InventoryMovementType.RETURN]
      }
    },
    select: {
      id: true,
      storeId: true,
      movementType: true,
      quantity: true,
      unitCost: true,
      externalReference: true,
      occurredAt: true,
      product: {
        select: {
          code: true,
          name: true,
          baseCostPrice: true
        }
      }
    }
  });
  let created = 0;

  for (const entry of entries) {
    const existing = await tx.glJournalEntry.findFirst({
      where: {
        retailOrgId: input.retailOrgId,
        sourceType: inventoryCogsSourceType,
        sourceId: entry.id
      },
      select: {
        id: true
      }
    });

    if (existing) {
      continue;
    }

    const ledgerUnitCost = Number(entry.unitCost ?? 0);
    const productUnitCost = Number(entry.product.baseCostPrice ?? 0);
    const unitCost = ledgerUnitCost > 0 ? ledgerUnitCost : productUnitCost;
    const amount = roundMoney(Math.abs(Number(entry.quantity)) * unitCost);

    if (amount <= 0) {
      continue;
    }

    const isReturn = entry.movementType === InventoryMovementType.RETURN;
    const lines: PostAccountingDocumentLine[] = [];
    const memo = `${transaction.transactionNo} ${entry.product.code} COGS`;

    addPostingLine(
      lines,
      isReturn ? context.inventoryAccountCode : cogsAccountCode,
      amount,
      0,
      memo,
      entry.storeId ?? transaction.storeId
    );
    addPostingLine(
      lines,
      isReturn ? cogsAccountCode : context.inventoryAccountCode,
      0,
      amount,
      memo,
      entry.storeId ?? transaction.storeId
    );

    await postAccountingDocumentInTransaction(tx, {
      retailOrgId: input.retailOrgId,
      companyId: context.companyId,
      documentType: journalDocumentType,
      batchSourceType: inventoryCogsSourceType,
      journalType: inventoryCogsSourceType,
      sourceType: inventoryCogsSourceType,
      sourceId: entry.id,
      sourceReference: entry.externalReference ?? transaction.transactionNo,
      postingDate: entry.occurredAt,
      description: `${transaction.transactionNo} COGS for ${entry.product.name}`,
      postedBy,
      lines
    });
    created += 1;
  }

  return created;
}

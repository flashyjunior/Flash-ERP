import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import "dotenv/config";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient, type Prisma } from "@prisma/client";

import {
  postLayawayAccountingInTransaction,
  postPosTransactionAccountingInTransaction
} from "../apps/enterprise-web/src/server/services/erp-pos-sale-accounting";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl?.startsWith("sqlserver://")) {
  throw new Error("DATABASE_URL must target SQL Server before running the layaway finance gate.");
}

const prisma = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });
const rollback = new Error("ROLLBACK_LAYAWAY_FINANCE_GATE");

function amountFor(
  lines: Array<{ account: { code: string }; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }>,
  accountCode: string,
  side: "debit" | "credit"
) {
  return lines
    .filter((line) => line.account.code === accountCode)
    .reduce(
      (sum, line) =>
        sum + Number(side === "debit" ? line.debitAmount : line.creditAmount),
      0
    );
}

async function runGate(tx: Prisma.TransactionClient) {
  const stamp = randomUUID().slice(0, 8).toUpperCase();
  const enterpriseNode = await tx.syncNode.findFirst({
    where: { nodeType: "ENTERPRISE", isPrimary: true, status: "ACTIVE" },
    select: { retailOrgId: true }
  });
  const retailOrg = enterpriseNode
    ? { id: enterpriseNode.retailOrgId }
    : await tx.retailOrg.findFirst({ select: { id: true } });

  assert.ok(retailOrg, "Layaway finance acceptance needs an initialized retail organization.");

  const company =
    (await tx.erpCompany.findFirst({
      where: { retailOrgId: retailOrg.id, status: "ACTIVE" },
      orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
    })) ??
    (await tx.erpCompany.create({
      data: {
        retailOrgId: retailOrg.id,
        code: `LAY-${stamp}`,
        legalName: "Layaway finance acceptance",
        baseCurrencyCode: "GHS",
        timezone: "Africa/Accra",
        isPrimary: true,
        status: "ACTIVE"
      }
    }));
  const store =
    (await tx.store.findFirst({
      where: { retailOrgId: retailOrg.id, status: "ACTIVE" },
      orderBy: { code: "asc" }
    })) ??
    (await tx.store.create({
      data: {
        retailOrgId: retailOrg.id,
        code: `LAY-${stamp}`,
        name: "Layaway finance acceptance",
        timezone: "Africa/Accra",
        currencyCode: company.baseCurrencyCode,
        status: "ACTIVE"
      }
    }));
  const terminal =
    (await tx.terminal.findFirst({
      where: { storeId: store.id, status: "ACTIVE" },
      orderBy: { code: "asc" }
    })) ??
    (await tx.terminal.create({
      data: {
        retailOrgId: retailOrg.id,
        storeId: store.id,
        code: `LAY-${stamp}`,
        name: "Layaway finance acceptance",
        status: "ACTIVE"
      }
    }));

  await tx.erpAccountingSettings.upsert({
    where: { companyId: company.id },
    update: {
      arControlAccountCode: "1100",
      inventoryControlAccountCode: "1200",
      taxControlAccountCode: "2100",
      status: "ACTIVE"
    },
    create: {
      retailOrgId: retailOrg.id,
      companyId: company.id,
      baseCurrencyCode: company.baseCurrencyCode,
      arControlAccountCode: "1100",
      inventoryControlAccountCode: "1200",
      taxControlAccountCode: "2100",
      status: "ACTIVE"
    }
  });

  const accountDefinitions = [
    ["1000", "Cash", "ASSET", "DEBIT"],
    ["1100", "Accounts receivable", "ASSET", "DEBIT"],
    ["1200", "Inventory", "ASSET", "DEBIT"],
    ["2010", "Customer advances", "LIABILITY", "CREDIT"],
    ["2100", "Output tax", "LIABILITY", "CREDIT"],
    ["4000", "Sales revenue", "REVENUE", "CREDIT"],
    ["4100", "Service revenue", "REVENUE", "CREDIT"],
    ["4400", "Cancellation fee revenue", "REVENUE", "CREDIT"],
    ["5000", "Cost of goods sold", "EXPENSE", "DEBIT"],
    ["8000", "Customer discounts", "EXPENSE", "DEBIT"]
  ] as const;

  for (const [code, name, accountType, normalBalance] of accountDefinitions) {
    await tx.glAccount.upsert({
      where: { retailOrgId_code: { retailOrgId: retailOrg.id, code } },
      update: { companyId: company.id, name, accountType, normalBalance, status: "ACTIVE" },
      create: {
        retailOrgId: retailOrg.id,
        companyId: company.id,
        code,
        name,
        accountType,
        normalBalance,
        status: "ACTIVE"
      }
    });
  }

  const postingProfile = await tx.erpArApPostingProfile.findFirst({
    where: {
      retailOrgId: retailOrg.id,
      companyId: company.id,
      profileType: "CUSTOMER",
      isDefault: true,
      status: "ACTIVE"
    }
  });

  if (postingProfile) {
    await tx.erpArApPostingProfile.update({
      where: { id: postingProfile.id },
      data: { customerAdvanceAccountCode: "2010", customerDiscountAccountCode: "8000" }
    });
  } else {
    await tx.erpArApPostingProfile.create({
      data: {
        retailOrgId: retailOrg.id,
        companyId: company.id,
        code: `LAY-${stamp}`,
        name: "Layaway finance acceptance",
        profileType: "CUSTOMER",
        customerAdvanceAccountCode: "2010",
        customerDiscountAccountCode: "8000",
        isDefault: true,
        status: "ACTIVE"
      }
    });
  }

  const now = new Date();
  const fiscalYear = await tx.erpFiscalYear.create({
    data: {
      retailOrgId: retailOrg.id,
      companyId: company.id,
      code: `LAY-${stamp}`,
      name: "Layaway finance acceptance",
      startsOn: new Date(now.getFullYear(), 0, 1),
      endsOn: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      status: "OPEN"
    }
  });
  await tx.erpFiscalPeriod.create({
    data: {
      retailOrgId: retailOrg.id,
      companyId: company.id,
      fiscalYearId: fiscalYear.id,
      periodNo: 1,
      code: `LAY-${stamp}`,
      name: "Layaway finance acceptance",
      startsOn: fiscalYear.startsOn,
      endsOn: fiscalYear.endsOn,
      status: "OPEN"
    }
  });

  for (const [documentType, prefix] of [
    ["JOURNAL", "LJG"],
    ["CASHBOOK_ENTRY", "LCB"]
  ] as const) {
    await tx.erpDocumentSequence.create({
      data: {
        retailOrgId: retailOrg.id,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType,
        prefix: `${prefix}${stamp.slice(0, 3)}`,
        nextSequence: 1,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: "ACTIVE"
      }
    });
  }

  const cashAccount = await tx.glAccount.findUniqueOrThrow({
    where: { retailOrgId_code: { retailOrgId: retailOrg.id, code: "1000" } }
  });
  const cashbook = await tx.erpCashbookAccount.create({
    data: {
      retailOrgId: retailOrg.id,
      companyId: company.id,
      glAccountId: cashAccount.id,
      code: `LAY-${stamp}`,
      name: "Layaway finance acceptance cash",
      accountType: "CASH",
      currencyCode: company.baseCurrencyCode,
      glAccountCode: "1000",
      isDefault: false,
      status: "ACTIVE"
    }
  });
  const tender = await tx.tenderMethod.create({
    data: {
      retailOrgId: retailOrg.id,
      cashbookAccountId: cashbook.id,
      code: `LAY-${stamp}`,
      name: "Layaway finance acceptance cash",
      paymentMethod: "CASH",
      status: "ACTIVE"
    }
  });

  async function createPayment(input: {
    transactionId: string;
    amount: number;
    purpose: "LAYAWAY_DEPOSIT" | "LAYAWAY_INSTALLMENT" | "LAYAWAY_REFUND";
    reference: string;
  }) {
    return tx.posPayment.create({
      data: {
        posTransactionId: input.transactionId,
        tenderMethodId: tender.id,
        tenderMethodCodeSnapshot: tender.code,
        tenderMethodNameSnapshot: tender.name,
        method: "CASH",
        amount: input.amount,
        reference: input.reference,
        paymentPurpose: input.purpose,
        receivedShiftNoSnapshot: `SHIFT-${stamp}`,
        receivedTerminalCodeSnapshot: terminal.code,
        receivedCashierCodeSnapshot: "layaway.gate",
        receivedAt: now
      }
    });
  }

  const cancelledTransaction = await tx.posTransaction.create({
    data: {
      retailOrgId: retailOrg.id,
      storeId: store.id,
      terminalId: terminal.id,
      transactionNo: `LAY-CANCEL-TX-${stamp}`,
      transactionType: "SALE",
      status: "PARKED",
      customerNameSnapshot: "Layaway cancellation customer",
      cashierCodeSnapshot: "layaway.gate",
      subtotalAmount: 400,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 400,
      paidAmount: 200,
      changeAmount: 0,
      recordVersion: 1
    }
  });
  const cancelledOrder = await tx.salesOrder.create({
    data: {
      retailOrgId: retailOrg.id,
      storeId: store.id,
      terminalId: terminal.id,
      orderNo: `LAY-CANCEL-${stamp}`,
      sourceTransactionId: cancelledTransaction.id,
      sourceTransactionNo: cancelledTransaction.transactionNo,
      customerNameSnapshot: "Layaway cancellation customer",
      orderType: "LAYAWAY",
      status: "OPEN",
      totalAmount: 400,
      depositAmount: 80,
      paidAmount: 200,
      balanceAmount: 200,
      minimumDepositAmount: 80,
      reservationStatus: "ACTIVE",
      operatorName: "layaway.gate",
      recordVersion: 1,
      createdAt: now
    }
  });
  await createPayment({
    transactionId: cancelledTransaction.id,
    amount: 80,
    purpose: "LAYAWAY_DEPOSIT",
    reference: `DEP-${stamp}`
  });
  await createPayment({
    transactionId: cancelledTransaction.id,
    amount: 120,
    purpose: "LAYAWAY_INSTALLMENT",
    reference: `INS-${stamp}`
  });

  const openingPosting = await postLayawayAccountingInTransaction(tx, {
    retailOrgId: retailOrg.id,
    salesOrderId: cancelledOrder.id,
    companyId: company.id,
    postedBy: "layaway finance gate"
  });
  assert.deepEqual(openingPosting, {
    paymentJournalCount: 2,
    cashbookEntryCount: 2,
    cancellationFeeJournalCreated: false
  });
  assert.deepEqual(
    await postLayawayAccountingInTransaction(tx, {
      retailOrgId: retailOrg.id,
      salesOrderId: cancelledOrder.id,
      companyId: company.id,
      postedBy: "layaway finance gate replay"
    }),
    { paymentJournalCount: 0, cashbookEntryCount: 0, cancellationFeeJournalCreated: false }
  );

  await createPayment({
    transactionId: cancelledTransaction.id,
    amount: -180,
    purpose: "LAYAWAY_REFUND",
    reference: `REF-${stamp}`
  });
  await tx.salesOrder.update({
    where: { id: cancelledOrder.id },
    data: {
      status: "CANCELLED",
      balanceAmount: 0,
      cancellationFeeAmount: 20,
      refundedAmount: 180,
      reservationStatus: "RELEASED",
      cancelledAt: now,
      recordVersion: 2
    }
  });
  assert.deepEqual(
    await postLayawayAccountingInTransaction(tx, {
      retailOrgId: retailOrg.id,
      salesOrderId: cancelledOrder.id,
      companyId: company.id,
      postedBy: "layaway finance gate cancellation"
    }),
    { paymentJournalCount: 1, cashbookEntryCount: 1, cancellationFeeJournalCreated: true }
  );

  const cancellationJournals = await tx.glJournalEntry.findMany({
    where: {
      retailOrgId: retailOrg.id,
      sourceType: { in: ["LAYAWAY_PAYMENT", "LAYAWAY_CANCELLATION_FEE"] },
      sourceReference: cancelledOrder.orderNo
    },
    include: { lines: { include: { account: { select: { code: true } } } } }
  });
  const cancellationLines = cancellationJournals.flatMap((journal) => journal.lines);
  assert.equal(cancellationJournals.length, 4);
  assert.equal(amountFor(cancellationLines, "1000", "debit"), 200);
  assert.equal(amountFor(cancellationLines, "1000", "credit"), 180);
  assert.equal(amountFor(cancellationLines, "2010", "credit"), 200);
  assert.equal(amountFor(cancellationLines, "2010", "debit"), 200);
  assert.equal(amountFor(cancellationLines, "4400", "credit"), 20);

  const product = await tx.product.upsert({
    where: { retailOrgId_code: { retailOrgId: retailOrg.id, code: `LAY-${stamp}` } },
    update: {},
    create: {
      retailOrgId: retailOrg.id,
      code: `LAY-${stamp}`,
      sku: `LAY-${stamp}`,
      name: "Layaway finance acceptance item",
      productType: "SERVICE",
      unitOfMeasure: "EA",
      taxable: false,
      trackInventory: false,
      baseUnitPrice: 400,
      status: "ACTIVE"
    }
  });
  const fulfilledTransaction = await tx.posTransaction.create({
    data: {
      retailOrgId: retailOrg.id,
      storeId: store.id,
      terminalId: terminal.id,
      transactionNo: `LAY-FULFIL-TX-${stamp}`,
      transactionType: "SALE",
      status: "COMPLETED",
      customerNameSnapshot: "Layaway fulfilment customer",
      cashierCodeSnapshot: "layaway.gate",
      subtotalAmount: 400,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 400,
      paidAmount: 400,
      changeAmount: 0,
      completedAt: now,
      recordVersion: 4,
      lines: {
        create: {
          productId: product.id,
          lineIntent: "SALE",
          productCodeSnapshot: product.code,
          productNameSnapshot: product.name,
          quantity: 1,
          sellingUnitOfMeasure: "EA",
          baseUnitOfMeasure: "EA",
          uomConversionFactor: 1,
          baseQuantity: 1,
          unitPrice: 400,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: 400
        }
      }
    }
  });
  const fulfilledOrder = await tx.salesOrder.create({
    data: {
      retailOrgId: retailOrg.id,
      storeId: store.id,
      terminalId: terminal.id,
      orderNo: `LAY-FULFIL-${stamp}`,
      sourceTransactionId: fulfilledTransaction.id,
      sourceTransactionNo: fulfilledTransaction.transactionNo,
      customerNameSnapshot: "Layaway fulfilment customer",
      orderType: "LAYAWAY",
      status: "FULFILLED",
      totalAmount: 400,
      depositAmount: 80,
      paidAmount: 400,
      balanceAmount: 0,
      minimumDepositAmount: 80,
      reservationStatus: "CONSUMED",
      operatorName: "layaway.gate",
      fulfilledTransactionId: fulfilledTransaction.id,
      fulfilledTransactionNo: fulfilledTransaction.transactionNo,
      fulfilledAt: now,
      recordVersion: 4,
      createdAt: now
    }
  });
  await createPayment({ transactionId: fulfilledTransaction.id, amount: 80, purpose: "LAYAWAY_DEPOSIT", reference: `FDEP-${stamp}` });
  await createPayment({ transactionId: fulfilledTransaction.id, amount: 120, purpose: "LAYAWAY_INSTALLMENT", reference: `FINS1-${stamp}` });
  await createPayment({ transactionId: fulfilledTransaction.id, amount: 200, purpose: "LAYAWAY_INSTALLMENT", reference: `FINS2-${stamp}` });

  const fulfilmentPaymentPosting = await postLayawayAccountingInTransaction(tx, {
    retailOrgId: retailOrg.id,
    salesOrderId: fulfilledOrder.id,
    companyId: company.id,
    postedBy: "layaway finance gate fulfilment payments"
  });
  assert.equal(fulfilmentPaymentPosting.paymentJournalCount, 3);
  assert.equal(fulfilmentPaymentPosting.cashbookEntryCount, 3);

  const fulfilmentPosting = await postPosTransactionAccountingInTransaction(tx, {
    retailOrgId: retailOrg.id,
    transactionId: fulfilledTransaction.id,
    companyId: company.id,
    postedBy: "layaway finance gate fulfilment"
  });
  assert.equal(fulfilmentPosting.salesJournalCreated, true);
  assert.equal(fulfilmentPosting.cashbookEntryCount, 0);

  const fulfilmentJournal = await tx.glJournalEntry.findFirstOrThrow({
    where: {
      retailOrgId: retailOrg.id,
      sourceType: "POS_SALE",
      sourceId: fulfilledTransaction.id
    },
    include: { lines: { include: { account: { select: { code: true } } } } }
  });
  assert.equal(amountFor(fulfilmentJournal.lines, "2010", "debit"), 400);
  assert.equal(amountFor(fulfilmentJournal.lines, "4100", "credit"), 400);
  assert.equal(amountFor(fulfilmentJournal.lines, "1000", "debit"), 0);
  assert.deepEqual(
    await postPosTransactionAccountingInTransaction(tx, {
      retailOrgId: retailOrg.id,
      transactionId: fulfilledTransaction.id,
      companyId: company.id,
      postedBy: "layaway finance gate fulfilment replay"
    }),
    { salesJournalCreated: false, cogsJournalCount: 0, cashbookEntryCount: 0 }
  );

  const layawayCashbookEntries = await tx.erpCashbookEntry.findMany({
    where: {
      retailOrgId: retailOrg.id,
      cashbookAccountId: cashbook.id,
      workflowType: "LAYAWAY"
    }
  });
  assert.equal(layawayCashbookEntries.filter((entry) => entry.direction === "INFLOW").length, 5);
  assert.equal(layawayCashbookEntries.filter((entry) => entry.direction === "OUTFLOW").length, 1);

  const layawayReportRows = await tx.salesOrder.findMany({
    where: {
      retailOrgId: retailOrg.id,
      id: { in: [cancelledOrder.id, fulfilledOrder.id] },
      orderType: "LAYAWAY"
    },
    select: {
      status: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      reservationStatus: true,
      cancellationFeeAmount: true,
      refundedAmount: true
    }
  });
  assert.equal(layawayReportRows.length, 2);
  assert.ok(
    layawayReportRows.some(
      (row) =>
        row.status === "CANCELLED" &&
        Number(row.cancellationFeeAmount) === 20 &&
        Number(row.refundedAmount) === 180
    )
  );
  assert.ok(
    layawayReportRows.some(
      (row) =>
        row.status === "FULFILLED" &&
        Number(row.paidAmount) === 400 &&
        Number(row.balanceAmount) === 0 &&
        row.reservationStatus === "CONSUMED"
    )
  );
  const paymentHistoryRows = await tx.posPayment.findMany({
    where: {
      posTransactionId: { in: [cancelledTransaction.id, fulfilledTransaction.id] },
      paymentPurpose: {
        in: ["LAYAWAY_DEPOSIT", "LAYAWAY_INSTALLMENT", "LAYAWAY_REFUND"]
      }
    },
    select: {
      paymentPurpose: true,
      receivedShiftNoSnapshot: true,
      receivedTerminalCodeSnapshot: true,
      receivedCashierCodeSnapshot: true,
      receivedAt: true
    }
  });
  assert.equal(paymentHistoryRows.length, 6);
  assert.ok(
    paymentHistoryRows.every(
      (row) =>
        row.receivedShiftNoSnapshot &&
        row.receivedTerminalCodeSnapshot &&
        row.receivedCashierCodeSnapshot &&
        row.receivedAt instanceof Date
    )
  );

  process.stdout.write(
    "Layaway finance/reporting gate passed: deposits/installments credit customer advances, refunds and fees clear advances, fulfilment recognizes revenue without a second cash debit, cashbook attribution is dated, report fields reconcile, and replay is idempotent.\n"
  );
}

async function main() {
  try {
    await prisma.$transaction(
      async (tx) => {
        await runGate(tx);
        throw rollback;
      },
      { maxWait: 60_000, timeout: 120_000 }
    );
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

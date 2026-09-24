import { resolveSalesOrderCollectionAttribution } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";

type ReportingSalesOrder = {
  id: string;
  sourceTransactionId: string;
  fulfilledTransactionId: string | null;
  status: string;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  depositPaidAt: Date | string | null;
  operatorName: string | null;
};

export async function getSalesOrderCollectionAttributionMap(
  retailOrgId: string,
  orders: ReportingSalesOrder[],
) {
  const sourceTransactionIds = [...new Set(orders.map((order) => order.sourceTransactionId))];
  const fulfilledTransactionIds = [
    ...new Set(
      orders
        .map((order) => order.fulfilledTransactionId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [payments, fulfilledTransactions] = await Promise.all([
    sourceTransactionIds.length > 0
      ? prisma.posPayment.findMany({
          where: {
            posTransactionId: { in: sourceTransactionIds },
            paymentPurpose: {
              in: [
                "SALES_ORDER_DEPOSIT",
                "SALES_ORDER_BALANCE",
                "TRANSACTION_SETTLEMENT",
              ],
            },
            posTransaction: { retailOrgId },
          },
          orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
          select: {
            posTransactionId: true,
            paymentPurpose: true,
            receivedCashierCodeSnapshot: true,
            receivedAt: true,
          },
        })
      : [],
    fulfilledTransactionIds.length > 0
      ? prisma.posTransaction.findMany({
          where: {
            id: { in: fulfilledTransactionIds },
            retailOrgId,
          },
          select: {
            id: true,
            cashierCodeSnapshot: true,
          },
        })
      : [],
  ]);
  const paymentsByTransactionId = new Map<
    string,
    Array<{
      paymentPurpose: string;
      receivedCashierCode: string | null;
      receivedAt: Date;
    }>
  >();

  for (const payment of payments) {
    const transactionPayments = paymentsByTransactionId.get(payment.posTransactionId) ?? [];
    transactionPayments.push({
      paymentPurpose: payment.paymentPurpose,
      receivedCashierCode: payment.receivedCashierCodeSnapshot,
      receivedAt: payment.receivedAt,
    });
    paymentsByTransactionId.set(payment.posTransactionId, transactionPayments);
  }

  const fulfilledCashierByTransactionId = new Map(
    fulfilledTransactions.map((transaction) => [
      transaction.id,
      transaction.cashierCodeSnapshot,
    ] as const),
  );

  return new Map(
    orders.map((order) => [
      order.id,
      resolveSalesOrderCollectionAttribution({
        status: order.status,
        totalAmount: order.totalAmount,
        depositAmount: order.depositAmount,
        balanceAmount: order.balanceAmount,
        depositPaidAt: order.depositPaidAt,
        operatorName: order.operatorName,
        fulfilledCashierCode: order.fulfilledTransactionId
          ? fulfilledCashierByTransactionId.get(order.fulfilledTransactionId) ?? null
          : null,
        payments: paymentsByTransactionId.get(order.sourceTransactionId) ?? [],
      }),
    ] as const),
  );
}

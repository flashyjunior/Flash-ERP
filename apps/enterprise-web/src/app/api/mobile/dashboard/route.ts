import {
  PosTransactionLineIntent,
  PosTransactionStatus,
  PosTransactionType,
} from "@flash-erp/domain";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  EnterpriseAuthError,
  getEnterpriseSession,
} from "@/server/auth/enterprise-session";

function signedTransactionAmount(transactionType: string, amount: number) {
  return transactionType === PosTransactionType.RETURN
    ? Math.abs(amount) * -1
    : amount;
}

function signedLineAmount(
  transactionType: string,
  lineIntent: string,
  amount: number,
) {
  return transactionType === PosTransactionType.RETURN ||
    lineIntent === PosTransactionLineIntent.RETURN
    ? Math.abs(amount) * -1
    : amount;
}

export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) {
      throw new EnterpriseAuthError(
        "Flash ERP requires a signed-in session.",
        401,
      );
    }
    if (
      !session.permissionCodes.includes("pos.sale.process") &&
      !session.permissionCodes.includes("pos.sell")
    ) {
      throw new EnterpriseAuthError(
        "Flash ERP requires POS selling privileges to view shop sales analytics.",
        403,
      );
    }

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const sevenDays = new Date(start);
    sevenDays.setUTCDate(sevenDays.getUTCDate() - 6);
    const store = session.homeStoreCode
      ? await prisma.store.findFirst({
          where: {
            retailOrgId: session.retailOrgId,
            code: session.homeStoreCode,
          },
          select: { id: true },
        })
      : null;

    const [recentTransactions, pendingLeave] = await Promise.all([
      prisma.posTransaction.findMany({
        where: {
          retailOrgId: session.retailOrgId,
          status: PosTransactionStatus.COMPLETED,
          transactionType: {
            in: [
              PosTransactionType.SALE,
              PosTransactionType.RETURN,
              PosTransactionType.EXCHANGE,
            ],
          },
          completedAt: { gte: sevenDays },
          ...(store ? { storeId: store.id } : {}),
        },
        select: {
          completedAt: true,
          transactionType: true,
          totalAmount: true,
          lines: {
            select: {
              productCodeSnapshot: true,
              productNameSnapshot: true,
              quantity: true,
              lineTotal: true,
              lineIntent: true,
            },
          },
        },
      }),
      session.permissionCodes.some((code) => code.includes("approve"))
        ? prisma.erpLeaveRequest.count({
            where: {
              retailOrgId: session.retailOrgId,
              status: "SUBMITTED",
            },
          })
        : Promise.resolve(0),
    ]);

    const todayTransactions = recentTransactions.filter(
      (transaction) =>
        transaction.completedAt && transaction.completedAt >= start,
    );
    const salesTotal = todayTransactions.reduce(
      (sum, transaction) =>
        sum +
        signedTransactionAmount(
          transaction.transactionType,
          Number(transaction.totalAmount),
        ),
      0,
    );
    const transactionCount = todayTransactions.length;
    const saleCount = todayTransactions.filter(
      (transaction) => transaction.transactionType === PosTransactionType.SALE,
    ).length;

    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDays);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        total: recentTransactions
          .filter(
            (transaction) =>
              transaction.completedAt?.toISOString().slice(0, 10) === key,
          )
          .reduce(
            (sum, transaction) =>
              sum +
              signedTransactionAmount(
                transaction.transactionType,
                Number(transaction.totalAmount),
              ),
            0,
          ),
      };
    });

    const products = new Map<
      string,
      {
        productCode: string;
        productName: string;
        quantity: number;
        sales: number;
      }
    >();
    for (const transaction of recentTransactions) {
      for (const line of transaction.lines) {
        const current = products.get(line.productCodeSnapshot) ?? {
          productCode: line.productCodeSnapshot,
          productName: line.productNameSnapshot,
          quantity: 0,
          sales: 0,
        };
        current.quantity += signedLineAmount(
          transaction.transactionType,
          line.lineIntent,
          Number(line.quantity),
        );
        current.sales += signedLineAmount(
          transaction.transactionType,
          line.lineIntent,
          Number(line.lineTotal),
        );
        products.set(line.productCodeSnapshot, current);
      }
    }

    return NextResponse.json({
      salesTotal,
      transactionCount,
      averageBasket: saleCount ? salesTotal / saleCount : 0,
      pendingApprovals: pendingLeave,
      trend,
      topProducts: [...products.values()]
        .filter((product) => product.quantity > 0 || product.sales > 0)
        .sort((left, right) => right.sales - left.sales)
        .slice(0, 5),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not load mobile analytics.",
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400,
      },
    );
  }
}

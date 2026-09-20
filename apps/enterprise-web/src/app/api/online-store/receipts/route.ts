import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

/**
 * Receipt search for the mobile Returns screen.
 * - `query` (>= 2 chars) narrows by transaction number or customer name (historic behavior).
 * - `date` (YYYY-MM-DD, defaults to today UTC) lists that day's completed sales so the
 *   refund flow can auto-load the current day's receipts without typing anything.
 */
export async function GET(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.homeStoreCode) throw new EnterpriseAuthError("Assign a home shop before processing returns.", 403);
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() ?? "";

    const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date")?.trim() ?? "") ? (url.searchParams.get("date") as string) : new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const transactions = await prisma.posTransaction.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: "COMPLETED",
        transactionType: "SALE",
        ...(query.length >= 2
          ? { OR: [{ transactionNo: { contains: query } }, { customerNameSnapshot: { contains: query } }] }
          : { completedAt: { gte: dayStart, lt: dayEnd } })
      },
      orderBy: { completedAt: "desc" },
      take: query.length >= 2 ? 10 : 100,
      select: {
        id: true,
        transactionNo: true,
        customerNameSnapshot: true,
        totalAmount: true,
        completedAt: true,
        store: { select: { code: true, name: true } },
        payments: { select: { method: true, tenderMethodCodeSnapshot: true, tenderMethodNameSnapshot: true, amount: true, reference: true } },
        lines: { select: { id: true, productCodeSnapshot: true, productNameSnapshot: true, quantity: true, unitPrice: true, lineTotal: true, sellingUnitOfMeasure: true } }
      }
    });
    const lineIds = transactions.flatMap((transaction) => transaction.lines.map((line) => line.id));
    const returned = lineIds.length ? await prisma.posTransactionLine.groupBy({ by: ["sourceLineId"], where: { sourceLineId: { in: lineIds }, lineIntent: "RETURN" }, _sum: { quantity: true } }) : [];
    const returnedByLine = new Map(returned.map((row) => [row.sourceLineId, Math.abs(Number(row._sum.quantity ?? 0))]));
    return NextResponse.json({
      date: dayKey,
      receipts: transactions.map((transaction) => ({
        transactionId: transaction.id,
        transactionNo: transaction.transactionNo,
        customerName: transaction.customerNameSnapshot ?? "Walk-in Customer",
        totalAmount: Number(transaction.totalAmount),
        completedAt: transaction.completedAt?.toISOString() ?? null,
        storeCode: transaction.store.code,
        storeName: transaction.store.name,
        payments: transaction.payments.map((payment) => ({ method: payment.method, tenderMethodCode: payment.tenderMethodCodeSnapshot, tenderMethodName: payment.tenderMethodNameSnapshot, amount: Number(payment.amount), reference: payment.reference })),
        lines: transaction.lines.map((line) => ({
          sourceLineId: line.id,
          productCode: line.productCodeSnapshot,
          productName: line.productNameSnapshot,
          soldQuantity: Number(line.quantity),
          returnedQuantity: returnedByLine.get(line.id) ?? 0,
          eligibleQuantity: Math.max(0, Number(line.quantity) - (returnedByLine.get(line.id) ?? 0)),
          unitPrice: Number(line.unitPrice),
          lineTotal: Number(line.lineTotal),
          unitOfMeasure: line.sellingUnitOfMeasure
        }))
      }))
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not search receipts." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

export async function GET(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.homeStoreCode) throw new EnterpriseAuthError("Assign a home shop before processing returns.", 403);
    const query = new URL(request.url).searchParams.get("query")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ receipts: [] });
    const transactions = await prisma.posTransaction.findMany({
      where: { retailOrgId: session.retailOrgId, status: "COMPLETED", transactionType: "SALE", OR: [{ transactionNo: { contains: query } }, { customerNameSnapshot: { contains: query } }] },
      orderBy: { completedAt: "desc" }, take: 10,
      select: { id: true, transactionNo: true, customerNameSnapshot: true, totalAmount: true, completedAt: true, store: { select: { code: true, name: true } }, lines: { select: { id: true, productCodeSnapshot: true, productNameSnapshot: true, quantity: true, unitPrice: true, lineTotal: true, sellingUnitOfMeasure: true } } }
    });
    const lineIds = transactions.flatMap((transaction) => transaction.lines.map((line) => line.id));
    const returned = lineIds.length ? await prisma.posTransactionLine.groupBy({ by: ["sourceLineId"], where: { sourceLineId: { in: lineIds }, lineIntent: "RETURN" }, _sum: { quantity: true } }) : [];
    const returnedByLine = new Map(returned.map((row) => [row.sourceLineId, Math.abs(Number(row._sum.quantity ?? 0))]));
    return NextResponse.json({ receipts: transactions.map((transaction) => ({ transactionId: transaction.id, transactionNo: transaction.transactionNo, customerName: transaction.customerNameSnapshot ?? "Walk-in Customer", totalAmount: Number(transaction.totalAmount), completedAt: transaction.completedAt?.toISOString() ?? null, storeCode: transaction.store.code, storeName: transaction.store.name, lines: transaction.lines.map((line) => ({ sourceLineId: line.id, productCode: line.productCodeSnapshot, productName: line.productNameSnapshot, soldQuantity: Number(line.quantity), returnedQuantity: returnedByLine.get(line.id) ?? 0, eligibleQuantity: Math.max(0, Number(line.quantity) - (returnedByLine.get(line.id) ?? 0)), unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal), unitOfMeasure: line.sellingUnitOfMeasure })) })) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not search receipts." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}

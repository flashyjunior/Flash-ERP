import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.permissionCodes.includes("pos.sale.process") && !session.permissionCodes.includes("pos.sell")) {
      throw new EnterpriseAuthError("Flash ERP requires POS selling privileges to view shop sales analytics.", 403);
    }
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const sevenDays = new Date(start); sevenDays.setUTCDate(sevenDays.getUTCDate() - 6);
    const store = session.homeStoreCode ? await prisma.store.findFirst({ where: { retailOrgId: session.retailOrgId, code: session.homeStoreCode }, select: { id: true } }) : null;
    const salesWhere = { retailOrgId: session.retailOrgId, status: "COMPLETED", transactionType: "SALE", completedAt: { gte: start }, ...(store ? { storeId: store.id } : {}) };
    const [today, recent, pendingLeave] = await Promise.all([
      prisma.posTransaction.aggregate({ where: salesWhere, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.posTransaction.findMany({ where: { ...salesWhere, completedAt: { gte: sevenDays } }, select: { completedAt: true, totalAmount: true, lines: { select: { productCodeSnapshot: true, productNameSnapshot: true, quantity: true, lineTotal: true } } } }),
      session.permissionCodes.some((code) => code.includes("approve")) ? prisma.erpLeaveRequest.count({ where: { retailOrgId: session.retailOrgId, status: "SUBMITTED" } }) : Promise.resolve(0)
    ]);
    const trend = Array.from({ length: 7 }, (_, index) => { const date = new Date(sevenDays); date.setUTCDate(date.getUTCDate() + index); const key = date.toISOString().slice(0, 10); return { date: key, total: recent.filter((sale) => sale.completedAt?.toISOString().slice(0, 10) === key).reduce((sum, sale) => sum + Number(sale.totalAmount), 0) }; });
    const products = new Map<string, { productCode: string; productName: string; quantity: number; sales: number }>();
    for (const sale of recent) for (const line of sale.lines) { const current = products.get(line.productCodeSnapshot) ?? { productCode: line.productCodeSnapshot, productName: line.productNameSnapshot, quantity: 0, sales: 0 }; current.quantity += Number(line.quantity); current.sales += Number(line.lineTotal); products.set(line.productCodeSnapshot, current); }
    const salesTotal = Number(today._sum.totalAmount ?? 0); const transactionCount = today._count.id;
    return NextResponse.json({ salesTotal, transactionCount, averageBasket: transactionCount ? salesTotal / transactionCount : 0, pendingApprovals: pendingLeave, trend, topProducts: [...products.values()].sort((a, b) => b.sales - a.sales).slice(0, 5), generatedAt: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not load mobile analytics." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 }); }
}

import { NextResponse } from "next/server";

import { createOnlineStoreHeldSale } from "@/server/repositories/online-store.repository";
import { getEnterpriseSession, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { prisma } from "@/lib/db/prisma";


export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.homeStoreCode) throw new EnterpriseAuthError("Assign a home shop before recalling held sales.", 403);
    const rows = await prisma.posTransaction.findMany({
      where: { retailOrgId: session.retailOrgId, store: { code: session.homeStoreCode }, status: "PARKED" },
      orderBy: { updatedAt: "desc" }, take: 50,
      select: { id: true, transactionNo: true, customerId: true, customerNameSnapshot: true, totalAmount: true, updatedAt: true,
        customer: { select: { fullName: true } },
        lines: { select: { productId: true, productCodeSnapshot: true, productNameSnapshot: true, quantity: true, unitPrice: true, taxAmount: true, lineTotal: true, sellingUnitOfMeasure: true } }
      }
    });
    return NextResponse.json({ heldSales: rows.map((row) => ({ transactionId: row.id, transactionNo: row.transactionNo, customerId: row.customerId, customerName: row.customerNameSnapshot ?? row.customer?.fullName ?? "Walk-in Customer", totalAmount: Number(row.totalAmount), updatedAt: row.updatedAt.toISOString(), lines: row.lines.map((line) => ({ productId: line.productId, productCode: line.productCodeSnapshot, productName: line.productNameSnapshot, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxAmount: Number(line.taxAmount), lineTotal: Number(line.lineTotal), sellingUnitOfMeasure: line.sellingUnitOfMeasure ?? "EA" })) })) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not load held sales." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreHeldSale({
      customerId: body?.customerId ?? null,
      lines: Array.isArray(body?.lines) ? body.lines : [],
      note: body?.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not hold that online store sale."
      },
      { status: 400 }
    );
  }
}

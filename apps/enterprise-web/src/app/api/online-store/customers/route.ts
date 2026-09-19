import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

export async function GET(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    if (!session.homeStoreCode) throw new EnterpriseAuthError("Assign a home shop before searching customers.", 403);
    if (!session.permissionCodes.includes("pos.customer.attach") && !session.permissionCodes.includes("pos.sell") && !session.permissionCodes.includes("pos.sale.process")) {
      throw new EnterpriseAuthError("Flash ERP requires customer or POS selling privileges.", 403);
    }
    const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
    const customers = await prisma.customer.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: "ACTIVE",
        deletedAt: null,
        ...(query ? { OR: [
          { customerNo: { contains: query } }, { fullName: { contains: query } },
          { phone: { contains: query } }, { email: { contains: query } }
        ] } : {})
      },
      orderBy: { fullName: "asc" },
      take: 30,
      select: { id: true, customerNo: true, fullName: true, phone: true, email: true, customerType: true }
    });
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not search customers." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  EnterpriseAuthError,
  getEnterpriseSession,
} from "@/server/auth/enterprise-session";

export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) {
      throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    }
    if (!session.homeStoreCode) {
      throw new EnterpriseAuthError("Assign a home shop before taking payments.", 403);
    }
    if (
      !session.permissionCodes.includes("pos.sale.process") &&
      !session.permissionCodes.includes("pos.sell")
    ) {
      throw new EnterpriseAuthError("Flash ERP requires POS selling privileges.", 403);
    }

    const tenders = await prisma.tenderMethod.findMany({
      where: {
        retailOrgId: session.retailOrgId,
        status: "ACTIVE",
        deletedAt: null,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        paymentMethod: true,
        requiresReference: true,
        allowChange: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({ tenders });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not load tender settings.",
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 },
    );
  }
}

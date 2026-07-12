import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { confirmGoodsReceiptStockUpdate } from "@/server/repositories/inventory-stock-policy.repository";

type RouteContext = {
  params: Promise<{
    goodsReceiptId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await assertEnterprisePermission(["inventory.grn.receive"]);
    const { goodsReceiptId } = await context.params;
    const response = await confirmGoodsReceiptStockUpdate(
      decodeURIComponent(goodsReceiptId),
      session.displayName || session.loginId
    );

    return NextResponse.json({
      ...response,
      serverProcessedAt: new Date().toISOString()
    });
  } catch (error) {
    const status = error instanceof EnterpriseAuthError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not confirm the goods-receipt stock update."
      },
      { status }
    );
  }
}

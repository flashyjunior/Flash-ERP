import { NextResponse } from "next/server";

import type { ClosePurchaseOrderRequest } from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { closePurchaseOrder } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    purchaseOrderId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertEnterprisePermission(["inventory.purchase-order.manage"]);
    const { purchaseOrderId } = await context.params;
    const body =
      request.headers.get("content-length") === "0"
        ? null
        : ((await request.json().catch(() => null)) as ClosePurchaseOrderRequest | null);
    const response = await closePurchaseOrder(decodeURIComponent(purchaseOrderId), body ?? undefined);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not close the purchase order."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 500 }
    );
  }
}

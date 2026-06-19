import { NextResponse } from "next/server";

import { commitPurchaseOrder } from "@/server/repositories/store-sync.repository";

type RouteContext = {
  params: Promise<{
    purchaseOrderId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { purchaseOrderId } = await context.params;
    const response = await commitPurchaseOrder(decodeURIComponent(purchaseOrderId));

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not commit the purchase order."
      },
      { status: 500 }
    );
  }
}

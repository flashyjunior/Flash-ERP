import { NextResponse } from "next/server";

import { cancelOnlineStoreSalesOrder } from "@/server/repositories/online-store.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      orderId: string;
    }>;
  }
) {
  try {
    const params = await context.params;
    const body = await request.json().catch(() => ({}));
    const response = await cancelOnlineStoreSalesOrder(params.orderId, {
      refundPayments: Array.isArray(body?.refundPayments) ? body.refundPayments : null,
      note: body?.note ?? null,
      policyOverrideApproved: body?.policyOverrideApproved === true,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not cancel that Online POS sales order."
      },
      { status: 400 }
    );
  }
}

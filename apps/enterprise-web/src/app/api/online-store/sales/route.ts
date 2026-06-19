import { NextResponse } from "next/server";

import { createOnlineStoreSale } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await createOnlineStoreSale({
      sourceTransactionId: body?.sourceTransactionId ?? null,
      salesOrderId: body?.salesOrderId ?? null,
      customerId: body?.customerId ?? null,
      lines: Array.isArray(body?.lines) ? body.lines : [],
      payments: Array.isArray(body?.payments) ? body.payments : null,
      paymentMethod: body?.paymentMethod ?? null,
      paymentReference: body?.paymentReference ?? null,
      reference: body?.reference ?? null,
      loyaltyPointsRedeemed: body?.loyaltyPointsRedeemed ?? 0,
      loyaltyRedemptionAmount: body?.loyaltyRedemptionAmount ?? 0,
      managerOverride:
        body?.managerOverride && typeof body.managerOverride === "object"
          ? body.managerOverride
          : null,
      note: body?.note ?? null,
      details: body?.details ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not complete that online store sale."
      },
      { status: 400 }
    );
  }
}

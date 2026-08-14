import { NextResponse } from "next/server";

import { receiveOnlineStoreLayawayPayment } from "@/server/repositories/online-store.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const [params, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    const response = await receiveOnlineStoreLayawayPayment(params.orderId, {
      payments: Array.isArray(body?.payments) ? body.payments : [],
      note: body?.note ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not receive that layaway payment.",
      },
      { status: 400 },
    );
  }
}
